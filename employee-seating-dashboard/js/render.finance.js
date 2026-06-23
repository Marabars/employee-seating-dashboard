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
      var wrap = U.el('div', { class: 'cf-table-wrap' });
      var table = U.el('table', { class: 'cf-table' });

      // Header
      var headerCells = [U.el('th', { text: 'Офис / Фаза' })];
      years.forEach(function (yr) {
        headerCells.push(U.el('th', { class: 'cf-year-col', text: String(yr) }));
      });
      headerCells.push(U.el('th', { class: 'cf-year-col', text: 'Итого' }));
      table.appendChild(U.el('thead', {}, U.el('tr', {}, headerCells)));

      // Body — split AS-IS and TO-BE with a divider row
      var tbody = U.el('tbody');
      var lastPhase = null;
      rows.forEach(function (row) {
        // Phase section header
        if (row.phase !== lastPhase && !row.isSubtotal) {
          lastPhase = row.phase;
          var phaseLabel = row.phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
          var phaseClass = row.phase === C.OFFICE_PHASE.ASIS ? 'phase-asis' : 'phase-tobe';
          var headerRow = U.el('tr', { class: 'cf-phase-header ' + phaseClass }, [
            U.el('td', { colspan: String(years.length + 2), text: phaseLabel })
          ]);
          tbody.appendChild(headerRow);
        }
        var rowClass = row.isSubtotal ? 'cf-subtotal-row' : '';
        var cells = [U.el('td', { class: 'cf-name-col' + (row.isSubtotal ? ' cf-bold' : ''), text: row.name })];
        row.values.forEach(function (v) {
          cells.push(U.el('td', { class: 'cf-val-col', text: formatM(v) }));
        });
        cells.push(U.el('td', { class: 'cf-val-col cf-bold', text: formatM(row.rowTotal) }));
        tbody.appendChild(U.el('tr', { class: rowClass }, cells));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      panel.appendChild(wrap);
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', data.tenantRows, data.years));
  }

  function formatM(v) {
    if (v === null || v === undefined || isNaN(v)) { return '—'; }
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
