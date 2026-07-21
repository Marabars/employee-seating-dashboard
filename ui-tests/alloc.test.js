'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');

var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

function loadApp() {
  var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  var w = dom.window;
  ['js/constants.js', 'js/utils.js', 'js/state.js', 'js/calculations.js', 'js/allocations.js'].forEach(function (f) {
    var s = w.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8');
    w.document.body.appendChild(s);
  });
  return w;
}
function project() {
  return {
    projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
    scenarios: [{
      id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 'a1', type: 'physical', phase: 'asis', name: 'AsisA', area: 100, zones: [{ id: 'az', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 't1o', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, zones: [{ id: 'tz', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 't2o', type: 'physical', phase: 'tobe', name: 'TobeB', area: 100, zones: [{ id: 'tz2', name: 'Z2', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, linkedTeamIds: [], isVip: false }],
      employees: [{ id: 'e1', fullName: 'Иван', teamId: 'tm' }],
      allocations: [
        { id: 'old_tobe', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 4, targetOfficeId: 't1o', targetZoneId: 'tz' },
        { id: 'old_asis', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 4, targetOfficeId: 'a1', targetZoneId: null },
        { id: 'emp_tobe', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 't1o', targetZoneId: 'tz' }
      ]
    }]
  };
}

console.log('setTeamPhaseAllocations');
var w = loadApp();
var App = w.App;
App.state.setProject(project());
App.state.setActiveScenario('s1');

App.allocations.setTeamPhaseAllocations('tm', 'tobe', [
  { officeId: 't1o', zoneId: 'tz', count: 3 },
  { officeId: 't2o', zoneId: 'tz2', count: 2 }
]);

var s = App.state.getActiveScenario();
var tobeTeam = s.allocations.filter(function (a) { return a.type === 'team' && a.teamId === 'tm' && (a.targetOfficeId === 't1o' || a.targetOfficeId === 't2o' || a.targetOfficeId === 'rem'); });
assert(tobeTeam.length === 2, 'two TO-BE team allocations after sync (got ' + tobeTeam.length + ')');
assert(tobeTeam.filter(function (a) { return a.targetOfficeId === 't1o' && a.employeesCount === 3; }).length === 1, 't1o has 3');
assert(tobeTeam.filter(function (a) { return a.targetOfficeId === 't2o' && a.employeesCount === 2; }).length === 1, 't2o has 2');
assert(s.allocations.filter(function (a) { return a.id === 'emp_tobe'; }).length === 1, 'EMPLOYEE allocation untouched');
assert(s.allocations.filter(function (a) { return a.id === 'old_asis'; }).length === 1, 'AS-IS allocation untouched');

App.allocations.setTeamPhaseAllocations('tm', 'tobe', []);
var s2 = App.state.getActiveScenario();
assert(s2.allocations.filter(function (a) { return a.type === 'team' && a.teamId === 'tm' && (a.targetOfficeId === 't1o' || a.targetOfficeId === 't2o'); }).length === 0, 'empty rows remove all TO-BE team allocations');
// Clearing the phase distribution also unplaces the team's named members in that
// phase (offices no longer in the rows) — so deleting a row fully removes it.
assert(s2.allocations.filter(function (a) { return a.id === 'emp_tobe'; }).length === 0, 'named member TO-BE allocation removed by empty sync');
// AS-IS named/team placements are left intact (different phase).
assert(s2.allocations.filter(function (a) { return a.id === 'old_asis'; }).length === 1, 'AS-IS allocation untouched by TO-BE clear');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
