'use strict';
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
App.render = { render: function () {} }; // cfEdit calls App.render.render() lazily

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

console.log('cfEdit controller');
CE.enterEdit(scen, [2026], 'finance-office');
assert(CE.isEditing('finance-office') && CE.anyEditing(), 'enterEdit sets editing key');
assert(CE.getDraft() && CE.getDraft().offices.length === 1, 'draft snapshot has the office row');

CE.editCell('offices', 'o1', 2026, null, 24);
var row = CE.getDraft().offices[0];
assert(Math.abs(row.monthly['2026'][0] - 2) < 1e-9 && row.monthly['2026'].length === 12, 'year edit splits into 12 months of 2');

var eff = CE.effectiveScenario(scen);
assert(eff.cfOverride === CE.getDraft(), 'effectiveScenario returns draft-backed scenario');

CE.save(scen);
assert(!CE.anyEditing(), 'save clears editing state');
assert(scen.cfOverride && Math.abs(scen.cfOverride.offices[0].monthly['2026'][0] - 2) < 1e-9, 'save writes cfOverride with edited values');

CE.reset(scen);
assert(scen.cfOverride === null, 'reset clears cfOverride');
assert(CE.effectiveScenario(scen) === scen, 'effectiveScenario returns original scenario when not editing');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
