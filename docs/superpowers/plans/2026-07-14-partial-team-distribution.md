# Partial Team Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the team pencil form (✎) distribute a team partially across multiple offices/zones per phase via repeatable rows (office + zone + count), replacing the single AS-IS/TO-BE office selects; on save these become the team's TEAM allocations.

**Architecture:** A new `placementrows` form field type (`modals.js`) mirrors the existing `namelist`. `openTeamForm` uses two of them (AS-IS, TO-BE). A new one-commit `App.allocations.setTeamPhaseAllocations(teamId, phase, rows)` rebuilds a phase's TEAM allocations. Profile fields `currentOfficeId/toBeOfficeId` are derived from the dominant (largest-count) row for backward-compat.

**Tech Stack:** Vanilla JS ES5. Build `python build.py`. Unit/UI tests via jsdom in `ui-tests/` (`npm install` once; `node <file>.test.js`).

## Global Constraints

- Vanilla JS **ES5 ONLY** — `var`/`function`, no arrow functions, template literals, `const`/`let`, `class`, destructuring.
- DOM via `U.el`; mutations via `state.commit`. Helpers: `U.qs`, `U.qsa`, `U.clear`, `U.findById`, `U.genId`, `U.toNonNegativeInt`.
- A phase's row-count sum must never exceed team headcount (enforced in the form).
- Files are CRLF; prefer the Python CRLF-safe replace if a plain Edit reports "not found".
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.

---

### Task 1: `App.allocations.setTeamPhaseAllocations`

**Files:**
- Modify: `js/allocations.js` (add function after `remove`/`removeTeamZone`; add to exports)
- Test: `ui-tests/alloc.test.js` (new; jsdom)

**Interfaces:**
- Produces: `setTeamPhaseAllocations(teamId, phase, rows)` where `phase` is `'asis'|'tobe'` and `rows` is `[{officeId, zoneId, count}]`. In one commit: removes existing TEAM allocations of `teamId` in that phase, then creates one TEAM allocation per valid row. EMPLOYEE allocations and other phases are untouched.

- [ ] **Step 1: Write the failing test**

Create `ui-tests/alloc.test.js`:

```js
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');

var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

function loadApp() {
  var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  var w = dom.window;
  ['js/constants.js','js/utils.js','js/state.js','js/calculations.js','js/allocations.js'].forEach(function (f) {
    var s = w.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8');
    w.document.body.appendChild(s);
  });
  return w;
}
function project() {
  return {
    projectVersion: '1.0.0', appName: 't',
    settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2030 } },
    scenarios: [{
      id: 's1', name: 'S', comment: '', cfOverride: null,
      offices: [
        { id: 'a1', type: 'physical', phase: 'asis', name: 'AsisA', area: 100, zones: [{ id: 'az', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 't1o', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, zones: [{ id: 'tz', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 't2o', type: 'physical', phase: 'tobe', name: 'TobeB', area: 100, zones: [{ id: 'tz2', name: 'Z2', capacity: 50, isVipZone: false }], tenants: [] },
        { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
      ],
      teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, canSplit: true, linkedTeamIds: [], isVip: false }],
      employees: [{ id: 'e1', fullName: 'Иван', teamId: 'tm' }],
      allocations: [
        { id: 'old_tobe', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 4, targetOfficeId: 't1o', targetZoneId: 'tz' },
        { id: 'old_asis', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 4, targetOfficeId: 'a1', targetZoneId: null },
        { id: 'emp_tobe', type: 'employee', teamId: 'tm', employeeId: 'e1', employeesCount: 1, targetOfficeId: 't1o', targetZoneId: 'tz' }
      ]
    }]
  };
}

console.log('setTeamPhaseAllocations');
var w = loadApp();
var App = w.App;
App.state.setProject(project());
App.state.setActiveScenario('s1');

App.allocations.setTeamPhaseAllocations('tm', 'tobe', [
  { officeId: 't1o', zoneId: 'tz', count: 3 },
  { officeId: 't2o', zoneId: 'tz2', count: 2 }
]);

var s = App.state.getActiveScenario();
function teamAllocs(phaseTest) { return s.allocations.filter(phaseTest); }
var tobeTeam = teamAllocs(function (a) { return a.type === 'team' && a.teamId === 'tm' && (a.targetOfficeId === 't1o' || a.targetOfficeId === 't2o' || a.targetOfficeId === 'rem'); });
assert(tobeTeam.length === 2, 'two TO-BE team allocations after sync (got ' + tobeTeam.length + ')');
assert(tobeTeam.filter(function (a) { return a.targetOfficeId === 't1o' && a.employeesCount === 3; }).length === 1, 't1o has 3');
assert(tobeTeam.filter(function (a) { return a.targetOfficeId === 't2o' && a.employeesCount === 2; }).length === 1, 't2o has 2');
assert(s.allocations.filter(function (a) { return a.id === 'emp_tobe'; }).length === 1, 'EMPLOYEE allocation untouched');
assert(s.allocations.filter(function (a) { return a.id === 'old_asis'; }).length === 1, 'AS-IS allocation untouched');

App.allocations.setTeamPhaseAllocations('tm', 'tobe', []);
var s2 = App.state.getActiveScenario();
assert(s2.allocations.filter(function (a) { return a.type === 'team' && a.teamId === 'tm' && (a.targetOfficeId === 't1o' || a.targetOfficeId === 't2o'); }).length === 0, 'empty rows remove all TO-BE team allocations');
assert(s2.allocations.filter(function (a) { return a.id === 'emp_tobe'; }).length === 1, 'EMPLOYEE still untouched after empty sync');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail**

```
cd ui-tests && npm install   # if not already
node alloc.test.js
```
Expected: fails — `setTeamPhaseAllocations is not a function`.

- [ ] **Step 3: Implement `setTeamPhaseAllocations`**

In `js/allocations.js`, add after the `removeTeamZone` function (before `sendTeamRemainderToRemote`):

```js
  /**
   * Replace ALL TEAM allocations of a team in one phase with the given rows,
   * in a single commit. rows: [{officeId, zoneId, count}]. EMPLOYEE allocations
   * and allocations in the other phase are left untouched.
   */
  function setTeamPhaseAllocations(teamId, phase, rows) {
    state.commit('Распределение команды', function () {
      var s = scenario();
      s.allocations = s.allocations.filter(function (a) {
        if (a.teamId !== teamId || a.type !== C.ALLOCATION_TYPE.TEAM) { return true; }
        var o = U.findById(s.offices, a.targetOfficeId);
        if (!o) { return true; }
        var inPhase = phase === C.OFFICE_PHASE.ASIS
          ? o.phase === C.OFFICE_PHASE.ASIS
          : (o.phase === C.OFFICE_PHASE.TOBE || o.type === C.OFFICE_TYPE.REMOTE);
        return !inPhase;
      });
      (rows || []).forEach(function (r) {
        var count = U.toNonNegativeInt(r.count);
        if (!r.officeId || count <= 0) { return; }
        s.allocations.push({
          id: U.genId('allocation'),
          type: C.ALLOCATION_TYPE.TEAM,
          teamId: teamId,
          employeeId: null,
          employeesCount: count,
          targetOfficeId: r.officeId,
          targetZoneId: r.zoneId || null,
          comment: ''
        });
      });
    });
  }
```

Add to the exports object (after `removeTeamZone: removeTeamZone,`):

```js
    removeTeamZone: removeTeamZone,
    setTeamPhaseAllocations: setTeamPhaseAllocations,
```

- [ ] **Step 4: Run → pass**

`node alloc.test.js` → all pass. Then `python build.py`.

- [ ] **Step 5: Commit**

```bash
git add js/allocations.js employee-seating-dashboard.html ui-tests/alloc.test.js
git commit -m "feat: setTeamPhaseAllocations rebuilds a team phase's allocations in one commit"
```

---

### Task 2: `placementrows` form field type

**Files:**
- Modify: `js/modals.js` (`buildPlacementRows` + build & collect branches)
- Modify: `styles.css`
- Test: `ui-tests/placementrows.test.js` (new; jsdom)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: form field `{ name, label, type: 'placementrows', value: [{officeId, zoneId, count}], offices: [{id, name, zones:[{id,name,capacity}]}], headcount }`. `collect()` returns `[{officeId, zoneId, count}]` for rows with a non-empty office and count > 0.

- [ ] **Step 1: Write the failing test**

Create `ui-tests/placementrows.test.js`:

```js
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/modals.js'].forEach(function (f) {
  var s = w.document.createElement('script');
  s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8');
  w.document.body.appendChild(s);
});
var App = w.App;

console.log('placementrows field type');
var offices = [{ id: 'o1', name: 'A', zones: [{ id: 'z1', name: 'Z', capacity: 5 }] },
               { id: 'o2', name: 'B', zones: [] }];
var f = App.modals.form({
  title: 't',
  fields: [{ name: 'rows', label: 'R', type: 'placementrows', offices: offices, headcount: 10,
             value: [{ officeId: 'o1', zoneId: 'z1', count: 3 }] }],
  onSubmit: function () { return true; }
});

var control = f.inputs.rows;
var rowEls = w.App.utils.qsa('.placementrows-row', control);
assert(rowEls.length === 1, 'one pre-filled row rendered (got ' + rowEls.length + ')');

var v1 = f.collect().rows;
assert(v1.length === 1 && v1[0].officeId === 'o1' && v1[0].zoneId === 'z1' && v1[0].count === 3,
  'collect returns the pre-filled row: ' + JSON.stringify(v1));

// Add a row via the add button, fill office + count, collect again.
var addBtn = w.App.utils.qsa('button', control).filter(function (b) { return /строка/.test(b.textContent); })[0];
addBtn.click();
var rows2 = w.App.utils.qsa('.placementrows-row', control);
assert(rows2.length === 2, 'add button adds a row (got ' + rows2.length + ')');
var newRow = rows2[1];
var off = w.App.utils.qs('.pr-office', newRow); off.value = 'o2';
var cnt = w.App.utils.qs('.pr-count', newRow); cnt.value = '4';
var v2 = f.collect().rows;
assert(v2.length === 2 && v2[1].officeId === 'o2' && v2[1].count === 4 && v2[1].zoneId === null,
  'collect includes the added row with null zone: ' + JSON.stringify(v2));

// A row with no office is dropped.
addBtn.click();
var v3 = f.collect().rows;
assert(v3.length === 2, 'empty (no-office) row is dropped by collect (got ' + v3.length + ')');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail**

`node placementrows.test.js` → fails (no `.placementrows-row`; field falls through to a plain text input).

- [ ] **Step 3: Add `buildPlacementRows` to `modals.js`**

In `js/modals.js`, immediately after the `buildNameList` function (before `function form(options)`), add:

```js
  /**
   * Build a "placementrows" control: repeatable rows of office + zone + count
   * with a live "distributed N / of M (remainder K)" counter. field.offices is
   * [{id,name,zones:[{id,name,capacity}]}]; field.headcount sets M; field.value
   * pre-fills rows [{officeId, zoneId, count}].
   */
  function buildPlacementRows(field) {
    var offices = field.offices || [];
    var headcount = field.headcount || 0;
    var container = U.el('div', { class: 'placementrows' });
    var rowsEl = U.el('div', { class: 'placementrows-rows' });
    var counter = U.el('div', { class: 'placement-counter' });

    function officeById(id) {
      var found = null;
      offices.forEach(function (o) { if (String(o.id) === String(id)) { found = o; } });
      return found;
    }
    function fillZones(sel, officeId, selectedZoneId) {
      U.clear(sel);
      sel.appendChild(U.el('option', { value: '' }, '— Вся площадь'));
      var o = officeById(officeId);
      if (o && o.zones) {
        o.zones.forEach(function (z) {
          var opt = U.el('option', { value: z.id }, z.name + ' (' + (z.capacity || 0) + ' мест)');
          if (String(z.id) === String(selectedZoneId)) { opt.selected = true; }
          sel.appendChild(opt);
        });
      }
    }
    function updateCounter() {
      var n = 0;
      U.qsa('.placementrows-row', rowsEl).forEach(function (row) {
        var c = U.qs('.pr-count', row);
        var v = c ? parseInt(c.value, 10) : 0;
        if (v > 0) { n += v; }
      });
      counter.textContent = 'Распределено ' + n + ' / всего ' + headcount + ' (остаток ' + (headcount - n) + ')';
      counter.className = n > headcount ? 'placement-counter over' : 'placement-counter';
    }
    function addRow(entry) {
      entry = entry || {};
      var row = U.el('div', { class: 'placementrows-row' });
      var officeSel = U.el('select', { class: 'place-select pr-office' });
      officeSel.appendChild(U.el('option', { value: '' }, '— офис —'));
      offices.forEach(function (o) {
        var opt = U.el('option', { value: o.id }, o.name);
        if (String(o.id) === String(entry.officeId)) { opt.selected = true; }
        officeSel.appendChild(opt);
      });
      var zoneSel = U.el('select', { class: 'place-select pr-zone' });
      fillZones(zoneSel, entry.officeId || '', entry.zoneId || '');
      var countInput = U.el('input', { type: 'number', min: '1', class: 'place-count pr-count' });
      countInput.value = entry.count ? String(entry.count) : '';
      var removeBtn = U.el('button', {
        type: 'button', class: 'btn btn-sm btn-secondary',
        onclick: function () { rowsEl.removeChild(row); updateCounter(); }
      }, '✕');
      officeSel.addEventListener('change', function () { fillZones(zoneSel, officeSel.value, ''); });
      countInput.addEventListener('input', updateCounter);
      row.appendChild(officeSel);
      row.appendChild(zoneSel);
      row.appendChild(countInput);
      row.appendChild(removeBtn);
      rowsEl.appendChild(row);
    }

    (field.value || []).forEach(addRow);

    var addBtn = U.el('button', {
      type: 'button', class: 'btn btn-sm btn-secondary',
      onclick: function () { addRow(); updateCounter(); }
    }, '＋ строка');

    container.appendChild(rowsEl);
    container.appendChild(addBtn);
    container.appendChild(counter);
    updateCounter();
    return container;
  }
```

- [ ] **Step 4: Wire the build branch**

In `form()`, after the `namelist` build branch (`} else if (field.type === 'namelist') { control = buildNameList(field); }`), add:

```js
      } else if (field.type === 'placementrows') {
        control = buildPlacementRows(field);
```

- [ ] **Step 5: Wire the collect branch**

In `collect()`, after the `namelist` collect branch (the block ending `values[field.name] = rows;`), add:

```js
        } else if (field.type === 'placementrows') {
          var prRows = [];
          U.qsa('.placementrows-row', control).forEach(function (row) {
            var off = U.qs('.pr-office', row);
            var cnt = U.qs('.pr-count', row);
            var zn = U.qs('.pr-zone', row);
            var officeId = off ? off.value : '';
            var count = cnt ? parseInt(cnt.value, 10) : 0;
            if (officeId && count > 0) {
              prRows.push({ officeId: officeId, zoneId: (zn && zn.value) ? zn.value : null, count: count });
            }
          });
          values[field.name] = prRows;
```

- [ ] **Step 6: CSS**

Append to `styles.css`:

```css
.placementrows-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.placementrows-row .pr-count { width: 72px; }
.placementrows-row .pr-office, .placementrows-row .pr-zone { flex: 1; min-width: 0; }
.placement-counter { font-size: 12px; color: #52606d; margin-top: 4px; }
.placement-counter.over { color: #dc2626; font-weight: 600; }
```

- [ ] **Step 7: Run → pass; build**

`node placementrows.test.js` → all pass. `python build.py`.

- [ ] **Step 8: Commit**

```bash
git add js/modals.js styles.css employee-seating-dashboard.html ui-tests/placementrows.test.js
git commit -m "feat: placementrows form field type (office/zone/count rows + counter)"
```

---

### Task 3: Wire `openTeamForm` to use `placementrows`

**Files:**
- Modify: `js/render.teams.js` (`openTeamForm` + new `teamPhaseRows` helper)

**Interfaces:**
- Consumes: `placementrows` field (Task 2), `App.allocations.setTeamPhaseAllocations` (Task 1).

- [ ] **Step 1: Add `teamPhaseRows` helper**

In `js/render.teams.js`, add this function just before `function openTeamForm(team) {`:

```js
  /** Existing TEAM allocations of a team in a phase → [{officeId, zoneId, count}]. */
  function teamPhaseRows(scenario, team, phase) {
    if (!team) { return []; }
    var byKey = {};
    var order = [];
    (scenario.allocations || []).forEach(function (a) {
      if (a.teamId !== team.id || a.type !== C.ALLOCATION_TYPE.TEAM) { return; }
      var o = U.findById(scenario.offices, a.targetOfficeId);
      if (!o) { return; }
      var inPhase = phase === C.OFFICE_PHASE.ASIS
        ? o.phase === C.OFFICE_PHASE.ASIS
        : (o.phase === C.OFFICE_PHASE.TOBE || o.type === C.OFFICE_TYPE.REMOTE);
      if (!inPhase) { return; }
      var zoneId = a.targetZoneId || '';
      var key = a.targetOfficeId + '|' + zoneId;
      if (!byKey[key]) { byKey[key] = { officeId: a.targetOfficeId, zoneId: a.targetZoneId || null, count: 0 }; order.push(key); }
      byKey[key].count += (a.employeesCount || 0);
    });
    return order.map(function (k) { return byKey[k]; });
  }
```

- [ ] **Step 2: Replace the office-option lists with office objects**

In `openTeamForm`, replace the block (currently ~lines 610–616):

```js
    var asisOptions = [{ value: '', label: '—' }];
    var tobeOptions = [{ value: '', label: '—' }];
    scenario.offices.forEach(function (o) {
      if (o.type === C.OFFICE_TYPE.REMOTE) { return; }
      if (!o.phase || o.phase === 'asis') { asisOptions.push({ value: o.id, label: o.name }); }
      if (!o.phase || o.phase === 'tobe') { tobeOptions.push({ value: o.id, label: o.name }); }
    });
```

with:

```js
    var asisOffices = scenario.offices.filter(function (o) {
      return o.type !== C.OFFICE_TYPE.REMOTE && (o.phase === C.OFFICE_PHASE.ASIS || !o.phase);
    });
    var tobeOffices = scenario.offices.filter(function (o) {
      return (o.type !== C.OFFICE_TYPE.REMOTE && (o.phase === C.OFFICE_PHASE.TOBE || !o.phase))
        || (o.type === C.OFFICE_TYPE.REMOTE && o.phase === C.OFFICE_PHASE.TOBE);
    });
    var headcountNow = team ? (team.employeesCount || 0) : 0;
```

- [ ] **Step 3: Remove the now-unused prev-office snapshot**

In `openTeamForm`, delete these two lines (~619–620):

```js
    var prevAsisOfficeId = team ? (team.currentOfficeId || null) : null;
    var prevTobeOfficeId = team ? (team.toBeOfficeId || null) : null;
```

- [ ] **Step 4: Swap the two select fields for `placementrows`**

Replace the two field defs (currently ~lines 643–644):

```js
        { name: 'currentOfficeId', label: 'AS-IS офис (сейчас)', type: 'select', options: asisOptions, value: team ? team.currentOfficeId : '' },
        { name: 'toBeOfficeId', label: 'TO-BE офис (план)', type: 'select', options: tobeOptions, value: team ? team.toBeOfficeId : '' },
```

with:

```js
        { name: 'asisRows', label: 'Распределение AS-IS (офис / зона / кол-во)', type: 'placementrows',
          offices: asisOffices, headcount: headcountNow, value: teamPhaseRows(scenario, team, C.OFFICE_PHASE.ASIS),
          help: 'Куда команда посажена сейчас. Можно несколько строк; сумма не больше численности.' },
        { name: 'toBeRows', label: 'Распределение TO-BE (офис / зона / кол-во)', type: 'placementrows',
          offices: tobeOffices, headcount: headcountNow, value: teamPhaseRows(scenario, team, C.OFFICE_PHASE.TOBE),
          help: 'План переезда. Удалёнку тоже можно выбрать. Сумма не больше численности.' },
```

- [ ] **Step 5: Rewrite the onSubmit placement block**

In `openTeamForm`'s `onSubmit`, replace the entire block from `var newAsisId = values.currentOfficeId || null;` through the end of the TO-BE sync `if (...) { ... }` (currently ~lines 662–703) with:

```js
        var asisRows = values.asisRows || [];
        var toBeRows = values.toBeRows || [];
        delete values.asisRows;
        delete values.toBeRows;

        function sumRows(rows) { return rows.reduce(function (s, r) { return s + (r.count || 0); }, 0); }
        if (sumRows(asisRows) > headcount) {
          App.modals.alert('Распределение AS-IS превышает численность команды (' + sumRows(asisRows) + ' > ' + headcount + ')');
          return false;
        }
        if (sumRows(toBeRows) > headcount) {
          App.modals.alert('Распределение TO-BE превышает численность команды (' + sumRows(toBeRows) + ' > ' + headcount + ')');
          return false;
        }
        function dominantOffice(rows) {
          var best = null;
          rows.forEach(function (r) { if (r.officeId && (!best || r.count > best.count)) { best = r; } });
          return best ? best.officeId : '';
        }
        values.currentOfficeId = dominantOffice(asisRows);
        values.toBeOfficeId = dominantOffice(toBeRows);

        var teamId;
        if (team) {
          T.update(team.id, values);
          teamId = team.id;
          syncMembers(team.id, existingMembers, members);
        } else {
          teamId = T.add(values);
          syncMembers(teamId, [], members);
        }

        App.allocations.setTeamPhaseAllocations(teamId, C.OFFICE_PHASE.ASIS, asisRows);
        App.allocations.setTeamPhaseAllocations(teamId, C.OFFICE_PHASE.TOBE, toBeRows);

        return true;
```

Note: the earlier lines in `onSubmit` that compute `members`, `namedCount`, `values.employeesCount`, `headcount`, and the `var teamId;` declaration are REMOVED from their old spots only where duplicated — keep the ones above this block. Specifically the retained preamble is (unchanged):

```js
        var members = values.members || [];
        var namedCount = members.length;
        values.employeesCount = Math.max(U.toNonNegativeInt(values.employeesCount), namedCount);
        delete values.members;
        var headcount = values.employeesCount;
```

Delete the old standalone `var newAsisId`, `var newTobeId`, `var headcount = values.employeesCount;` duplication and the two `existingAsis/TobeAllocs` sync blocks — they are fully replaced above. (The retained preamble already defines `headcount`; ensure it appears exactly once.)

- [ ] **Step 6: Build + syntax + manual verify**

```
python build.py
node --check js/render.teams.js
```
Open `employee-seating-dashboard.html` → «Команды» → ✎ on a team:
- «Распределение AS-IS» and «TO-BE» show rows (office/zone/count) pre-filled from current allocations; «＋ строка» adds; ✕ removes; counter updates and turns red when the sum exceeds headcount.
- Save with two TO-BE rows in different offices → the team's TO-BE column shows both placements; no error.
- Try a phase sum > headcount → save is blocked with an alert.
- The AS-IS/TO-BE office filters and the employee-card office pre-fill still work (driven by the derived profile field).

- [ ] **Step 7: Commit**

```bash
git add js/render.teams.js employee-seating-dashboard.html
git commit -m "feat: teams pencil form distributes team partially via office/zone/count rows"
```

---

## Self-Review

1. **Spec coverage:**
   - ✅ Repeatable AS-IS/TO-BE rows with office+zone+count (Task 2 field, Task 3 wiring).
   - ✅ Partial distribution; sum ≤ headcount enforced with a counter (Task 2 counter, Task 3 validation).
   - ✅ TO-BE can target Удалёнка (Task 3 `tobeOffices`).
   - ✅ Rebuild phase allocations without touching EMPLOYEE/other phase (Task 1, unit-tested).
   - ✅ Profile fields derived from dominant row (Task 3 `dominantOffice`).
   - ✅ Multi-value display in the teams table unchanged (uses `teamPlacementLines`).

2. **Placeholder scan:** No TBD. All steps contain full code. `<...>` appears only inside user-facing alert strings as literal count interpolation via `+`.

3. **Type consistency:** row shape `{officeId, zoneId, count}` identical across `placementrows` collect (Task 2), `teamPhaseRows` (Task 3), `setTeamPhaseAllocations` (Task 1). Field names `asisRows`/`toBeRows` match between the field defs and the onSubmit reads. `setTeamPhaseAllocations(teamId, phase, rows)` signature matches its callers.

4. **Line numbers** are `~` (single-file build + prior edits shift offsets); anchor on the shown snippets.
