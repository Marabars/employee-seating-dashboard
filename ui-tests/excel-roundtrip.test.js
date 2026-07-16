'use strict';
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
var App = w.App, XLSX = w.XLSX;
App.render = { render: function () {} };

App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 'src', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 'src', name: 'Src', comment: '', cfOverride: { offices: [{ id: 'c1', name: 'A', phase: 'tobe', monthly: { '2026': [2,2,2,2,2,2,2,2,2,2,2,2] } }], tenants: [] },
    offices: [
      { id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1000, opexPerSqm: 50, indexationPct: 10, leaseStartDate: '2026-01-01', leaseEndDate: '2028-08-30', indexationStartDate: '2026-06-01', zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 't', name: 'МР Групп', area: 40 }] },
      { id: 'r1', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true },
      { id: 'r0', type: 'remote', phase: 'asis', name: 'Удаленка AS', unlimitedCapacity: true, isSystem: true }
    ],
    teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, linkedTeamIds: [], isVip: false, currentOfficeId: null, toBeOfficeId: 'o1' }],
    employees: [],
    allocations: [{ id: 'a', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 5, targetOfficeId: 'o1', targetZoneId: 'z' }] }] });
App.state.setActiveScenario('src');
var src = App.state.getActiveScenario();

var wb = App.importExport.buildWorkbook([src], false);
var bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
var wb2 = XLSX.read(bin, { type: 'array' });
function toAoa(name) { var ws = wb2.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
var sheets = { offices: toAoa('Offices'), zones: toAoa('Zones'), teams: toAoa('Teams'), employees: toAoa('Employees'), tenants: toAoa('Tenants'), allocations: toAoa('Allocations'), cf: toAoa('CF') };
var parsed = App.importValidation.parseWorkbook(sheets);
App.importExport.applyImportParsed(parsed, 'new', 'RT');

var dst = App.state.getActiveScenario();
console.log('excel round-trip');
var office = dst.offices.filter(function (o) { return o.name === 'A' && o.phase === 'tobe'; })[0];
assert(!!office, 'office A imported');
assert(office && office.leaseEndDate === '2028-08-30' && office.indexationStartDate === '2026-06-01', 'office dates round-trip');
assert(office && (office.tenants || []).filter(function (t) { return t.name === 'МР Групп' && t.area === 40; }).length === 1, 'tenant round-trip');
var teamAlloc = dst.allocations.filter(function (a) { return a.type === 'team' && a.employeesCount === 5; })[0];
var to = teamAlloc && App.utils.findById(dst.offices, teamAlloc.targetOfficeId);
assert(!!teamAlloc && to && to.name === 'A' && to.phase === 'tobe', 'team allocation (office+count+phase) round-trip');
assert(dst.cfOverride && dst.cfOverride.offices.filter(function (r) { return r.name === 'A' && r.monthly['2026'] && r.monthly['2026'][0] === 2; }).length === 1, 'cfOverride round-trip (monthly)');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
