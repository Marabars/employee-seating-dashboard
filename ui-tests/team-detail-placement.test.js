/**
 * Regression: in the expanded team member list, a member's AS-IS/TO-BE office is
 * shown ONLY from their individual allocation. Bulk team allocations must NOT be
 * attributed to every member (previously placementOf's team fallback showed the
 * team office for everyone, e.g. all 30 members "in AS-IS" though only 2 seats).
 */
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
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js',
 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js', 'js/modals.js',
 'js/render.js', 'js/render.teams.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 'a1', type: 'physical', phase: 'asis', name: 'Нева17', area: 200, zones: [{ id: 'az', name: 'Опен', capacity: 100, isVipZone: false }], tenants: [] },
      { id: 't1', type: 'physical', phase: 'tobe', name: 'Нева17', area: 200, zones: [{ id: 'tz', name: 'Опен', capacity: 100, isVipZone: false }], tenants: [] },
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
    ],
    teams: [{ id: 'tm', name: 'Дирекция', employeesCount: 5, linkedTeamIds: [], isVip: false, currentOfficeId: null, toBeOfficeId: null }],
    employees: [
      { id: 'e1', fullName: 'Некрасов Ф.', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' },
      { id: 'e2', fullName: 'Зайченко Л.', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' },
      { id: 'e3', fullName: 'Корнева А.', teamId: 'tm', currentOfficeId: null, isVip: false, workFormat: 'office' }
    ],
    allocations: [
      { id: 'ba', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 2, targetOfficeId: 'a1', targetZoneId: 'az' }, // bulk AS-IS (2 seats)
      { id: 'bt', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 3, targetOfficeId: 't1', targetZoneId: 'tz' }, // bulk TO-BE (3 seats)
      { id: 'ie', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 't1', targetZoneId: 'tz' } // e1 individually placed TO-BE
    ] }] });
App.state.setActiveScenario('s1');
App.render.setActiveTab('teams');
App.render.render();

// expand the team
var expandBtn = U.qsa('button', w.document.getElementById('tab-content')).filter(function (b) {
  return b.getAttribute && b.getAttribute('title') === 'Раскрыть'; })[0];
expandBtn.click();

var memberRows = U.qsa('.member-row', w.document.getElementById('tab-content'));
function textOf(row, cls) { var e = U.qs('.' + cls, row); return e ? e.textContent : ''; }
console.log('team detail: member AS-IS/TO-BE from individual allocation only');
assert(memberRows.length === 3, 'three member rows — got ' + memberRows.length);

var asisWithOffice = memberRows.filter(function (r) { return /Нева17/.test(textOf(r, 'placement-asis')); });
assert(asisWithOffice.length === 0, 'no member shows AS-IS office from bulk team seats — got ' + asisWithOffice.length);

var tobeWithOffice = memberRows.filter(function (r) { return /Нева17/.test(textOf(r, 'placement-tobe')); });
assert(tobeWithOffice.length === 1, 'only the individually-placed member shows TO-BE office — got ' + tobeWithOffice.length);

// the e1 row specifically has TO-BE office; e2/e3 do not
var e1Row = memberRows.filter(function (r) { return /Некрасов/.test(r.textContent); })[0];
assert(e1Row && /Нева17/.test(textOf(e1Row, 'placement-tobe')), 'e1 (individual) shows TO-BE Нева17');
assert(e1Row && !/Нева17/.test(textOf(e1Row, 'placement-asis')), 'e1 shows no AS-IS office (no individual AS-IS alloc)');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
