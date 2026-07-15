# In-place CF Editing on the Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pencil (✎) CF editing to the Dashboard money-mode CF tables, sharing one edit controller and one `cfOverride` with the «Финансы» tab.

**Architecture:** Extract the CF edit state + handlers into a shared `App.cfEdit` module; refactor `render.finance.js` to delegate to it; wire the same edit affordances into `render.dashboard.js`'s `buildDashCFTable`/`buildDashTenantCFTable`. One table editable app-wide at a time.

**Tech Stack:** Vanilla JS ES5. Build `python build.py` (auto-inlines every `<script src>` from `index.html`). Tests: jsdom in `ui-tests/` (`node <file>.test.js`).

## Global Constraints

- Vanilla JS **ES5 ONLY** — `var`/`function`, no arrow functions, template literals, `const`/`let`, `class`, destructuring.
- DOM via `U.el`; mutations via `state.commit`. `U.genId`, `U.qs`, `U.qsa`, `U.findById` available.
- One CF table editable at a time across the whole app (single draft).
- Pencil hidden when `state.isViewOnly()`; hidden on other tables while any table is being edited.
- Row shape in `cfOverride`: `{ id, name, phase:'asis'|'tobe', monthly: { "<year>": number[12] } }`; `listKey` is `'offices'|'tenants'`.
- Files are CRLF; prefer the Python CRLF-safe replace if a plain Edit reports "not found".
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.

---

### Task 1: Shared `App.cfEdit` controller

**Files:**
- Create: `js/cfEdit.js`
- Modify: `index.html` (add `<script src="js/cfEdit.js"></script>` after `js/allocations.js`)
- Test: `ui-tests/cfedit.test.js` (new, jsdom)

**Interfaces:**
- Produces `App.cfEdit` with: `isEditing(key)`, `anyEditing()`, `getDraft()`, `enterEdit(scenario, years, key)`, `save(scenario)`, `cancel()`, `reset(scenario)`, `editCell(listKey, rowId, year, monthIndex, value)`, `addRow(listKey, name, phase)`, `deleteRow(listKey, rowId)`, `effectiveScenario(scenario)`.

- [ ] **Step 1: Write the failing test** — create `ui-tests/cfedit.test.js`:

```js
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/calculations.js', 'js/allocations.js', 'js/cfEdit.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App;
App.render = { render: function () {} }; // cfEdit calls App.render.render() lazily

App.state.setProject({
  projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1200, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [] }],
    teams: [], employees: [], allocations: [] }]
});
App.state.setActiveScenario('s1');
var scen = App.state.getActiveScenario();
var CE = App.cfEdit;

console.log('cfEdit controller');
CE.enterEdit(scen, [2026], 'finance-office');
assert(CE.isEditing('finance-office') && CE.anyEditing(), 'enterEdit sets editing key');
assert(CE.getDraft() && CE.getDraft().offices.length === 1, 'draft snapshot has the office row');

// Year-cell edit splits value/12 across 12 months.
CE.editCell('offices', 'o1', 2026, null, 24);
var row = CE.getDraft().offices[0];
assert(Math.abs(row.monthly['2026'][0] - 2) < 1e-9 && row.monthly['2026'].length === 12, 'year edit splits into 12 months of 2');

// effectiveScenario reflects the draft while editing.
var eff = CE.effectiveScenario(scen);
assert(eff.cfOverride === CE.getDraft(), 'effectiveScenario returns draft-backed scenario');

CE.save(scen);
assert(!CE.anyEditing(), 'save clears editing state');
assert(scen.cfOverride && Math.abs(scen.cfOverride.offices[0].monthly['2026'][0] - 2) < 1e-9, 'save writes cfOverride with edited values');

CE.reset(scen);
assert(scen.cfOverride === null, 'reset clears cfOverride');
assert(CE.effectiveScenario(scen) === scen, 'effectiveScenario returns original scenario when not editing');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail** — `cd ui-tests && node cfedit.test.js` → fails (`Cannot read properties of undefined` / `App.cfEdit` undefined).

- [ ] **Step 3: Create `js/cfEdit.js`:**

```js
/**
 * cfEdit.js
 * Shared Cash Flow edit controller. One CF table editable at a time across the
 * whole app (Финансы + Dashboard). Holds the working draft (a copy of
 * scenario.cfOverride) and the edit key; both tabs delegate here so there is a
 * single edit state and one cfOverride. App.render is referenced lazily (it
 * loads after this file).
 */
window.App = window.App || {};

App.cfEdit = (function () {
  'use strict';

  var U = App.utils;
  var calc = App.calc;
  var state = App.state;

  var editingKey = null; // e.g. 'finance-office', 'dash-tenant-tobe'
  var draft = null;      // { offices:[...], tenants:[...] } | null

  function render() { App.render.render(); }
  function isEditing(key) { return editingKey === key; }
  function anyEditing() { return editingKey !== null; }
  function getDraft() { return draft; }
  function listOf(listKey) { return listKey === 'tenants' ? draft.tenants : draft.offices; }

  function enterEdit(scenario, years, key) {
    draft = calc.buildOverrideFromComputed(scenario, years);
    editingKey = key;
    render();
  }
  function save(scenario) {
    var d = draft;
    state.commit('Правка CF', function () { scenario.cfOverride = d; });
    editingKey = null; draft = null;
  }
  function cancel() { editingKey = null; draft = null; render(); }
  function reset(scenario) {
    state.commit('Сброс CF (пересчёт из офисов)', function () { scenario.cfOverride = null; });
    editingKey = null; draft = null;
  }
  function editCell(listKey, rowId, year, monthIndex, value) {
    if (!draft) { return; }
    var list = listOf(listKey);
    var row = null;
    list.forEach(function (r) { if (r.id === rowId) { row = r; } });
    if (!row) { return; }
    var ys = String(year);
    if (!row.monthly[ys] || row.monthly[ys].length !== 12) {
      row.monthly[ys] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (monthIndex === null) {
      var per = value / 12;
      for (var m = 0; m < 12; m++) { row.monthly[ys][m] = per; }
    } else {
      row.monthly[ys][monthIndex] = value;
    }
    render();
  }
  function addRow(listKey, name, phase) {
    if (!draft || !name) { return; }
    listOf(listKey).push({ id: U.genId('cfrow'), name: name, phase: phase, monthly: {} });
    render();
  }
  function deleteRow(listKey, rowId) {
    if (!draft) { return; }
    var list = listOf(listKey);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === rowId) { list.splice(i, 1); break; }
    }
    render();
  }
  function effectiveScenario(scenario) {
    if (!editingKey || !draft) { return scenario; }
    var copy = {};
    for (var k in scenario) { if (scenario.hasOwnProperty(k)) { copy[k] = scenario[k]; } }
    copy.cfOverride = draft;
    return copy;
  }

  return {
    isEditing: isEditing, anyEditing: anyEditing, getDraft: getDraft,
    enterEdit: enterEdit, save: save, cancel: cancel, reset: reset,
    editCell: editCell, addRow: addRow, deleteRow: deleteRow,
    effectiveScenario: effectiveScenario
  };
})();
```

- [ ] **Step 4: Register in `index.html`** — after the `<script src="js/allocations.js"></script>` line, add:

```html
  <script src="js/cfEdit.js"></script>
```

- [ ] **Step 5: Run → pass** — `node cfedit.test.js` → all pass. Then `python build.py` (confirms cfEdit.js is inlined).

- [ ] **Step 6: Commit**

```bash
git add js/cfEdit.js index.html employee-seating-dashboard.html ui-tests/cfedit.test.js
git commit -m "feat: shared App.cfEdit CF edit controller"
```

---

### Task 2: Refactor `render.finance.js` to delegate to `App.cfEdit`

**Files:**
- Modify: `js/render.finance.js` (replace local edit state/handlers with `App.cfEdit`)
- Test: `ui-tests/finance-edit.test.js` (new, jsdom) — guards the refactor end-to-end.

**Interfaces:**
- Consumes `App.cfEdit` (Task 1). Keys `'finance-office'`/`'finance-tenant'`; `listKey` `'offices'`/`'tenants'`.

- [ ] **Step 1: Write the failing test** — create `ui-tests/finance-edit.test.js`:

```js
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
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js', 'js/employees.js',
 'js/calculations.js', 'js/allocations.js', 'js/cfEdit.js', 'js/validation.js', 'js/modals.js', 'js/render.js',
 'js/render.finance.js', 'js/undoRedo.js'].forEach(function (f) {
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
App.render.setActiveTab('finance');
App.render.render();

console.log('finance tab CF editing (post-refactor)');
var pencil = U.qsa('button', w.document).filter(function (b) { return b.getAttribute && b.getAttribute('title') === 'Редактировать таблицу'; })[0];
assert(!!pencil, 'pencil present on Финансы CF table');
pencil.click();
var input = U.qsa('.cf-edit-input', w.document)[0];
assert(!!input, 'editable inputs appear after clicking pencil');
input.value = '24';
input.dispatchEvent(new w.Event('change'));
var save = U.qsa('button', w.document).filter(function (b) { return b.textContent.trim() === 'Сохранить'; })[0];
assert(!!save, 'Save button present'); save.click();
var scen = App.state.getActiveScenario();
assert(!!scen.cfOverride, 'cfOverride written after save');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail** — `node finance-edit.test.js`. It currently PASSES against the pre-refactor finance code (local controller). To make it a true guard of the refactor, run it after Step 3; here just confirm it runs. (If it errors because `cfEdit.js` isn't loaded by finance yet, that's fine — Step 3 wires it.)

- [ ] **Step 3: Replace the edit internals of `render.finance.js`.** Replace the whole file with:

```js
/**
 * render.finance.js
 * "Финансы" tab: editable Cash Flow tables by office and by tenant.
 * Editing is delegated to the shared App.cfEdit controller (one CF table
 * editable at a time across the app; edits write scenario.cfOverride).
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var state = App.state;

  var expandedCFYears = {};

  function yearsArray(cf) {
    var ys = [];
    for (var y = cf.startYear; y <= cf.endYear; y++) { ys.push(y); }
    return ys;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var CE = App.cfEdit;
    var settings = state.getSettings();
    var cfRaw = settings.cfSettings || { startYear: 2026, endYear: 2030 };
    var cf = { startYear: cfRaw.startYear, endYear: cfRaw.endYear };

    var controlsPanel = R.section('Параметры прогноза');
    var controlsRow = U.el('div', { class: 'cf-controls' });

    function yearStepper(label, key) {
      var dec = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '−' });
      var inc = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '+' });
      var display = U.el('span', { class: 'cf-year-val', text: String(cf[key]) });
      function step(delta) {
        cf[key] = Math.max(2000, Math.min(2100, cf[key] + delta));
        if (cf.startYear > cf.endYear) {
          if (key === 'startYear') { cf.endYear = cf.startYear; } else { cf.startYear = cf.endYear; }
        }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
        display.textContent = String(cf[key]);
      }
      dec.addEventListener('click', function () { step(-1); });
      inc.addEventListener('click', function () { step(1); });
      return U.el('div', { class: 'cf-stepper' }, [U.el('span', { class: 'cf-stepper-label', text: label }), dec, display, inc]);
    }

    controlsRow.appendChild(yearStepper('С года:', 'startYear'));
    controlsRow.appendChild(yearStepper('По год:', 'endYear'));
    controlsPanel.appendChild(controlsRow);
    container.appendChild(controlsPanel);

    var data = calc.getScenarioCFData(CE.effectiveScenario(scenario), cf.startYear, cf.endYear);
    if (data.years.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Некорректный диапазон лет' }));
      return;
    }

    function renderCFTable(title, tableKey, rows, years) {
      var key = 'finance-' + tableKey;
      var listKey = tableKey === 'tenant' ? 'tenants' : 'offices';
      var panel = R.section(title);
      var head = panel.firstChild;
      var viewOnly = state.isViewOnly();

      if (CE.isEditing(key)) {
        var saveBtn = U.el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
        saveBtn.addEventListener('click', function () { CE.save(scenario); });
        var cancelBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Отмена' });
        cancelBtn.addEventListener('click', function () { CE.cancel(); });
        var recalcBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
        recalcBtn.addEventListener('click', function () { CE.reset(scenario); });
        head.appendChild(U.el('div', { class: 'cf-edit-actions' }, [saveBtn, cancelBtn, recalcBtn]));
      } else if (!viewOnly && !CE.anyEditing()) {
        head.appendChild(R.iconBtn('✎', 'Редактировать таблицу', (function (k, yy) {
          return function () { CE.enterEdit(scenario, yy, k); };
        })(key, yearsArray(cf))));
      }

      if (scenario.cfOverride && !CE.isEditing(key)) {
        var banner = U.el('div', { class: 'cf-override-banner' }, [U.el('span', { text: 'Данные CF переопределены вручную' })]);
        if (!viewOnly && !CE.anyEditing()) {
          var b = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
          b.addEventListener('click', function () { CE.reset(scenario); });
          banner.appendChild(b);
        }
        panel.appendChild(banner);
      }

      if (rows.length === 0) {
        panel.appendChild(U.el('p', { class: 'muted', text: 'Нет данных' }));
        return panel;
      }
      panel.appendChild(R.cfTable({
        rows: rows,
        years: years,
        expandedYears: expandedCFYears,
        onToggleYear: function (yr) { expandedCFYears[yr] = !expandedCFYears[yr]; R.render(); },
        firstColLabel: tableKey === 'tenant' ? 'Арендатор' : 'Офис / Фаза',
        editable: CE.isEditing(key),
        onEditCell: function (rowId, year, monthIndex, value) { CE.editCell(listKey, rowId, year, monthIndex, value); },
        onDeleteRow: function (rowId) { CE.deleteRow(listKey, rowId); },
        onAddRow: function (phase) { var name = window.prompt('Название строки:'); CE.addRow(listKey, name, phase); }
      }));
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', 'office', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', 'tenant', data.tenantRows, data.years));
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
```

- [ ] **Step 4: Run tests** — `node finance-edit.test.js` (all pass), `node cfedit.test.js` (still pass). `python build.py`. `node <scratch>/run_tests.js .` → 76/76.

- [ ] **Step 5: Commit**

```bash
git add js/render.finance.js employee-seating-dashboard.html ui-tests/finance-edit.test.js
git commit -m "refactor: render.finance delegates CF editing to App.cfEdit"
```

---

### Task 3: Dashboard in-place CF editing

**Files:**
- Modify: `js/render.js` (`renderCFTableBlock`: honor `opts.addRowPhases`)
- Modify: `js/render.dashboard.js` (`buildDashCFTable`, `buildDashTenantCFTable`, + `dashCFEditControls`/`dashCFBanner` helpers)
- Test: `ui-tests/dash-cf-edit.test.js` (new, jsdom)

**Interfaces:**
- Consumes `App.cfEdit`. Keys `'dash-office-' + phase` / `'dash-tenant-' + phase`; `listKey` `'offices'`/`'tenants'`.
- `R.cfTable` gains `opts.addRowPhases` (array of phase strings; default `[ASIS, TOBE]`) limiting which add-row buttons render.

- [ ] **Step 1: `render.js` — honor `addRowPhases`.** In `renderCFTableBlock`, the add-row block currently is:

```js
    if (editable) {
      [C.OFFICE_PHASE.ASIS, C.OFFICE_PHASE.TOBE].forEach(function (ph) {
```

Replace that first line pair with:

```js
    if (editable) {
      (opts.addRowPhases || [C.OFFICE_PHASE.ASIS, C.OFFICE_PHASE.TOBE]).forEach(function (ph) {
```

- [ ] **Step 2: `render.dashboard.js` — add shared helpers.** Add just above `function buildDashCFTable(` :

```js
  /** Edit controls (pencil OR Save/Cancel/Recalc) for a dashboard CF table. */
  function dashCFEditControls(scenario, years, key) {
    var CE = App.cfEdit;
    if (CE.isEditing(key)) {
      var save = U.el('button', { class: 'btn btn-sm btn-primary', text: 'Сохранить' });
      save.addEventListener('click', function () { CE.save(scenario); });
      var cancel = U.el('button', { class: 'btn btn-sm btn-secondary', text: 'Отмена' });
      cancel.addEventListener('click', function () { CE.cancel(); });
      var recalc = U.el('button', { class: 'btn btn-sm btn-secondary', text: 'Пересчитать' });
      recalc.addEventListener('click', function () { CE.reset(scenario); });
      return U.el('div', { class: 'cf-edit-actions' }, [save, cancel, recalc]);
    }
    if (!state.isViewOnly() && !CE.anyEditing()) {
      return R.iconBtn('✎', 'Редактировать CF', (function (yy, k) {
        return function () { CE.enterEdit(scenario, yy, k); };
      })(years, key));
    }
    return null;
  }

  /** "Overridden manually" banner for a dashboard CF table. */
  function dashCFBanner(scenario, key) {
    var CE = App.cfEdit;
    if (!scenario.cfOverride || CE.isEditing(key)) { return null; }
    var banner = U.el('div', { class: 'cf-override-banner' }, [U.el('span', { text: 'Данные CF переопределены вручную' })]);
    if (!state.isViewOnly() && !CE.anyEditing()) {
      var b = U.el('button', { class: 'btn btn-sm btn-secondary', text: 'Пересчитать из офисов' });
      b.addEventListener('click', function () { CE.reset(scenario); });
      banner.appendChild(b);
    }
    return banner;
  }
```

- [ ] **Step 3: `render.dashboard.js` — rewrite `buildDashCFTable`.** Replace the whole function with:

```js
  /** CF table block for one phase, embedded below office grid in money mode. */
  function buildDashCFTable(scenario, phase, startYear, endYear) {
    var CE = App.cfEdit;
    var years = []; for (var y = startYear; y <= endYear; y++) { years.push(y); }
    var data = calc.getScenarioCFData(CE.effectiveScenario(scenario), startYear, endYear);
    if (data.years.length === 0) { return null; }
    var phaseRows = data.officeRows.filter(function (r) { return r.phase === phase; });
    if (phaseRows.length === 0) { return null; }
    var phaseLabel = phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
    var key = 'dash-office-' + phase;
    var isCollapsed = !!dashCFCollapsed[phase];
    var wrap = U.el('div', { class: 'dash-cf-block' });

    var headKids = [U.el('div', { class: 'section-title', text: 'Cash Flow ' + phaseLabel + ' (млн руб./год)' })];
    var controls = dashCFEditControls(scenario, years, key);
    if (controls) { headKids.push(controls); }
    headKids.push(U.el('button', {
      class: 'btn btn-sm btn-secondary cf-collapse-btn',
      onclick: (function (ph) { return function () { dashCFCollapsed[ph] = !dashCFCollapsed[ph]; R.render(); }; })(phase)
    }, isCollapsed ? '▸ Развернуть' : '▾ Свернуть'));
    wrap.appendChild(U.el('div', { class: 'cf-block-head' }, headKids));

    var banner = dashCFBanner(scenario, key);
    if (banner) { wrap.appendChild(banner); }

    if (!isCollapsed || CE.isEditing(key)) {
      wrap.appendChild(R.cfTable({
        rows: phaseRows,
        years: data.years,
        expandedYears: dashExpandedCFYears,
        onToggleYear: function (yr) { dashExpandedCFYears[yr] = !dashExpandedCFYears[yr]; R.render(); },
        firstColLabel: 'Офис',
        showPhaseHeaders: false,
        editable: CE.isEditing(key),
        addRowPhases: [phase],
        onEditCell: function (rowId, year, mIdx, val) { CE.editCell('offices', rowId, year, mIdx, val); },
        onDeleteRow: function (rowId) { CE.deleteRow('offices', rowId); },
        onAddRow: function (ph) { var name = window.prompt('Название строки:'); CE.addRow('offices', name, ph); }
      }));
    }
    return wrap;
  }
```

- [ ] **Step 4: `render.dashboard.js` — rewrite `buildDashTenantCFTable`.** Replace the whole function with:

```js
  /** Tenant CF table block for one phase, embedded below office CF table in money mode. */
  function buildDashTenantCFTable(scenario, phase, startYear, endYear) {
    var CE = App.cfEdit;
    var years = []; for (var y = startYear; y <= endYear; y++) { years.push(y); }
    var data = calc.getScenarioCFData(CE.effectiveScenario(scenario), startYear, endYear);
    if (data.years.length === 0) { return null; }
    var phaseRows = data.tenantRows.filter(function (r) { return r.phase === phase; });
    if (phaseRows.length === 0) { return null; }
    var phaseLabel = phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
    var key = 'dash-tenant-' + phase;
    var isCollapsed = !!dashTenantCFCollapsed[phase];
    var wrap = U.el('div', { class: 'dash-cf-block' });

    var headKids = [U.el('div', { class: 'section-title', text: 'CF по арендаторам ' + phaseLabel + ' (млн руб./год)' })];
    var controls = dashCFEditControls(scenario, years, key);
    if (controls) { headKids.push(controls); }
    headKids.push(U.el('button', {
      class: 'btn btn-sm btn-secondary cf-collapse-btn',
      onclick: (function (ph) { return function () { dashTenantCFCollapsed[ph] = !dashTenantCFCollapsed[ph]; R.render(); }; })(phase)
    }, isCollapsed ? '▸ Развернуть' : '▾ Свернуть'));
    wrap.appendChild(U.el('div', { class: 'cf-block-head' }, headKids));

    var banner = dashCFBanner(scenario, key);
    if (banner) { wrap.appendChild(banner); }

    if (!isCollapsed || CE.isEditing(key)) {
      wrap.appendChild(R.cfTable({
        rows: phaseRows,
        years: data.years,
        expandedYears: dashExpandedTenantCFYears,
        onToggleYear: function (yr) { dashExpandedTenantCFYears[yr] = !dashExpandedTenantCFYears[yr]; R.render(); },
        firstColLabel: 'Арендатор',
        showPhaseHeaders: false,
        editable: CE.isEditing(key),
        addRowPhases: [phase],
        onEditCell: function (rowId, year, mIdx, val) { CE.editCell('tenants', rowId, year, mIdx, val); },
        onDeleteRow: function (rowId) { CE.deleteRow('tenants', rowId); },
        onAddRow: function (ph) { var name = window.prompt('Название строки:'); CE.addRow('tenants', name, ph); }
      }));
    }
    return wrap;
  }
```

- [ ] **Step 5: Write the dashboard-edit test** — create `ui-tests/dash-cf-edit.test.js`:

```js
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
```

- [ ] **Step 6: Run tests + build** — `node dash-cf-edit.test.js` passes; re-run `cfedit`, `finance-edit`, `dash-cards`, `team-form`, `alloc`, `placementrows`, `dnd` (all pass). `python build.py`. `node <scratch>/run_tests.js .` → 76/76.

- [ ] **Step 7: Manual verify** — Dashboard → money mode → each CF table (TO BE/AS IS, office/tenant) has a ✎; clicking it shows editable cells + Save/Cancel/Пересчитать and hides pencils on the other tables; editing + Save updates the dashboard and the «Финансы» tab identically; the «Финансы» pencil still works.

- [ ] **Step 8: Commit**

```bash
git add js/render.js js/render.dashboard.js employee-seating-dashboard.html ui-tests/dash-cf-edit.test.js
git commit -m "feat: in-place CF editing on dashboard money-mode tables via App.cfEdit"
```

---

## Self-Review

1. **Spec coverage:** shared `App.cfEdit` (Task 1); finance delegates (Task 2); dashboard pencil/action-bar/banner/editable table + effectiveScenario (Task 3); one-editable-at-a-time via `anyEditing()` gating (Tasks 2+3); pencil hidden in view-only (Tasks 2+3). ✅
2. **Placeholder scan:** no TBD; full code in every step. `<scratch>/run_tests.js` = the session's Node unit runner path.
3. **Type consistency:** `cfEdit` API signatures identical across finance (Task 2) and dashboard (Task 3) callers; `listKey` is `'offices'|'tenants'` everywhere; keys are `'<area>-<type>[-phase]'`; `addRowPhases` added to `R.cfTable` (Task 3 Step 1) and passed as `[phase]` by the dashboard.
4. **Line numbers** approximate; anchor on shown snippets.
