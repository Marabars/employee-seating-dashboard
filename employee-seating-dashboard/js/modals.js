/**
 * modals.js
 * Reusable modal / form / popup / confirmation infrastructure.
 * One overlay is reused; content is rebuilt per open. Esc and backdrop click
 * close (cancel). Form builder renders a field spec and returns values.
 */
window.App = window.App || {};

App.modals = (function () {
  'use strict';

  var U = App.utils;
  var overlay = null;
  var currentOnClose = null;

  function ensureOverlay() {
    if (overlay) {
      return overlay;
    }
    overlay = U.el('div', { class: 'modal-overlay', 'aria-hidden': 'true' });
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) {
        close();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        close();
      }
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function close() {
    if (!overlay) {
      return;
    }
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    U.clear(overlay);
    var cb = currentOnClose;
    currentOnClose = null;
    if (typeof cb === 'function') {
      cb();
    }
  }

  /**
   * Open a modal with a title, a body Node, and footer buttons.
   * buttons: array of { label, kind, onClick(returnsTrueToClose) , autofocus }.
   * Returns the dialog node.
   */
  function open(options) {
    options = options || {};
    ensureOverlay();
    U.clear(overlay);

    var dialog = U.el('div', {
      class: 'modal-dialog' + (options.wide ? ' modal-wide' : ''),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': options.title || 'Диалог'
    });

    var header = U.el('div', { class: 'modal-header' }, [
      U.el('h2', { class: 'modal-title', text: options.title || '' }),
      U.el('button', {
        class: 'modal-close',
        'aria-label': 'Закрыть',
        type: 'button',
        onclick: close
      }, '×')
    ]);

    var body = U.el('div', { class: 'modal-body' });
    if (options.body) {
      U.appendNode(body, options.body);
    }

    var footer = U.el('div', { class: 'modal-footer' });
    (options.buttons || []).forEach(function (btn) {
      var b = U.el('button', {
        type: 'button',
        class: 'btn ' + (btn.kind ? 'btn-' + btn.kind : 'btn-secondary')
      }, btn.label);
      b.addEventListener('click', function () {
        var shouldClose = btn.onClick ? btn.onClick() : true;
        if (shouldClose !== false) {
          close();
        }
      });
      footer.appendChild(b);
      if (btn.autofocus) {
        setTimeout(function () { b.focus(); }, 0);
      }
    });

    dialog.appendChild(header);
    dialog.appendChild(body);
    if ((options.buttons || []).length) {
      dialog.appendChild(footer);
    }
    overlay.appendChild(dialog);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    currentOnClose = options.onClose || null;
    return dialog;
  }

  /** Simple confirmation dialog. onConfirm runs if the user confirms. */
  function confirm(message, onConfirm, opts) {
    opts = opts || {};
    open({
      title: opts.title || 'Подтверждение',
      body: U.el('p', { text: message }),
      buttons: [
        { label: opts.cancelLabel || 'Отмена', kind: 'secondary' },
        {
          label: opts.confirmLabel || 'Подтвердить',
          kind: opts.danger ? 'danger' : 'primary',
          autofocus: true,
          onClick: function () {
            if (onConfirm) {
              onConfirm();
            }
            return true;
          }
        }
      ]
    });
  }

  /** Lightweight alert / info dialog. */
  function alert(message, title) {
    open({
      title: title || 'Сообщение',
      body: typeof message === 'string' ? U.el('p', { text: message }) : message,
      buttons: [{ label: 'OK', kind: 'primary', autofocus: true }]
    });
  }

  /**
   * Build a form from a field spec and open it in a modal.
   * fields: array of:
   *   { name, label, type: 'text'|'number'|'textarea'|'checkbox'|'select',
   *     value, options:[{value,label}], min, required, help }
   * onSubmit(values) -> return false to keep modal open (validation failed).
   */
  function form(options) {
    options = options || {};
    var inputs = {};
    var formEl = U.el('form', { class: 'modal-form' });

    (options.fields || []).forEach(function (field) {
      var fieldWrap = U.el('div', { class: 'form-field' });
      var inputId = 'f_' + field.name;
      var control;

      if (field.type === 'textarea') {
        control = U.el('textarea', { id: inputId, name: field.name, rows: '3' });
        control.value = field.value || '';
      } else if (field.type === 'checkbox') {
        control = U.el('input', { id: inputId, name: field.name, type: 'checkbox' });
        control.checked = !!field.value;
      } else if (field.type === 'select') {
        control = U.el('select', { id: inputId, name: field.name });
        (field.options || []).forEach(function (opt) {
          var o = U.el('option', { value: opt.value }, opt.label);
          if (String(opt.value) === String(field.value)) {
            o.selected = true;
          }
          control.appendChild(o);
        });
      } else if (field.type === 'checkboxgroup') {
        // Multi-select rendered as a list of checkboxes. field.value is an
        // array of pre-selected values. The "control" is the container; its
        // checkbox children carry value="..." for collection.
        control = U.el('div', { class: 'checkbox-group' });
        var selected = {};
        (field.value || []).forEach(function (v) { selected[String(v)] = true; });
        if (!(field.options || []).length) {
          control.appendChild(U.el('div', { class: 'form-help', text: 'Нет доступных вариантов' }));
        }
        (field.options || []).forEach(function (opt) {
          var cb = U.el('input', { type: 'checkbox', value: opt.value });
          cb.checked = !!selected[String(opt.value)];
          control.appendChild(U.el('label', { class: 'checkbox-label' }, [
            cb, U.el('span', { text: opt.label })
          ]));
        });
      } else {
        control = U.el('input', {
          id: inputId,
          name: field.name,
          type: field.type || 'text'
        });
        if (field.min !== undefined) {
          control.setAttribute('min', field.min);
        }
        control.value = field.value !== undefined && field.value !== null ? field.value : '';
      }

      inputs[field.name] = control;

      if (field.type === 'checkbox') {
        var inlineLabel = U.el('label', { 'for': inputId, class: 'checkbox-label' }, [
          control,
          U.el('span', { text: field.label })
        ]);
        fieldWrap.appendChild(inlineLabel);
      } else {
        fieldWrap.appendChild(U.el('label', { 'for': inputId, text: field.label }));
        fieldWrap.appendChild(control);
      }
      if (field.help) {
        fieldWrap.appendChild(U.el('div', { class: 'form-help', text: field.help }));
      }
      formEl.appendChild(fieldWrap);
    });

    function collect() {
      var values = {};
      (options.fields || []).forEach(function (field) {
        var control = inputs[field.name];
        if (field.type === 'checkbox') {
          values[field.name] = control.checked;
        } else if (field.type === 'checkboxgroup') {
          var picked = [];
          U.qsa('input[type=checkbox]', control).forEach(function (cb) {
            if (cb.checked) {
              picked.push(cb.value);
            }
          });
          values[field.name] = picked;
        } else if (field.type === 'number') {
          values[field.name] = control.value === '' ? '' : Number(control.value);
        } else {
          values[field.name] = control.value;
        }
      });
      return values;
    }

    // Submit on Enter within the form (except textarea).
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      doSubmit();
    });

    function doSubmit() {
      var values = collect();
      var ok = options.onSubmit ? options.onSubmit(values) : true;
      if (ok !== false) {
        close();
      }
    }

    open({
      title: options.title || 'Форма',
      body: formEl,
      wide: options.wide,
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        {
          label: options.submitLabel || 'Сохранить',
          kind: 'primary',
          onClick: function () {
            doSubmit();
            return false; // doSubmit closes on success
          }
        }
      ]
    });

    // Autofocus the first control.
    var firstField = (options.fields || [])[0];
    if (firstField && inputs[firstField.name]) {
      setTimeout(function () { inputs[firstField.name].focus(); }, 0);
    }

    return { inputs: inputs, collect: collect };
  }

  return {
    open: open,
    close: close,
    confirm: confirm,
    alert: alert,
    form: form
  };
})();
