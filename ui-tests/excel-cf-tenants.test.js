'use strict';
// CF sheet must export the COMPUTED cash flow (office + tenant rows) when there
// is no manual override; Tenants sheet must export the computed breakdown
// including "Без арендатора". Import must skip the synthetic "Без арендатора"
// tenant so round-trip stays clean.
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

function proj(offices) {
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2027 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null, offices: offices, teams: [], employees: [], allocations: [] }] };
}
function aoa(wb, name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

// --- office with rent, NO explicit tenants, NO override ---
App.state.setProject(proj([
  { id: 'o1', type: 'physical', phase: 'tobe', name: 'Стекляшка', area: 100, rentPerSqm: 1200, opexPerSqm: 100, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }
]));
App.state.setActiveScenario('s1');
var wb = App.importExport.buildWorkbook([App.state.getActiveScenario()], false);

console.log('CF sheet exports computed CF when no override');
var cf = aoa(wb, 'CF');
assert(cf.length >= 2, 'CF sheet is not empty — got ' + (cf.length - 1) + ' rows');
var kindCol = cf[0].indexOf('kind'), nameCol = cf[0].indexOf('name'), m1 = cf[0].indexOf('m1');
var officeCfRows = cf.slice(1).filter(function (r) { return r[kindCol] === 'office'; });
var tenantCfRows = cf.slice(1).filter(function (r) { return r[kindCol] === 'tenant'; });
assert(officeCfRows.length >= 1, 'CF has office rows');
assert(tenantCfRows.length >= 1, 'CF has tenant rows (Без арендатора)');
assert(officeCfRows.some(function (r) { return (r[m1] || 0) > 0; }), 'CF office monthly values are non-zero');

console.log('Tenants sheet exports computed breakdown incl. Без арендатора');
var ten = aoa(wb, 'Tenants');
var tnName = ten[0].indexOf('tenant_name'), tnArea = ten[0].indexOf('area');
assert(ten.length >= 2, 'Tenants sheet not empty — got ' + (ten.length - 1) + ' rows');
var noTenantRow = ten.slice(1).filter(function (r) { return r[tnName] === 'Без арендатора'; })[0];
assert(!!noTenantRow && noTenantRow[tnArea] === 100, 'Без арендатора row with full office area (100)');

// --- explicit tenants + remaining area ---
App.state.setProject(proj([
  { id: 'o2', type: 'physical', phase: 'tobe', name: 'Нева', area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [], tenants: [{ id: 't', name: 'МР Групп', area: 40 }] }
]));
App.state.setActiveScenario('s1');
var ten2 = aoa(App.importExport.buildWorkbook([App.state.getActiveScenario()], false), 'Tenants');
var tn2 = ten2[0].indexOf('tenant_name'), ta2 = ten2[0].indexOf('area');
assert(ten2.slice(1).some(function (r) { return r[tn2] === 'МР Групп' && r[ta2] === 40; }), 'explicit tenant МР Групп (40) exported');
assert(ten2.slice(1).some(function (r) { return r[tn2] === 'Без арендатора' && r[ta2] === 60; }), 'remaining 60 as Без арендатора');

// --- import must skip synthetic Без арендатора ---
App.state.setProject(proj([]));
App.state.setActiveScenario('s1');
var sheets = {
  offices: [['office_name', 'office_type', 'area', 'rent_per_sqm'], ['Стекляшка', 'tobe', 100, 1200]],
  zones: [], teams: [], employees: [],
  tenants: [['office_name', 'office_phase', 'tenant_name', 'area'], ['Стекляшка', 'tobe', 'Без арендатора', 100]],
  allocations: [], cf: []
};
var parsed = App.importValidation.parseWorkbook(sheets);
App.importExport.applyImportParsed(parsed, 'new', 'Imp');
var dst = App.state.getActiveScenario();
var imported = dst.offices.filter(function (o) { return o.name === 'Стекляшка'; })[0];
console.log('import skips synthetic Без арендатора');
assert(!!imported, 'office imported');
assert((imported.tenants || []).filter(function (t) { return t.name === 'Без арендатора'; }).length === 0, 'no fake Без арендатора tenant created on import');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
