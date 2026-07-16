'use strict';
// Teams sheet AS-IS/TO-BE office columns show the team distribution as
// "Офис / Зона (N)" (one per line for splits, count = max(teamSeats, named)),
// and on import those columns are parsed and applied (team distribution),
// overriding team rows from the Allocations sheet. Employees untouched.
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

function proj(allocations) {
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 'oA', type: 'physical', phase: 'tobe', name: 'ОфисA', area: 100, zones: [{ id: 'zA', name: 'ЗонаA', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'oB', type: 'physical', phase: 'tobe', name: 'ОфисB', area: 100, zones: [{ id: 'zB', name: 'ЗонаB', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, currentOfficeId: null, toBeOfficeId: null, linkedTeamIds: [], isVip: false, comment: '' }],
      employees: [], allocations: allocations }] };
}
function aoa(wb, name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

// ---- Test A: export format + round-trip (team split, no double) ----
App.state.setProject(proj([
  { id: 'a1', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 4, targetOfficeId: 'oA', targetZoneId: 'zA', comment: '' },
  { id: 'a2', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 6, targetOfficeId: 'oB', targetZoneId: 'zB', comment: '' }
]));
App.state.setActiveScenario('s1');
var wb = App.importExport.buildWorkbook([App.state.getActiveScenario()], false);
var tRows = aoa(wb, 'Teams');
var tobeCol = tRows[0].indexOf('to_be_office');
var cell = tRows[1][tobeCol];
console.log('export: distribution as "Офис / Зона (N)" per line');
assert(/ОфисA \/ ЗонаA \(4\)/.test(cell), 'line "ОфисA / ЗонаA (4)" present — got ' + JSON.stringify(cell));
assert(/ОфисB \/ ЗонаB \(6\)/.test(cell), 'line "ОфисB / ЗонаB (6)" present');
assert(cell.indexOf('\n') > -1, 'multiple placements separated by newline');

var bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
var rb = XLSX.read(bin, { type: 'array' });
function rt(name) { var ws = rb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
var parsed = App.importValidation.parseWorkbook({ offices: rt('Offices'), zones: rt('Zones'), teams: rt('Teams'), employees: rt('Employees'), tenants: rt('Tenants'), allocations: rt('Allocations'), cf: rt('CF') });
App.importExport.applyImportParsed(parsed, 'new', 'RT');
var dst = App.state.getActiveScenario();
var t = dst.teams.filter(function (x) { return x.name === 'Alpha'; })[0];
var teamAllocs = dst.allocations.filter(function (a) { return a.type === 'team' && a.teamId === t.id; });
console.log('round-trip: split preserved, no double');
assert(teamAllocs.length === 2, 'exactly 2 team allocations — got ' + teamAllocs.length);
function findAlloc(officeName, zoneName) {
  return teamAllocs.filter(function (a) {
    var o = U.findById(dst.offices, a.targetOfficeId);
    var z = a.targetZoneId ? U.findById(o.zones || [], a.targetZoneId) : null;
    return o && o.name === officeName && (!zoneName || (z && z.name === zoneName));
  })[0];
}
var aA = findAlloc('ОфисA', 'ЗонаA'), aB = findAlloc('ОфисB', 'ЗонаB');
assert(aA && aA.employeesCount === 4, 'ОфисA/ЗонаA = 4');
assert(aB && aB.employeesCount === 6, 'ОфисB/ЗонаB = 6');

// ---- Test B: Teams column overrides Allocations sheet team rows ----
App.state.setProject(proj([]));
App.state.setActiveScenario('s1');
var sheets = {
  offices: [['office_name', 'office_type', 'area'], ['ОфисA', 'tobe', 100], ['ОфисB', 'tobe', 100]],
  zones: [['office_name', 'office_phase', 'zone_name', 'zone_type', 'capacity'], ['ОфисB', 'tobe', 'ЗонаB', 'open_space', 50]],
  employees: [],
  teams: [['team_name', 'employees_count', 'current_office', 'to_be_office'], ['Alpha', 10, '', 'ОфисB / ЗонаB (7)']],
  tenants: [],
  allocations: [['type', 'entity', 'phase', 'count', 'office', 'zone'], ['team', 'Alpha', 'tobe', 4, 'ОфисA', '']],
  cf: []
};
var parsedB = App.importValidation.parseWorkbook(sheets);
App.importExport.applyImportParsed(parsedB, 'new', 'B');
var dstB = App.state.getActiveScenario();
var tB = dstB.teams.filter(function (x) { return x.name === 'Alpha'; })[0];
var tobeB = dstB.allocations.filter(function (a) {
  if (a.type !== 'team' || a.teamId !== tB.id) { return false; }
  var o = U.findById(dstB.offices, a.targetOfficeId); return o && o.phase === 'tobe';
});
console.log('Teams column overrides Allocations team rows');
assert(tobeB.length === 1, 'exactly 1 TO-BE team allocation after override — got ' + tobeB.length);
var oB = tobeB[0] && U.findById(dstB.offices, tobeB[0].targetOfficeId);
assert(oB && oB.name === 'ОфисB' && tobeB[0].employeesCount === 7, 'override applied: ОфисB = 7 (not ОфисA=4)');

// ---- Test C: named-employee seats counted in export ----
App.state.setProject(proj([
  { id: 'e', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'oA', targetZoneId: 'zA', comment: '' }
]));
var sc = App.state.getActiveScenario(); sc.employees.push({ id: 'e1', fullName: 'Иван', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' });
var wbC = App.importExport.buildWorkbook([sc], false);
var tC = aoa(wbC, 'Teams');
var cC = tC[1][tC[0].indexOf('to_be_office')];
console.log('named-employee seats counted');
assert(/ОфисA \/ ЗонаA \(1\)/.test(cC), 'named employee counted: "ОфисA / ЗонаA (1)" — got ' + JSON.stringify(cC));

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
