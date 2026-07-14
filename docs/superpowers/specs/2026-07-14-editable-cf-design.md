# Editable Cash Flow Tables — Design

**Goal:** Let the user edit the Cash Flow tables on the «Финансы» tab (via a pencil toggle): edit cell values, add and delete rows (year granularity and monthly granularity), with auto-recomputed AS-IS/TO-BE subtotals. Adding a row must NOT create an office. On save, the edits become the source of truth for both CF tables AND the CF charts on the «Визуализация» tab.

## Background — current state

Both CF tables («CF по офисам» and «CF по арендаторам») are **computed** by `App.calc.getScenarioCFData(scenario, startYear, endYear)` from office/tenant fields (area, rent, opex, indexation, lease dates). It returns `{ years, officeRows, tenantRows }`; each row is `{ name, phase, values:[perYear], monthlyValues:{year:[12]}, rowTotal, isSubtotal }`, grouped by phase with `isSubtotal` rows appended per group ("Итого AS IS", "Итого TO BE").

The table renderer `App.render.cfTable(opts)` (`render.js`) renders read-only cells; years come from `settings.cfSettings.{startYear,endYear}` stepper controls in `render.finance.js`. The «Визуализация» CF charts (`render.visualization.js`, `renderCFSection`) do NOT call `getScenarioCFData` — they recompute per-office/per-tenant annual totals via a local `cfYearTotal` helper. The «Деньги» charts (₽/m², ₽/seat) derive from office fields directly and are **out of scope**.

## Chosen approach — snapshot + override

On first edit, the current computed CF is **snapshotted** into the scenario as `cfOverride`. From then on, `cfOverride` is the source of truth for both tables and the CF charts; office changes no longer flow into CF until the user clicks «Пересчитать из офисов» (which drops the override). Column (year) editing is out of scope — years stay controlled by the existing steppers.

### 1. Data model — `scenario.cfOverride`

```
cfOverride: null | {
  offices: [ { id: string, name: string, phase: 'asis'|'tobe', monthly: { "<year>": number[12] } }, ... ],
  tenants: [ { id: string, name: string, phase: 'asis'|'tobe', monthly: { "<year>": number[12] } }, ... ]
}
```

- `null` (default) → CF computed from offices (today's behavior).
- Non-null → source of truth for CF tables and CF charts.
- Rows store `monthly` keyed by 4-digit year string → array of 12 numbers (Jan..Dec), in millions RUB. A year's value = sum of its 12 months. Years absent from `monthly` render as 0 (and are editable, becoming present on edit).
- Subtotals are NOT stored — recomputed from rows by phase.
- `id`: office-derived rows keep the office id; free added rows get `U.genId('cfrow')`. Free rows are ordinary entries in `offices`/`tenants` — **no `scenario.offices` entry is created**.
- `normalizeProject` guard: `if (s.cfOverride === undefined) { s.cfOverride = null; }`.

### 2. `getScenarioCFData` refactor (override-aware) — single source

`getScenarioCFData(scenario, startYear, endYear)` gains a branch at the top:

- If `scenario.cfOverride` is non-null: build `officeRows` from `cfOverride.offices` and `tenantRows` from `cfOverride.tenants`. For each row and each year in `[startYear..endYear]`: `monthlyValues[yr] = cfOverride row.monthly[String(yr)] || [0×12]`; `values[i] = sum(monthlyValues[yr])`; `rowTotal = sum(values)`. Preserve `name`, `phase`, `id`. Then append the same per-phase subtotal rows via the existing `subtotalRow(...)` helper (AS-IS group + "Итого AS IS", TO-BE group + "Итого TO BE"), exactly as the computed path does.
- Else: compute as today.

Return shape is unchanged, so `render.finance.js` and (after §4) `render.visualization.js` both consume the same override-aware data. `getScenarioCFData` rows gain an `id` field in both paths (computed path: office/tenant id; the computed office path already has offices with ids; tenant rows get a stable id derived from the tenant name — `'cftenant_' + name`).

### 3. «Финансы» tab — edit UX (`render.finance.js` + `render.js` cfTable)

Module-level edit state in `render.finance.js`:
```
var editing = { office: false, tenant: false };   // which table is in edit mode
var draft = null;                                  // working copy of cfOverride during edit
```

- **Pencil ✎ button** in each table's section header. Hidden when `settings.viewOnlyMode` is true. Clicking enters edit mode for that table:
  - If `scenario.cfOverride` is null, snapshot: `draft = buildOverrideFromComputed(scenario, years)` (maps current computed `officeRows`/`tenantRows` non-subtotal rows into the `cfOverride` shape). If non-null, `draft = deepCopy(scenario.cfOverride)`.
  - Re-render with the table in edit mode.
- **Editable cells:** `cfTable` gains `opts.editable` (bool) and `opts.onCellEdit(rowId, year, monthOrNull, value)`. When `editable`:
  - Non-subtotal data cells render `<input type="number">` (step any, empty → 0). Subtotal rows and the row "Итого" total column stay read-only (auto).
  - Editing a **year** cell (`col.type==='year'` or `'ytotal'` is read-only; year edit only in collapsed `'year'` column) sets all 12 months of that year to `value/12`.
  - Editing a **month** cell sets that month; the year total recomputes as the sum.
  - After each edit, mutate `draft` and re-render (subtotals refresh live).
- **Row add/delete (edit mode only):**
  - Each non-subtotal row shows a 🗑 delete button (removes that row from `draft`).
  - Under each phase group, a «＋ строка» button prompts for a name (`window.prompt`) and appends `{ id: U.genId('cfrow'), name, phase, monthly: {} }` to the correct `draft` array.
- **Action bar (edit mode):** «Сохранить» → `state.commit('Правка CF', function(){ scenario.cfOverride = draft; })`, exit edit mode. «Отмена» → discard `draft`, exit edit mode. «Пересчитать из офисов» → `state.commit('Сброс CF', function(){ scenario.cfOverride = null; })`, exit edit mode.
- **Override banner (view mode):** when `scenario.cfOverride` is non-null and not editing, show above the tables: «Данные CF переопределены вручную» + a «Пересчитать из офисов» button (same reset commit).

### 4. «Визуализация» — reflect edits (`render.visualization.js`)

`renderCFSection` is refactored to source from `getScenarioCFData(scenario, startY, endY)` instead of recomputing:
- **Chart 1 (CF по офисам TO BE):** `officeRows` filtered to `phase==='tobe' && !isSubtotal`. Each row → a segment per year: `{ key: row.id, name: row.name, value: row.values[yearIndex] }`. Colors: `officeColor(row.name) || PALETTE[i]`; legend built from these rows. This works with or without override (rows carry `id`+`name`), and free rows appear as new segments.
- **Chart 2 (МР Групп TO BE):** find the `tenantRows` entry whose name matches `MR_GRUPП_NAME` (case-insensitive), `phase==='tobe'`, `!isSubtotal`; per-year value = `row.values[yearIndex]` (0 if absent).
- The local `cfYearTotal` helper and its per-office calls are removed.

### 5. Persistence / undo / view-only

- `cfOverride` lives on the scenario → included in JSON export/import automatically; `normalizeProject` defaults it to `null`.
- All mutations go through `state.commit` → undo/redo covers save and reset.
- View-only mode hides the pencil and the reset/add/delete controls (banner may still show, without its button).

## Affected files

- `js/state.js` — `normalizeProject` cfOverride guard.
- `js/calculations.js` — `getScenarioCFData` override branch; add `id` to rows in both paths; export a new helper `buildOverrideFromComputed(scenario, years)` (placed and exported here so it is unit-testable).
- `js/render.js` — `cfTable`: `editable` + `onCellEdit` + row add/delete rendering.
- `js/render.finance.js` — pencil toggle, draft state, action bar, banner, add/delete handlers.
- `js/render.visualization.js` — `renderCFSection` sources from `getScenarioCFData`.
- `js/tests/calculations.test.js` — tests for the override branch of `getScenarioCFData`.

## Tests

1. `getScenarioCFData` with `cfOverride`: office rows read stored monthly, year values = month sums, subtotals correct, years outside `monthly` → 0.
2. `getScenarioCFData` with `cfOverride` + a free row (id `cfrow_*`) appears in `officeRows` and in the TO-BE subtotal; no `scenario.offices` mutation.
3. `getScenarioCFData` without `cfOverride`: unchanged computed output (regression), rows now carry `id`.
4. `buildOverrideFromComputed` round-trips: computed → override → `getScenarioCFData` yields the same `values` as the computed path.

## Constraints

- Vanilla JS **ES5 only** — `var`/`function`, no arrow functions, template literals, `const`/`let`, `class`, destructuring.
- DOM via `U.el(tag, attrs, children)` only; mutations via `state.commit(label, fn)`.
- Build: `python build.py` → `employee-seating-dashboard.html`. Tests: headless Node runner or `tests.html`.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
- Test fixtures must set `phase` on remote/office literals (normalizeProject invariant — the app never has a phase-less office).
