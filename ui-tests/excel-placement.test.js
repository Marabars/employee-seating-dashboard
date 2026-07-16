'use strict';
// Teams/Employees sheets must reflect ACTUAL placement (derived from allocations),
// and the Teams office columns must drive placement on import when there is no
// Allocations sheet. The Allocations sheet stays authoritative (no double-count).
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

function baseProject() {
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 'asisO', type: 'physical', phase: 'asis', name: 'Старый офис', area: 200, zones: [{ id: 'za', name: 'Опенспейс', capacity: 100, isVipZone: false }], tenants: [] },
        { id: 'tobeO', type: 'physical', phase: 'tobe', name: 'Новый офис', area: 300, zones: [{ id: 'zt', name: 'Опенспейс', capacity: 150, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm1', name: 'Финансы', employeesCount: 8, currentOfficeId: null, toBeOfficeId: null, linkedTeamIds: [], isVip: false, comment: '' }],
      employees: [{ id: 'e1', fullName: 'Иванов И.И.', position: 'CFO', teamId: 'tm1', currentOfficeId: null, isVip: false, workFormat: 'office', comment: '' }],
      allocations: [
        { id: 'al1', type: 'team', teamId: 'tm1', employeeId: null, employeesCount: 3, targetOfficeId: 'asisO', targetZoneId: 'za', comment: '' },
        { id: 'al2', type: 'team', teamId: 'tm1', employeeId: null, employeesCount: 5, targetOfficeId: 'tobeO', targetZoneId: 'zt', comment: '' }
      ] }] };
}

// ---- Test 1: export reflects actual placement ----
App.state.setProject(baseProject());
App.state.setActiveScenario('s1');
var src = App.state.getActiveScenario();
var wb = App.importExport.buildWorkbook([src], false);
function aoa(wbook, name) { var ws = wbook.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

console.log('export reflects placement');
var tRows = aoa(wb, 'Teams');
var tHead = tRows[0], tRow = tRows[1];
var ciCur = tHead.indexOf('current_office'), ciTobe = tHead.indexOf('to_be_office');
assert(/Старый офис/.test(tRow[ciCur]), 'Teams current_office shows AS-IS placement office — got "' + tRow[ciCur] + '"');
assert(/Новый офис/.test(tRow[ciTobe]), 'Teams to_be_office shows TO-BE placement office — got "' + tRow[ciTobe] + '"');
var eRows = aoa(wb, 'Employees');
var eHead = eRows[0], eRow = eRows[1];
var eiCur = eHead.indexOf('current_office');
assert(/Новый офис/.test(eRow[eiCur]), 'Employees current_office shows placement office — got "' + eRow[eiCur] + '"');

// ---- Test 2: Teams columns drive import when no Allocations sheet ----
App.state.setProject(baseProject());
App.state.setActiveScenario('s1');
var sheets2 = {
  offices: [['office_name', 'office_type', 'area'], ['Старый офис', 'asis', 200], ['Новый офис', 'tobe', 300]],
  zones: [], employees: [],
  teams: [['team_name', 'employees_count', 'current_office', 'to_be_office'], ['Финансы', 8, 'Старый офис', 'Новый офис']],
  tenants: [], allocations: [], cf: []
};
var parsed2 = App.importValidation.parseWorkbook(sheets2);
App.importExport.applyImportParsed(parsed2, 'new', 'FromColumns');
var dst2 = App.state.getActiveScenario();
var team2 = dst2.teams.filter(function (t) { return t.name === 'Финансы'; })[0];
function teamAllocOfficeNames(scn, teamId, phasePred) {
  return scn.allocations.filter(function (a) { return a.type === 'team' && a.teamId === teamId; })
    .map(function (a) { return U.findById(scn.offices, a.targetOfficeId); })
    .filter(function (o) { return o && phasePred(o); }).map(function (o) { return o.name; });
}
console.log('Teams columns drive import (no Allocations sheet)');
assert(!!team2, 'team imported');
assert(teamAllocOfficeNames(dst2, team2.id, function (o) { return o.phase === 'asis'; }).indexOf('Старый офис') > -1, 'AS-IS placement allocation created from current_office column');
assert(teamAllocOfficeNames(dst2, team2.id, function (o) { return o.phase === 'tobe'; }).indexOf('Новый офис') > -1, 'TO-BE placement allocation created from to_be_office column');

// ---- Test 3: full round-trip keeps split exactly, no double-count ----
App.state.setProject(baseProject());
App.state.setActiveScenario('s1');
var src3 = App.state.getActiveScenario();
var wb3 = App.importExport.buildWorkbook([src3], false);
var bin = XLSX.write(wb3, { type: 'array', bookType: 'xlsx' });
var rb = XLSX.read(bin, { type: 'array' });
function rt(name) { var ws = rb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
var parsed3 = App.importValidation.parseWorkbook({ offices: rt('Offices'), zones: rt('Zones'), teams: rt('Teams'), employees: rt('Employees'), tenants: rt('Tenants'), allocations: rt('Allocations'), cf: rt('CF') });
App.importExport.applyImportParsed(parsed3, 'new', 'RT');
var dst3 = App.state.getActiveScenario();
var t3 = dst3.teams.filter(function (t) { return t.name === 'Финансы'; })[0];
var teamAllocs3 = dst3.allocations.filter(function (a) { return a.type === 'team' && a.teamId === t3.id; });
console.log('full round-trip: split preserved, no double-count');
assert(teamAllocs3.length === 2, 'exactly 2 team allocations after round-trip (no double from columns) — got ' + teamAllocs3.length);
var counts = teamAllocs3.map(function (a) { return a.employeesCount; }).sort();
assert(counts[0] === 3 && counts[1] === 5, 'per-office counts preserved (3 + 5) — got ' + counts.join('+'));

// ---- Test 4: export reflects placement made via NAMED-EMPLOYEE allocations ----
var namedProj = baseProject();
var scn4 = namedProj.scenarios[0];
scn4.allocations = [
  { id: 'ne1', type: 'employee', teamId: 'tm1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'asisO', targetZoneId: 'za', comment: '' }
];
scn4.teams[0].toBeOfficeId = null; scn4.teams[0].currentOfficeId = null;
App.state.setProject(namedProj);
App.state.setActiveScenario('s1');
var wb4 = App.importExport.buildWorkbook([App.state.getActiveScenario()], false);
var t4 = aoa(wb4, 'Teams');
var h4 = t4[0], r4 = t4[1];
console.log('export reflects named-employee placement');
assert(/Старый офис/.test(r4[h4.indexOf('current_office')]), 'current_office shows office of named-employee placement — got "' + r4[h4.indexOf('current_office')] + '"');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
