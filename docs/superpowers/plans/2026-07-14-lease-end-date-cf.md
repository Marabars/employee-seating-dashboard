# Lease End Date in CF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cash-flow calculation stop charging rent/opex after `office.leaseEndDate`, prorating the lease-end month by day (charged through the end date inclusive) and returning 0 for months entirely after it.

**Architecture:** Rewrite the internals of `cfForMonth` to sum daily rates across the month's active days (per-day accumulation), replacing the current multiplicative proration. Add `leaseEndDate` as a new last parameter. Then thread `office.leaseEndDate` through the three `cfForMonth` call sites.

**Tech Stack:** Vanilla JS ES5, single-file build via `python build.py`. In-browser test harness (`tests.html` → `js/tests/calculations.test.js`) using `describe`/`it`/`expect(...).toBeCloseTo(value, digits)`.

## Global Constraints

- Vanilla JS **ES5 ONLY** — `var`/`function`, no `const`/`let`, no arrow functions, no template literals, no `class`, no destructuring.
- CF values are in **millions of RUB**; monthly scaling is `/ 1_000_000 / 12`.
- `leaseEndDate` is a string `YYYY-MM-DD` or `null`/`undefined` (undefined ⇒ no end bound).
- Build: `python build.py` from repo root → `employee-seating-dashboard.html` (~3 MB).
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.
- Test constants used throughout: `cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear, indexationStartDate, leaseEndDate)`. With `area=1000, rent=100, opex=50, idx=10` → `base=150000`, full month at exp 0 = `0.0125` (млн).

---

### Task 1: Rewrite `cfForMonth` with per-day accumulation + `leaseEndDate`

**Files:**
- Modify: `js/calculations.js` (function `cfForMonth`, currently lines ~576–631)
- Test: `js/tests/calculations.test.js` (append tests before the final `})();`, currently line 431)

**Interfaces:**
- Consumes: `daysInMonth(year, month)` (already defined in `calculations.js`).
- Produces: `cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear, indexationStartDate, leaseEndDate)` → number (млн RUB for the month). `leaseEndDate` is the **10th and last** parameter; omitting it (⇒ `undefined`) preserves current behavior.

- [ ] **Step 1: Write the failing tests**

In `js/tests/calculations.test.js`, immediately before the closing `})();` on line 431, add:

```js
  describe('cfForMonth — leaseEndDate', function () {
    it('month entirely after leaseEndDate is 0', function () {
      // lease ends 2028-08-30; September 2028 => no expense
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 9, null, null, '2028-08-30');
      expect(result).toBe(0);
    });

    it('lease-end month prorated by day (Aug 2028, 31 days, ends day 30 => 30/31)', function () {
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 8, null, null, '2028-08-30');
      expect(result).toBeCloseTo(0.0125 * 30 / 31, 6);
    });

    it('lease ends on last day of month => full month, no proration', function () {
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 8, null, null, '2028-08-31');
      expect(result).toBeCloseTo(0.0125, 6);
    });

    it('lease start and end in the same month => only active days charged', function () {
      // Aug 2028 (31 days), active days 10..20 = 11 days
      var result = calc.cfForMonth(1000, 100, 50, 10, '2028-08-10', 2028, 8, null, null, '2028-08-20');
      expect(result).toBeCloseTo(0.0125 * 11 / 31, 6);
    });

    it('no leaseEndDate => full month within lease (backward compatible)', function () {
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 8, null, null);
      expect(result).toBeCloseTo(0.0125, 6);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html` in a browser (or `employee-seating-dashboard.html` test mode). Run the suite.
Expected: the 4 new lease-end tests FAIL (the current `cfForMonth` ignores the 10th arg, so Sep 2028 returns `0.0125` instead of `0`, and Aug returns `0.0125` instead of the prorated value). The "no leaseEndDate" test already passes.

- [ ] **Step 3: Replace `cfForMonth` with the per-day implementation**

In `js/calculations.js`, replace the entire `cfForMonth` function (lines ~576–631) with:

```js
  function cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear, indexationStartDate, leaseEndDate) {
    var a = area || 0;
    var rent = rentPerSqm || 0;
    var opex = opexPerSqm || 0;
    var idx = (indexationPct || 0) / 100;
    var base = a * (rent + opex);
    var dim = daysInMonth(year, month);

    // ---- Active-day bounds within this month ----
    var firstActiveDay = 1;
    var lastActiveDay = dim;

    if (leaseStartDate) {
      var lsStr = String(leaseStartDate);
      var lsYear  = parseInt(lsStr.substring(0, 4), 10);
      var lsMonth = parseInt(lsStr.substring(5, 7), 10);
      var lsDay   = parseInt(lsStr.substring(8, 10), 10) || 1;
      if (!isNaN(lsYear) && !isNaN(lsMonth)) {
        if (year < lsYear || (year === lsYear && month < lsMonth)) { return 0; }
        if (year === lsYear && month === lsMonth) { firstActiveDay = lsDay; }
      }
    }

    if (leaseEndDate) {
      var leStr = String(leaseEndDate);
      var leYear  = parseInt(leStr.substring(0, 4), 10);
      var leMonth = parseInt(leStr.substring(5, 7), 10);
      var leDay   = parseInt(leStr.substring(8, 10), 10) || 1;
      if (!isNaN(leYear) && !isNaN(leMonth)) {
        if (year > leYear || (year === leYear && month > leMonth)) { return 0; }
        if (year === leYear && month === leMonth) { lastActiveDay = leDay; }
      }
    }

    if (lastActiveDay < firstActiveDay) { return 0; }

    // ---- Indexation start (per-day exponent) ----
    var idxYear = null, idxMonth = null, idxDay = 1;
    if (indexationStartDate) {
      var idxStr = String(indexationStartDate);
      idxYear  = parseInt(idxStr.substring(0, 4), 10);
      idxMonth = parseInt(idxStr.substring(5, 7), 10);
      idxDay   = parseInt(idxStr.substring(8, 10), 10) || 1;
      if (isNaN(idxYear) || isNaN(idxMonth)) { idxYear = null; }
    }

    function dayExponent(d) {
      if (idxYear === null) { return 0; }
      if (year < idxYear) { return 0; }
      if (year === idxYear && month < idxMonth) { return 0; }
      if (year === idxYear && month === idxMonth && d < idxDay) { return 0; }
      return year - idxYear + 1;
    }

    // ---- Sum daily rates over active days ----
    var monthly = 0;
    for (var d = firstActiveDay; d <= lastActiveDay; d++) {
      monthly += base * Math.pow(1 + idx, dayExponent(d)) / 1000000 / 12 / dim;
    }
    return monthly;
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Rebuild and reload the test page:
```
python build.py
```
Open `tests.html`, run the suite.
Expected: all `cfForMonth — leaseEndDate` tests PASS, and all pre-existing `cfForMonth — indexationStartDate` tests still PASS (they pass no 10th arg → `undefined` → `lastActiveDay = dim`, identical to before).

- [ ] **Step 5: Commit**

```bash
git add js/calculations.js js/tests/calculations.test.js employee-seating-dashboard.html
git commit -m "feat: cfForMonth honors leaseEndDate (per-day accumulation)"
```

---

### Task 2: Thread `leaseEndDate` through all `cfForMonth` call sites

**Files:**
- Modify: `js/calculations.js` (`getScenarioCFData` — office call ~line 658, `collectTenantEntries` 3 push sites ~lines 719/726/732, tenant call ~line 749)
- Modify: `js/render.visualization.js` (`cfYearTotal` ~line 499, call sites ~lines 514, 525)
- Test: `js/tests/calculations.test.js` (append one integration test)

**Interfaces:**
- Consumes: `cfForMonth(..., leaseEndDate)` from Task 1; `getScenarioCFData(scenario, startYear, endYear)` → `{ years, officeRows, tenantRows }` where each row has `{ name, phase, values:[perYear], rowTotal, ... }`.
- Produces: office/tenant CF rows that reflect `office.leaseEndDate`.

- [ ] **Step 1: Write the failing integration test**

In `js/tests/calculations.test.js`, immediately before the closing `})();` (now after the Task-1 block), add:

```js
  describe('getScenarioCFData — leaseEndDate flows through', function () {
    it('office CF for the lease-end year drops after the end date', function () {
      var scen = {
        id: 'sc', name: 'CF', comment: '',
        offices: [
          { id: 'o1', type: 'physical', phase: 'tobe', name: 'LeaseEndOffice',
            area: 1000, rentPerSqm: 100, opexPerSqm: 50, indexationPct: 10,
            leaseStartDate: null, indexationStartDate: null, leaseEndDate: '2028-08-30',
            zones: [], tenants: [] }
        ],
        teams: [], employees: [], allocations: []
      };
      var data = calc.getScenarioCFData(scen, 2028, 2028);
      var row = data.officeRows.filter(function (r) { return r.name === 'LeaseEndOffice'; })[0];
      // Jan–Jul full (7 × 0.0125) + Aug prorated (0.0125 × 30/31) + Sep–Dec 0
      expect(row.values[0]).toBeCloseTo(0.0125 * 7 + 0.0125 * 30 / 31, 4);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Open `tests.html`, run the suite.
Expected: FAIL — `getScenarioCFData` still calls `cfForMonth` without `leaseEndDate`, so the office charges a full year (`0.15`) instead of the prorated `~0.0996`.

- [ ] **Step 3: Pass `office.leaseEndDate` in the office monthly loop**

In `js/calculations.js`, in `buildOfficeRow` (the `cfForMonth` call at ~line 658), add the 10th argument:

```js
// BEFORE:
          monthlyValues[yr].push(cfForMonth(
            office.area, office.rentPerSqm, office.opexPerSqm,
            office.indexationPct, office.leaseStartDate, yr, m, baseYear,
            office.indexationStartDate
          ));

// AFTER:
          monthlyValues[yr].push(cfForMonth(
            office.area, office.rentPerSqm, office.opexPerSqm,
            office.indexationPct, office.leaseStartDate, yr, m, baseYear,
            office.indexationStartDate, office.leaseEndDate
          ));
```

- [ ] **Step 4: Add `leaseEndDate` to the three `collectTenantEntries` push objects**

In `js/calculations.js`, in `collectTenantEntries`, add `leaseEndDate: office.leaseEndDate` to each of the three pushed entry objects:

```js
// Push #1 — office with no tenants (~line 719):
            entries[NO_TENANT].push({ area: office.area, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate, leaseEndDate: office.leaseEndDate });

// Push #2 — per tenant (~line 726):
            entries[key].push({ area: t.area || 0, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate, leaseEndDate: office.leaseEndDate });

// Push #3 — remaining un-tenanted area (~line 732):
            entries[NO_TENANT].push({ area: remaining, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate, leaseEndDate: office.leaseEndDate });
```

- [ ] **Step 5: Pass `p.leaseEndDate` in the tenant monthly loop**

In `js/calculations.js`, in `buildTenantRows` (the `cfForMonth` call at ~line 749), add the 10th argument:

```js
// BEFORE:
              return s + cfForMonth(
                p.area, p.rentPerSqm, p.opexPerSqm,
                p.indexationPct, p.leaseStartDate, yr, m, baseYear,
                p.indexationStartDate
              );

// AFTER:
              return s + cfForMonth(
                p.area, p.rentPerSqm, p.opexPerSqm,
                p.indexationPct, p.leaseStartDate, yr, m, baseYear,
                p.indexationStartDate, p.leaseEndDate
              );
```

- [ ] **Step 6: Thread `leaseEndDate` through `cfYearTotal` in visualization**

In `js/render.visualization.js`, update `cfYearTotal` (~line 499) and its two call sites (~lines 514, 525):

```js
// Function signature + inner call (~line 499):
    function cfYearTotal(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, yr, indexationStartDate, leaseEndDate) {
      var total = 0;
      for (var m = 1; m <= 12; m++) {
        total += calc.cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, yr, m, yr, indexationStartDate, leaseEndDate);
      }
      return total;
    }

// Call site #1 (~line 514):
            value: cfYearTotal(o.area, o.rentPerSqm, o.opexPerSqm, o.indexationPct, o.leaseStartDate, yr, o.indexationStartDate, o.leaseEndDate)

// Call site #2 (~line 525):
            total += cfYearTotal(t.area || 0, o.rentPerSqm, o.opexPerSqm, o.indexationPct, o.leaseStartDate, yr, o.indexationStartDate, o.leaseEndDate);
```

- [ ] **Step 7: Build and run the full suite**

```
python build.py
```
Open `tests.html`, run the suite.
Expected: the new `getScenarioCFData — leaseEndDate flows through` test PASSES; all other tests still PASS.

- [ ] **Step 8: Manual verification**

Open `employee-seating-dashboard.html`. Go to **Офисы**, edit a TO-BE office, set money fields (аренда/opex/индексация) and a "Дата окончания договора аренды" mid-year (e.g. `2028-08-30`). Go to **Финансы**:
- The office's total for 2028 is lower than a full year, and expanding the year shows Sep–Dec = 0, Aug reduced.
- Check the **Визуализация** → CF charts reflect the same drop for that office.

- [ ] **Step 9: Commit**

```bash
git add js/calculations.js js/render.visualization.js js/tests/calculations.test.js employee-seating-dashboard.html
git commit -m "feat: thread office.leaseEndDate into CF office/tenant/visualization"
```

---

### Task 3: Push and deploy

**Files:** none (release step).

- [ ] **Step 1: Push to origin/main**

```bash
git push
```

- [ ] **Step 2: Deploy to workai-05:8004**

Set the SSH password in the environment first (never hardcode it), then run the deploy script:

```bash
# PowerShell:  $env:SEATING_DEPLOY_PASS = '<пароль>'
# bash:        export SEATING_DEPLOY_PASS='<пароль>'
python deploy.py
```

Expected: `Done. URL: http://workai-05.mr-group.ru:8004`. Open the URL and re-check the Финансы tab with a mid-year lease end.

---

## Self-Review

1. **Spec coverage:**
   - ✅ Months after `leaseEndDate` → 0 (Task 1, active-day bounds).
   - ✅ Lease-end month prorated by day, inclusive (Task 1, `lastActiveDay = leDay`).
   - ✅ Existing indexation + lease-start proration preserved (Task 1 per-day rule; regression tests in Step 4).
   - ✅ Flows into Finance office rows, tenant rows, and Visualization (Task 2 call sites).
   - ✅ `cfForYear` left unchanged, form unchanged (per spec — field already present).

2. **Placeholder scan:** No TBD/TODO. Every code step shows full code. The only bracketed token is `<пароль>` in Task 3, which is a real user-supplied secret, not a plan placeholder.

3. **Type consistency:** `leaseEndDate` is the 10th parameter of `cfForMonth` everywhere it is added (Task 1 signature, Task 2 office/tenant/visualization calls). Entry objects in `collectTenantEntries` carry `leaseEndDate`, consumed as `p.leaseEndDate`. `cfYearTotal` gains `leaseEndDate` as its 8th param, matched at both call sites.

4. **Line numbers** are marked `~` (approximate) because the single-file build shifts offsets; anchor on the shown BEFORE snippets.
