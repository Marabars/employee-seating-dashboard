'use strict';
// Regression: after CE.save() / CE.reset() the UI must re-render in VIEW mode.
// The bug was that state.commit() fires the render listener while editingKey is
// still set, then cfEdit cleared the state without a follow-up render — leaving
// the user stuck in edit mode.
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
var CE = App.cfEdit;

// Record the editing state observed at every render (mirrors main.js: onChange -> render).
var observed = [];
App.render = { render: function () { observed.push(CE.anyEditing()); } };
App.state.onChange(function () { App.render.render(); });

App.state.setProject({
  projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1200, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }],
    teams: [], employees: [], allocations: [] }]
});
App.state.setActiveScenario('s1');
var scen = App.state.getActiveScenario();

console.log('cfEdit save/reset re-render in view mode');
CE.enterEdit(scen, [2026], 'finance-office');
CE.editCell('offices', 'o1', 2026, null, 24);
observed.length = 0; // only care about what happens from save onward

CE.save(scen);
assert(!CE.anyEditing(), 'save clears editing state');
assert(observed.length > 0, 'save triggers at least one render');
assert(observed[observed.length - 1] === false, 'last render after save is in VIEW mode (not stuck in edit)');
assert(scen.cfOverride && Math.abs(scen.cfOverride.offices[0].monthly['2026'][0] - 2) < 1e-9, 'save persists edited cfOverride');

// reset should also drop the user out of edit mode with a view-mode render.
CE.enterEdit(scen, [2026], 'finance-office');
observed.length = 0;
CE.reset(scen);
assert(!CE.anyEditing(), 'reset clears editing state');
assert(observed.length > 0 && observed[observed.length - 1] === false, 'last render after reset is in VIEW mode');
assert(scen.cfOverride === null, 'reset clears cfOverride');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
