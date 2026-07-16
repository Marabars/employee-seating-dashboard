/**
 * Regression: the Teams pencil form must pre-fill the AS-IS/TO-BE distribution
 * rows from the team's ACTUAL placement, including seats placed as individual
 * named-employee allocations (not just bulk TEAM allocations). Mirrors the
 * Teams-table columns, which already aggregate both.
 */
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var shell = '<!DOCTYPE html><body>' +
  '<div id="dnd-live"></div><div id="topbar-status"></div>' +
  '<button id="btn-undo"></button><button id="btn-redo"></button>' +
  '<button id="btn-onboarding"></button><button id="btn-settings"></button>' +
  '<div id="viewonly-banner" style="display:none"></div>' +
  '<nav id="main-nav"></nav><aside id="scenarios-panel"></aside>' +
  '<main id="tab-content"></main></body>';
var dom = new JSDOM(shell, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js',
 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js', 'js/modals.js',
 'js/render.js', 'js/render.teams.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;

App.state.setProject({
  projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
  scenarios: [{
    id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 'a1o', type: 'physical', phase: 'asis', name: 'Нева 8й', area: 100, zones: [{ id: 'az', name: 'Опенспейс', capacity: 50, isVipZone: false }], tenants: [] },
      { id: 't1o', type: 'physical', phase: 'tobe', name: 'Стекляшка', area: 100, zones: [{ id: 'tz', name: '3й этаж', capacity: 50, isVipZone: false }], tenants: [] },
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
    ],
    teams: [{ id: 'tm', name: 'MR Private', employeesCount: 10, linkedTeamIds: [], isVip: false, currentOfficeId: null, toBeOfficeId: 't1o' }],
    employees: [
      { id: 'e1', fullName: 'Атанасиу К.', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' },
      { id: 'e2', fullName: 'Зуева Е.', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' }
    ],
    allocations: [
      { id: 'a1', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'a1o', targetZoneId: 'az' },
      { id: 'a2', type: 'employee', teamId: 'tm', employeeId: 'e2', employeesCount: 1, targetOfficeId: 'a1o', targetZoneId: 'az' },
      { id: 'a3', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 't1o', targetZoneId: 'tz' },
      { id: 'a4', type: 'employee', teamId: 'tm', employeeId: 'e2', employeesCount: 1, targetOfficeId: 't1o', targetZoneId: 'tz' }
    ]
  }]
});
App.state.setActiveScenario('s1');
App.render.setActiveTab('teams');
App.render.render();

var pencil = U.qsa('button', w.document.getElementById('tab-content')).filter(function (b) {
  return b.getAttribute && b.getAttribute('title') === 'Редактировать';
})[0];
pencil.click();

function rowsOf(ctl) {
  return U.qsa('.placementrows-row', ctl).map(function (row) {
    return { office: U.qs('.pr-office', row).value, count: U.qs('.pr-count', row).value };
  });
}
var controls = U.qsa('.placementrows', w.document);
console.log('team form pre-fills distribution from named-employee placement');
assert(controls.length === 2, 'two placementrows fields');
var asisRows = rowsOf(controls[0]);
var tobeRows = rowsOf(controls[1]);
assert(asisRows.length === 1 && asisRows[0].office === 'a1o' && asisRows[0].count === '2', 'AS-IS row prefilled: Нева 8й = 2 (from named employees) — got ' + JSON.stringify(asisRows));
assert(tobeRows.length === 1 && tobeRows[0].office === 't1o' && tobeRows[0].count === '2', 'TO-BE row prefilled: Стекляшка = 2 (from named employees) — got ' + JSON.stringify(tobeRows));

// Saving without changes must not double-count (occupancy uses max(teamSeats, named)).
var b = U.qsa('button', w.document).filter(function (x) { return x.textContent.trim() === 'Сохранить'; })[0];
b.click();
var occ = App.calc.calculateOfficeOccupancy(App.state.getActiveScenario(), 't1o');
assert(occ === 2, 'TO-BE office occupancy stays 2 after save (no double-count) — got ' + occ);

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
