'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var shell = '<!DOCTYPE html><body><div id="dnd-live"></div><div id="topbar-status"></div>' +
  '<button id="btn-undo"></button><button id="btn-redo"></button><button id="btn-onboarding"></button><button id="btn-settings"></button>' +
  '<div id="viewonly-banner" style="display:none"></div><nav id="main-nav"></nav><aside id="scenarios-panel"></aside><main id="tab-content"></main></body>';
var dom = new JSDOM(shell, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
if (w.HTMLCanvasElement) { w.HTMLCanvasElement.prototype.getContext = function () { return { font: '', measureText: function (t) { return { width: t.length * 7 }; } }; }; }
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js', 'js/employees.js',
 'js/calculations.js', 'js/allocations.js', 'js/cfEdit.js', 'js/validation.js', 'js/modals.js', 'js/render.js',
 'js/render.dashboard.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.state.setProject({
  projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1200, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }],
    teams: [], employees: [], allocations: [] }]
});
App.state.setActiveScenario('s1');
App.render.setActiveTab('dashboard');
App.render.render();
console.log('dashboard CF in-place editing');
var moneyCb = U.qsa('.money-toggle input', w.document)[0];
moneyCb.checked = true; moneyCb.dispatchEvent(new w.Event('change'));
var pencil = U.qsa('button', w.document.getElementById('tab-content')).filter(function (b) { return b.getAttribute && b.getAttribute('title') === 'Редактировать CF'; })[0];
assert(!!pencil, 'pencil present on dashboard CF table');
pencil.click();
var input = U.qsa('.cf-edit-input', w.document)[0];
assert(!!input, 'editable inputs appear after clicking dashboard pencil');
input.value = '24'; input.dispatchEvent(new w.Event('change'));
var save = U.qsa('button', w.document).filter(function (b) { return b.textContent.trim() === 'Сохранить'; })[0];
assert(!!save, 'Save present'); save.click();
var scen = App.state.getActiveScenario();
assert(!!scen.cfOverride, 'cfOverride written after dashboard save');
assert(scen.cfOverride.offices.filter(function (r) { return r.id === 'o1'; }).length === 1, 'office row present in override');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
