# Lease End Date in CF — Design

**Goal:** Cash-flow calculation must respect `office.leaseEndDate`. After the lease ends, rent/opex expense stops. The lease-end month is prorated by day (expense charged through the end date inclusive); months entirely after the end date contribute `0`.

Example: lease ends `2028-08-30`. August 2028 charges 30 of 31 days (factor 30/31). From September 2028 onward — zero.

## Background — current state

`office.leaseEndDate` (string `YYYY-MM-DD | null`) already exists in the data model (`state.js` `createOffice` + `normalizeProject`), is editable in the office form (`render.offices.js:207,365`), and is displayed on the dashboard card (`render.dashboard.js:362-373`). It is **not** used by any calculation — `cfForMonth`/`cfForYear` ignore it. This is the gap.

`cfForMonth` is the single source of monthly CF. Annual figures in both the Finance tab and the Visualization tab are built by summing `cfForMonth` over 12 months, so fixing `cfForMonth` fixes every downstream number. `cfForYear` is exported and unit-tested but **not called anywhere in the app** — left unchanged (out of scope).

Current `cfForMonth` handles two prorations via multiplicative combination: an intra-month indexation split (base-rate days vs indexed-rate days) and a lease-start proration applied as a final multiplier. Adding an end-date proration as a third independent multiplier would mis-count in the rare case where several boundaries fall in one month. The chosen approach removes that fragility.

## Approach — per-day accumulation (Approach B)

Rewrite the internals of `cfForMonth` to sum daily rates across the month's active days. Each day is either active (lease running) or not, and carries the correct indexation exponent. This is unambiguously correct for any combination of lease-start / lease-end / indexation-start within a single month, and reproduces all existing behavior exactly.

### Signature

```
cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear, indexationStartDate, leaseEndDate)
```

`leaseEndDate` is the new **10th and last** parameter (string `YYYY-MM-DD | null | undefined`). Placing it last keeps backward compatibility: existing callers that omit it pass `undefined`, treated as "no end bound", so results are identical to today.

### Algorithm

1. `base = (area||0) × ((rent||0)+(opex||0))`; `idx = (indexationPct||0)/100`; `dim = daysInMonth(year, month)`.
2. Active-day bounds:
   - `firstActiveDay = 1`, `lastActiveDay = dim`.
   - If `leaseStartDate`: parse `lsYear/lsMonth/lsDay`. If month is entirely before start (`year<lsYear` or `year==lsYear && month<lsMonth`) → return `0`. If `year==lsYear && month==lsMonth` → `firstActiveDay = lsDay`.
   - If `leaseEndDate`: parse `leYear/leMonth/leDay`. If month is entirely after end (`year>leYear` or `year==leYear && month>leMonth`) → return `0`. If `year==leYear && month==leMonth` → `lastActiveDay = leDay`.
   - If `lastActiveDay < firstActiveDay` → return `0`.
3. Daily rate at exponent `e` (in millions RUB): `base × (1+idx)^e / 1_000_000 / 12 / dim`.
4. Day exponent for day `d` (reproduces existing indexation rule):
   - No `indexationStartDate` → `0`.
   - Parse `idxYear/idxMonth/idxDay`. If `(year, month, d)` is before `(idxYear, idxMonth, idxDay)` → `0`. Otherwise → `year − idxYear + 1`.
5. Sum daily rate over `d` from `firstActiveDay` to `lastActiveDay`, using each day's exponent. Return the sum.

`daysInMonth`, `parseInt` date-part extraction, and the millions/12 scaling are unchanged from the current implementation.

### Correctness vs current tests (spot checks)

- **Lease-start mid-month:** days `lsDay..dim` active → factor `(dim−lsDay+1)/dim`. Matches current.
- **Indexation mid-month (e.g. `2023-06-16`, June=30 days):** days 1–15 at exp 0, 16–30 at exp 1 → `(15·monthlyAt0 + 15·monthlyAt1)/30`. Matches current `0.013125`.
- **No `leaseEndDate`:** `lastActiveDay = dim` → identical to today.

## Affected files

- **`js/calculations.js`**
  - Rewrite `cfForMonth` internals per the algorithm; add `leaseEndDate` param.
  - Office monthly call (~line 658): pass `office.leaseEndDate`.
  - `collectTenantEntries` (3 push sites): add `leaseEndDate: office.leaseEndDate` to each pushed entry object.
  - Tenant monthly call (~line 749): pass `p.leaseEndDate`.
  - `cfForYear`: unchanged.
- **`js/render.visualization.js`**
  - `cfYearTotal` (~line 499): add `leaseEndDate` param, pass to `cfForMonth`.
  - Two call sites (~lines 514, 525): pass `o.leaseEndDate`.
- **`js/tests/calculations.test.js`** — new tests (see below).
- **No form change** — `leaseEndDate` input already exists and saves.

## Tests (add to `calculations.test.js`)

1. Month entirely after `leaseEndDate` → `0` (e.g. Sep 2028, end `2028-08-30`).
2. Lease-end month prorated by day → `2028-08-30`, Aug has 31 days → factor `30/31` of the full-month amount.
3. Lease-end month where `endDay == dim` (e.g. `2028-08-31`) → full month, no proration.
4. Lease start and end in the same month → active days `startDay..endDay` only.
5. Regression: existing lease-start and indexation-proration tests still pass unchanged (no `leaseEndDate` passed).

## Verification

`python build.py` → `employee-seating-dashboard.html`. Run `tests.html` (all pass). Manual check on the "Финансы" tab: set an office `leaseEndDate` mid-year and confirm the year's total drops and months after end read `0`. Deploy via `python deploy.py` (password from env `SEATING_DEPLOY_PASS`).

## Constraints

- Vanilla JS **ES5 only** — `var`/`function`, no arrow functions, template literals, `const`/`let`, `class`, destructuring.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
