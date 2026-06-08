/**
 * render.comparison.js
 * "Сравнение сценариев" tab: KPI table across all scenarios (11 KPI rows).
 */
window.App = window.App || {};

(function () {
  'use strict';

  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var state = App.state;

  // KPI rows: label + accessor on a computed kpi object.
  var ROWS = [
    { label: 'Всего сотрудников', key: 'totalEmployees' },
    { label: 'Требуется посадочных мест', key: 'requiredSeats' },
    { label: 'Вместимость новых офисов', key: 'newOfficesCapacity' },
    { label: 'Распределено в офисы', key: 'placedInOffices' },
    { label: 'На удаленке', key: 'remoteCount' },
    { label: 'Не размещено', key: 'unplacedCount' },
    { label: 'Свободный резерв', key: 'freeReserve' },
    { label: 'Переполнение офисов', key: 'officeOverflow' },
    { label: 'Переполнение зон', key: 'zoneOverflow' },
    { label: 'Количество предупреждений', key: 'warningsCount' },
    { label: 'Количество ошибок', key: 'errorsCount' }
  ];

  function render(container) {
    var panel = R.section('Сравнение сценариев');
    var project = state.getProject();

    var computed = project.scenarios.map(function (s) {
      var messages = App.validation.validateScenario(s);
      return { scenario: s, kpis: calc.calculateScenarioKpis(s, messages) };
    });

    var table = U.el('table', { class: 'data-table comparison-table' });

    var headRow = U.el('tr', {}, [U.el('th', { text: 'KPI' })]);
    computed.forEach(function (c) {
      headRow.appendChild(U.el('th', { text: c.scenario.name }));
    });
    table.appendChild(U.el('thead', {}, headRow));

    var tbody = U.el('tbody');
    ROWS.forEach(function (row) {
      var tr = U.el('tr', {}, [U.el('td', { class: 'row-label', text: row.label })]);
      computed.forEach(function (c) {
        var value = c.kpis[row.key];
        tr.appendChild(U.el('td', { text: String(value) }));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    panel.appendChild(table);
    container.appendChild(panel);
  }

  App.render.registerTab('comparison', { label: 'Сравнение сценариев', render: render });
})();
