'use strict';
// Allocations sheet is one row per entity (team + employee) with AS-IS / TO-BE
// columns showing "Офис / Зона" (teams add "(N)"). On import: employee rows are
// parsed and applied per phase; team rows are informational (Teams sheet is
// authoritative for team placement).
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

function proj() {
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 'a1o', type: 'physical', phase: 'asis', name: 'Старый', area: 100, zones: [{ id: 'az', name: 'Опен', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 't1o', type: 'physical', phase: 'tobe', name: 'Новый', area: 100, zones: [{ id: 'tz', name: 'Этаж3', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm', name: 'Alpha', employeesCount: 5, currentOfficeId: null, toBeOfficeId: null, linkedTeamIds: [], isVip: false, comment: '' }],
      employees: [{ id: 'e1', fullName: 'Иван Иванов', position: '', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office', comment: '' }],
      allocations: [
        { id: 'tA', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 3, targetOfficeId: 't1o', targetZoneId: 'tz', comment: '' },
        { id: 'eA', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'a1o', targetZoneId: 'az', comment: '' },
        { id: 'eB', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 't1o', targetZoneId: 'tz', comment: '' }
      ] }] };
}
function aoa(wb, name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

// ---- Export shape ----
App.state.setProject(proj());
App.state.setActiveScenario('s1');
var wb = App.importExport.buildWorkbook([App.state.getActiveScenario()], false);
var al = aoa(wb, 'Allocations');
console.log('Allocations sheet: one row per entity with AS-IS / TO-BE');
var h = al[0];
assert(h.indexOf('type') > -1 && h.indexOf('entity') > -1 && h.indexOf('as_is') > -1 && h.indexOf('to_be') > -1, 'header type/entity/as_is/to_be — got ' + JSON.stringify(h));
var ti = h.indexOf('type'), ei = h.indexOf('entity'), ai = h.indexOf('as_is'), bi = h.indexOf('to_be');
var teamRow = al.slice(1).filter(function (r) { return r[ti] === 'team' && r[ei] === 'Alpha'; })[0];
var empRow = al.slice(1).filter(function (r) { return r[ti] === 'employee' && r[ei] === 'Иван Иванов'; })[0];
assert(!!teamRow, 'team row present');
assert(!!empRow, 'employee row present');
assert(/Новый \/ Этаж3 \(3\)/.test(teamRow[bi]), 'team TO-BE = "Новый / Этаж3 (3)" — got ' + JSON.stringify(teamRow[bi]));
assert(empRow[ai] === 'Старый / Опен', 'employee AS-IS = "Старый / Опен" — got ' + JSON.stringify(empRow[ai]));
assert(empRow[bi] === 'Новый / Этаж3', 'employee TO-BE = "Новый / Этаж3" — got ' + JSON.stringify(empRow[bi]));

// ---- Round-trip: employee individual placement reconstructed ----
var bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
var rb = XLSX.read(bin, { type: 'array' });
function rt(n) { var ws = rb.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
var parsed = App.importValidation.parseWorkbook({ offices: rt('Offices'), zones: rt('Zones'), teams: rt('Teams'), employees: rt('Employees'), tenants: rt('Tenants'), allocations: rt('Allocations'), cf: rt('CF') });
App.importExport.applyImportParsed(parsed, 'new', 'RT');
var dst = App.state.getActiveScenario();
var emp = dst.employees.filter(function (e) { return e.fullName === 'Иван Иванов'; })[0];
var empAllocs = dst.allocations.filter(function (a) { return a.type === 'employee' && a.employeeId === emp.id; });
console.log('round-trip: employee individual placement');
function inPhase(a, ph) { var o = U.findById(dst.offices, a.targetOfficeId); return o && (ph === 'asis' ? o.phase === 'asis' : (o.phase === 'tobe' || o.type === 'remote')); }
var asisA = empAllocs.filter(function (a) { return inPhase(a, 'asis'); })[0];
var tobeA = empAllocs.filter(function (a) { return inPhase(a, 'tobe'); })[0];
assert(asisA && U.findById(dst.offices, asisA.targetOfficeId).name === 'Старый', 'employee AS-IS allocation → Старый');
assert(tobeA && U.findById(dst.offices, tobeA.targetOfficeId).name === 'Новый', 'employee TO-BE allocation → Новый');

// ---- Team rows in Allocations are NOT authoritative (Teams sheet wins) ----
App.state.setProject(proj());
App.state.setActiveScenario('s1');
var sheets = {
  offices: [['office_name', 'office_type', 'area'], ['Старый', 'asis', 100], ['Новый', 'tobe', 100]],
  zones: [['office_name', 'office_phase', 'zone_name', 'zone_type', 'capacity'], ['Старый', 'asis', 'Опен', 'open_space', 50], ['Новый', 'tobe', 'Этаж3', 'open_space', 50]],
  employees: [],
  teams: [['team_name', 'employees_count', 'current_office', 'to_be_office'], ['Alpha', 5, '', 'Новый / Этаж3 (5)']],
  tenants: [],
  allocations: [['type', 'entity', 'as_is', 'to_be'], ['team', 'Alpha', '', 'Старый / Опен (2)']],
  cf: []
};
var parsedB = App.importValidation.parseWorkbook(sheets);
App.importExport.applyImportParsed(parsedB, 'new', 'B');
var dstB = App.state.getActiveScenario();
var tmB = dstB.teams.filter(function (t) { return t.name === 'Alpha'; })[0];
var teamAllocsB = dstB.allocations.filter(function (a) { return a.type === 'team' && a.teamId === tmB.id; });
console.log('Teams sheet authoritative for teams (Allocations team rows ignored)');
assert(teamAllocsB.length === 1, 'one team allocation — got ' + teamAllocsB.length);
var obTeam = teamAllocsB[0] && U.findById(dstB.offices, teamAllocsB[0].targetOfficeId);
assert(obTeam && obTeam.name === 'Новый' && teamAllocsB[0].employeesCount === 5, 'team placed from Teams sheet (Новый, 5) not Allocations (Старый, 2)');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
