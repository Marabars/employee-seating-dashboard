/**
 * render.finance.js
 * "Финансы" tab: editable Cash Flow tables by office and by tenant.
 * Editing is delegated to the shared App.cfEdit controller (one CF table
 * editable at a time across the app; edits write scenario.cfOverride).
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var state = App.state;

  var expandedCFYears = {};

  function yearsArray(cf) {
    var ys = [];
    for (var y = cf.startYear; y <= cf.endYear; y++) { ys.push(y); }
    return ys;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var CE = App.cfEdit;
    var settings = state.getSettings();
    var cfRaw = settings.cfSettings || { startYear: 2026, endYear: 2030 };
    var cf = { startYear: cfRaw.startYear, endYear: cfRaw.endYear };

    var controlsPanel = R.section('Параметры прогноза');
    var controlsRow = U.el('div', { class: 'cf-controls' });

    function yearStepper(label, key) {
      var dec = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '−' });
      var inc = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '+' });
      var display = U.el('span', { class: 'cf-year-val', text: String(cf[key]) });
      function step(delta) {
        cf[key] = Math.max(2000, Math.min(2100, cf[key] + delta));
        if (cf.startYear > cf.endYear) {
          if (key === 'startYear') { cf.endYear = cf.startYear; } else { cf.startYear = cf.endYear; }
        }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
        display.textContent = String(cf[key]);
      }
      dec.addEventListener('click', function () { step(-1); });
      inc.addEventListener('click', function () { step(1); });
      return U.el('div', { class: 'cf-stepper' }, [U.el('span', { class: 'cf-stepper-label', text: label }), dec, display, inc]);
    }

    controlsRow.appendChild(yearStepper('С года:', 'startYear'));
    controlsRow.appendChild(yearStepper('По год:', 'endYear'));
    controlsPanel.appendChild(controlsRow);
    container.appendChild(controlsPanel);

    var data = calc.getScenarioCFData(CE.effectiveScenario(scenario), cf.startYear, cf.endYear);
    if (data.years.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Некорректный диапазон лет' }));
      return;
    }

    function renderCFTable(title, tableKey, rows, years) {
      var key = 'finance-' + tableKey;
      var listKey = tableKey === 'tenant' ? 'tenants' : 'offices';
      var panel = R.section(title);
      var head = panel.firstChild;
      var viewOnly = state.isViewOnly();

      if (CE.isEditing(key)) {
        var saveBtn = U.el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
        saveBtn.addEventListener('click', function () { CE.save(scenario); });
        var cancelBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Отмена' });
        cancelBtn.addEventListener('click', function () { CE.cancel(); });
        var recalcBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
        recalcBtn.addEventListener('click', function () { CE.reset(scenario); });
        head.appendChild(U.el('div', { class: 'cf-edit-actions' }, [saveBtn, cancelBtn, recalcBtn]));
      } else if (!viewOnly && !CE.anyEditing()) {
        head.appendChild(R.iconBtn('✎', 'Редактировать таблицу', (function (k, yy) {
          return function () { CE.enterEdit(scenario, yy, k); };
        })(key, yearsArray(cf))));
      }

      if (scenario.cfOverride && !CE.isEditing(key)) {
        var banner = U.el('div', { class: 'cf-override-banner' }, [U.el('span', { text: 'Данные CF переопределены вручную' })]);
        if (!viewOnly && !CE.anyEditing()) {
          var b = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
          b.addEventListener('click', function () { CE.reset(scenario); });
          banner.appendChild(b);
        }
        panel.appendChild(banner);
      }

      if (rows.length === 0) {
        panel.appendChild(U.el('p', { class: 'muted', text: 'Нет данных' }));
        return panel;
      }
      panel.appendChild(R.cfTable({
        rows: rows,
        years: years,
        expandedYears: expandedCFYears,
        onToggleYear: function (yr) { expandedCFYears[yr] = !expandedCFYears[yr]; R.render(); },
        firstColLabel: tableKey === 'tenant' ? 'Арендатор' : 'Офис / Фаза',
        editable: CE.isEditing(key),
        onEditCell: function (rowId, year, monthIndex, value) { CE.editCell(listKey, rowId, year, monthIndex, value); },
        onDeleteRow: function (rowId) { CE.deleteRow(listKey, rowId); },
        onAddRow: function (phase) { var name = window.prompt('Название строки:'); CE.addRow(listKey, name, phase); }
      }));
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', 'office', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', 'tenant', data.tenantRows, data.years));
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
