/**
 * render.finance.js
 * "Финансы" tab: editable Cash Flow tables by office and by tenant.
 * Computed from office/tenant data unless scenario.cfOverride is set, in
 * which case the stored values are the source of truth (snapshot + override).
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
  var editingTable = null; // null | 'office' | 'tenant'
  var draft = null;        // working cfOverride copy while editing

  function yearsArray(cf) {
    var ys = [];
    for (var y = cf.startYear; y <= cf.endYear; y++) { ys.push(y); }
    return ys;
  }

  function enterEdit(scenario, cf, tableKey) {
    editingTable = tableKey;
    draft = calc.buildOverrideFromComputed(scenario, yearsArray(cf));
    R.render();
  }

  function saveEdit(scenario) {
    var d = draft;
    state.commit('Правка CF', function () { scenario.cfOverride = d; });
    editingTable = null; draft = null;
  }

  function cancelEdit() {
    editingTable = null; draft = null; R.render();
  }

  function resetToComputed(scenario) {
    state.commit('Сброс CF (пересчёт из офисов)', function () { scenario.cfOverride = null; });
    editingTable = null; draft = null;
  }

  function editCell(tableKey, rowId, year, monthIndex, value) {
    var list = tableKey === 'office' ? draft.offices : draft.tenants;
    var row = null;
    list.forEach(function (r) { if (r.id === rowId) { row = r; } });
    if (!row) { return; }
    var ys = String(year);
    if (!row.monthly[ys] || row.monthly[ys].length !== 12) {
      row.monthly[ys] = [0,0,0,0,0,0,0,0,0,0,0,0];
    }
    if (monthIndex === null) {
      var per = value / 12;
      for (var m = 0; m < 12; m++) { row.monthly[ys][m] = per; }
    } else {
      row.monthly[ys][monthIndex] = value;
    }
    R.render();
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var settings = state.getSettings();
    var cfRaw = settings.cfSettings || { startYear: 2026, endYear: 2030 };
    var cf = { startYear: cfRaw.startYear, endYear: cfRaw.endYear };

    // ---- Year range controls ----
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
      return U.el('div', { class: 'cf-stepper' }, [
        U.el('span', { class: 'cf-stepper-label', text: label }), dec, display, inc
      ]);
    }

    controlsRow.appendChild(yearStepper('С года:', 'startYear'));
    controlsRow.appendChild(yearStepper('По год:', 'endYear'));
    controlsPanel.appendChild(controlsRow);
    container.appendChild(controlsPanel);

    // ---- CF Data (draft while editing, else scenario) ----
    var srcScenario = scenario;
    if (editingTable && draft) {
      srcScenario = {};
      for (var k in scenario) { if (scenario.hasOwnProperty(k)) { srcScenario[k] = scenario[k]; } }
      srcScenario.cfOverride = draft;
    }
    var data = calc.getScenarioCFData(srcScenario, cf.startYear, cf.endYear);
    if (data.years.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Некорректный диапазон лет' }));
      return;
    }

    function renderCFTable(title, tableKey, rows, years) {
      var panel = R.section(title);
      var head = panel.firstChild; // .section-head
      var viewOnly = state.isViewOnly();

      if (editingTable === tableKey) {
        var saveBtn = U.el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
        saveBtn.addEventListener('click', function () { saveEdit(scenario); });
        var cancelBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Отмена' });
        cancelBtn.addEventListener('click', function () { cancelEdit(); });
        var recalcBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
        recalcBtn.addEventListener('click', function () { resetToComputed(scenario); });
        head.appendChild(U.el('div', { class: 'cf-edit-actions' }, [saveBtn, cancelBtn, recalcBtn]));
      } else if (!viewOnly && !editingTable) {
        head.appendChild(R.iconBtn('✎', 'Редактировать таблицу', (function (tk) {
          return function () { enterEdit(scenario, cf, tk); };
        })(tableKey)));
      }

      if (scenario.cfOverride && editingTable !== tableKey) {
        var banner = U.el('div', { class: 'cf-override-banner' }, [
          U.el('span', { text: 'Данные CF переопределены вручную' })
        ]);
        if (!viewOnly && !editingTable) {
          var b = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
          b.addEventListener('click', function () { resetToComputed(scenario); });
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
        editable: editingTable === tableKey,
        onEditCell: (function (tk) {
          return function (rowId, year, monthIndex, value) { editCell(tk, rowId, year, monthIndex, value); };
        })(tableKey)
      }));
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', 'office', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', 'tenant', data.tenantRows, data.years));
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
