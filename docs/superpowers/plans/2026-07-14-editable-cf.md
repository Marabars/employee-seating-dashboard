# Editable Cash Flow Tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CF tables on the «Финансы» tab editable (pencil toggle): edit year/month cells, add/delete rows, auto subtotals; adding a row does not create an office; on save the edits become the source of truth for the tables and the CF charts on «Визуализация».

**Architecture:** Snapshot + override. A new `scenario.cfOverride` holds per-row monthly values. `getScenarioCFData` becomes override-aware and is the single source for both the tables and the CF charts. The «Финансы» tab gains an edit mode (working `draft` copy, Save/Cancel/Пересчитать). Charts in `renderCFSection` are refactored to read `getScenarioCFData`.

**Tech Stack:** Vanilla JS ES5. Build `python build.py` → `employee-seating-dashboard.html`. Tests: headless Node runner (`node run_tests.js <repo>`) or `tests.html` in a browser.

## Global Constraints

- Vanilla JS **ES5 ONLY** — `var`/`function`, no `const`/`let`, no arrow functions, no template literals, no `class`, no destructuring.
- DOM via `U.el(tag, attrs, children)` only (never innerHTML); mutations via `state.commit(label, fn)`.
- CF values in **millions RUB**; `monthly` arrays are 12 numbers (Jan..Dec); a year value = sum of its months.
- Edit UI hidden when `state.isViewOnly()` is true.
- Files are **CRLF**; the Edit tool's exact-string match can fail — prefer the Python CRLF-safe replace helper if a plain Edit reports "not found".
- Test fixtures must set `phase` on office/remote literals (normalizeProject invariant — the app never has a phase-less office).
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.

---

### Task 1: Data layer — `cfOverride`, override-aware `getScenarioCFData`, `buildOverrideFromComputed`

**Files:**
- Modify: `js/state.js` (`normalizeProject`, scenario loop ~line 308)
- Modify: `js/calculations.js` (`getScenarioCFData` ~lines 643–779; exports ~line 811)
- Test: `js/tests/calculations.test.js`

**Interfaces:**
- Produces: `scenario.cfOverride` = `null | { offices: Row[], tenants: Row[] }` where `Row = { id, name, phase:'asis'|'tobe', monthly: { "<year>": number[12] } }`.
- Produces: `getScenarioCFData(scenario, startYear, endYear)` unchanged shape `{ years, officeRows, tenantRows }`, but every non-subtotal row now has an `id`, and when `scenario.cfOverride` is non-null the rows are built from it.
- Produces: `App.calc.buildOverrideFromComputed(scenario, years)` → `{ offices, tenants }` (snapshot of current `getScenarioCFData` non-subtotal rows).

- [ ] **Step 1: Write failing tests**

Append before the closing `})();` of `js/tests/calculations.test.js`:

```js
  describe('getScenarioCFData — cfOverride', function () {
    function overrideScenario() {
      return {
        id: 'sc', name: 'CF', comment: '',
        offices: [
          { id: 'o1', type: 'physical', phase: 'tobe', name: 'Кораблик', area: 100,
            rentPerSqm: 0, opexPerSqm: 0, indexationPct: 0, zones: [], tenants: [] }
        ],
        teams: [], employees: [], allocations: [],
        cfOverride: {
          offices: [
            { id: 'o1', name: 'Кораблик', phase: 'tobe', monthly: { '2026': [1,1,1,1,1,1,1,1,1,1,1,1] } },
            { id: 'cfrow_x', name: 'Свободная', phase: 'tobe', monthly: { '2026': [2,0,0,0,0,0,0,0,0,0,0,0] } }
          ],
          tenants: []
        }
      };
    }

    it('office row reads stored monthly; year value = sum of months', function () {
      var data = calc.getScenarioCFData(overrideScenario(), 2026, 2026);
      var row = data.officeRows.filter(function (r) { return r.name === 'Кораблик'; })[0];
      expect(row.values[0]).toBeCloseTo(12, 6);
    });

    it('years outside monthly render as 0', function () {
      var data = calc.getScenarioCFData(overrideScenario(), 2026, 2027);
      var row = data.officeRows.filter(function (r) { return r.name === 'Кораблик'; })[0];
      expect(row.values[1]).toBe(0);
    });

    it('free row appears and TO BE subtotal sums all rows; scenario.offices untouched', function () {
      var s = overrideScenario();
      var before = s.offices.length;
      var data = calc.getScenarioCFData(s, 2026, 2026);
      var free = data.officeRows.filter(function (r) { return r.name === 'Свободная'; })[0];
      expect(free.values[0]).toBeCloseTo(2, 6);
      var sub = data.officeRows.filter(function (r) { return r.isSubtotal && r.phase === 'tobe'; })[0];
      expect(sub.values[0]).toBeCloseTo(14, 6); // 12 + 2
      expect(s.offices.length).toBe(before);
    });

    it('no cfOverride → computed path unchanged; rows carry id', function () {
      var s = fixture();
      var data = calc.getScenarioCFData(s, 2026, 2026);
      var row = data.officeRows.filter(function (r) { return r.name === 'Новый B'; })[0];
      expect(row.id).toBe('new1');
    });

    it('buildOverrideFromComputed round-trips to identical values', function () {
      var s = {
        id: 's', name: 'x', comment: '',
        offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 1000,
          rentPerSqm: 100, opexPerSqm: 50, indexationPct: 10,
          leaseStartDate: null, indexationStartDate: null, leaseEndDate: null, zones: [], tenants: [] }],
        teams: [], employees: [], allocations: [], cfOverride: null
      };
      var years = [2026, 2027];
      var ov = calc.buildOverrideFromComputed(s, years);
      var s2 = { id: 's2', name: 'x', comment: '', offices: s.offices, teams: [], employees: [], allocations: [], cfOverride: ov };
      var computed = calc.getScenarioCFData(s, 2026, 2027);
      var overridden = calc.getScenarioCFData(s2, 2026, 2027);
      var cRow = computed.officeRows.filter(function (r) { return r.name === 'A'; })[0];
      var oRow = overridden.officeRows.filter(function (r) { return r.name === 'A'; })[0];
      expect(oRow.values[0]).toBeCloseTo(cRow.values[0], 6);
      expect(oRow.values[1]).toBeCloseTo(cRow.values[1], 6);
    });
  });
```

- [ ] **Step 2: Run tests → verify new ones fail**

`node <scratch>/run_tests.js "$(pwd)"` (or open `tests.html`). Expected: the 5 new tests fail (`buildOverrideFromComputed` undefined; override branch missing; rows lack `id`). Pre-existing tests still pass (71).

- [ ] **Step 3: `state.js` — default `cfOverride`**

In `js/state.js`, in the `p.scenarios.forEach(function (s) { ... })` loop, right after `s.allocations = s.allocations || [];` (line ~308), add:

```js
      s.allocations = s.allocations || [];
      if (s.cfOverride === undefined) { s.cfOverride = null; }
```

- [ ] **Step 4: `calculations.js` — add `id` to computed rows**

In `getScenarioCFData`, in `buildOfficeRow` (the returned object ~line 668), add `id: office.id,` as the first field:

```js
      return {
        id: office.id,
        name: office.name,
        phase: office.phase,
        values: values,
        monthlyValues: monthlyValues,
        rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
        isSubtotal: false
      };
```

In `buildTenantRows`, in the returned row object (~line 760), add `id: 'cftenant_' + name,` as the first field:

```js
        return {
          id: 'cftenant_' + name,
          name: name,
          phase: phase,
          values: values,
          monthlyValues: monthlyValues,
          rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
          isSubtotal: false
        };
```

- [ ] **Step 5: `calculations.js` — override branch in `getScenarioCFData`**

`getScenarioCFData` begins (~line 643):

```js
  function getScenarioCFData(scenario, startYear, endYear) {
    var years = [];
    for (var y = startYear; y <= endYear; y++) { years.push(y); }
```

Immediately AFTER those three lines and BEFORE `// ---- CF by office ----`, insert the override branch plus a shared `subtotalRow` used by it. Since `subtotalRow` is currently defined later inside the function, DEFINE it above the branch by MOVING its definition up. Concretely, insert this block right after the `years` loop:

```js
    // Subtotal row over a set of rows (shared by computed + override paths).
    function subtotalRowFor(rows, phase, label) {
      var vals = years.map(function (_, i) {
        return rows.reduce(function (s, r) { return s + (r.values[i] || 0); }, 0);
      });
      var mv = {};
      years.forEach(function (yr) {
        mv[yr] = [];
        for (var m = 0; m < 12; m++) {
          mv[yr].push(rows.reduce(function (s, r) {
            return s + ((r.monthlyValues && r.monthlyValues[yr]) ? r.monthlyValues[yr][m] : 0);
          }, 0));
        }
      });
      return {
        id: 'subtotal_' + phase, name: label, phase: phase,
        values: vals, monthlyValues: mv,
        rowTotal: vals.reduce(function (s, v) { return s + v; }, 0),
        isSubtotal: true
      };
    }

    // ---- Override path: rows come from scenario.cfOverride ----
    if (scenario.cfOverride) {
      function zeros12() { return [0,0,0,0,0,0,0,0,0,0,0,0]; }
      function rowsFromOverride(list) {
        return (list || []).map(function (o) {
          var monthlyValues = {};
          years.forEach(function (yr) {
            var m = o.monthly && o.monthly[String(yr)];
            monthlyValues[yr] = (m && m.length === 12) ? m.slice() : zeros12();
          });
          var values = years.map(function (yr) {
            return monthlyValues[yr].reduce(function (s, v) { return s + v; }, 0);
          });
          return {
            id: o.id, name: o.name, phase: o.phase,
            values: values, monthlyValues: monthlyValues,
            rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
            isSubtotal: false
          };
        });
      }
      function groupWithSubtotals(rows) {
        var asis = rows.filter(function (r) { return r.phase === C.OFFICE_PHASE.ASIS; });
        var tobe = rows.filter(function (r) { return r.phase === C.OFFICE_PHASE.TOBE; });
        return asis.concat([subtotalRowFor(asis, C.OFFICE_PHASE.ASIS, 'Итого AS IS')])
          .concat(tobe).concat([subtotalRowFor(tobe, C.OFFICE_PHASE.TOBE, 'Итого TO BE')]);
      }
      return {
        years: years,
        officeRows: groupWithSubtotals(rowsFromOverride(scenario.cfOverride.offices)),
        tenantRows: groupWithSubtotals(rowsFromOverride(scenario.cfOverride.tenants))
      };
    }
```

The existing computed code below (the `subtotalRow` nested function and its uses) stays as-is — it is only reached when `cfOverride` is falsy. (Leaving the original `subtotalRow` in place is intentional; do not delete it.)

- [ ] **Step 6: `calculations.js` — `buildOverrideFromComputed` + export**

Add this function just above the `return {` exports block (~line 781):

```js
  /**
   * Snapshot the current computed (or already-overridden) CF into the
   * cfOverride shape: { offices:[{id,name,phase,monthly}], tenants:[...] }.
   * Only non-subtotal rows are captured. Called when the user first enters
   * CF edit mode.
   */
  function buildOverrideFromComputed(scenario, years) {
    var data = getScenarioCFData(scenario, years[0], years[years.length - 1]);
    function toRows(rows) {
      return rows.filter(function (r) { return !r.isSubtotal; }).map(function (r) {
        var monthly = {};
        years.forEach(function (yr) {
          var mv = r.monthlyValues && r.monthlyValues[yr];
          monthly[String(yr)] = (mv && mv.length === 12) ? mv.slice() : [0,0,0,0,0,0,0,0,0,0,0,0];
        });
        return { id: r.id, name: r.name, phase: r.phase, monthly: monthly };
      });
    }
    return { offices: toRows(data.officeRows), tenants: toRows(data.tenantRows) };
  }
```

Add to the exports object (after `getScenarioCFData: getScenarioCFData,`):

```js
    getScenarioCFData: getScenarioCFData,
    buildOverrideFromComputed: buildOverrideFromComputed
```

(Ensure the preceding line keeps its comma and the object stays valid.)

- [ ] **Step 7: Run tests + build**

`node <scratch>/run_tests.js "$(pwd)"` → all pass (76/76). Then `python build.py`.

- [ ] **Step 8: Commit**

```bash
git add js/state.js js/calculations.js js/tests/calculations.test.js employee-seating-dashboard.html
git commit -m "feat: cfOverride data model + override-aware getScenarioCFData"
```

---

### Task 2: «Финансы» edit mode — editable cells, Save/Cancel/Пересчитать, banner

**Files:**
- Modify: `js/render.js` (`renderCFTableBlock` ~lines 288–386)
- Modify: `js/render.finance.js` (whole render flow)
- Modify: `styles.css` (edit input + banner + action bar styles)

**Interfaces:**
- Consumes: `getScenarioCFData`, `buildOverrideFromComputed` (Task 1); `state.commit`, `state.isViewOnly`, `R.iconBtn`, `R.section`, `R.render`.
- `cfTable(opts)` gains `opts.editable` (bool) and `opts.onEditCell(rowId, year, monthIndexOrNull, value)`.

- [ ] **Step 1: `render.js` — editable cells in `renderCFTableBlock`**

In `renderCFTableBlock`, read the new options near the top (after `var showPhaseHeaders = ...;`):

```js
    var editable = !!opts.editable;
    var onEditCell = opts.onEditCell || function () {};
```

Replace the cell-building loop body (the `columns.forEach(function (col) { ... cells.push(...); });` block ~lines 363–380) with a version that renders inputs when editing. The full replacement:

```js
      columns.forEach(function (col) {
        var val, cellClass;
        if (col.type === 'year') {
          val = row.values[years.indexOf(col.year)];
          cellClass = 'cf-val-col';
        } else if (col.type === 'ytotal') {
          val = row.values[years.indexOf(col.year)];
          cellClass = 'cf-val-col cf-ytotal-col cf-bold';
        } else if (col.type === 'month') {
          var mv = row.monthlyValues && row.monthlyValues[col.year];
          val = mv ? mv[col.month - 1] : null;
          cellClass = 'cf-val-col cf-month-col';
        } else {
          val = row.rowTotal;
          cellClass = 'cf-val-col cf-bold';
        }
        // Editable inputs: year cells and month cells of non-subtotal rows.
        // ytotal and grand-total stay read-only (auto-computed).
        var isEditableCell = editable && !row.isSubtotal &&
          (col.type === 'year' || col.type === 'month');
        if (isEditableCell) {
          var input = U.el('input', {
            type: 'number', step: 'any', class: 'cf-edit-input',
            value: (val === null || val === undefined || isNaN(val)) ? '' : String(Math.round(val * 100) / 100)
          });
          input.addEventListener('change', (function (rid, yr, mIdx, inputEl) {
            return function () {
              var num = parseFloat(inputEl.value);
              if (isNaN(num)) { num = 0; }
              onEditCell(rid, yr, mIdx, num);
            };
          })(row.id, col.year, col.type === 'month' ? (col.month - 1) : null, input));
          cells.push(U.el('td', { class: cellClass }, [input]));
        } else {
          cells.push(U.el('td', { class: cellClass, text: fmt(val) }));
        }
      });
```

- [ ] **Step 2: `render.finance.js` — edit state + controller**

Replace the entire contents of `js/render.finance.js` with:

```js
/**
 * render.finance.js
 * "Финансы" tab: editable Cash Flow tables by office and by tenant.
 * Computed from office/tenant data unless scenario.cfOverride is set, in
 * which case the stored values are the source of truth (snapshot + override).
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
  var editingTable = null; // null | 'office' | 'tenant'
  var draft = null;        // working cfOverride copy while editing

  function yearsArray(cf) {
    var ys = [];
    for (var y = cf.startYear; y <= cf.endYear; y++) { ys.push(y); }
    return ys;
  }

  function enterEdit(scenario, cf, tableKey) {
    editingTable = tableKey;
    draft = calc.buildOverrideFromComputed(scenario, yearsArray(cf));
    R.render();
  }

  function saveEdit(scenario) {
    var d = draft;
    state.commit('Правка CF', function () { scenario.cfOverride = d; });
    editingTable = null; draft = null;
  }

  function cancelEdit() {
    editingTable = null; draft = null; R.render();
  }

  function resetToComputed(scenario) {
    state.commit('Сброс CF (пересчёт из офисов)', function () { scenario.cfOverride = null; });
    editingTable = null; draft = null;
  }

  function editCell(tableKey, rowId, year, monthIndex, value) {
    var list = tableKey === 'office' ? draft.offices : draft.tenants;
    var row = null;
    list.forEach(function (r) { if (r.id === rowId) { row = r; } });
    if (!row) { return; }
    var ys = String(year);
    if (!row.monthly[ys] || row.monthly[ys].length !== 12) {
      row.monthly[ys] = [0,0,0,0,0,0,0,0,0,0,0,0];
    }
    if (monthIndex === null) {
      var per = value / 12;
      for (var m = 0; m < 12; m++) { row.monthly[ys][m] = per; }
    } else {
      row.monthly[ys][monthIndex] = value;
    }
    R.render();
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var settings = state.getSettings();
    var cfRaw = settings.cfSettings || { startYear: 2026, endYear: 2030 };
    var cf = { startYear: cfRaw.startYear, endYear: cfRaw.endYear };

    // ---- Year range controls ----
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
      return U.el('div', { class: 'cf-stepper' }, [
        U.el('span', { class: 'cf-stepper-label', text: label }), dec, display, inc
      ]);
    }

    controlsRow.appendChild(yearStepper('С года:', 'startYear'));
    controlsRow.appendChild(yearStepper('По год:', 'endYear'));
    controlsPanel.appendChild(controlsRow);
    container.appendChild(controlsPanel);

    // ---- CF Data (draft while editing, else scenario) ----
    var srcScenario = scenario;
    if (editingTable && draft) {
      srcScenario = {};
      for (var k in scenario) { if (scenario.hasOwnProperty(k)) { srcScenario[k] = scenario[k]; } }
      srcScenario.cfOverride = draft;
    }
    var data = calc.getScenarioCFData(srcScenario, cf.startYear, cf.endYear);
    if (data.years.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Некорректный диапазон лет' }));
      return;
    }

    function renderCFTable(title, tableKey, rows, years) {
      var panel = R.section(title);
      var head = panel.firstChild; // .section-head
      var viewOnly = state.isViewOnly();

      if (editingTable === tableKey) {
        var saveBtn = U.el('button', { class: 'btn btn-primary btn-sm', text: 'Сохранить' });
        saveBtn.addEventListener('click', function () { saveEdit(scenario); });
        var cancelBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Отмена' });
        cancelBtn.addEventListener('click', function () { cancelEdit(); });
        var recalcBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
        recalcBtn.addEventListener('click', function () { resetToComputed(scenario); });
        head.appendChild(U.el('div', { class: 'cf-edit-actions' }, [saveBtn, cancelBtn, recalcBtn]));
      } else if (!viewOnly && !editingTable) {
        head.appendChild(R.iconBtn('✎', 'Редактировать таблицу', (function (tk) {
          return function () { enterEdit(scenario, cf, tk); };
        })(tableKey)));
      }

      if (scenario.cfOverride && editingTable !== tableKey) {
        var banner = U.el('div', { class: 'cf-override-banner' }, [
          U.el('span', { text: 'Данные CF переопределены вручную' })
        ]);
        if (!viewOnly && !editingTable) {
          var b = U.el('button', { class: 'btn btn-secondary btn-sm', text: 'Пересчитать из офисов' });
          b.addEventListener('click', function () { resetToComputed(scenario); });
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
        editable: editingTable === tableKey,
        onEditCell: (function (tk) {
          return function (rowId, year, monthIndex, value) { editCell(tk, rowId, year, monthIndex, value); };
        })(tableKey)
      }));
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', 'office', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', 'tenant', data.tenantRows, data.years));
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
```

- [ ] **Step 3: `styles.css` — edit styles**

Append to `styles.css`:

```css
.cf-edit-input {
  width: 68px;
  padding: 2px 4px;
  border: 1px solid var(--border, #cbd2d9);
  border-radius: 4px;
  font: inherit;
  text-align: right;
  background: #fffbe6;
}
.cf-edit-actions { display: inline-flex; gap: 6px; margin-left: auto; }
.cf-override-banner {
  display: flex; align-items: center; gap: 10px;
  margin: 8px 0; padding: 6px 10px;
  background: #eef4ff; border: 1px solid #c7d7f5; border-radius: 6px;
  font-size: 13px; color: #1f2933;
}
```

- [ ] **Step 4: Build + manual verify**

`python build.py`. Open `employee-seating-dashboard.html` → «Финансы». Verify:
- Pencil ✎ appears on each table header (hidden in view-only mode).
- Clicking ✎ turns that table's year/month cells into inputs; subtotal rows stay text; Save/Cancel/Пересчитать appear.
- Editing a year cell then blurring updates the subtotal; expanding the year shows the 12 months each = year/12.
- Editing a month cell updates the year total.
- Save → inputs disappear, values persist, banner «переопределено вручную» shows; reload after export/import keeps values.
- Cancel → reverts to pre-edit; Пересчитать → banner disappears, values back to computed.
- Undo (Ctrl+Z) reverts a Save.

- [ ] **Step 5: Commit**

```bash
git add js/render.js js/render.finance.js styles.css employee-seating-dashboard.html
git commit -m "feat: editable CF cells with save/cancel/recompute on Finance tab"
```

---

### Task 3: Add / delete rows

**Files:**
- Modify: `js/render.js` (`renderCFTableBlock` — add per-row delete + per-phase add-row affordances)
- Modify: `js/render.finance.js` (add/delete handlers)

**Interfaces:**
- `cfTable(opts)` gains `opts.editable` (already), `opts.onDeleteRow(rowId)`, `opts.onAddRow(phase)`.

- [ ] **Step 1: `render.js` — delete button per row + add-row rows**

In `renderCFTableBlock`, read the new callbacks near the other opts:

```js
    var onDeleteRow = opts.onDeleteRow || function () {};
    var onAddRow = opts.onAddRow || function () {};
```

In the row loop, when `editable && !row.isSubtotal`, append a delete button as the first cell content of the name column. Replace the name-cell construction line:

```js
      var cells = [U.el('td', { class: 'cf-name-col' + (row.isSubtotal ? ' cf-bold' : ''), text: row.name })];
```

with:

```js
      var nameCell;
      if (editable && !row.isSubtotal) {
        var delBtn = U.el('button', { class: 'icon-btn cf-del-row', title: 'Удалить строку' }, '🗑');
        delBtn.addEventListener('click', (function (rid) { return function () { onDeleteRow(rid); }; })(row.id));
        nameCell = U.el('td', { class: 'cf-name-col' }, [delBtn, U.el('span', { text: ' ' + row.name })]);
      } else {
        nameCell = U.el('td', { class: 'cf-name-col' + (row.isSubtotal ? ' cf-bold' : ''), text: row.name });
      }
      var cells = [nameCell];
```

After the `rows.forEach(...)` loop that fills `tbody`, when editing, append one "add row" row per phase. Insert right before `table.appendChild(tbody);`:

```js
    if (editable) {
      [C.OFFICE_PHASE.ASIS, C.OFFICE_PHASE.TOBE].forEach(function (ph) {
        var label = ph === C.OFFICE_PHASE.ASIS ? '＋ строка в AS IS' : '＋ строка в TO BE';
        var addBtn = U.el('button', { class: 'btn btn-secondary btn-sm', text: label });
        addBtn.addEventListener('click', (function (phase) { return function () { onAddRow(phase); }; })(ph));
        var td = U.el('td', { class: 'cf-add-row-cell', colspan: String(columns.length + 1) }, [addBtn]);
        tbody.appendChild(U.el('tr', { class: 'cf-add-row' }, [td]));
      });
    }
```

- [ ] **Step 2: `render.finance.js` — add/delete handlers wired into `cfTable` call**

In the `R.cfTable({ ... })` options object inside `renderCFTable`, add two callbacks after `onEditCell`:

```js
        onDeleteRow: (function (tk) {
          return function (rowId) {
            var list = tk === 'office' ? draft.offices : draft.tenants;
            for (var i = 0; i < list.length; i++) {
              if (list[i].id === rowId) { list.splice(i, 1); break; }
            }
            R.render();
          };
        })(tableKey),
        onAddRow: (function (tk) {
          return function (phase) {
            var name = window.prompt('Название строки:');
            if (!name) { return; }
            var list = tk === 'office' ? draft.offices : draft.tenants;
            list.push({ id: U.genId('cfrow'), name: name, phase: phase, monthly: {} });
            R.render();
          };
        })(tableKey)
```

- [ ] **Step 3: `styles.css` — add-row / delete styling**

Append to `styles.css`:

```css
.cf-del-row { color: #dc2626; font-size: 0.85em; padding: 0 4px; }
.cf-add-row-cell { padding: 6px 8px; background: #f7f9fc; }
```

- [ ] **Step 4: Build + manual verify**

`python build.py`. In edit mode:
- Each non-subtotal row shows a 🗑 that removes it; subtotal updates.
- «＋ строка в AS IS / TO BE» prompts for a name and adds a zero row in the right group; **no new office card appears** on the «Офисы»/dashboard tabs.
- Save persists added/removed rows; Cancel discards them.

- [ ] **Step 5: Commit**

```bash
git add js/render.js js/render.finance.js styles.css employee-seating-dashboard.html
git commit -m "feat: add/delete rows in editable CF tables (no office created)"
```

---

### Task 4: «Визуализация» CF charts read from `getScenarioCFData`

**Files:**
- Modify: `js/render.visualization.js` (`renderCFSection` ~lines 481–561)

**Interfaces:**
- Consumes: `getScenarioCFData` (override-aware). Removes the local `cfYearTotal` helper and per-office recomputation.

- [ ] **Step 1: Replace chart data construction in `renderCFSection`**

In `renderCFSection`, replace from the `function cfYearTotal(...) { ... }` definition through the `chart2Data` assignment (the block that currently defines `cfYearTotal`, `chart1Data`, `chart2Data`) with:

```js
    var cfData = calc.getScenarioCFData(scenario, startY, endY);
    function yearIndex(yr) { return cfData.years.indexOf(yr); }

    var tobeOfficeRows = cfData.officeRows.filter(function (r) {
      return r.phase === C.OFFICE_PHASE.TOBE && !r.isSubtotal;
    });

    var chart1Data = years.map(function (yr) {
      var idx = yearIndex(yr);
      return {
        year: yr,
        segments: tobeOfficeRows.map(function (r) {
          return { key: r.id, name: r.name, value: idx >= 0 ? (r.values[idx] || 0) : 0 };
        })
      };
    });

    var mrRow = cfData.tenantRows.filter(function (r) {
      return r.phase === C.OFFICE_PHASE.TOBE && !r.isSubtotal &&
        (r.name || '').trim().toLowerCase() === MR_GRUPП_NAME.toLowerCase();
    })[0];

    var chart2Data = years.map(function (yr) {
      var idx = yearIndex(yr);
      var val = (mrRow && idx >= 0) ? (mrRow.values[idx] || 0) : 0;
      return { year: yr, segments: [{ key: MR_GRUPП_NAME, name: MR_GRUPП_NAME, value: val }] };
    });
```

- [ ] **Step 2: Fix the office color map + legend to use the CF rows**

`officeColorMap` is currently keyed by `o.id` over `tobeOffices`. Replace the `officeColorMap` construction (~lines 491–494) so it covers the CF rows (which may include free rows):

```js
    var officeColorMap = {};
    tobeOfficeRows.forEach(function (r, idx) {
      officeColorMap[r.id] = officeColor(r.name) || PALETTE[idx % PALETTE.length];
    });
```

Move this block to AFTER `tobeOfficeRows` is defined (i.e., after the Step 1 replacement). Then update the legend for card1 (~line 549):

```js
    var legend1 = tobeOfficeRows.map(function (r) { return { name: r.name, color: officeColorMap[r.id] }; });
```

The `tobeOffices` variable defined earlier (~lines 487–489) may now be unused; if so, delete its declaration to keep the build clean. Verify with a search for `tobeOffices` before deleting.

- [ ] **Step 3: Build + manual verify**

`python build.py`. Open the app:
- With no override: «Визуализация» CF charts look identical to before (regression).
- Enter «Финансы» edit mode, change an office's CF value, add a free TO-BE row, Save.
- «Визуализация» CF-по-офисам chart reflects the edited value and shows the new free row as a segment (colored by name); МР Групп chart reflects tenant-table edits.

- [ ] **Step 4: Commit**

```bash
git add js/render.visualization.js employee-seating-dashboard.html
git commit -m "feat: CF charts read override-aware getScenarioCFData"
```

---

## Self-Review

1. **Spec coverage:**
   - ✅ Editable cells, year + month granularity (Task 2, `isEditableCell`, year→even split, month→direct).
   - ✅ Add/delete rows without creating an office (Task 3 — mutates `draft` only; verify step checks no office card).
   - ✅ Auto subtotals (Task 1 `subtotalRowFor`; subtotal rows non-editable in Task 2).
   - ✅ Snapshot + override source of truth (Task 1 `cfOverride` + `buildOverrideFromComputed`; Task 2 Save/Cancel/Пересчитать + banner).
   - ✅ Charts reflect edits (Task 4 reads `getScenarioCFData`).
   - ✅ Persistence/undo/view-only (Task 1 normalizeProject guard; Task 2 `state.commit`, `state.isViewOnly`).
   - Columns (years) not editable — steppers retained (per spec descope).

2. **Placeholder scan:** No TBD/TODO. All steps carry full code. `<scratch>` in test-run commands = the scratchpad Node runner path used during this session.

3. **Type consistency:** `cfOverride` row shape `{id,name,phase,monthly:{year:[12]}}` is identical in Task 1 (build/read), Task 2 (`editCell`), Task 3 (add row). `getScenarioCFData` rows carry `id` used by Task 4 chart keys and color map. `onEditCell(rowId, year, monthIndexOrNull, value)` signature matches between `render.js` caller and `render.finance.js` handler. `onDeleteRow(rowId)` / `onAddRow(phase)` match.

4. **Line numbers** are `~` (single-file build and prior edits shift offsets); anchor on the shown snippets.
