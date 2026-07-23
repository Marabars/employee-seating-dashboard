'use strict';
// Export → import of the same scenario must be idempotent: remote offices are not
// re-created as physical duplicates, and placements are not doubled (team bulk vs
// individual employee allocations are exported in separate sheets, not both).
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body><div id="dnd-live"></div></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
['libs/xlsx.full.min.js', 'js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js',
 'js/teams.js', 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js',
 'js/validation.import.js', 'js/modals.js', 'js/undoRedo.js', 'js/importExport.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, XLSX = w.XLSX, U = App.utils;
App.render = { render: function () {} };

App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 'ra', type: 'remote', phase: 'asis', name: 'Удаленка (AS IS)', unlimitedCapacity: true, isSystem: true, zones: [] },
      { id: 'rt', type: 'remote', phase: 'tobe', name: 'Удаленка (TO BE)', unlimitedCapacity: true, isSystem: true, zones: [] },
      { id: 'aO', type: 'physical', phase: 'asis', name: 'Старый', area: 100, zones: [{ id: 'az', name: 'Опен', capacity: 50, isVipZone: false }], tenants: [] },
      { id: 'tO', type: 'physical', phase: 'tobe', name: 'Новый', area: 100, zones: [{ id: 'tz', name: 'Этаж3', capacity: 50, isVipZone: false }], tenants: [] }
    ],
    teams: [{ id: 'tm', name: 'Alpha', employeesCount: 3, linkedTeamIds: [], isVip: false }],
    employees: [
      { id: 'e1', fullName: 'Иван', teamId: 'tm', isVip: false, workFormat: 'office' },
      { id: 'e2', fullName: 'Пётр', teamId: 'tm', isVip: false, workFormat: 'office' }
    ],
    allocations: [
      { id: 'a1', type: 'team', teamId: 'tm', employeesCount: 3, targetOfficeId: 'tO', targetZoneId: 'tz' }, // bulk TO-BE 3
      { id: 'a2', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'aO', targetZoneId: 'az' }, // e1 individual AS-IS
      { id: 'a3', type: 'employee', teamId: 'tm', employeeId: 'e2', employeesCount: 1, targetOfficeId: 'rt', targetZoneId: null } // e2 individual TO-BE remote
    ] }] });
App.state.setActiveScenario('s1');

function signature(s) {
  var offices = s.offices.map(function (o) { return o.type + ':' + o.phase + ':' + o.name; }).sort();
  var emps = s.employees.map(function (e) { return e.fullName; }).sort();
  var allocs = s.allocations.map(function (a) {
    var o = U.findById(s.offices, a.targetOfficeId);
    var z = (o && a.targetZoneId) ? U.findById(o.zones || [], a.targetZoneId) : null;
    return a.type + '|' + (a.employeeId || '') + '|' + (o ? o.name : '?') + '|' + (z ? z.name : '') + '|' + (a.employeesCount || '');
  }).sort();
  return { offices: offices, emps: emps, allocs: allocs };
}
function count(s) { return { offices: s.offices.length, employees: s.employees.length, allocations: s.allocations.length }; }

var before = App.state.getActiveScenario();
var beforeCount = count(before);
var beforeSig = signature(before);

var wb = App.importExport.buildWorkbook([before], false);
var bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
var rb = XLSX.read(bin, { type: 'array' });
function rt(n) { var ws = rb.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
App.importExport.applyImportParsed(App.importValidation.parseWorkbook({ offices: rt('Offices'), zones: rt('Zones'), teams: rt('Teams'), employees: rt('Employees'), tenants: rt('Tenants'), allocations: rt('Allocations'), cf: rt('CF') }), 'new', 'RT');
var after = App.state.getActiveScenario();

console.log('export→import is idempotent');
assert(after.offices.length === beforeCount.offices, 'office count unchanged (' + beforeCount.offices + ') — got ' + after.offices.length);
assert(after.offices.filter(function (o) { return o.type === 'remote'; }).length === 2, 'exactly 2 remote offices (no physical Удаленка dup) — got ' + after.offices.filter(function (o) { return o.type === 'remote'; }).length);
assert(after.offices.filter(function (o) { return o.type === 'physical' && /Удаленка/.test(o.name); }).length === 0, 'no physical office named Удаленка');
assert(after.employees.length === beforeCount.employees, 'employee count unchanged (' + beforeCount.employees + ') — got ' + after.employees.length);
assert(after.allocations.length === beforeCount.allocations, 'allocation count unchanged (' + beforeCount.allocations + ') — got ' + after.allocations.length);
var afterSig = signature(after);
assert(JSON.stringify(afterSig.offices) === JSON.stringify(beforeSig.offices), 'office signature identical');
assert(JSON.stringify(afterSig.allocs.map(function (x) { return x.replace(/^[^|]*\|[^|]*\|/, ''); })) === JSON.stringify(beforeSig.allocs.map(function (x) { return x.replace(/^[^|]*\|[^|]*\|/, ''); })), 'allocation placement signature identical (office/zone/count)');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
