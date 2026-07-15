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
 'js/render.visualization.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2027 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 't1', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z1', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 'te1', name: 'МР Групп', area: 40 }] },
      { id: 'a1', type: 'physical', phase: 'asis', name: 'AsisA', area: 100, rentPerSqm: 800, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z2', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 'te2', name: 'МР Групп', area: 30 }] },
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
    ], teams: [], employees: [], allocations: [] }] });
App.state.setActiveScenario('s1');
App.render.setActiveTab('visualization');
App.render.render();

console.log('CF viz: grouped office + tenant charts');
var tc = w.document.getElementById('tab-content');
var section = U.qsa('.viz-cf-section', tc)[0];
assert(!!section, 'CF section present');
var cards = U.qsa('.viz-cf-card', section);
assert(cards.length === 2, 'exactly two CF cards (offices + tenants) — got ' + cards.length);
var titles = cards.map(function (c) { return (U.qsa('.viz-cf-chart-title', c)[0] || {}).textContent || ''; });
assert(titles.filter(function (t) { return /офисам/i.test(t); }).length === 1, 'office chart card present');
assert(titles.filter(function (t) { return /арендатор/i.test(t); }).length === 1, 'tenant chart card present');
assert(titles.filter(function (t) { return /МР Групп/i.test(t); }).length === 0, 'МР Групп card removed');
var texts = [];
U.qsa('svg text', cards[0]).forEach(function (t) { texts.push(t.textContent); });
assert(texts.indexOf('AS IS') > -1 && texts.indexOf('TO BE') > -1, 'office chart has AS IS / TO BE sub-labels');
var rects = U.qsa('svg rect', cards[0]);
assert(rects.length >= 2, 'office chart draws bars (rects) — got ' + rects.length);
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
