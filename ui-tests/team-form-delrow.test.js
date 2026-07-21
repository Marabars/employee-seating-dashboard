/**
 * Regression: deleting a distribution row in the team pencil form and saving
 * must actually remove that placement — including when the row is backed by a
 * named-employee allocation (not just bulk team seats). Previously save only
 * rewrote TEAM allocations, so a named-backed row reappeared after save.
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
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js',
 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js', 'js/modals.js',
 'js/render.js', 'js/render.teams.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 'a1', type: 'physical', phase: 'asis', name: 'Нева14', area: 200, zones: [{ id: 'az', name: 'Опен', capacity: 148, isVipZone: false }], tenants: [] },
      { id: 'tA', type: 'physical', phase: 'tobe', name: 'Нева14', area: 200, zones: [{ id: 'zta', name: 'Опен', capacity: 148, isVipZone: false }], tenants: [] },
      { id: 'tB', type: 'physical', phase: 'tobe', name: 'Стекляшка', area: 100, zones: [{ id: 'ztb', name: '3й этаж', capacity: 66, isVipZone: false }], tenants: [] },
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
    ],
    teams: [{ id: 'tm', name: 'Группа 2', employeesCount: 1, linkedTeamIds: [], isVip: false, currentOfficeId: null, toBeOfficeId: null }],
    employees: [{ id: 'e1', fullName: 'Мусин Т.', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' }],
    allocations: [
      { id: 'ea', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'tA', targetZoneId: 'zta' }, // named in Нева14 (tobe)
      { id: 'tb', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 1, targetOfficeId: 'tB', targetZoneId: 'ztb' }        // bulk in Стекляшка (tobe)
    ] }] });
App.state.setActiveScenario('s1');
App.render.setActiveTab('teams');
App.render.render();

var pencil = U.qsa('button', w.document.getElementById('tab-content')).filter(function (b) {
  return b.getAttribute && b.getAttribute('title') === 'Редактировать'; })[0];
pencil.click();

var tobeCtl = U.qsa('.placementrows', w.document)[1];
var rows = U.qsa('.placementrows-row', tobeCtl);
console.log('team form: delete a named-backed row persists');
assert(rows.length === 2, 'TO-BE has 2 rows (named Нева14 + bulk Стекляшка) — got ' + rows.length);
// delete the row whose office === tA (the named-employee-backed one)
var target = rows.filter(function (r) { return U.qs('.pr-office', r).value === 'tA'; })[0];
var delBtn = U.qsa('button', target).filter(function (b) { return b.textContent.trim() === '✕'; })[0];
delBtn.click();

var saveBtn = U.qsa('button', w.document).filter(function (x) { return x.textContent.trim() === 'Сохранить'; })[0];
saveBtn.click();

var s = App.state.getActiveScenario();
var e1TobeInTA = s.allocations.filter(function (a) {
  return a.type === 'employee' && a.employeeId === 'e1' && a.targetOfficeId === 'tA';
});
assert(e1TobeInTA.length === 0, "named employee's TO-BE allocation in Нева14 removed — got " + e1TobeInTA.length);
var occTA = App.calc.calculateOfficeOccupancy(s, 'tA');
assert(occTA === 0, 'Нева14 (tobe) occupancy is 0 after deleting its row — got ' + occTA);
var occTB = App.calc.calculateOfficeOccupancy(s, 'tB');
assert(occTB === 1, 'Стекляшка (tobe) still 1 — got ' + occTB);

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
