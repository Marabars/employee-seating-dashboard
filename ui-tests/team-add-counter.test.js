'use strict';
// Regression: in the ADD-team form the placement counter ("всего N / остаток")
// must follow the "Количество сотрудников" field live (was stuck at "всего 0").
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var shell = '<!DOCTYPE html><body><div id="dnd-live"></div><div id="topbar-status"></div>' +
  '<button id="btn-undo"></button><button id="btn-redo"></button><button id="btn-onboarding"></button><button id="btn-settings"></button>' +
  '<div id="viewonly-banner" style="display:none"></div><nav id="main-nav"></nav><aside id="scenarios-panel"></aside><main id="tab-content"></main></body>';
var dom = new JSDOM(shell, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js',
 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js', 'js/modals.js',
 'js/render.js', 'js/render.teams.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [{ id: 't1o', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, zones: [{ id: 'tz', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }, { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }],
    teams: [], employees: [], allocations: [] }] });
App.state.setActiveScenario('s1');
App.render.setActiveTab('teams');
App.render.render();

// open the ADD-team form
var addBtn = U.qsa('button', w.document.getElementById('tab-content')).filter(function (b) { return /\+ Команда/.test(b.textContent); })[0];
addBtn.click();

function counterText() { return (U.qsa('.placement-counter', w.document)[0] || {}).textContent || ''; }
console.log('add-team form: counter follows headcount field');
var cntInput = U.qs('input[name=employeesCount]', w.document) || U.qs('#f_employeesCount', w.document);
assert(!!cntInput, 'employeesCount input present');
cntInput.value = '5';
cntInput.dispatchEvent(new w.Event('input'));
assert(/всего 5/.test(counterText()), 'counter shows "всего 5" after typing headcount — got "' + counterText() + '"');

// add a TO-BE placement row of 5 -> остаток 0
var tobeCtl = U.qsa('.placementrows', w.document)[1];
var rowAdd = U.qsa('button', tobeCtl).filter(function (b) { return /строка/.test(b.textContent); })[0];
rowAdd.click();
var rows = U.qsa('.placementrows-row', tobeCtl);
var row = rows[rows.length - 1];
U.qs('.pr-office', row).value = 't1o';
var cnt = U.qs('.pr-count', row); cnt.value = '5'; cnt.dispatchEvent(new w.Event('input'));
var txt = (U.qsa('.placement-counter', tobeCtl)[0] || {}).textContent || '';
assert(/Распределено 5 \/ всего 5 \(остаток 0\)/.test(txt), 'TO-BE counter = "Распределено 5 / всего 5 (остаток 0)" — got "' + txt + '"');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
