/**
 * utils.js
 * Small pure helpers shared across the app: id generation, deep clone,
 * HTML escaping, number/label formatters, DOM helpers, debounce.
 *
 * No DOM state is kept here — everything is a pure-ish utility.
 */
window.App = window.App || {};

App.utils = (function () {
  'use strict';

  var idCounter = 0;

  /**
   * Generate a reasonably-unique id with a semantic prefix.
   * Not cryptographic — only needs to be unique within one project in memory.
   */
  function genId(prefix) {
    idCounter += 1;
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + idCounter + rand;
  }

  /**
   * Structured deep clone. Uses native structuredClone when available,
   * falls back to JSON round-trip (state is plain JSON-safe data).
   */
  function deepClone(value) {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (e) {
        // fall through to JSON clone
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  /** Escape a string for safe insertion into HTML text/attribute context. */
  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Coerce arbitrary input to a non-negative integer (0 on failure). */
  function toNonNegativeInt(value) {
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 0) {
      return 0;
    }
    return n;
  }

  /** Clamp a number into [min, max]. */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Format an overflow value per ТЗ: "Переполнение: N мест".
   * Returns empty string when there is no overflow.
   */
  function formatOverflow(overflow) {
    if (!overflow || overflow <= 0) {
      return '';
    }
    return 'Переполнение: ' + overflow + ' ' + pluralPlaces(overflow);
  }

  /** Russian pluralization for the word "место". */
  function pluralPlaces(n) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) {
      return 'мест';
    }
    if (last > 1 && last < 5) {
      return 'места';
    }
    if (last === 1) {
      return 'место';
    }
    return 'мест';
  }

  /** Format a places count with the "шт. мест" unit. */
  function fmtPlaces(n) {
    return (n === null || n === undefined || n === Infinity ? '∞' : n) + ' шт. мест';
  }

  /** Format an area with the "м²" unit. */
  function fmtArea(n) {
    return (n || 0) + ' м²';
  }

  /** Format a money amount (RUB) with thousands separators. */
  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) {
      return '—';
    }
    return Math.round(n).toLocaleString('ru-RU') + ' ₽';
  }

  /** Round a percentage to a whole number for display. */
  function formatPercent(percent) {
    if (percent === null || percent === undefined || isNaN(percent)) {
      return '—';
    }
    return Math.round(percent) + '%';
  }

  /** Parse a truthy/falsey cell value (Excel import): yes/да/true/1. */
  function parseBoolean(value) {
    if (value === true || value === 1) {
      return true;
    }
    if (value === false || value === 0 || value === null || value === undefined) {
      return false;
    }
    var s = String(value).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'да' || s === 'yes' || s === 'y' || s === 'x';
  }

  // ---- DOM helpers -------------------------------------------------------

  /** querySelector shortcut scoped to document or a root. */
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  /** querySelectorAll -> real array. */
  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /**
   * Create an element with attributes/props and children.
   * children: string (textContent) | Node | array of those.
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val === null || val === undefined || val === false) {
          return;
        }
        if (key === 'class' || key === 'className') {
          node.className = val;
        } else if (key === 'text') {
          node.textContent = val;
        } else if (key === 'html') {
          node.innerHTML = val;
        } else if (key === 'dataset' && typeof val === 'object') {
          Object.keys(val).forEach(function (dk) {
            node.dataset[dk] = val[dk];
          });
        } else if (key.indexOf('on') === 0 && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else {
          node.setAttribute(key, val);
        }
      });
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined) {
      return;
    }
    if (Array.isArray(children)) {
      children.forEach(function (child) {
        appendChildren(node, child);
      });
      return;
    }
    if (children instanceof Node) {
      node.appendChild(children);
    } else {
      node.appendChild(document.createTextNode(String(children)));
    }
  }

  /** Append a child (string/Node/array) to a node — public wrapper. */
  function appendNode(node, child) {
    appendChildren(node, child);
  }

  /** Remove all children from a node. */
  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  /**
   * Debounce a function by `wait` ms. Returns a wrapped function;
   * `.cancel()` cancels a pending call.
   */
  function debounce(fn, wait) {
    var timer = null;
    function wrapped() {
      var args = arguments;
      var ctx = this;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(function () {
        timer = null;
        fn.apply(ctx, args);
      }, wait);
    }
    wrapped.cancel = function () {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return wrapped;
  }

  /** Sum a numeric field across an array of objects. */
  function sumBy(arr, key) {
    return (arr || []).reduce(function (acc, item) {
      var v = item ? item[key] : 0;
      return acc + (typeof v === 'number' && !isNaN(v) ? v : 0);
    }, 0);
  }

  /** Find an item by id in an array (returns null if not found). */
  function findById(arr, id) {
    if (!arr) {
      return null;
    }
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === id) {
        return arr[i];
      }
    }
    return null;
  }

  /** Trigger a client-side file download of a Blob. */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke a tick later so the download has time to start.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return {
    genId: genId,
    deepClone: deepClone,
    escapeHtml: escapeHtml,
    toNonNegativeInt: toNonNegativeInt,
    clamp: clamp,
    formatOverflow: formatOverflow,
    pluralPlaces: pluralPlaces,
    formatPercent: formatPercent,
    fmtPlaces: fmtPlaces,
    fmtArea: fmtArea,
    fmtMoney: fmtMoney,
    parseBoolean: parseBoolean,
    qs: qs,
    qsa: qsa,
    el: el,
    appendNode: appendNode,
    clear: clear,
    debounce: debounce,
    sumBy: sumBy,
    findById: findById,
    downloadBlob: downloadBlob
  };
})();
