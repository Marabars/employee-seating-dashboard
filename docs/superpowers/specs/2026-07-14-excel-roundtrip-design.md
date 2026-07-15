# Excel Export/Import Round-Trip for New Functionality — Design

**Goal:** Excel export/import must round-trip everything added recently: office lease/indexation dates, office tenants, partial team distribution (multi office/zone/count per phase), and manual CF overrides. Export then re-import restores the scenario faithfully.

## Background

- Export: `doExportExcel` (`js/importExport.js`) writes sheets Summary/Offices/Zones/Teams/Employees/Allocations/Warnings via `buildX` functions.
- Import: `importExcelDialog` reads sheets to arrays-of-arrays (`sheetToAoa`), then `App.importValidation.parseWorkbook` (`js/validation.import.js`) maps RU/EN headers to canonical objects using alias maps in `C.EXCEL_HEADERS[sheetKey]` (`js/constants.js`); `applyImport` builds entities into a scenario.
- Office **phase** is carried by the `office_type` column (parseOffices maps it via `C.OFFICE_PHASE_ALIASES`).
- Allocations already import (source of team/employee placement when the Allocations sheet is present), but with no phase column → office name can be ambiguous across AS-IS/TO-BE.
- Gaps: no lease dates on Offices; no tenants; no CF override; Allocations lacks phase.

## Design

### Sheet schema (target)

- **Offices** — add three date columns after `indexation_pct`: `lease_start_date`, `lease_end_date`, `indexation_start_date` (strings `YYYY-MM-DD`, empty = null). Existing columns unchanged; phase stays in `office_type`.
- **Zones**, **Teams**, **Employees** — unchanged (Teams keeps `current_office`/`to_be_office` as reference profile columns).
- **Allocations** — add a `phase` column: `type, entity, phase, count, office, zone, comment`. Export writes **all** allocations (team + employee) with the target office's phase. On import this sheet is the source of truth for distribution.
- **Tenants** (new) — `office_name, office_phase, tenant_name, area, comment`. One row per office tenant.
- **CF** (new) — `kind, phase, name, year, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec`. `kind` ∈ {`office`,`tenant`}. One row per override row per year, monthly values in millions RUB. **Written only when `scenario.cfOverride` is non-null.**

For multi-scenario export (`includeScenarioCol`), Tenants and CF also get a leading `scenario_name` column, consistent with the other sheets.

### Export changes (`js/importExport.js`)

- `buildOffices`: append the three date fields (raw `office.leaseStartDate || ''`, etc.).
- `buildAllocations`: add `phase` = the target office's `phase` (`''` for remote/unknown); already iterates all allocations.
- New `buildTenants(scenarios, inc)`: for each physical office, one row per `office.tenants[]` (`{name, area}`).
- New `buildCF(scenarios, inc)`: for each scenario whose `cfOverride` is set, for each `offices`/`tenants` row and each year present in `monthly`, emit a row `[kind, phase, name, year, m1..m12]`. Skip scenarios with `cfOverride == null`.
- `doExportExcel`: append `Tenants` after `Employees`, and `CF` after `Allocations` (CF sheet still created even if empty — header only — for template consistency).
- `downloadExcelTemplate`: add the three Offices date columns, and add empty `Tenants` and `CF` sheets with headers.

### Header aliases (`js/constants.js` `EXCEL_HEADERS`)

- `offices`: add aliases for `lease_start_date` (`'дата начала аренды'`, `'lease_start_date'`, `'начало аренды'`), `lease_end_date` (`'дата окончания аренды'`, `'lease_end_date'`, `'окончание аренды'`), `indexation_start_date` (`'дата начала индексации'`, `'indexation_start_date'`).
- `allocations`: add `phase` (`'фаза'`, `'phase'`).
- new `tenants`: `office_name`, `office_phase`, `tenant_name` (`'арендатор'`, `'tenant_name'`, `'название арендатора'`), `area` (`'площадь'`, `'area'`, `'площадь, м²'`), `comment`.
- new `cf`: `kind` (`'тип'`,`'kind'`), `phase`, `name` (`'название'`,`'name'`,`'офис/арендатор'`), `year` (`'год'`,`'year'`), `m1..m12` (`'янв'..'дек'` and `'jan'..'dec'`).

### Import changes (`js/validation.import.js` + `js/importExport.js`)

- `parseWorkbook` + `importExcelDialog` `sheetToAoa` list: add `tenants` and `cf` sheets; `parseWorkbook` calls new `parseTenants` and `parseCF`, and `parseAllocations` reads `phase`.
- `parseOffices`: read the three dates → `leaseStartDate`/`leaseEndDate`/`indexationStartDate` (string or null).
- `parseTenants`: rows → `{ officeName, officePhase, name, area, comment }`; report count.
- `parseCF`: rows → `{ kind, phase, name, year, monthly:[12] }`; report count.
- `parseAllocations`: add `phase` to each entry (aliased via `C.OFFICE_PHASE_ALIASES`, null when absent).
- `applyImport`:
  - `makeOffice`: set `leaseStartDate`/`leaseEndDate`/`indexationStartDate` from parsed dates.
  - After offices/zones: apply tenants → matching office's `tenants` array (resolve office by name+phase; replace/append).
  - Allocations: resolve office by name **and** phase (`findOffice(name, allocPhase)`); build team/employee allocations. This already runs when the Allocations sheet is present; make it phase-aware.
  - CF: if `parsed.cf` non-empty, group rows into `scenario.cfOverride = { offices:[...], tenants:[...] }` — each row `{ id: U.genId('cfrow'), name, phase, monthly: { "<year>": [12] } }` (merge multiple year-rows for the same kind+phase+name). If `parsed.cf` empty, leave `cfOverride = null`.

### Computed-vs-override rule

CF is exported only as an override. If the source scenario had no override, no CF sheet rows → import leaves `cfOverride = null` → CF recomputes from the round-tripped offices/rent/dates/tenants (identical to the source). This preserves the distinction and avoids accidental freezing.

## Affected files

- `js/constants.js` — `EXCEL_HEADERS` aliases (offices dates, allocations phase, new tenants + cf).
- `js/validation.import.js` — `parseOffices` dates; new `parseTenants`, `parseCF`; `parseAllocations` phase; `parseWorkbook` wiring + report counts.
- `js/importExport.js` — export builders (offices dates, allocations phase, `buildTenants`, `buildCF`), `doExportExcel` sheet list, `downloadExcelTemplate`, `sheetToAoa` list, `applyImport` (dates, tenants, cfOverride, phase-aware allocations).
- `ui-tests/` — jsdom round-trip test (export a scenario to a workbook object, re-parse+apply, assert equality of dates/tenants/allocations/cfOverride).

## Tests

1. **parse (unit, jsdom):** `parseWorkbook` maps Offices date columns, Tenants, CF (monthly), and Allocations phase from RU headers.
2. **Round-trip (jsdom):** build a scenario with lease dates, tenants, multi-office team allocations, and a manual `cfOverride`; run the export builders to AoA; feed AoA through `parseWorkbook` + `applyImport` into a fresh scenario; assert: office dates equal, tenants equal, team allocations (office+zone+count per phase) equal, `cfOverride` monthly values equal.
3. **No-override case:** a scenario without `cfOverride` exports an empty CF sheet; re-import leaves `cfOverride` null and computed CF matches.

## Constraints

- Vanilla JS ES5. XLSX via the bundled SheetJS (`window.XLSX`).
- RU + EN headers supported (alias maps).
- Import remains single-scenario (multi-scenario workbooks import as one scenario — pre-existing behavior).
- Dates are `YYYY-MM-DD` strings or empty.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
