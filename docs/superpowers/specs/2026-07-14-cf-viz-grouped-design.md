# CF Visualization Block — Grouped AS-IS/TO-BE + Tenants Chart — Design

**Goal:** Rework the «Визуализация» CF block: (1) remove the "МР Групп (TO BE)" chart; (2) add a "CF по аренде по годам по арендаторам" stacked-bar chart; (3) merge the AS-IS and TO-BE office charts into one where each year shows two bars (AS IS and TO BE) side by side. Same for the tenant chart.

## Background

`renderCFSection` (`js/render.visualization.js`) currently renders three cards via `renderStackedBarSVG(yearsData, colorFn, opts)`: TO-BE offices, AS-IS offices, and МР Групп (TO BE). `renderStackedBarSVG` draws one stacked bar per year (`yearsData[i] = { year, segments:[{key,name,value}] }`). It is used **only** by `renderCFSection`. Data comes from `getScenarioCFData` (`officeRows`/`tenantRows`, each with `phase`, `!isSubtotal`).

## Design

### 1. `renderStackedBarSVG` — grouped mode

Accept an optional grouped shape: `yearsData[i] = { year, groups: [{ label, segments:[...] }, ...] }`. Back-compat: if a year has `segments` and no `groups`, treat it as one group `[{ label: null, segments }]` (existing single-bar behavior — but no current caller relies on it after this change).

Rendering per year column (`colW`): place `groups.length` stacked bars side by side (bar width and gaps derived from `colW`). For each group: stack its `segments` (same as today), draw the optional per-bar total (when `opts.showTotals`), and draw the group `label` (e.g. "AS IS"/"TO BE") centered **under** that bar. The year label is centered under the whole column, below the group labels. `maxScale` = `opts.maxScale` or auto over **all** groups' stacks.

### 2. `renderCFSection` — two grouped cards

Replace the three cards with two:

- **«CF по аренде по годам по офисам (AS IS / TO BE)»**: per year, `groups = [{ label:'AS IS', segments: asisOfficeSegs }, { label:'TO BE', segments: tobeOfficeSegs }]`, where segments map non-subtotal office rows of that phase to `{ key: row.id, name: row.name, value: row.values[yearIdx] }`. Colors via `officeColorMap` (keyed by row.id, value `officeColor(row.name) || PALETTE[i]`) built over AS-IS + TO-BE office rows — same office name across phases gets the same color. Legend = office rows deduped by name.
- **«CF по аренде по годам по арендаторам (AS IS / TO BE)»**: same structure over `tenantRows` per phase; `tenantColorMap` keyed by row.id (`officeColor(row.name) || PALETTE[i]`). Legend = tenant rows deduped by name.

Each chart auto-scales independently (`opts.showTotals: true`, no shared `maxScale`). Remove the old `officeMax`/`sharedMax` and the МР Групп card and its `chart2Data`/`mrRow`.

### 3. Distinguishing phases

The two bars per year are distinguished by the "AS IS"/"TO BE" sub-labels under each bar; colors continue to encode office/tenant identity.

## Affected files

- `js/render.visualization.js` — `renderStackedBarSVG` (grouped mode), `renderCFSection` (two grouped cards, remove МР Групп).
- `ui-tests/` — jsdom render test (canvas stubbed): CF section has two cards; the office chart renders AS IS / TO BE sub-labels and two bars per year.

## Tests

1. **jsdom viz render (canvas stub):** render the Visualization tab for a scenario with AS-IS and TO-BE offices + tenants; assert the CF section shows exactly two cards; the office chart's SVG contains "AS IS" and "TO BE" text labels; per year there are ≥ 2 bars (`rect`).
2. **Regression:** existing unit (76) and ui-tests stay green.

## Constraints

- Vanilla JS ES5; SVG via `document.createElementNS`; DOM via `U.el`.
- `getScenarioCFData` is the single data source (override-aware); no new data model.
- Each chart scales to its own data.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
