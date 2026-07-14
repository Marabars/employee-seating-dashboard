# Partial Team Distribution in the Teams Pencil Form — Design

**Goal:** From the team edit form (✎ on the «Команды» tab), let the user distribute a team **partially** across multiple offices and zones per phase. Replace the single "AS-IS офис" / "TO-BE офис" selects with two repeatable row editors (office + zone + count), one for AS-IS and one for TO-BE. On save, these rows become the team's TEAM allocations.

## Background

`openTeamForm` (`js/render.teams.js`) uses `App.modals.form` with declarative fields. Today it has two single selects `currentOfficeId` (AS-IS) and `toBeOfficeId` (TO-BE); on submit it creates one full-headcount TEAM allocation into each chosen office (zone = whole area). No zones, no partial split.

The Teams table already **displays** all of a team's placements per phase (`teamPlacementLines` reads every allocation, grouped by office|zone → "Офис / Зона (N)"). That display is unchanged — the new form just produces the allocations behind it.

`App.modals.form` field types: text, number, textarea, checkbox, select, checkboxgroup, namelist. `namelist` (`buildNameList` + a `collect()` branch) is the model for a new repeatable type.

## Design

### 1. New form field type `placementrows` (`js/modals.js`)

- **Field spec:** `{ name, label, type: 'placementrows', value: [{officeId, zoneId, count}], offices: [{id, name, zones:[{id,name,capacity}]}], headcount: <number>, help }`.
- **Build (`buildPlacementRows(field)`):** a container with:
  - a rows area; each row = office `<select>` (options from `field.offices`, plus a leading "— офис —" empty option) → zone `<select>` (rebuilt on office change: "— Вся площадь" + that office's zones) → count `<input type=number min=1>` → remove `✕` button.
  - a live counter line: `Распределено N / всего M (остаток K)` where `M = field.headcount`, `N = Σ counts`, `K = M − N`; add class `over` (red) when `N > M`.
  - an "＋ строка" add button.
  - Rows pre-fill from `field.value`; changing any office/zone/count or add/remove updates the counter.
- **Collect (in `form()`'s `collect()`):** for `placementrows`, read each row → `{ officeId, zoneId, count }`, keeping rows with a non-empty `officeId` and `count > 0`. Value = array.

### 2. `openTeamForm` (`js/render.teams.js`)

- Compute phase office lists:
  - AS-IS offices: physical, `phase === 'asis'`.
  - TO-BE offices: physical `phase === 'tobe'` **plus** the TO-BE remote office (Удалёнка).
- Replace the two select fields with:
  - `{ name: 'asisRows', label: 'Распределение AS-IS (офис / зона / кол-во)', type: 'placementrows', offices: asisOffices, headcount: <current>, value: teamPhaseRows(scenario, team, 'asis') }`
  - `{ name: 'tobeRows', label: 'Распределение TO-BE (офис / зона / кол-во)', type: 'placementrows', offices: tobeOffices, headcount: <current>, value: teamPhaseRows(scenario, team, 'tobe') }`
- `teamPhaseRows(scenario, team, phase)`: from existing TEAM allocations of the team whose target office is in `phase` (asis → `office.phase==='asis'`; tobe → `office.phase==='tobe' || office.type===REMOTE`), group by `officeId|zoneId`, sum `employeesCount` → `[{officeId, zoneId, count}]`. Empty for new teams.
- **onSubmit:**
  1. Compute `headcount = max(employeesCount, namedCount)` (unchanged logic).
  2. Validate each phase: `Σ row.count ≤ headcount`. If a phase exceeds it → `App.modals.alert('Распределение <фаза> превышает численность команды (N > M)')` and `return false`.
  3. Derive profile fields for backward-compat (filters, employee-form pre-fill): `values.currentOfficeId = officeId of the AS-IS row with the largest count (or '')`; `values.toBeOfficeId = officeId of the TO-BE row with the largest count (or '')`.
  4. Save team (`T.update`/`T.add`) + `syncMembers` (unchanged).
  5. Sync allocations per phase via a new `App.allocations.setTeamPhaseAllocations(teamId, phase, rows)` (see §3) — replaces the old AS-IS/TO-BE change-detection block entirely.
  6. `return true`.

### 3. `App.allocations.setTeamPhaseAllocations(teamId, phase, rows)` (`js/allocations.js`)

Pure state sync in ONE commit (good undo granularity), unit-testable:
- In one `state.commit('Распределение команды', ...)`:
  - Remove existing **TEAM** allocations of `teamId` whose target office is in `phase` (asis → `office.phase==='asis'`; tobe → `office.phase==='tobe' || office.type===C.OFFICE_TYPE.REMOTE`). Non-team (EMPLOYEE) allocations and other phases untouched.
  - For each row with `officeId` and `count>0`, push `{ id: U.genId('allocation'), type: C.ALLOCATION_TYPE.TEAM, teamId, employeeId:null, employeesCount: count, targetOfficeId: officeId, targetZoneId: zoneId||null, comment:'' }`.
- Export it.

## Affected files

- `js/modals.js` — `buildPlacementRows` + `placementrows` branches in `form()` build and `collect()`.
- `js/render.teams.js` — `openTeamForm` field swap + `teamPhaseRows` helper + onSubmit rewrite; remove obsolete AS-IS/TO-BE sync block.
- `js/allocations.js` — `setTeamPhaseAllocations` + export.
- `styles.css` — `.placementrows` row layout + `.placement-counter.over`.
- `js/tests/calculations.test.js` **or** a dedicated allocations test — unit tests for `setTeamPhaseAllocations`.
- `ui-tests/` — jsdom test for the form flow.

## Tests

1. **Unit (`setTeamPhaseAllocations`):** given a team with existing TEAM+EMPLOYEE allocations across phases, calling it for TO-BE with rows `[{off,zone,3},{off,zone2,2}]` → exactly those two TEAM tobe allocations exist; EMPLOYEE allocations and AS-IS allocations untouched; empty rows → all TEAM tobe allocations removed.
2. **Unit (profile derivation):** helper picks the office with the largest count (tie → first).
3. **jsdom UI:** open the team form, add two TO-BE rows via the DOM, submit, assert `App.state` has the two allocations and `team.toBeOfficeId` = larger row's office. Over-headcount rows → submit blocked (alert), allocations unchanged.

## Constraints

- Vanilla JS ES5; DOM via `U.el`; mutations via `state.commit`.
- Sum of a phase's rows must never exceed team headcount (enforced in the form).
- Existing 📍 place modal and «Остаток на удалёнку» button unchanged.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
