/**
 * Headless UI test (jsdom) for dashboard drag-and-drop.
 * Loads the REAL app modules into a jsdom window, injects a project, binds the
 * real drag-drop handlers via App.dragDrop.refresh(), dispatches a real 'drop'
 * event on the "unallocated" panel, and asserts on App.state.
 *
 * No browser required. Run:  cd ui-tests && npm install && node dnd.test.js
 * Optionally pass a repo dir:  node dnd.test.js <repo-dir>
 */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

var REPO = process.argv[2] || path.join(__dirname, '..');

var results = { pass: 0, fail: 0 };
function assert(cond, msg) {
  if (cond) { results.pass++; console.log('  ✓ ' + msg); }
  else { results.fail++; console.log('  ✗ ' + msg); }
}

function loadApp() {
  var dom = new JSDOM(
    '<!DOCTYPE html><body>' +
    '<div id="dnd-live" aria-live="polite"></div>' +
    '<div class="team-chips unalloc-drop-zone" data-drop-panel="unallocated"></div>' +
    '</body>',
    { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' }
  );
  var w = dom.window;
  ['js/constants.js', 'js/utils.js', 'js/state.js', 'js/calculations.js',
   'js/allocations.js', 'js/dragDrop.js'].forEach(function (f) {
    var script = w.document.createElement('script');
    script.textContent = fs.readFileSync(path.join(REPO, f), 'utf8');
    w.document.body.appendChild(script);
  });
  return w;
}

function makeProject() {
  return {
    projectVersion: '1.0.0', appName: 'test',
    settings: {
      thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 },
      viewOnlyMode: false, autosaveEnabled: false,
      lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 }
    },
    scenarios: [{
      id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 'off1', type: 'physical', phase: 'tobe', name: 'Офис', area: 100,
          zones: [
            { id: 'z1', name: 'Зона', type: 'open_space', capacity: 50, isVipZone: false },
            { id: 'z2', name: 'Зона 2', type: 'open_space', capacity: 50, isVipZone: false }
          ],
          tenants: [], rentPerSqm: null, opexPerSqm: null, indexationPct: null,
          leaseStartDate: null, leaseEndDate: null, indexationStartDate: null },
        { id: 'rem_tobe', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true },
        { id: 'rem_asis', type: 'remote', phase: 'asis', name: 'Удаленка AS', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [
        { id: 't1', name: 'Alpha', employeesCount: 10, canSplit: true, linkedTeamIds: [], isVip: false },
        { id: 't2', name: 'Beta', employeesCount: 10, canSplit: true, linkedTeamIds: [], isVip: false }
      ],
      employees: [{ id: 'e1', fullName: 'Иван Иванов', teamId: 't1' }],
      // Team 't1' occupies zone z1 via TWO allocations (TEAM block + one named employee).
      // Guards: 't2' also in z1, and 't1' also in z2 — neither must be removed.
      allocations: [
        { id: 'al_team', type: 'team', teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'off1', targetZoneId: 'z1' },
        { id: 'al_emp', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'off1', targetZoneId: 'z1' },
        { id: 'al_t2', type: 'team', teamId: 't2', employeeId: null, employeesCount: 3, targetOfficeId: 'off1', targetZoneId: 'z1' },
        { id: 'al_t1_z2', type: 'team', teamId: 't1', employeeId: null, employeesCount: 2, targetOfficeId: 'off1', targetZoneId: 'z2' }
      ]
    }]
  };
}

function dropOnUnallocated(w, payload) {
  var panel = w.document.querySelector('[data-drop-panel="unallocated"]');
  var ev = new w.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = {
    getData: function (type) {
      if (type === 'application/json') { return JSON.stringify(payload); }
      return payload.kind + ':' + payload.id;
    },
    dropEffect: 'move'
  };
  panel.dispatchEvent(ev);
}

console.log('UI test: drag team from zone to «нераспределённые» removes ALL its allocations');
var w = loadApp();
var App = w.App;
App.state.setProject(makeProject());
App.state.setActiveScenario('s1');
App.dragDrop.refresh();

// Drag the team-box, whose payload id is the FIRST allocation of the team in the zone.
dropOnUnallocated(w, { kind: 'allocation', id: 'al_team' });

var s = App.state.getActiveScenario();
function count(teamId, zoneId) {
  return s.allocations.filter(function (a) {
    return a.teamId === teamId && a.targetOfficeId === 'off1' && (a.targetZoneId || null) === zoneId;
  }).length;
}
assert(count('t1', 'z1') === 0, 'all t1 allocations in z1 removed (got ' + count('t1', 'z1') + ')');
assert(count('t2', 'z1') === 1, 'other team t2 in same zone is untouched (got ' + count('t2', 'z1') + ')');
assert(count('t1', 'z2') === 1, 'same team t1 in another zone is untouched (got ' + count('t1', 'z2') + ')');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
