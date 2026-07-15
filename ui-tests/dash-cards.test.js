/**
 * Headless UI test (jsdom): collapsing a phase's office cards on the dashboard
 * (money mode) hides only the cards grid and keeps that phase's CF table.
 * Run:  cd ui-tests && npm install && node dash-cards.test.js
 */
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var shell = '<!DOCTYPE html><body>' +
  '<div id="dnd-live"></div><div id="topbar-status"></div>' +
  '<button id="btn-undo"></button><button id="btn-redo"></button><button id="btn-onboarding"></button><button id="btn-settings"></button>' +
  '<div id="viewonly-banner" style="display:none"></div>' +
  '<nav id="main-nav"></nav><aside id="scenarios-panel"></aside><main id="tab-content"></main></body>';
var dom = new JSDOM(shell, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
if (w.HTMLCanvasElement) { w.HTMLCanvasElement.prototype.getContext = function () { return { font: '', measureText: function (t) { return { width: t.length * 7 }; } }; }; }
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js', 'js/employees.js',
 'js/calculations.js', 'js/allocations.js', 'js/validation.js', 'js/modals.js', 'js/render.js',
 'js/render.dashboard.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;

function project() {
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2027 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 't1', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'a1', type: 'physical', phase: 'asis', name: 'AsisA', area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'za', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ], teams: [], employees: [], allocations: [] }] };
}

console.log('dashboard: collapse office cards keeps CF table');
App.state.setProject(project());
App.state.setActiveScenario('s1');
App.render.setActiveTab('dashboard');
App.render.render();

var moneyCb = U.qsa('.money-toggle input', w.document)[0];
assert(!!moneyCb, 'money toggle present');
moneyCb.checked = true;
moneyCb.dispatchEvent(new w.Event('change'));

function tc() { return w.document.getElementById('tab-content'); }
function gridCount() { return U.qsa('.office-grid', tc()).length; }
function hasTobeCF() { return U.qsa('*', tc()).some(function (e) { return (e.textContent || '').indexOf('Cash Flow TO BE') !== -1; }); }

assert(gridCount() >= 1, 'office grids rendered in money mode (got ' + gridCount() + ')');
assert(hasTobeCF(), 'TO BE CF table present before collapse');

var toggle = U.qsa('.phase-cards-toggle', tc())[0];
assert(!!toggle, 'labeled "Карточки" toggle present on phase head');
var before = gridCount();
toggle.click();
assert(gridCount() === before - 1, 'collapsing removes exactly one office grid (before ' + before + ', after ' + gridCount() + ')');
assert(hasTobeCF(), 'TO BE CF table STILL present after collapsing TO BE cards');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
