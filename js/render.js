/**
 * render.js
 * Central render router + shared UI components. render() rebuilds the active
 * tab from state; the scenarios sidebar, top bar, and validation are always
 * refreshed. Tab-specific rendering lives in render.<tab>.js and registers
 * here via App.render.tabs.
 */
window.App = window.App || {};

App.render = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;
  var calc = App.calc;

  var activeTab = 'dashboard';

  var MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  // Tab renderers register themselves: { id, label, render(container, ctx) }.
  var tabs = {};

  function registerTab(id, renderer) {
    tabs[id] = renderer;
  }

  function setActiveTab(id) {
    if (tabs[id]) {
      activeTab = id;
    }
    render();
  }

  function getActiveTab() {
    return activeTab;
  }

  /**
   * Build a render context shared by tabs for the active scenario, so each
   * tab doesn't recompute KPIs/validation.
   */
  function buildContext() {
    var scenario = state.getActiveScenario();
    var messages = App.validation.validateScenario(scenario);
    var kpis = calc.calculateScenarioKpis(scenario, messages);
    return {
      scenario: scenario,
      messages: messages,
      kpis: kpis,
      thresholds: state.getThresholds(),
      viewOnly: state.isViewOnly()
    };
  }

  /** Full re-render of sidebar, top bar, active tab, and view-only banner. */
  function render() {
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

    // Save scroll positions of scrollable sub-containers (e.g. dnd-scroll columns on the distribution tab).
    var container = U.qs('#tab-content');
    var savedScrolls = container ? U.qsa('.dnd-scroll', container).map(function (el) {
      return el.scrollTop;
    }) : [];

    var ctx = buildContext();
    renderSidebar(ctx);
    renderTopbar(ctx);
    renderViewOnlyBanner(ctx);

    U.clear(container);
    var renderer = tabs[activeTab] || tabs.dashboard;
    if (renderer && renderer.render) {
      renderer.render(container, ctx);
    }
    updateNavActive();
    if (App.dragDrop) {
      App.dragDrop.refresh();
    }

    if (scrollY > 0) {
      window.scrollTo(0, scrollY);
    }
    // Restore inner-container scrolls by index (same tab template = same element order).
    if (savedScrolls.length > 0 && container) {
      U.qsa('.dnd-scroll', container).forEach(function (el, i) {
        if (savedScrolls[i] > 0) { el.scrollTop = savedScrolls[i]; }
      });
    }
  }

  // ---- Sidebar (scenarios) ----------------------------------------------

  function renderSidebar(ctx) {
    var host = U.qs('#scenarios-panel');
    if (!host) {
      return;
    }
    U.clear(host);
    var project = state.getProject();

    host.appendChild(U.el('div', { class: 'sidebar-head' }, [
      U.el('h2', { text: 'Сценарии' }),
      ctx.viewOnly ? null : U.el('button', {
        class: 'btn btn-primary btn-sm',
        title: 'Создать сценарий',
        onclick: function () { App.app.onCreateScenario(); }
      }, '+ Сценарий')
    ]));

    var listEl = U.el('div', { class: 'scenario-list' });
    project.scenarios.forEach(function (s) {
      var isActive = s.id === project.settings.lastSelectedScenarioId;
      var item = U.el('div', {
        class: 'scenario-item' + (isActive ? ' active' : ''),
        onclick: function () { App.scenarios.select(s.id); }
      }, [
        U.el('div', { class: 'scenario-name', text: s.name }),
        s.comment ? U.el('div', { class: 'scenario-comment', text: s.comment }) : null
      ]);

      if (!ctx.viewOnly) {
        var actions = U.el('div', { class: 'scenario-actions' });
        actions.appendChild(iconBtn('✎', 'Переименовать', function (e) {
          e.stopPropagation();
          App.app.onRenameScenario(s.id);
        }));
        actions.appendChild(iconBtn('❏', 'Дублировать', function (e) {
          e.stopPropagation();
          App.scenarios.duplicate(s.id);
        }));
        actions.appendChild(iconBtn('💬', 'Комментарий', function (e) {
          e.stopPropagation();
          App.app.onCommentScenario(s.id);
        }));
        if (project.scenarios.length > 1) {
          actions.appendChild(iconBtn('🗑', 'Удалить', function (e) {
            e.stopPropagation();
            App.app.onDeleteScenario(s.id);
          }));
        }
        item.appendChild(actions);
      }
      listEl.appendChild(item);
    });
    host.appendChild(listEl);
  }

  function iconBtn(symbol, title, onClick) {
    return U.el('button', {
      class: 'icon-btn',
      title: title,
      'aria-label': title,
      onclick: onClick
    }, symbol);
  }

  // ---- Top bar -----------------------------------------------------------

  function renderTopbar(ctx) {
    var host = U.qs('#topbar-status');
    if (!host) {
      return;
    }
    U.clear(host);
    host.appendChild(badge('Предупреждения: ' + ctx.kpis.warningsCount,
      ctx.kpis.warningsCount > 0 ? 'yellow' : 'grey'));
    host.appendChild(badge('Ошибки: ' + ctx.kpis.errorsCount,
      ctx.kpis.errorsCount > 0 ? 'red' : 'grey'));

    // Undo/redo buttons reflect availability.
    var undoBtn = U.qs('#btn-undo');
    var redoBtn = U.qs('#btn-redo');
    if (undoBtn) {
      undoBtn.disabled = ctx.viewOnly || !App.undoRedo.canUndo();
    }
    if (redoBtn) {
      redoBtn.disabled = ctx.viewOnly || !App.undoRedo.canRedo();
    }
  }

  function renderViewOnlyBanner(ctx) {
    var banner = U.qs('#viewonly-banner');
    if (!banner) {
      return;
    }
    banner.style.display = ctx.viewOnly ? 'block' : 'none';
  }

  function updateNavActive() {
    U.qsa('.nav-tab').forEach(function (btn) {
      if (btn.dataset.tab === activeTab) {
        btn.classList.add('active');
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.classList.remove('active');
        btn.removeAttribute('aria-current');
      }
    });
  }

  // ---- Shared components (used by tab renderers) -------------------------

  /** Colored pill badge. */
  function badge(text, color) {
    return U.el('span', { class: 'badge badge-' + (color || 'grey'), text: text });
  }

  /**
   * Progress bar with status color. value/max numeric; overflow shows red.
   * Returns a node.
   */
  function progressBar(occupied, capacity, thresholds) {
    var percent = calc.calculateOccupancyPercent(occupied, capacity);
    var color = calc.statusColor(percent, thresholds);
    var widthPercent = percent === null ? 0 : Math.min(100, percent);
    var bar = U.el('div', { class: 'progress' }, [
      U.el('div', {
        class: 'progress-fill progress-' + color,
        style: 'width:' + widthPercent + '%'
      })
    ]);
    return bar;
  }

  /** KPI card: label + value, optional accent color. */
  function kpiCard(label, value, color) {
    return U.el('div', { class: 'kpi-card' + (color ? ' kpi-' + color : '') }, [
      U.el('div', { class: 'kpi-value', text: String(value) }),
      U.el('div', { class: 'kpi-label', text: label })
    ]);
  }

  /** Empty-state block. */
  function emptyState(text, actionLabel, onAction) {
    var node = U.el('div', { class: 'empty-state' }, [
      U.el('p', { text: text })
    ]);
    if (actionLabel && onAction && !state.isViewOnly()) {
      node.appendChild(U.el('button', {
        class: 'btn btn-primary',
        onclick: onAction
      }, actionLabel));
    }
    return node;
  }

  /** Section wrapper with a title and optional header action button. */
  function section(title, action) {
    var head = U.el('div', { class: 'section-head' }, [
      U.el('h2', { text: title })
    ]);
    if (action && !state.isViewOnly()) {
      head.appendChild(U.el('button', {
        class: 'btn btn-primary btn-sm',
        onclick: action.onClick
      }, action.label));
    }
    return U.el('section', { class: 'panel' }, [head]);
  }

  /** Free/overflow text for capacity vs occupied. */
  function freeOrOverflowText(capacity, occupied) {
    if (!isFinite(capacity)) {
      return 'Без лимита';
    }
    var overflow = calc.calculateOverflow(capacity, occupied);
    if (overflow > 0) {
      return U.formatOverflow(overflow);
    }
    var free = capacity - occupied;
    return 'Свободно: ' + free + ' ' + U.pluralPlaces(free);
  }

  function renderCFTableBlock(opts) {
    var rows = opts.rows;
    var years = opts.years;
    var expandedYears = opts.expandedYears || {};
    var onToggleYear = opts.onToggleYear || function () {};
    var firstColLabel = opts.firstColLabel || 'Офис / Фаза';
    var showPhaseHeaders = opts.showPhaseHeaders !== false;

    function fmt(v) {
      if (v === null || v === undefined || isNaN(v)) { return '—'; }
      var rounded = Math.round(v * 100) / 100;
      var sign = rounded < 0 ? '-' : '';
      var abs = Math.abs(rounded);
      var parts = abs.toFixed(2).split('.');
      var intStr = parts[0];
      var out = '';
      for (var i = 0; i < intStr.length; i++) {
        if (i > 0 && (intStr.length - i) % 3 === 0) { out += ' '; }
        out += intStr.charAt(i);
      }
      return sign + out + ',' + parts[1];
    }

    var columns = [];
    years.forEach(function (yr) {
      var isExp = !!expandedYears[yr];
      if (isExp) {
        for (var m = 1; m <= 12; m++) {
          columns.push({ type: 'month', year: yr, month: m, label: MONTHS_SHORT[m - 1] });
        }
        columns.push({ type: 'ytotal', year: yr, label: '∑ ' + yr });
      } else {
        columns.push({ type: 'year', year: yr, label: String(yr) });
      }
    });
    columns.push({ type: 'total', label: 'Итого' });

    var wrap = U.el('div', { class: 'cf-table-wrap' });
    var table = U.el('table', { class: 'cf-table' });

    var headerCells = [U.el('th', { text: firstColLabel })];
    columns.forEach(function (col) {
      var th;
      if (col.type === 'year') {
        th = U.el('th', {
          class: 'cf-year-col cf-year-clickable',
          title: 'Развернуть по месяцам',
          onclick: (function (yr) { return function () { onToggleYear(yr); }; })(col.year)
        }, '▸ ' + col.label);
      } else if (col.type === 'ytotal') {
        th = U.el('th', {
          class: 'cf-year-col cf-year-clickable cf-ytotal-col',
          title: 'Свернуть',
          onclick: (function (yr) { return function () { onToggleYear(yr); }; })(col.year)
        }, '▾ ' + col.label);
      } else if (col.type === 'month') {
        th = U.el('th', { class: 'cf-year-col cf-month-col', text: col.label });
      } else {
        th = U.el('th', { class: 'cf-year-col', text: col.label });
      }
      headerCells.push(th);
    });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, headerCells)));

    var tbody = U.el('tbody');
    var lastPhase = null;
    rows.forEach(function (row) {
      if (showPhaseHeaders && row.phase !== lastPhase && !row.isSubtotal) {
        lastPhase = row.phase;
        var phaseLabel = row.phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
        var phaseClass = row.phase === C.OFFICE_PHASE.ASIS ? 'phase-asis' : 'phase-tobe';
        tbody.appendChild(U.el('tr', { class: 'cf-phase-header ' + phaseClass }, [
          U.el('td', { colspan: String(columns.length + 1), text: phaseLabel })
        ]));
      }
      var cells = [U.el('td', { class: 'cf-name-col' + (row.isSubtotal ? ' cf-bold' : ''), text: row.name })];
      columns.forEach(function (col) {
        var val, cellClass;
        if (col.type === 'year') {
          val = row.values[years.indexOf(col.year)];
          cellClass = 'cf-val-col';
        } else if (col.type === 'ytotal') {
          val = row.values[years.indexOf(col.year)];
          cellClass = 'cf-val-col cf-ytotal-col cf-bold';
        } else if (col.type === 'month') {
          var mv = row.monthlyValues && row.monthlyValues[col.year];
          val = mv ? mv[col.month - 1] : null;
          cellClass = 'cf-val-col cf-month-col';
        } else {
          val = row.rowTotal;
          cellClass = 'cf-val-col cf-bold';
        }
        cells.push(U.el('td', { class: cellClass, text: fmt(val) }));
      });
      tbody.appendChild(U.el('tr', { class: row.isSubtotal ? 'cf-subtotal-row' : '' }, cells));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  return {
    registerTab: registerTab,
    setActiveTab: setActiveTab,
    getActiveTab: getActiveTab,
    render: render,
    buildContext: buildContext,
    // shared components
    badge: badge,
    progressBar: progressBar,
    kpiCard: kpiCard,
    emptyState: emptyState,
    section: section,
    iconBtn: iconBtn,
    freeOrOverflowText: freeOrOverflowText,
    cfTable: renderCFTableBlock
  };
})();
