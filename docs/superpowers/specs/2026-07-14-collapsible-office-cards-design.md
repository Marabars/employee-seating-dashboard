# Collapsible Office Cards (per phase) — Design

**Goal:** On the Dashboard «Офисы» block, let the user collapse/expand the office-cards grid per phase (TO BE / AS IS) independently of the CF tables, so AS-IS and TO-BE CF tables can sit next to each other for comparison without scrolling past the cards.

## Background

`renderOfficesBlock` (`js/render.dashboard.js`) renders, per phase group: a phase heading `<h3>`, an `.office-grid` of cards, and (in money mode) a CF table + a tenant CF table. Existing independent controls: `hideTobe`/`hideAsis` (hide the whole phase), `dashCFCollapsed`/`dashTenantCFCollapsed` (collapse the CF tables per phase). Missing: collapsing just the office-cards grid.

## Design

- New module-level state `var dashCardsCollapsed = {};` (keys `'tobe'`/`'asis'` → bool). Transient (not persisted), consistent with `dashCFCollapsed`, `hideTobe`, `expanded`.
- Each phase heading gains a leading toggle button (`R.iconBtn`, ▾ expanded / ▸ collapsed, title «Свернуть/Показать карточки») that flips `dashCardsCollapsed[phase]` and calls `R.render()`.
- The `.office-grid` for a phase is appended only when `!dashCardsCollapsed[phase]`. CF tables (money mode) are unaffected — they render regardless of card collapse.
- Fully independent of `hideTobe/hideAsis` (whole-phase hide wins: if the phase is hidden, nothing renders) and of the CF-table collapse.
- CSS: size the toggle down inside the `.phase-head` heading.

## Affected files

- `js/render.dashboard.js` — `dashCardsCollapsed` state; phase-head toggle; conditional grid append (both TO BE and AS IS branches).
- `styles.css` — `.phase-head .icon-btn` sizing.

## Verification

`python build.py`; `node --check js/render.dashboard.js`. Manual: Dashboard → money mode → collapse TO BE and AS IS cards → both phases' CF tables are adjacent; expand restores cards; whole-phase hide and CF-table collapse still work independently.

## Constraints

- Vanilla JS ES5; DOM via `U.el`; no persistence for this UI state.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
