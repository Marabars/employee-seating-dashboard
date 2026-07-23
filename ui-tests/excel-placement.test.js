'use strict';
// New Excel format round-trip:
//  - Employees sheet has AS-IS (office/zone/vip/work_format) + TO-BE blocks and
//    drives per-phase employee placement on import.
//  - Teams sheet is one row per placement (phase/office/zone/count) and drives
//    team placement on import.
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
        { id: 'aO', type: 'physical', phase: 'asis', name: 'Старый', area: 100, zones: [{ id: 'az', name: 'Опен', capacity: 100, isVipZone: false }], tenants: [] },
        { id: 'tO', type: 'physical', phase: 'tobe', name: 'Новый', area: 100, zones: [{ id: 'tz', name: 'Этаж3', capacity: 100, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm', name: 'Финансы', employeesCount: 8, linkedTeamIds: [], isVip: false }],
      employees: [{ id: 'e1', fullName: 'Иванов', position: 'CFO', teamId: 'tm', isVip: false, workFormat: 'office' }],
      allocations: [
        { id: 'a1', type: 'team', teamId: 'tm', employeesCount: 3, targetOfficeId: 'aO', targetZoneId: 'az' },
        { id: 'a2', type: 'team', teamId: 'tm', employeesCount: 5, targetOfficeId: 'tO', targetZoneId: 'tz' },
        { id: 'a3', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'aO', targetZoneId: 'az' },
        { id: 'a4', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'tO', targetZoneId: 'tz' }
      ] }] };
}

App.state.setProject(baseProject());
App.state.setActiveScenario('s1');
var wb = App.importExport.buildWorkbook([App.state.getActiveScenario()], false);
function aoa(wbk, n) { var ws = wbk.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

console.log('export: Employees AS-IS + TO-BE blocks');
var e = aoa(wb, 'Employees'); var eh = e[0], er = e[1];
assert(eh.indexOf('current_office') > -1 && eh.indexOf('cabinet') > -1 && eh.indexOf('to_be_office') > -1 && eh.indexOf('to_be_zone') > -1, 'Employees header has AS-IS + TO-BE office/zone');
assert(er[eh.indexOf('current_office')] === 'Старый' && er[eh.indexOf('cabinet')] === 'Опен', 'employee AS-IS = Старый/Опен');
assert(er[eh.indexOf('to_be_office')] === 'Новый' && er[eh.indexOf('to_be_zone')] === 'Этаж3', 'employee TO-BE = Новый/Этаж3');

console.log('export: Teams parallel AS-IS / TO-BE columns');
var t = aoa(wb, 'Teams'); var th = t[0];
assert(th.indexOf('as_is_office') > -1 && th.indexOf('as_is_zone') > -1 && th.indexOf('to_be_office') > -1 && th.indexOf('to_be_zone') > -1, 'Teams header has AS-IS + TO-BE office/zone columns');
var trows = t.slice(1).filter(function (r) { return r[th.indexOf('team_name')] === 'Финансы'; });
assert(trows.length === 1, 'one placement row for Финансы (1 AS-IS + 1 TO-BE) — got ' + trows.length);
var r0 = trows[0];
assert(r0[th.indexOf('as_is_office')] === 'Старый' && r0[th.indexOf('as_is_zone')] === 'Опен' && r0[th.indexOf('as_is_count')] === 3, 'AS-IS Старый/Опен/3');
assert(r0[th.indexOf('to_be_office')] === 'Новый' && r0[th.indexOf('to_be_zone')] === 'Этаж3' && r0[th.indexOf('to_be_count')] === 5, 'TO-BE Новый/Этаж3/5');

console.log('round-trip: teams + employees placement reconstructed');
var bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
var rb = XLSX.read(bin, { type: 'array' });
function rt(n) { var ws = rb.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
var parsed = App.importValidation.parseWorkbook({ offices: rt('Offices'), zones: rt('Zones'), teams: rt('Teams'), employees: rt('Employees'), tenants: rt('Tenants'), allocations: rt('Allocations'), cf: rt('CF') });
App.importExport.applyImportParsed(parsed, 'new', 'RT');
var dst = App.state.getActiveScenario();
function off(id) { return U.findById(dst.offices, id); }
var team = dst.teams.filter(function (x) { return x.name === 'Финансы'; })[0];
var teamAllocs = dst.allocations.filter(function (a) { return a.type === 'team' && a.teamId === team.id; });
assert(teamAllocs.filter(function (a) { return off(a.targetOfficeId).name === 'Старый' && a.employeesCount === 3; }).length === 1, 'team AS-IS Старый=3 round-trip');
assert(teamAllocs.filter(function (a) { return off(a.targetOfficeId).name === 'Новый' && a.employeesCount === 5; }).length === 1, 'team TO-BE Новый=5 round-trip');
var emp = dst.employees.filter(function (x) { return x.fullName === 'Иванов'; })[0];
var empAllocs = dst.allocations.filter(function (a) { return a.type === 'employee' && a.employeeId === emp.id; });
assert(empAllocs.filter(function (a) { return off(a.targetOfficeId).name === 'Старый'; }).length === 1, 'employee AS-IS individual alloc round-trip');
assert(empAllocs.filter(function (a) { return off(a.targetOfficeId).name === 'Новый'; }).length === 1, 'employee TO-BE individual alloc round-trip');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
