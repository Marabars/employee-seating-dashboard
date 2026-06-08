/**
 * render.comparison.js
 * "Сравнение сценариев" tab: a KPI dashboard — one card panel per scenario
 * with KPI tiles and a move-progress bar, so scenarios can be compared
 * visually rather than as a dense table.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var state = App.state;

  // KPI tiles shown per scenario. `accent` chooses a status color when the
  // value indicates a problem.
  var TILES = [
    { label: 'Всего мест', key: 'totalPlaces' },
    { label: 'Всего сотрудников', key: 'totalEmployees' },
    { label: 'Потребность мест', key: 'requiredSeats' },
    { label: 'Баланс мест', key: 'placesBalance', balance: true },
    { label: 'В офисах', key: 'placedInOffices' },
    { label: 'На удаленке', key: 'remoteCount', accent: 'blue' },
    { label: 'Не размещено', key: 'unplacedCount', warnIfPositive: true },
    { label: 'Переполн. зон', key: 'zoneOverflow', redIfPositive: true },
    { label: 'Предупреждений', key: 'warningsCount', warnIfPositive: true },
    { label: 'Ошибок', key: 'errorsCount', redIfPositive: true }
  ];

  function render(container) {
    var project = state.getProject();
    var active = state.getActiveScenario();

    var intro = R.section('Сравнение сценариев');
    intro.appendChild(U.el('p', { class: 'muted', text:
      'Дашборд KPI по всем сценариям. Активный сценарий выделен.' }));
    container.appendChild(intro);

    var grid = U.el('div', { class: 'comparison-grid' });
    project.scenarios.forEach(function (s) {
      var messages = App.validation.validateScenario(s);
      var kpis = calc.calculateScenarioKpis(s, messages);
      grid.appendChild(renderScenarioCard(s, kpis, s.id === active.id));
    });
    container.appendChild(grid);
  }

  function renderScenarioCard(scenario, kpis, isActive) {
    var card = U.el('div', { class: 'panel comparison-card' + (isActive ? ' active' : '') });

    var head = U.el('div', { class: 'comparison-card-head' }, [
      U.el('h2', { text: scenario.name }),
      isActive ? R.badge('Активный', 'blue') : null
    ]);
    card.appendChild(head);
    if (scenario.comment) {
      card.appendChild(U.el('div', { class: 'scenario-comment', text: scenario.comment }));
    }

    // Move-progress bar (clamped — never exceeds 100%).
    var p = calc.calculateMoveProgress(scenario);
    card.appendChild(U.el('div', { class: 'progress progress-stacked' }, [
      U.el('div', { class: 'progress-fill progress-green', style: 'width:' + p.inOfficesPercent + '%', title: 'В офисах' }),
      U.el('div', { class: 'progress-fill progress-blue', style: 'width:' + p.remotePercent + '%', title: 'Удаленка' }),
      U.el('div', { class: 'progress-fill progress-grey', style: 'width:' + p.unplacedPercent + '%', title: 'Не размещено' })
    ]));
    card.appendChild(U.el('div', { class: 'progress-legend' }, [
      U.el('span', { text: 'Офисы: ' + p.inOfficesPercent + '%' }),
      U.el('span', { text: 'Удаленка: ' + p.remotePercent + '%' }),
      U.el('span', { text: 'Не размещено: ' + p.unplacedPercent + '%' })
    ]));

    var tilesGrid = U.el('div', { class: 'kpi-grid' });
    TILES.forEach(function (tile) {
      var value = kpis[tile.key];
      var display = tile.balance ? (value >= 0 ? '+' + value : String(value)) : value;
      tilesGrid.appendChild(R.kpiCard(tile.label, display, accentFor(tile, value)));
    });
    card.appendChild(tilesGrid);

    return card;
  }

  function accentFor(tile, value) {
    if (tile.balance) { return value >= 0 ? 'green' : 'red'; }
    if (tile.redIfPositive && value > 0) { return 'red'; }
    if (tile.redIfNegative && value < 0) { return 'red'; }
    if (tile.warnIfPositive && value > 0) { return 'yellow'; }
    return tile.accent || null;
  }

  App.render.registerTab('comparison', { label: 'Сравнение сценариев', render: render });
})();
