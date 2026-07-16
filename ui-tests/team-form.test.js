/**
 * Headless UI test (jsdom): the Teams pencil form distributes a team partially
 * across offices/zones via placementrows, and blocks over-headcount sums.
 * Boots the app shell + the modules the Teams tab needs, renders the tab,
 * clicks the pencil, drives the modal, and asserts on App.state.
 *
 * Run:  cd ui-tests && npm install && node team-form.test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
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
var w = dom.window;
// Silence jsdom's unimplemented window.scrollTo (render() calls it).
w.scrollTo = function () {};
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js',
 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js', 'js/modals.js',
 'js/render.js', 'js/render.teams.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script');
  s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8');
  w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;

function project() {
  return {
    projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
    scenarios: [{
      id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 't1o', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, zones: [{ id: 'tz', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 't2o', type: 'physical', phase: 'tobe', name: 'TobeB', area: 100, zones: [{ id: 'tz2', name: 'Z2', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, linkedTeamIds: [], isVip: false }],
      employees: [], allocations: []
    }]
  };
}

function openPencil() {
  App.render.setActiveTab('teams');
  App.render.render();
  var pencil = U.qsa('button', w.document.getElementById('tab-content')).filter(function (b) {
    return b.getAttribute && b.getAttribute('title') === 'Редактировать';
  })[0];
  pencil.click();
}
function tobeControl() { return U.qsa('.placementrows', w.document)[1]; }
function addFilled(ctl, officeId, count) {
  var addBtn = U.qsa('button', ctl).filter(function (b) { return /строка/.test(b.textContent); })[0];
  addBtn.click();
  var rows = U.qsa('.placementrows-row', ctl);
  var row = rows[rows.length - 1];
  U.qs('.pr-office', row).value = officeId;
  U.qs('.pr-count', row).value = String(count);
}
function clickBtn(label) {
  var b = U.qsa('button', w.document).filter(function (x) { return x.textContent.trim() === label; })[0];
  if (b) { b.click(); }
  return !!b;
}
function teamTobe() {
  return App.state.getActiveScenario().allocations.filter(function (a) { return a.type === 'team' && a.teamId === 'tm'; });
}

console.log('team form: partial distribution');
App.state.setProject(project());
App.state.setActiveScenario('s1');

// --- Happy path: two TO-BE rows across two offices ---
openPencil();
assert(U.qsa('.placementrows', w.document).length === 2, 'two placementrows fields (AS-IS + TO-BE)');
addFilled(tobeControl(), 't1o', 6);
addFilled(tobeControl(), 't2o', 3);
assert(clickBtn('Сохранить'), 'Save button present');

var tobe = teamTobe();
assert(tobe.length === 2, 'two TO-BE team allocations created (got ' + tobe.length + ')');
assert(tobe.filter(function (a) { return a.targetOfficeId === 't1o' && a.employeesCount === 6; }).length === 1, 't1o=6');
assert(tobe.filter(function (a) { return a.targetOfficeId === 't2o' && a.employeesCount === 3; }).length === 1, 't2o=3');
var team = App.state.getActiveScenario().teams.filter(function (t) { return t.id === 'tm'; })[0];
assert(team.toBeOfficeId === 't1o', 'profile toBeOfficeId = dominant row office (t1o)');

// --- Over-headcount is blocked: add a 3rd row making 6+3+5=14 > 10 ---
openPencil();
addFilled(tobeControl(), 'rem', 5);
clickBtn('Сохранить');
var tobe2 = teamTobe();
assert(tobe2.length === 2, 'over-headcount save is blocked; allocations unchanged (got ' + tobe2.length + ')');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
