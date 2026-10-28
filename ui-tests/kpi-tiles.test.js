/**
 * Headless UI test (jsdom): KPI tiles after the 28.10.2026 visual rework.
 *  - dashboard: one main row of 4 tiles, no secondary row, no balance tiles;
 *    "Нехватка мест" = сотрудники − места TO BE, "Прирост мест" = TO BE − AS IS;
 *  - visualization: top row keeps only "Количество мест" and "Количество кв.м.".
 * Run:  cd ui-tests && npm install && node kpi-tiles.test.js
 */
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var shell = '<!DOCTYPE html><body><div id="dnd-live"></div><div id="topbar-status"></div>' +
  '<button id="btn-undo"></button><button id="btn-redo"></button><button id="btn-onboarding"></button><button id="btn-settings"></button>' +
  '<div id="viewonly-banner" style="display:none"></div><nav id="main-nav"></nav><aside id="scenarios-panel"></aside><main id="tab-content"></main></body>';
var dom = new JSDOM(shell, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
if (w.HTMLCanvasElement) { w.HTMLCanvasElement.prototype.getContext = function () { return { font: '', measureText: function (t) { return { width: t.length * 7 }; } }; }; }
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js', 'js/employees.js',
 'js/calculations.js', 'js/allocations.js', 'js/cfEdit.js', 'js/validation.js', 'js/modals.js', 'js/render.js',
 'js/render.dashboard.js', 'js/render.visualization.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;

// 120 мест TO BE, 90 мест AS IS, 150 сотрудников (10 из них на удалёнке).
function project() {
  var employees = [];
  for (var i = 0; i < 150; i++) {
    employees.push({ id: 'e' + i, fullName: 'Сотрудник ' + i, teamId: 'tm1', isRemote: i < 10, isVip: false });
  }
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2027 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 't1', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z1', name: 'Z', capacity: 120, isVipZone: false }], tenants: [] },
        { id: 'a1', type: 'physical', phase: 'asis', name: 'AsisA', area: 100, rentPerSqm: 800, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z2', name: 'Z', capacity: 90, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm1', name: 'Команда', color: '#4f8ef7', employeesCount: 150 }],
      employees: employees, allocations: [] }] };
}

function tc() { return w.document.getElementById('tab-content'); }
function cards(sel) {
  return U.qsa(sel + ' .kpi-card', tc()).map(function (c) {
    var l = c.querySelector('.kpi-label'), v = c.querySelector('.kpi-value');
    return { label: (l ? l.textContent : '').trim(), value: (v ? v.textContent : '').trim() };
  });
}
function valueOf(list, label) {
  for (var i = 0; i < list.length; i++) { if (list[i].label === label) { return list[i].value; } }
  return null;
}

console.log('dashboard: KPI tiles');
App.state.setProject(project());
App.state.setActiveScenario('s1');
App.render.setActiveTab('dashboard');
App.render.render();

var main = cards('.kpi-grid-main');
var labels = main.map(function (c) { return c.label; });
var asis = cards('.kpi-grid-asis');
var asisLabels = asis.map(function (c) { return c.label; });
assert(main.length === 4, 'main row has 4 tiles (got ' + main.length + ': ' + labels.join(', ') + ')');
assert(asis.length === 2, 'AS IS row has 2 tiles (got ' + asis.length + ': ' + asisLabels.join(', ') + ')');
assert(U.qsa('.kpi-grid-sub', tc()).length === 0, 'secondary KPI row is gone');
['Всего мест (TO BE)', 'Всего сотрудников', 'Нехватка мест', 'Прирост мест'].forEach(function (lab) {
  assert(labels.indexOf(lab) !== -1, 'tile present: ' + lab);
});
['Вместимость (AS IS)', 'Занято (AS IS)'].forEach(function (lab) {
  assert(asisLabels.indexOf(lab) !== -1, 'AS IS tile present: ' + lab);
});
var allLabels = labels.concat(asisLabels);
['На удаленке', 'Не размещено', 'Распределено в офисы', 'Переполнение зон', 'Предупреждения', 'Ошибки',
 'Баланс мест (TO BE)', 'Баланс мест (AS IS)', 'Удаленка (AS IS)', 'Потребность мест'].forEach(function (lab) {
  assert(allLabels.indexOf(lab) === -1, 'removed tile absent: ' + lab);
});

assert(valueOf(main, 'Всего мест (TO BE)') === '120', 'TO BE capacity = 120');
assert(valueOf(main, 'Всего сотрудников') === '150', 'employees = 150');
// 150 сотрудников − 120 мест TO BE
assert(valueOf(main, 'Нехватка мест') === '30', 'Нехватка мест = 150 − 120 = 30 (got ' + valueOf(main, 'Нехватка мест') + ')');
// 120 мест TO BE − 90 мест AS IS
assert(valueOf(main, 'Прирост мест') === '+30', 'Прирост мест = 120 − 90 = +30 (got ' + valueOf(main, 'Прирост мест') + ')');
assert(valueOf(asis, 'Вместимость (AS IS)') === '90', 'AS IS row still renders capacity 90');

console.log('visualization: top row');
App.render.setActiveTab('visualization');
App.render.render();
var titles = U.qsa('.viz-top-row .viz-summary-title', tc()).map(function (e) { return e.textContent.trim(); });
assert(titles.length === 2, 'top row has 2 cards (got ' + titles.length + ': ' + titles.join(', ') + ')');
assert(titles.indexOf('Количество мест') !== -1, 'kept: Количество мест');
assert(titles.indexOf('Количество кв.м.') !== -1, 'kept: Количество кв.м.');
assert(titles.indexOf('Удалёнка') === -1, 'removed: Удалёнка');
assert(titles.indexOf('Баланс мест') === -1, 'removed: Баланс мест');

console.log('\n' + results.pass + ' passed, ' + results.fail + ' failed');
process.exit(results.fail === 0 ? 0 : 1);
