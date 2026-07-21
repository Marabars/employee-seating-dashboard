'use strict';
// Block 4 (CF section) must color office/tenant bars with the phase-specific
// palette from "Цвета для визуализации.xlsx": TO BE greens, AS IS purples,
// separate office vs tenant colors.
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
function office(id, phase, name) {
  return { id: id, type: 'physical', phase: phase, name: name, area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0,
    leaseStartDate: null, leaseEndDate: null, indexationStartDate: null,
    zones: [{ id: id + 'z', name: 'Z', capacity: 50, isVipZone: false }],
    tenants: [{ id: id + 't', name: 'МР Групп', area: 60 }, { id: id + 't2', name: 'СЗ T2 Девелопмент', area: 40 }] };
}
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [ office('t1', 'tobe', 'Нева 8й этаж'), office('a1', 'asis', 'Нева 8й этаж'),
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true } ],
    teams: [], employees: [], allocations: [] }] });
App.state.setActiveScenario('s1');
App.render.setActiveTab('visualization');
App.render.render();

var cards = U.qsa('.viz-cf-card', w.document.getElementById('tab-content'));
function fills(card) { return U.qsa('svg rect', card).map(function (r) { return r.getAttribute('fill'); }); }
function legendText(card) { return U.qsa('.viz-chart-legend-label', card).map(function (e) { return e.textContent; }); }

console.log('block 4 uses phase-specific palette from file');
assert(cards.length === 2, 'two CF cards');
var officeFills = fills(cards[0]);
assert(officeFills.indexOf('#518F4F') > -1, 'office TO BE "Нева 8й этаж" = #518F4F — got ' + JSON.stringify(officeFills));
assert(officeFills.indexOf('#E3DBFA') > -1, 'office AS IS "Нева 8й этаж" = #E3DBFA');
var tenantFills = fills(cards[1]);
assert(tenantFills.indexOf('#5BCD8C') > -1, 'tenant TO BE "МР Групп" = #5BCD8C — got ' + JSON.stringify(tenantFills));
assert(tenantFills.indexOf('#7549E8') > -1, 'tenant AS IS "МР Групп" = #7549E8');
assert(tenantFills.indexOf('#CCECD7') > -1, 'tenant TO BE "СЗ T2 Девелопмент" = #CCECD7 — got ' + JSON.stringify(tenantFills));
assert(tenantFills.indexOf('#D4B8DE') > -1, 'tenant AS IS "СЗ T2 Девелопмент" = #D4B8DE');
var legTitles = U.qsa('.viz-cf-legend-title', cards[0]).map(function (e) { return e.textContent; });
assert(legTitles.indexOf('AS IS') > -1 && legTitles.indexOf('TO BE') > -1, 'office legend split into AS IS / TO BE columns — got ' + JSON.stringify(legTitles));
var lg = legendText(cards[0]);
assert(lg.some(function (t) { return /Нева 8й этаж/.test(t); }), 'office legend lists the office name — got ' + JSON.stringify(lg));

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
