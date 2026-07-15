'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
var w = dom.window;
['libs/xlsx.full.min.js', 'js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js',
 'js/teams.js', 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js',
 'js/validation.import.js', 'js/modals.js', 'js/importExport.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, XLSX = w.XLSX;

var scen = { id: 's1', name: 'S', comment: '', cfOverride: { offices: [{ id: 'c1', name: 'A', phase: 'tobe', monthly: { '2026': [2,2,2,2,2,2,2,2,2,2,2,2] } }], tenants: [] },
  offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1000, opexPerSqm: 50, indexationPct: 10, leaseStartDate: '2026-01-01', leaseEndDate: '2028-08-30', indexationStartDate: '2026-06-01', zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 't', name: 'МР Групп', area: 40 }] }],
  teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, canSplit: true, linkedTeamIds: [], isVip: false }],
  employees: [],
  allocations: [{ id: 'a', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 5, targetOfficeId: 'o1', targetZoneId: 'z' }] };

var wb = App.importExport.buildWorkbook([scen], false);
function aoa(name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

console.log('excel export builders');
var offH = aoa('Offices')[0];
assert(offH.indexOf('lease_end_date') > -1 && offH.indexOf('indexation_start_date') > -1, 'Offices has date columns');
var allH = aoa('Allocations')[0];
assert(allH.indexOf('phase') > -1, 'Allocations has phase column');
var ten = aoa('Tenants');
assert(ten.length >= 2 && ten[1].indexOf('МР Групп') > -1, 'Tenants sheet has the tenant row');
var cf = aoa('CF');
assert(cf.length >= 2 && cf[1].indexOf(2026) > -1, 'CF sheet has an override row for 2026');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
