# CF Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix indexation in CF calculations, enlarge CF table font, add monthly drill-down per year column, and embed a phase-aware CF table on the Dashboard in money mode.

**Architecture:** Four independent tasks. Task 1 extends the calculation layer (pure functions, no DOM). Task 2 adds CSS only. Tasks 3–4 change render modules and may depend on Task 1 (monthlyValues in row objects) and Task 2 (new CSS classes). A shared `App.render.cfTable` helper is added in render.js so both Finance and Dashboard tabs reuse the same table-building logic.

**Tech Stack:** Vanilla JS ES5 (no arrow functions, no const/let, no template literals), pure DOM via `U.el`, CSS custom properties.

## Global Constraints

- **ES5 only** — no arrow functions, no `const`/`let`, no template literals, no spread/rest, no `class` keyword.
- **No `innerHTML`** — all DOM via `U.el(tag, attrs, children)`.
- **No external libraries** — no chart libs, no jQuery.
- **State mutations only via `state.commit(label, fn, opts)`** — never mutate `state.getSettings()` directly outside a commit.
- **Re-render is `R.render()`** — never touch the DOM directly outside the render cycle.
- **Files ship as source** — builder script (`python build.py`) inlines everything; no bundler-specific syntax.

---

## File Map

| File | Change |
|------|--------|
| `js/calculations.js` | Fix `cfForYear`, add `cfForMonth`, add `monthlyValues` to rows in `getScenarioCFData` |
| `js/render.js` | Add shared `App.render.cfTable(opts)` helper |
| `js/render.finance.js` | Add `expandedCFYears` state, replace inner `renderCFTable` with `R.cfTable` call |
| `js/render.dashboard.js` | Add `dashExpandedCFYears`, insert CF year controls + phase CF tables when money mode is on |
| `styles.css` | Larger CF table font, new classes for month columns, year-clickable, dashboard CF block |

---

## Task 1: Fix indexation + add cfForMonth + monthlyValues in rows

**Files:**
- Modify: `js/calculations.js`

**Interfaces:**
- Produces:
  - `cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear)` — 7th param `baseYear` (number|null) is the fallback indexation origin when `leaseStartDate` is absent; backward-compatible (existing callers that omit it get `baseYear = undefined → null`).
  - `cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear)` — month is 1-based; returns 0 if the month precedes the lease start; otherwise returns `cfForYear(…) / 12`.
  - Row objects from `getScenarioCFData` now carry `monthlyValues: { [year]: [v1, v2, …, v12] }` (12-element array, index 0 = January).

**Problem being fixed:** When `leaseStartDate` is `null`, the current code sets `yearsElapsed = 0` for **every** projected year, so indexation is never applied and all years show the same value. The fix: when `leaseStartDate` is absent, treat `baseYear` (= first projected year) as the indexation origin.

- [ ] **Step 1: Open `js/calculations.js` and locate `cfForYear` (line ~550)**

  Replace the function signature and body:

  ```js
  function cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear) {
    var a = area || 0;
    var rent = rentPerSqm || 0;
    var opex = opexPerSqm || 0;
    var idx = (indexationPct || 0) / 100;
    var base = a * (rent + opex);
    var yearsElapsed = 0;
    if (leaseStartDate) {
      var startYear = parseInt(String(leaseStartDate).substring(0, 4), 10);
      if (!isNaN(startYear)) { yearsElapsed = Math.max(0, year - startYear); }
    } else if (baseYear != null) {
      yearsElapsed = Math.max(0, year - baseYear);
    }
    return base * Math.pow(1 + idx, yearsElapsed) / 1000000;
  }
  ```

- [ ] **Step 2: Add `cfForMonth` immediately after `cfForYear`**

  ```js
  function cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear) {
    if (leaseStartDate) {
      var lsStr = String(leaseStartDate);
      var lsYear = parseInt(lsStr.substring(0, 4), 10);
      var lsMonth = parseInt(lsStr.substring(5, 7), 10);
      if (!isNaN(lsYear) && !isNaN(lsMonth)) {
        if (year < lsYear || (year === lsYear && month < lsMonth)) { return 0; }
      }
    }
    return cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear) / 12;
  }
  ```

- [ ] **Step 3: Update `buildOfficeRow` inside `getScenarioCFData` to pass `baseYear` and compute `monthlyValues`**

  Locate the inner `buildOfficeRow` function (~line 586). Replace it entirely:

  ```js
  function buildOfficeRow(office) {
    var baseYear = years[0];
    var values = years.map(function (yr) {
      return cfForYear(office.area, office.rentPerSqm, office.opexPerSqm, office.indexationPct, office.leaseStartDate, yr, baseYear);
    });
    var monthlyValues = {};
    years.forEach(function (yr) {
      monthlyValues[yr] = [];
      for (var m = 1; m <= 12; m++) {
        monthlyValues[yr].push(cfForMonth(office.area, office.rentPerSqm, office.opexPerSqm, office.indexationPct, office.leaseStartDate, yr, m, baseYear));
      }
    });
    return {
      name: office.name,
      phase: office.phase,
      values: values,
      monthlyValues: monthlyValues,
      rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
      isSubtotal: false
    };
  }
  ```

- [ ] **Step 4: Update `subtotalRow` to aggregate `monthlyValues`**

  Locate `subtotalRow` (~line 594). Replace:

  ```js
  function subtotalRow(rows, phase, label) {
    var values = years.map(function (_, i) {
      return rows.reduce(function (s, r) { return s + (r.values[i] || 0); }, 0);
    });
    var monthlyValues = {};
    years.forEach(function (yr) {
      monthlyValues[yr] = [];
      for (var m = 0; m < 12; m++) {
        monthlyValues[yr].push(rows.reduce(function (s, r) {
          return s + ((r.monthlyValues && r.monthlyValues[yr]) ? r.monthlyValues[yr][m] : 0);
        }, 0));
      }
    });
    return {
      name: label || 'Итого',
      phase: phase,
      values: values,
      monthlyValues: monthlyValues,
      rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
      isSubtotal: true
    };
  }
  ```

- [ ] **Step 5: Update `buildTenantRows` to include `monthlyValues` per tenant**

  Locate inner function `buildTenantRows` (~line 632). The function builds rows from aggregated parts. Replace the inner map:

  ```js
  function buildTenantRows(offices, phase) {
    var baseYear = years[0];
    var entries = collectTenantEntries(offices);
    var rows = Object.keys(entries).map(function (name) {
      var parts = entries[name];
      var values = years.map(function (yr) {
        return parts.reduce(function (s, p) {
          return s + cfForYear(p.area, p.rentPerSqm, p.opexPerSqm, p.indexationPct, p.leaseStartDate, yr, baseYear);
        }, 0);
      });
      var monthlyValues = {};
      years.forEach(function (yr) {
        monthlyValues[yr] = [];
        for (var m = 1; m <= 12; m++) {
          monthlyValues[yr].push(parts.reduce(function (s, p) {
            return s + cfForMonth(p.area, p.rentPerSqm, p.opexPerSqm, p.indexationPct, p.leaseStartDate, yr, m, baseYear);
          }, 0));
        }
      });
      return {
        name: name,
        phase: phase,
        values: values,
        monthlyValues: monthlyValues,
        rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
        isSubtotal: false
      };
    });
    rows.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return rows;
  }
  ```

- [ ] **Step 6: Export `cfForMonth` in the return object**

  Locate the `return { ... }` block at the end of `App.calc`. Add `cfForMonth: cfForMonth` alongside `getScenarioCFData`.

- [ ] **Step 7: Verify in browser console (open `index.html`)**

  Open the browser console and run:
  ```js
  var c = App.calc;
  // Office with indexation 10%, no leaseStartDate, area 1000, rent 10000, opex 2000
  // baseYear 2026 → year 2026 factor=1.0, year 2027 factor=1.1, year 2028 factor=1.21
  console.assert(Math.abs(c.cfForYear(1000, 10000, 2000, 10, null, 2026, 2026) - 12.0) < 0.01, 'year 2026 base');
  console.assert(Math.abs(c.cfForYear(1000, 10000, 2000, 10, null, 2027, 2026) - 13.2) < 0.01, 'year 2027 x1.1');
  // cfForMonth: leaseStartDate June 2026, month=5 (May) → 0; month=6 (June) → annual/12
  var annualJune = c.cfForYear(1000, 10000, 2000, 10, '2026-06-01', 2026, 2026);
  console.assert(c.cfForMonth(1000, 10000, 2000, 10, '2026-06-01', 2026, 5, 2026) === 0, 'May before lease');
  console.assert(Math.abs(c.cfForMonth(1000, 10000, 2000, 10, '2026-06-01', 2026, 6, 2026) - annualJune/12) < 0.001, 'June = annual/12');
  console.log('All assertions passed');
  ```
  Expected console output: `All assertions passed`

- [ ] **Step 8: Commit**

  ```bash
  git add js/calculations.js
  git commit -m "fix: indexation fallback to baseYear when leaseStartDate absent; add cfForMonth; add monthlyValues to CF rows"
  ```

---

## Task 2: CSS — larger CF table font + month column styles + dashboard CF block

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Produces new classes: `.cf-year-clickable`, `.cf-month-col`, `.cf-ytotal-col`, `.dash-cf-block`, `.dash-cf-controls`
- Changes existing: `.cf-table` font-size 0.875em → 1rem

- [ ] **Step 1: Locate `.cf-table` rule in `styles.css` (~line 908) and update font-size**

  Change:
  ```css
  .cf-table { width: 100%; border-collapse: collapse; font-size: 0.875em; }
  ```
  To:
  ```css
  .cf-table { width: 100%; border-collapse: collapse; font-size: 1rem; }
  ```

- [ ] **Step 2: Update `.cf-table th, .cf-table td` padding to match the larger font**

  Change:
  ```css
  .cf-table th, .cf-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  ```
  To:
  ```css
  .cf-table th, .cf-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  ```

- [ ] **Step 3: Add new CSS rules after the existing `.cf-*` block (~line 913)**

  Insert after the last `.cf-*` rule:
  ```css
  .cf-year-clickable { cursor: pointer; user-select: none; }
  .cf-year-clickable:hover { background: rgba(0,0,0,0.04); }
  .cf-month-col { text-align: right; color: var(--text-muted); font-size: 0.82em; min-width: 56px; background: var(--surface); }
  .cf-ytotal-col { background: var(--surface); font-weight: 600; }
  .dash-cf-block { margin-top: 16px; border-top: 2px dashed var(--border); padding-top: 12px; }
  .dash-cf-controls { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; font-size: 0.9rem; }
  ```

- [ ] **Step 4: Verify in browser**

  Open `index.html`, go to Finance tab. The CF table should be noticeably larger text. Year column headers should look the same for now (clickability added in Task 3).

- [ ] **Step 5: Commit**

  ```bash
  git add styles.css
  git commit -m "style: increase CF table font to 1rem; add month-column and dashboard CF block styles"
  ```

---

## Task 3: Monthly drill-down in Finance tab CF table

**Files:**
- Modify: `js/render.finance.js`
- Modify: `js/render.js` (add shared `App.render.cfTable` helper)

**Interfaces:**
- Consumes: `monthlyValues` on each row (from Task 1); new CSS classes (from Task 2)
- Produces: `App.render.cfTable(opts)` where `opts = { rows, years, expandedYears, onToggleYear, firstColLabel }`
  - `expandedYears`: object `{ [year]: boolean }`
  - `onToggleYear(year)`: called when user clicks a year header; should flip the year's state and re-render
  - Returns a DOM element (`<div class="cf-table-wrap">…</div>`)

### Part A: Add shared cfTable helper to render.js

- [ ] **Step 1: Open `js/render.js`, locate the `section` function (line ~248)**

  Before `section`, insert a module-level constant (inside the IIFE, after `var state = App.state` or wherever the `var` declarations are):

  ```js
  var MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  ```

- [ ] **Step 2: Add the `renderCFTableBlock` function inside the render.js IIFE, just before the `return` statement**

  ```js
  function renderCFTableBlock(opts) {
    var rows = opts.rows;
    var years = opts.years;
    var expandedYears = opts.expandedYears || {};
    var onToggleYear = opts.onToggleYear || function () {};
    var firstColLabel = opts.firstColLabel || 'Офис / Фаза';

    function fmt(v) {
      if (v === null || v === undefined || isNaN(v)) { return '—'; }
      return (Math.round(v * 100) / 100).toFixed(2);
    }

    var columns = [];
    years.forEach(function (yr) {
      var isExp = !!expandedYears[yr];
      if (isExp) {
        for (var m = 1; m <= 12; m++) {
          columns.push({ type: 'month', year: yr, month: m, label: MONTHS_SHORT[m - 1] });
        }
        columns.push({ type: 'ytotal', year: yr, label: '∑ ' + yr });
      } else {
        columns.push({ type: 'year', year: yr, label: String(yr) });
      }
    });
    columns.push({ type: 'total', label: 'Итого' });

    var wrap = U.el('div', { class: 'cf-table-wrap' });
    var table = U.el('table', { class: 'cf-table' });

    var headerCells = [U.el('th', { text: firstColLabel })];
    columns.forEach(function (col) {
      var th;
      if (col.type === 'year') {
        th = U.el('th', {
          class: 'cf-year-col cf-year-clickable',
          title: 'Развернуть по месяцам',
          onclick: (function (yr) { return function () { onToggleYear(yr); }; })(col.year)
        }, '▸ ' + col.label);
      } else if (col.type === 'ytotal') {
        th = U.el('th', {
          class: 'cf-year-col cf-year-clickable cf-ytotal-col',
          title: 'Свернуть',
          onclick: (function (yr) { return function () { onToggleYear(yr); }; })(col.year)
        }, '▾ ' + col.label);
      } else if (col.type === 'month') {
        th = U.el('th', { class: 'cf-year-col cf-month-col', text: col.label });
      } else {
        th = U.el('th', { class: 'cf-year-col', text: col.label });
      }
      headerCells.push(th);
    });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, headerCells)));

    var tbody = U.el('tbody');
    var lastPhase = null;
    rows.forEach(function (row) {
      if (row.phase !== lastPhase && !row.isSubtotal) {
        lastPhase = row.phase;
        var phaseLabel = row.phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
        var phaseClass = row.phase === C.OFFICE_PHASE.ASIS ? 'phase-asis' : 'phase-tobe';
        tbody.appendChild(U.el('tr', { class: 'cf-phase-header ' + phaseClass }, [
          U.el('td', { colspan: String(columns.length + 1), text: phaseLabel })
        ]));
      }
      var cells = [U.el('td', { class: 'cf-name-col' + (row.isSubtotal ? ' cf-bold' : ''), text: row.name })];
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
        cells.push(U.el('td', { class: cellClass, text: fmt(val) }));
      });
      tbody.appendChild(U.el('tr', { class: row.isSubtotal ? 'cf-subtotal-row' : '' }, cells));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }
  ```

  **Important:** The unicode escape sequences above encode:
  - `—` = `—`
  - `∑` = `∑`
  - Russian text characters for labels

  Alternatively, you may write the strings directly in UTF-8 (the file is UTF-8):
  - `'—'` → `'—'`
  - `'∑ ' + col.label` → `'∑ ' + col.label`
  - Tooltip titles and column labels in Russian directly

- [ ] **Step 3: Export `cfTable` in render.js return object**

  Locate the `return { … }` statement at the bottom of the render.js IIFE. Add:
  ```js
  cfTable: renderCFTableBlock,
  ```

### Part B: Update render.finance.js

- [ ] **Step 4: Open `js/render.finance.js`. Add `expandedCFYears` module-level variable**

  At the top of the IIFE (near where `C`, `U`, `R`, `calc`, `state` are declared), add:
  ```js
  var expandedCFYears = {};
  ```

- [ ] **Step 5: Replace the inner `renderCFTable` function with a thin wrapper calling `R.cfTable`**

  Find the `function renderCFTable(title, rows, years)` block (~line 70). Replace the entire function body:

  ```js
  function renderCFTable(title, rows, years) {
    var panel = R.section(title);
    if (rows.length === 0) {
      panel.appendChild(U.el('p', { class: 'muted', text: 'Нет данных' }));
      return panel;
    }
    var firstColLabel = title.indexOf('арендатор') > -1 ? 'Арендатор' : 'Офис / Фаза';
    panel.appendChild(R.cfTable({
      rows: rows,
      years: years,
      expandedYears: expandedCFYears,
      onToggleYear: function (yr) {
        expandedCFYears[yr] = !expandedCFYears[yr];
        R.render();
      },
      firstColLabel: firstColLabel
    }));
    return panel;
  }
  ```

- [ ] **Step 6: Remove the now-redundant `formatM` function from render.finance.js**

  Delete the `function formatM(v) { … }` block (it was a private formatter; its logic is now inside `renderCFTableBlock` in render.js).

  **Important:** The calls `formatM(v)` on lines 106, 107 in the old code are gone because those lines are replaced. Verify there are no remaining references to `formatM` before deleting.

- [ ] **Step 7: Verify manually**

  Open `index.html` → Finance tab. You should see:
  - Each year column header shows `▸ 2026` (clickable)
  - Click `▸ 2026` → expands to 12 month columns (Янв, Фев, … Дек) plus `∑ 2026` at the end
  - Click `▾ ∑ 2026` → collapses back
  - Offices with `indexationPct` set now show growing values year over year (even without `leaseStartDate`)
  - Offices with `leaseStartDate = "2026-06-01"` → months Jan–May in 2026 show `—` or `0.00`

- [ ] **Step 8: Commit**

  ```bash
  git add js/render.js js/render.finance.js
  git commit -m "feat: monthly drill-down in CF table; shared App.render.cfTable helper"
  ```

---

## Task 4: Dashboard CF tables in money mode

**Files:**
- Modify: `js/render.dashboard.js`

**Interfaces:**
- Consumes: `App.render.cfTable` (from Task 3), `App.calc.getScenarioCFData` (from Task 1), new CSS classes (from Task 2), `state.getSettings().cfSettings`
- State added: module-level `var dashExpandedCFYears = {};` — persists year-expansion state per-dashboard session without committing to persistent state

**Behavior spec:**
- When `moneyMode === true` in `renderOfficesBlock`:
  1. A year-range control strip (`dashCFYearControls`) appears **once** just below the phase toggle buttons.
  2. Below the **TO BE office grid** (if `!hideTobe && tobe.length > 0`): a CF table for TO BE offices only.
  3. Below the **AS IS office grid** (if `!hideAsis && asis.length > 0`): a CF table for AS IS offices only.
  4. Both tables use `dashExpandedCFYears` for monthly drill-down (same object, so a year expanded in one table is also expanded in the other — acceptable for this scope).
  5. Year controls update `state.cfSettings` (same setting used by Finance tab) — the two tabs share the year range.

- [ ] **Step 1: Open `js/render.dashboard.js`. Add module-level variable**

  After `var moneyMode = false;` add:
  ```js
  var dashExpandedCFYears = {};
  ```

- [ ] **Step 2: Add helper function `buildDashCFYearControls(cf, head)`**

  Insert this function before `renderOfficesBlock`:

  ```js
  function buildDashCFYearControls(cf) {
    var strip = U.el('div', { class: 'dash-cf-controls' });

    function makeStep(label, key) {
      var dec = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '−' });
      var inc = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '+' });
      var disp = U.el('span', { class: 'cf-year-val', text: String(cf[key]) });
      dec.addEventListener('click', function () {
        cf[key] = Math.max(2000, cf[key] - 1);
        if (key === 'startYear' && cf.startYear > cf.endYear) { cf.endYear = cf.startYear; }
        if (key === 'endYear' && cf.endYear < cf.startYear) { cf.startYear = cf.endYear; }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
        disp.textContent = String(cf[key]);
      });
      inc.addEventListener('click', function () {
        cf[key] = Math.min(2100, cf[key] + 1);
        if (key === 'startYear' && cf.startYear > cf.endYear) { cf.endYear = cf.startYear; }
        if (key === 'endYear' && cf.endYear < cf.startYear) { cf.startYear = cf.endYear; }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
        disp.textContent = String(cf[key]);
      });
      strip.appendChild(U.el('div', { class: 'cf-stepper' }, [
        U.el('span', { class: 'cf-stepper-label', text: label }),
        dec, disp, inc
      ]));
    }

    makeStep('С года:', 'startYear');
    makeStep('По год:', 'endYear');
    return strip;
  }
  ```

- [ ] **Step 3: Add helper function `buildDashCFTable(scenario, phase, startYear, endYear)`**

  Insert after `buildDashCFYearControls`:

  ```js
  function buildDashCFTable(scenario, phase, startYear, endYear) {
    var data = calc.getScenarioCFData(scenario, startYear, endYear);
    if (data.years.length === 0) { return null; }
    var phaseRows = data.officeRows.filter(function (r) { return r.phase === phase; });
    if (phaseRows.length === 0) { return null; }
    var wrap = U.el('div', { class: 'dash-cf-block' });
    var phaseLabel = phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
    wrap.appendChild(U.el('div', { class: 'section-title', text: 'Cash Flow ' + phaseLabel + ' (млн руб./год)' }));
    wrap.appendChild(R.cfTable({
      rows: phaseRows,
      years: data.years,
      expandedYears: dashExpandedCFYears,
      onToggleYear: function (yr) {
        dashExpandedCFYears[yr] = !dashExpandedCFYears[yr];
        R.render();
      },
      firstColLabel: 'Офис'
    }));
    return wrap;
  }
  ```

  **Decoded Russian in the strings above:**
  - `'млн руб./год'` = `'млн руб./год'`
  - `'Офис'` = `'Офис'`

  You may write these directly in UTF-8 instead of unicode escapes.

- [ ] **Step 4: Modify `renderOfficesBlock` to insert year controls and CF tables**

  In `renderOfficesBlock`, at the **very beginning of the function body** (after `var panel = R.section('Офисы');`), declare `cf` at function scope so all nested blocks can reference it safely:

  ```js
  var cf = null;
  if (moneyMode) {
    var cfRaw = state.getSettings().cfSettings || { startYear: 2026, endYear: 2030 };
    cf = { startYear: cfRaw.startYear, endYear: cfRaw.endYear };
  }
  ```

  Then find the block where the money toggle is built and the `head.appendChild(phaseToggles)` call. After `head.appendChild(phaseToggles)`, add:

  ```js
  if (moneyMode && cf) {
    panel.appendChild(buildDashCFYearControls(cf));
  }
  ```

  Then locate the TO BE offices block:

  ```js
  if (tobe.length && !hideTobe) {
    panel.appendChild(U.el('h3', { class: 'phase-head phase-tobe', text: 'TO BE — план переезда' }));
    var gT = U.el('div', { class: 'office-grid' });
    tobe.forEach(function (o) { gT.appendChild(renderOfficeCard(scenario, o, ctx)); });
    panel.appendChild(gT);
  }
  ```

  Replace with:

  ```js
  if (tobe.length && !hideTobe) {
    panel.appendChild(U.el('h3', { class: 'phase-head phase-tobe', text: 'TO BE — план переезда' }));
    var gT = U.el('div', { class: 'office-grid' });
    tobe.forEach(function (o) { gT.appendChild(renderOfficeCard(scenario, o, ctx)); });
    panel.appendChild(gT);
    if (moneyMode && cf) {
      var cfDataTobe = buildDashCFTable(scenario, C.OFFICE_PHASE.TOBE, cf.startYear, cf.endYear);
      if (cfDataTobe) { panel.appendChild(cfDataTobe); }
    }
  }
  ```

  Then find the AS IS block:

  ```js
  if (asis.length && !hideAsis) {
    panel.appendChild(U.el('h3', { class: 'phase-head phase-asis', text: 'AS IS — как есть' }));
    var gA = U.el('div', { class: 'office-grid' });
    asis.forEach(function (o) { gA.appendChild(renderOfficeCard(scenario, o, ctx)); });
    panel.appendChild(gA);
  }
  ```

  Replace with:

  ```js
  if (asis.length && !hideAsis) {
    panel.appendChild(U.el('h3', { class: 'phase-head phase-asis', text: 'AS IS — как есть' }));
    var gA = U.el('div', { class: 'office-grid' });
    asis.forEach(function (o) { gA.appendChild(renderOfficeCard(scenario, o, ctx)); });
    panel.appendChild(gA);
    if (moneyMode && cf) {
      var cfDataAsis = buildDashCFTable(scenario, C.OFFICE_PHASE.ASIS, cf.startYear, cf.endYear);
      if (cfDataAsis) { panel.appendChild(cfDataAsis); }
    }
  }
  ```

- [ ] **Step 5: Verify manually**

  Open `index.html` → Dashboard tab:
  1. Check "₽ Деньги (аренда)".
  2. Year controls (`С года:` / `По год:`) appear just below the phase toggle buttons.
  3. Below the TO BE office cards: `Cash Flow TO BE (млн руб./год)` table appears.
  4. Below the AS IS office cards: `Cash Flow AS IS (млн руб./год)` table appears (if AS IS offices exist).
  5. Hide TO BE (click `▾ TO BE`) → TO BE office cards disappear → CF TO BE table also disappears.
  6. Hide AS IS → CF AS IS table also disappears.
  7. Year column headers are clickable → monthly drill-down works.
  8. Uncheck "₽ Деньги (аренда)" → year controls and CF tables disappear.

- [ ] **Step 6: Commit**

  ```bash
  git add js/render.dashboard.js
  git commit -m "feat: embed CF tables per phase on dashboard in money mode with year controls and monthly drill-down"
  ```

---

## Final Step: Rebuild and push

- [ ] Run `python build.py` — should produce `employee-seating-dashboard.html` ~3 MB
- [ ] Verify no JS errors in browser console on `index.html`
- [ ] `git add employee-seating-dashboard.html && git commit -m "build: rebuild bundle with CF improvements"`
- [ ] `git push origin master:main`

---

## Verification Checklist

1. **Indexation visible:** Office with `indexationPct = 10`, no `leaseStartDate` → Finance tab CF table shows increasing values year over year (2026 < 2027 < 2028…).
2. **Monthly drill-down:** Click `▸ 2026` → 12 month columns appear; click `▾ ∑ 2026` → collapse.
3. **Partial lease year:** Office with `leaseStartDate = "2026-06-01"` → months Jan–May 2026 show `0.00` in monthly view.
4. **Font size:** Finance tab CF table is noticeably larger than before (was 0.875em, now 1rem).
5. **Dashboard CF tables:** Appear below office cards when money mode is on; disappear when phase is hidden or money mode off.
6. **Year controls on dashboard:** Steppers change year range → both dashboard CF tables and Finance tab update (shared cfSettings).
