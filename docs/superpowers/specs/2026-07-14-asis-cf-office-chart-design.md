# AS-IS "CF по аренде по офисам" Chart — Design

**Goal:** On the «Визуализация» tab, add a "CF по аренде по годам по офисам (AS IS)" stacked-bar chart, mirroring the existing TO-BE one, so AS-IS and TO-BE rent CF can be compared.

## Background

`renderCFSection` (`js/render.visualization.js`) builds a `.viz-cf-row` with two cards: chart1 "CF по аренде по годам по офисам (TO BE)" (from `tobeOfficeRows` of `getScenarioCFData`) and chart2 "МР Групп (TO BE)". A shared Y-axis `sharedMax` scales chart1 + chart2. Office colors come from `officeColor(name) || PALETTE[i]`.

## Design

- Add `asisOfficeRows = cfData.officeRows.filter(phase === ASIS && !isSubtotal)`.
- Extend `officeColorMap` to also color AS-IS rows (keyed by `row.id`, which is unique across phases).
- Build `chart1bData` (AS-IS) analogous to `chart1Data`.
- Include `chart1bData` in the `sharedMax` computation so all charts share one scale.
- Render an AS-IS card ("CF по аренде по годам по офисам (AS IS)") with `renderStackedBarSVG(chart1bData, colorFn, {showTotals:true, maxScale:sharedMax})` + legend, placed **between** the TO-BE offices card and the МР Групп card (offices charts adjacent for comparison).
- Only the offices chart is added for AS-IS (no AS-IS МР Групп).

## Affected files

- `js/render.visualization.js` — `renderCFSection` (data + card).

## Verification

`python build.py`; `node --check js/render.visualization.js`. Manual: «Визуализация» → CF section shows three cards (TO BE offices, AS IS offices, МР Групп); AS-IS bars reflect AS-IS office CF and share the Y-scale with TO-BE. (jsdom rendering of the viz tab is impractical — it uses `<canvas>` for label measurement; the underlying data comes from the already-tested `getScenarioCFData`.)

## Constraints

- Vanilla JS ES5; DOM via `U.el`.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
