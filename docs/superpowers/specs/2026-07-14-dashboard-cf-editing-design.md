# In-place CF Editing on the Dashboard — Design

**Goal:** Add the same pencil (✎) CF editing to the Dashboard money-mode CF tables that the «Финансы» tab already has, so the user can edit CF where they view it. Both tabs must share one edit state and one `cfOverride`.

## Background

`scenario.cfOverride` is the single source of truth for CF once edited. The «Финансы» tab (`render.finance.js`) owns the editing UI today: module-level `editingTable` + `draft`, handlers `enterEdit/saveEdit/cancelEdit/resetToComputed/editCell` and inline add/delete, plus `R.cfTable({ editable, onEditCell, onAddRow, onDeleteRow })`, an action bar (Сохранить/Отмена/Пересчитать), and an override banner.

The Dashboard money mode (`render.dashboard.js`) shows per-phase CF tables via `buildDashCFTable(scenario, phase, startYear, endYear)` and `buildDashTenantCFTable(...)`, currently **read-only** (title + «Свернуть» + `R.cfTable`). It reads `getScenarioCFData(scenario, …)`.

Duplicating the edit controller in the dashboard would create two `draft`s and risk divergence. So the edit state/handlers move to a shared module.

## Design

### 1. New shared controller `App.cfEdit` (`js/cfEdit.js`)

Single app-wide edit state (one table editable at a time). Loaded after `allocations.js` (needs `App.calc`, `App.state`), before `render.finance.js`/`render.dashboard.js`. References `App.render.render()` lazily at call time (render.js loads later).

State: `editingKey` (string | null), `draft` (cfOverride copy | null).

API:
- `isEditing(key)` → `editingKey === key`
- `anyEditing()` → `editingKey !== null`
- `enterEdit(scenario, years, key)` → `draft = App.calc.buildOverrideFromComputed(scenario, years); editingKey = key; App.render.render();`
- `save(scenario)` → `var d = draft; App.state.commit('Правка CF', function(){ scenario.cfOverride = d; }); editingKey = null; draft = null;`
- `cancel()` → `editingKey = null; draft = null; App.render.render();`
- `reset(scenario)` → `App.state.commit('Сброс CF (пересчёт из офисов)', function(){ scenario.cfOverride = null; }); editingKey = null; draft = null;`
- `editCell(listKey, rowId, year, monthIndex, value)` — `listKey` is `'offices'|'tenants'`; mutate the matching draft row's `monthly` (year cell → split value/12 across 12 months; month cell → set that month), then `App.render.render()`.
- `addRow(listKey, name, phase)` → push `{ id: U.genId('cfrow'), name, phase, monthly: {} }`; render.
- `deleteRow(listKey, rowId)` → splice; render.
- `effectiveScenario(scenario)` → while editing, a shallow copy of `scenario` with `cfOverride = draft`; else `scenario` (so every CF view reflects the draft during editing).

### 2. Refactor `render.finance.js` to delegate to `App.cfEdit`

Remove local `editingTable`/`draft` and the local handlers; call `App.cfEdit` instead. Keys: `'finance-office'` / `'finance-tenant'`; `listKey` `'offices'`/`'tenants'`. `renderCFTable` uses `cfEdit.isEditing(key)` for the editable flag, `cfEdit.anyEditing()` to gate the pencil, and `cfEdit.effectiveScenario(scenario)` for its data. Behavior is unchanged for the user. `expandedCFYears` stays local to render.finance (its own UI state).

### 3. Dashboard CF tables gain editing (`render.dashboard.js`)

In `buildDashCFTable(scenario, phase, startYear, endYear)` (key `'dash-office-' + phase`, `listKey 'offices'`) and `buildDashTenantCFTable(...)` (key `'dash-tenant-' + phase`, `listKey 'tenants'`):
- Data source becomes `getScenarioCFData(App.cfEdit.effectiveScenario(scenario), startYear, endYear)` so the table reflects the draft while editing.
- Header controls (next to the existing «Свернуть»):
  - If `App.cfEdit.isEditing(key)`: **Сохранить / Отмена / Пересчитать** buttons (call `cfEdit.save(scenario)` / `cfEdit.cancel()` / `cfEdit.reset(scenario)`).
  - Else if `!state.isViewOnly() && !App.cfEdit.anyEditing()`: a **✎** pencil → `cfEdit.enterEdit(scenario, [startYear..endYear], key)`.
- Banner «Данные CF переопределены вручную» + Пересчитать when `scenario.cfOverride` and not editing this key.
- `R.cfTable` is called with `editable: cfEdit.isEditing(key)`, and `onEditCell/onAddRow/onDeleteRow` delegating to `cfEdit` with the right `listKey` (add-row uses `phase`). Month-expansion state stays `dashExpandedCFYears` / `dashExpandedTenantCFYears`.

Because each dashboard CF table is already phase-filtered, editing shows only that phase's rows; `cfEdit` edits the shared draft by row id, and add-row tags the row with `phase`. Save writes the whole `cfOverride`.

### 4. One editable table at a time, app-wide

`anyEditing()` gates every pencil (Финансы and Dashboard), so entering edit on one table hides the pencils on all others (same as the current Финансы single-edit behavior). Save/Cancel/Пересчитать return to the normal state everywhere.

## Affected files

- `js/cfEdit.js` — **new** shared controller.
- `index.html`, `build.py` — add `js/cfEdit.js` to the load/inline order (after `allocations.js`).
- `js/render.finance.js` — delegate to `App.cfEdit`.
- `js/render.dashboard.js` — pencil + action bar + banner + editable `R.cfTable` in `buildDashCFTable`/`buildDashTenantCFTable`; data via `effectiveScenario`.
- `styles.css` — reuse existing `.cf-edit-actions` / `.cf-override-banner`; add a small `.dash-cf-actions` wrapper if needed.
- `ui-tests/` — jsdom test for dashboard CF editing.

## Tests

1. **Unit-ish (jsdom, `App.cfEdit`):** `enterEdit` snapshots draft; `editCell` on a year splits into 12 months; `save` writes `scenario.cfOverride`; `reset` clears it; `effectiveScenario` returns draft-backed scenario while editing.
2. **Dashboard editing (jsdom):** render dashboard money mode → click a dash CF pencil → edit a year cell → Save → assert `scenario.cfOverride` has the office row with the new monthly values, and the dashboard CF table reflects it.
3. **Regression:** existing `ui-tests` (finance path via team-form/dnd, dash-cards) and unit tests stay green; the Финансы pencil still works after the refactor.

## Constraints

- Vanilla JS ES5; DOM via `U.el`; mutations via `state.commit`.
- One CF table editable at a time across the whole app.
- Pencil hidden when `state.isViewOnly()`.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
