'use strict';
// "Пересчитать" (reset) must recompute only the office/card-derived CF rows and
// PRESERVE rows the user added manually via the pencil (id prefix 'cfrow_').
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/calculations.js', 'js/allocations.js', 'js/cfEdit.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App;
App.render = { render: function () {} };
App.state.setProject({
  projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1200, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }],
    teams: [], employees: [], allocations: [] }]
});
App.state.setActiveScenario('s1');
var scen = App.state.getActiveScenario();
var CE = App.cfEdit;

var computedO1 = App.calc.buildOverrideFromComputed(scen, [2026]).offices.filter(function (r) { return r.id === 'o1'; })[0];
var computedJan = computedO1.monthly['2026'][0];

console.log('reset preserves manual rows, recomputes office rows');
CE.enterEdit(scen, [2026], 'finance-office');
// tamper with the computed office row value
CE.editCell('offices', 'o1', 2026, 0, 999);
// add a manual row and give it values
CE.addRow('offices', 'Ручная строка', 'tobe');
var manualId = CE.getDraft().offices.filter(function (r) { return r.name === 'Ручная строка'; })[0].id;
assert(manualId.indexOf('cfrow_') === 0, 'manual row id has cfrow_ prefix');
CE.editCell('offices', manualId, 2026, 0, 42);
CE.save(scen);
assert(scen.cfOverride && scen.cfOverride.offices.length === 2, 'saved override has computed + manual row');

CE.reset(scen);
assert(scen.cfOverride !== null, 'reset keeps an override (manual rows exist)');
var manualAfter = scen.cfOverride.offices.filter(function (r) { return r.name === 'Ручная строка'; })[0];
assert(!!manualAfter && manualAfter.monthly['2026'][0] === 42, 'manual row preserved with its value (42)');
var o1After = scen.cfOverride.offices.filter(function (r) { return r.id === 'o1'; })[0];
assert(!!o1After, 'office row still present');
assert(Math.abs(o1After.monthly['2026'][0] - computedJan) < 1e-9 && o1After.monthly['2026'][0] !== 999, 'office row recomputed (not the tampered 999)');

// Imported override: office rows carry 'cfrow_' ids too (applyImport). Reset must
// NOT duplicate them — the office-derived rows should be recomputed once, not kept
// as manual AND recomputed.
scen.cfOverride = { offices: [
  { id: 'cfrow_imp1', name: 'A', phase: 'tobe', monthly: { '2026': [1,1,1,1,1,1,1,1,1,1,1,1] } },
  { id: 'cfrow_imp2', name: 'Доп. строка', phase: 'tobe', monthly: { '2026': [7,0,0,0,0,0,0,0,0,0,0,0] } }
], tenants: [] };
CE.reset(scen);
var aRows = (scen.cfOverride ? scen.cfOverride.offices : []).filter(function (r) { return r.name === 'A'; });
assert(aRows.length === 1, 'office "A" appears once after reset (no import duplication) — got ' + aRows.length);
var extra = (scen.cfOverride ? scen.cfOverride.offices : []).filter(function (r) { return r.name === 'Доп. строка'; });
assert(extra.length === 1 && extra[0].monthly['2026'][0] === 7, 'extra imported row "Доп. строка" preserved');

// Adding a tenant that covers the whole office, then Пересчитать, must NOT keep a
// stale "Без арендатора" row (it is a computed artifact, not a user row).
scen.cfOverride = null;
scen.offices[0].tenants = [];
CE.enterEdit(scen, [2026], 'finance-tenant'); CE.save(scen); // override now has a "Без арендатора" tenant row
assert(scen.cfOverride.tenants.filter(function (r) { return r.name === 'Без арендатора'; }).length === 1, 'setup: override has Без арендатора');
scen.offices[0].tenants = [{ id: 't1', name: 'МР Групп', area: 100 }]; // tenant covers full area
CE.reset(scen);
var tenAfter = scen.cfOverride ? scen.cfOverride.tenants : [];
assert(tenAfter.filter(function (r) { return r.name === 'Без арендатора'; }).length === 0, 'stale Без арендатора removed after adding full-area tenant + Пересчитать');
assert(tenAfter.filter(function (r) { return r.name === 'МР Групп'; }).length <= 1, 'tenant not duplicated');

// No manual rows -> reset clears override fully (live recompute).
scen.cfOverride = null;
scen.offices[0].tenants = [];
CE.enterEdit(scen, [2026], 'finance-office');
CE.editCell('offices', 'o1', 2026, 0, 5);
CE.save(scen);
CE.reset(scen);
assert(scen.cfOverride === null, 'reset with no manual rows clears override to null');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
