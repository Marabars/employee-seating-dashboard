'use strict';
// The team "Распределено" counter (calculateTeamAllocated) must stay correct when
// an employee's allocation changes — including reassigning the employee to another
// team or removing them from the team: their individual allocations' teamId must
// follow, so the old team stops counting them and the new team starts.
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js', 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App;
App.render = { render: function () {} };
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [{ id: 't1', type: 'physical', phase: 'tobe', name: 'Новый', area: 100, zones: [{ id: 'tz', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }],
    teams: [{ id: 'tm', name: 'A', employeesCount: 10, linkedTeamIds: [], isVip: false },
            { id: 'tm2', name: 'B', employeesCount: 5, linkedTeamIds: [], isVip: false }],
    employees: [{ id: 'e1', fullName: 'Иван', teamId: 'tm', isVip: false, workFormat: 'office' }],
    allocations: [] }] });
App.state.setActiveScenario('s1');
function A(tid) { return App.calc.calculateTeamAllocated(App.state.getActiveScenario(), tid); }

console.log('team counter follows employee reassignment');
App.allocations.setEmployeeAllocation('e1', 't1', 'tz');
assert(A('tm') === 1, 'after placing e1 in TO-BE, team A allocated = 1');
assert(A('tm2') === 0, 'team B allocated = 0');

App.employees.update('e1', { teamId: 'tm2' });
assert(A('tm') === 0, 'after reassigning e1 to B, team A allocated = 0 (no longer counts e1) — got ' + A('tm'));
assert(A('tm2') === 1, 'team B now counts e1 = 1 — got ' + A('tm2'));
var e1alloc = App.state.getActiveScenario().allocations.filter(function (a) { return a.employeeId === 'e1'; })[0];
assert(e1alloc && e1alloc.teamId === 'tm2', "e1's allocation teamId synced to new team");

App.employees.update('e1', { teamId: '' });
assert(A('tm2') === 0, 'after removing e1 from any team, team B allocated = 0 — got ' + A('tm2'));

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
