/**
 * render.finance.js
 * "Финансы" tab: Cash Flow tables by office and by tenant.
 * CF = area × (rent_per_sqm + opex_per_sqm) × (1 + idx%)^yearsFromLeaseStart
 * Values shown in millions of RUB, 2 decimal places.
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

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var settings = state.getSettings();
    var cfRaw = settings.cfSettings || { startYear: 2026, endYear: 2030 };
    var cf = { startYear: cfRaw.startYear, endYear: cfRaw.endYear };

    // ---- Year range controls ----
    var controlsPanel = R.section('Параметры прогноза');
    var controlsRow = U.el('div', { class: 'cf-controls' });

    function yearStepper(label, key) {
      var val = cf[key];
      var dec = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '−' });
      var inc = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '+' });
      var display = U.el('span', { class: 'cf-year-val', text: String(val) });
      dec.addEventListener('click', function () {
        cf[key] = Math.max(2000, cf[key] - 1);
        if (key === 'startYear' && cf.startYear > cf.endYear) { cf.endYear = cf.startYear; }
        if (key === 'endYear' && cf.endYear < cf.startYear) { cf.startYear = cf.endYear; }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
        display.textContent = String(cf[key]);
      });
      inc.addEventListener('click', function () {
        cf[key] = Math.min(2100, cf[key] + 1);
        if (key === 'startYear' && cf.startYear > cf.endYear) { cf.endYear = cf.startYear; }
        if (key === 'endYear' && cf.endYear < cf.startYear) { cf.startYear = cf.endYear; }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
        display.textContent = String(cf[key]);
      });
      return U.el('div', { class: 'cf-stepper' }, [
        U.el('span', { class: 'cf-stepper-label', text: label }),
        dec, display, inc
      ]);
    }

    controlsRow.appendChild(yearStepper('С года:', 'startYear'));
    controlsRow.appendChild(yearStepper('По год:', 'endYear'));
    controlsPanel.appendChild(controlsRow);
    container.appendChild(controlsPanel);

    // ---- CF Data ----
    var data = calc.getScenarioCFData(scenario, cf.startYear, cf.endYear);
    if (data.years.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Некорректный диапазон лет' }));
      return;
    }

    // ---- Helper: render one CF table ----
    function renderCFTable(title, rows, years) {
      var panel = R.section(title);
      if (rows.length === 0) {
        panel.appendChild(U.el('p', { class: 'muted', text: 'Нет данных' }));
        return panel;
      }
      var firstColLabel = title.indexOf('арендатор') > -1 ? 'Арендатор' : 'Офис / Фаза';
      panel.appendChild(R.cfTable({
        rows: rows,
        years: years,
        expandedYears: expandedCFYears,
        onToggleYear: function (yr) {
          expandedCFYears[yr] = !expandedCFYears[yr];
          R.render();
        },
        firstColLabel: firstColLabel
      }));
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', data.tenantRows, data.years));
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
