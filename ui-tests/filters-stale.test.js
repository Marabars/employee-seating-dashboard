/**
 * Regression: a filter value left over from another scenario must not silently
 * blank the table. Entity ids are regenerated on every Excel import (and differ
 * between scenarios), so a selected team/office id matches nothing afterwards —
 * the "Сотрудники"/"Команды" tab showed "Найдено: 0" while every dropdown still
 * read "все". Stale values are now dropped when the filters are rebuilt.
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
 'js/render.js', 'js/render.employees.js', 'js/render.teams.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;

/** Two scenarios holding the same people under different ids (as after a re-import). */
function scenario(sfx) {
  return { id: 's' + sfx, name: 'S' + sfx, comment: '', cfOverride: null,
    offices: [
      { id: 'a' + sfx, type: 'physical', phase: 'asis', name: 'Нева17', area: 200, zones: [{ id: 'az' + sfx, name: 'Опен', capacity: 100, isVipZone: false }], tenants: [] },
      { id: 't' + sfx, type: 'physical', phase: 'tobe', name: 'Icity', area: 200, zones: [{ id: 'tz' + sfx, name: 'Опен', capacity: 100, isVipZone: false }], tenants: [] }
    ],
    teams: [
      { id: 'tmA' + sfx, name: 'Казначейство', employeesCount: 2, linkedTeamIds: [], isVip: false, currentOfficeId: 'a' + sfx, toBeOfficeId: null },
      { id: 'tmB' + sfx, name: 'Бухгалтерия', employeesCount: 1, linkedTeamIds: [], isVip: false, currentOfficeId: null, toBeOfficeId: null }
    ],
    employees: [
      { id: 'e1' + sfx, fullName: 'Некрасов Ф.', teamId: 'tmA' + sfx, currentOfficeId: 'a' + sfx, isVip: false, workFormat: 'office' },
      { id: 'e2' + sfx, fullName: 'Зайченко Л.', teamId: 'tmA' + sfx, currentOfficeId: null, isVip: false, workFormat: 'office' },
      { id: 'e3' + sfx, fullName: 'Корнева А.', teamId: 'tmB' + sfx, currentOfficeId: null, isVip: false, workFormat: 'office' }
    ],
    allocations: [] };
}
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
  scenarios: [scenario('1'), scenario('2')] });

var main = w.document.getElementById('tab-content');
function found() { var e = U.qs('.result-count', main); return e ? e.textContent : '(none)'; }
function rowCount() { return U.qsa('.data-table tbody tr', main).length; }
function pickFilter(label, optionText) {
  var sel = U.qsa('.filters select', main).filter(function (s) { return (s.getAttribute('aria-label') || '') === label; })[0];
  var opt = U.qsa('option', sel).filter(function (o) { return o.textContent === optionText; })[0];
  sel.value = opt.value;
  sel.dispatchEvent(new w.Event('change'));
}

console.log('Сотрудники: filter from another scenario is dropped, not applied silently');
App.state.setActiveScenario('s1');
App.render.setActiveTab('employees');
App.render.render();
assert(rowCount() === 3, 'scenario 1 lists all 3 employees — got ' + rowCount());

pickFilter('Команда', 'Казначейство');
assert(rowCount() === 2, 'filter by team narrows to 2 — got ' + rowCount() + ' (' + found() + ')');

App.state.setActiveScenario('s2');
App.render.render();
assert(rowCount() === 3, 'after switching scenario all 3 employees are back — got ' + rowCount() + ' (' + found() + ')');

var teamSel = U.qsa('.filters select', main).filter(function (s) { return s.getAttribute('aria-label') === 'Команда'; })[0];
assert(teamSel.selectedIndex === 0, 'team dropdown reads "все" and the table agrees with it');

console.log('Команды: same for the office filters on the teams tab');
App.state.setActiveScenario('s1');
App.render.setActiveTab('teams');
App.render.render();
assert(rowCount() === 2, 'scenario 1 lists both teams — got ' + rowCount());

pickFilter('AS-IS офис', 'Нева17');
assert(rowCount() === 1, 'filter by AS-IS office narrows to 1 — got ' + rowCount() + ' (' + found() + ')');

App.state.setActiveScenario('s2');
App.render.render();
assert(rowCount() === 2, 'after switching scenario both teams are back — got ' + rowCount() + ' (' + found() + ')');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
