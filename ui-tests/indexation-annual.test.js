'use strict';
// Регрессия: индексация ежегодная и наступает в годовщину даты начала.
// Дата начала 01.09.2026 => 01.09.2027, 01.09.2028 ... а не 1 января каждого года.
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
function close(a, b) { return Math.abs(a - b) < 1e-6; }

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
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2028 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 't1', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, rentPerSqm: 1000, opexPerSqm: 0,
        indexationPct: 10, leaseStartDate: '2024-01-01', leaseEndDate: null, indexationStartDate: '2026-09-01',
        zones: [{ id: 'z1', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
    ], teams: [], employees: [], allocations: [] }] });
App.state.setActiveScenario('s1');

console.log('Индексация: ежегодно в годовщину даты начала');

// ── CF по месяцам ────────────────────────────────────────────────────────
var cf = App.calc.getScenarioCFData(App.state.getActiveScenario(), 2026, 2028);
var row = cf.officeRows.filter(function (r) { return r.name === 'TobeA'; })[0];
assert(!!row, 'строка офиса в CF найдена');
var baseM = 100 * 1000 / 1000000 / 12; // 0.1 млн/год => 1/120 млн/мес
function factor(year, monthIdx) { return row.monthlyValues[year][monthIdx] / baseM; }

assert(close(factor(2026, 7), 1), 'август 2026 — без индексации');
assert(close(factor(2026, 8), 1.1), 'сентябрь 2026 — первая индексация');
assert(close(factor(2027, 0), 1.1), 'январь 2027 — всё ещё x1.1 (1 января не индексируем)');
assert(close(factor(2027, 7), 1.1), 'август 2027 — всё ещё x1.1');
assert(close(factor(2027, 8), 1.21), 'сентябрь 2027 — вторая индексация');
assert(close(factor(2028, 7), 1.21), 'август 2028 — x1.21');
assert(close(factor(2028, 8), 1.331), 'сентябрь 2028 — третья индексация');

// годовая сумма 2027 = 8 мес x1.1 + 4 мес x1.21
var expected2027 = baseM * (1.1 * 8 + 1.21 * 4);
assert(close(row.values[1], expected2027), 'год 2027 = смесь 8 мес x1.1 и 4 мес x1.21');

// ── Деньги на вкладке «Визуализация» ─────────────────────────────────────
App.render.setActiveTab('visualization');
App.render.render();
var tc = w.document.getElementById('tab-content');
var moneySection = U.qsa('.viz-money-section', tc)[0];
assert(!!moneySection, 'секция «Финансовые показатели» на месте');
var vals = U.qsa('.viz-money-value', moneySection).map(function (e) { return e.textContent; });
// первый год окна (2026): 1000 руб/м² с индексацией только с 01.09 => 1000 * (1 + 0.1*122/365) = 1033,4
var y2026 = 1000 * App.calc.yearIndexationFactor('2026-09-01', 0.1, 2026);
var expectedText = (Math.round(y2026 * 10) / 10).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
assert(vals.indexOf(expectedText) > -1, 'ставка за 2026 учитывает индексацию только с сентября — ждали ' + expectedText + ', есть ' + JSON.stringify(vals));

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
