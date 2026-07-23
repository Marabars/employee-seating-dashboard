'use strict';
// Teams sheet (row-per-placement) import: multi-row splits create one allocation
// each; empty / "—" / "Без зоны" in the zone column → placement without a zone.
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body><div id="dnd-live"></div></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
['libs/xlsx.full.min.js', 'js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js',
 'js/teams.js', 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js',
 'js/validation.import.js', 'js/modals.js', 'js/undoRedo.js', 'js/importExport.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.render = { render: function () {} };

function emptyProject() {
  return { projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
    scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null, offices: [], teams: [], employees: [], allocations: [] }] };
}

App.state.setProject(emptyProject());
App.state.setActiveScenario('s1');
var sheets = {
  offices: [['office_name', 'office_type', 'area'], ['ОфисA', 'tobe', 100], ['ОфисB', 'tobe', 100], ['ОфисC', 'asis', 100]],
  zones: [['office_name', 'office_phase', 'zone_name', 'zone_type', 'capacity'], ['ОфисA', 'tobe', 'ЗонаA', 'open_space', 50]],
  employees: [],
  // Parallel AS-IS / TO-BE columns, ragged: 1 AS-IS placement, 2 TO-BE placements.
  teams: [
    ['team_name', 'employees_count', 'is_vip', 'linked_teams', 'comment', 'as_is_office', 'as_is_zone', 'as_is_count', 'to_be_office', 'to_be_zone', 'to_be_count'],
    ['Alpha', 10, 'нет', '', '', 'ОфисC', 'Без зоны', 2, 'ОфисA', 'ЗонаA', 4], // AS-IS "Без зоны" -> null; TO-BE zoned
    ['Alpha', 10, 'нет', '', '', '', '', '', 'ОфисB', '—', 3]                   // TO-BE dash -> null
  ],
  tenants: [], allocations: [], cf: []
};
var parsed = App.importValidation.parseWorkbook(sheets);
App.importExport.applyImportParsed(parsed, 'new', 'T');
var dst = App.state.getActiveScenario();
var tm = dst.teams.filter(function (t) { return t.name === 'Alpha'; })[0];
function off(id) { return U.findById(dst.offices, id); }
var teamAllocs = dst.allocations.filter(function (a) { return a.type === 'team' && a.teamId === tm.id; });

console.log('Teams row-per-placement import + empty-zone rule');
assert(!!tm, 'team Alpha created');
assert(teamAllocs.length === 3, 'three team allocations (one per row) — got ' + teamAllocs.length);
var a = teamAllocs.filter(function (x) { return off(x.targetOfficeId).name === 'ОфисA'; })[0];
assert(a && a.targetZoneId && off(a.targetOfficeId).zones[0].id === a.targetZoneId && a.employeesCount === 4, 'ОфисA → ЗонаA, count 4');
var b = teamAllocs.filter(function (x) { return off(x.targetOfficeId).name === 'ОфисB'; })[0];
assert(b && b.targetZoneId === null && b.employeesCount === 3, 'ОфисB "—" → no zone (null), count 3');
var c = teamAllocs.filter(function (x) { return off(x.targetOfficeId).name === 'ОфисC'; })[0];
assert(c && c.targetZoneId === null && c.employeesCount === 2, 'ОфисC "Без зоны" → no zone (null), count 2');
// phases
assert(off(a.targetOfficeId).phase === 'tobe' && off(c.targetOfficeId).phase === 'asis', 'placements land in the right phase offices');

// A team with no placement rows → created, no allocations.
App.state.setProject(emptyProject());
App.state.setActiveScenario('s1');
var parsed2 = App.importValidation.parseWorkbook({
  offices: [['office_name', 'office_type', 'area'], ['ОфисA', 'tobe', 100]],
  zones: [], employees: [],
  teams: [['team_name', 'employees_count', 'is_vip', 'linked_teams', 'comment', 'as_is_office', 'as_is_zone', 'as_is_count', 'to_be_office', 'to_be_zone', 'to_be_count'], ['Beta', 5, 'нет', '', '', '', '', '', '', '', '']],
  tenants: [], allocations: [], cf: []
});
App.importExport.applyImportParsed(parsed2, 'new', 'T2');
var dst2 = App.state.getActiveScenario();
var beta = dst2.teams.filter(function (t) { return t.name === 'Beta'; })[0];
console.log('team with no placement rows');
assert(!!beta && beta.employeesCount === 5, 'Beta created with headcount 5');
assert(dst2.allocations.filter(function (al) { return al.teamId === beta.id; }).length === 0, 'Beta has no allocations');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
