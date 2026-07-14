# Indexation Start Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `indexationStartDate` to the office model so that the CF calculation applies indexation only from that date onwards — months before it use the base rate, the start month is prorated by day, and a null date means no indexation at all.

**Architecture:** Three sequential tasks. Task 1 adds the field to the data model. Task 2 changes the core calculation functions `cfForYear` and `cfForMonth` plus all their call sites. Task 3 adds the date input to the office edit form. No new files are needed.

**Tech Stack:** Vanilla JS ES5. Test runner: `js/tests/test-harness.js` + `js/tests/calculations.test.js` (open in browser via `index.html?test=1` or equivalent).

## Global Constraints

- Vanilla JS ES5 ONLY — no `const`/`let`, no arrow functions, no template literals, no destructuring
- `U.el(tag, attrs, children)` for DOM; `state.commit(label, fn)` for mutations
- New field name: `indexationStartDate` (string `YYYY-MM-DD` or `null`)
- **Behavior when `indexationStartDate` is null:** exponent = 0 → CF = base rate (no growth). This is a deliberate breaking change from the old `leaseStartDate`-based exponent.
- **Exponent when indexation applies:** `year − indexationStartDate.year + 1` (so the start year has exponent 1, next year 2, etc.)
- **Month-level proration:** the indexation start month is split: days before `indexationStartDate.day` → base rate; days from `indexationStartDate.day` → indexed rate
- Build: `python build.py` from repo root → `employee-seating-dashboard.html (2.9 MB)`
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`

---

### Task 1: Data model — add `indexationStartDate` field

**Files:**
- Modify: `js/state.js` (two locations)

**Interfaces:**
- Produces: `office.indexationStartDate` — string `YYYY-MM-DD` or `null`, present on every office object from `createOffice` and `normalizeProject`

- [ ] **Step 1: Add field to `createOffice`**

In `js/state.js`, inside `createOffice` (around line 71), add the new field right after `leaseStartDate`:

```js
// BEFORE (line 72-73 area):
      leaseEndDate: data.leaseEndDate || null,
      leaseStartDate: data.leaseStartDate || null,

// AFTER:
      leaseEndDate: data.leaseEndDate || null,
      leaseStartDate: data.leaseStartDate || null,
      indexationStartDate: data.indexationStartDate || null,
```

- [ ] **Step 2: Add forward-compat guard to `normalizeProject`**

In `js/state.js`, inside `normalizeProject`, in the `s.offices.forEach` block where other undefined checks live (around line 361-365), add:

```js
// BEFORE (existing lines):
        if (o.leaseEndDate === undefined) { o.leaseEndDate = null; }
        if (o.leaseStartDate === undefined) { o.leaseStartDate = null; }

// AFTER:
        if (o.leaseEndDate === undefined) { o.leaseEndDate = null; }
        if (o.leaseStartDate === undefined) { o.leaseStartDate = null; }
        if (o.indexationStartDate === undefined) { o.indexationStartDate = null; }
```

- [ ] **Step 3: Build to verify no syntax errors**

```
cd C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard
python build.py
```

Expected: `Done! -> employee-seating-dashboard.html  (2.9 MB)`

- [ ] **Step 4: Commit**

```bash
git add js/state.js
git commit -m "feat: add indexationStartDate field to office model"
```

---

### Task 2: Calculation logic

**Files:**
- Modify: `js/calculations.js`
- Modify: `js/tests/calculations.test.js`

**Interfaces:**
- Consumes: `office.indexationStartDate` from Task 1
- Changes: `cfForYear` and `cfForMonth` signatures gain a new last parameter `indexationStartDate`; all internal call sites updated

**Background — current logic to replace:**

`cfForYear` currently computes `yearsElapsed` from `leaseStartDate` (or `baseYear` fallback). `cfForMonth` calls `cfForYear / 12` and prorates the lease start month.

**New rules (exactly):**
1. If `indexationStartDate` is `null` → exponent = 0 → result = `base × 1 / 1_000_000`
2. If the target year < `indexationStartDate.year` → exponent = 0
3. If the target year > `indexationStartDate.year` → exponent = `year − indexationStartDate.year + 1`
4. If target year === `indexationStartDate.year`: same exponent = 1 (handled at the month level)
5. Month before `indexationStartDate` (year/month < idxYear/idxMonth) → exponent = 0
6. Month after `indexationStartDate` month → exponent = year − idxYear + 1
7. Month === `indexationStartDate` month: prorate by day:
   - `(idxDay - 1)` days at exponent 0, `(daysInMonth - idxDay + 1)` days at exponent = year − idxYear + 1

- [ ] **Step 1: Write failing tests**

Open `js/tests/calculations.test.js`. Add these tests at the end of the file (before the closing of the test suite, wherever other `cfForYear`/`cfForMonth` tests are):

```js
// --- indexationStartDate tests ---

test('cfForYear: null indexationStartDate → exponent 0 regardless of indexationPct', function () {
  // base = 1000 * (100 + 50) = 150_000 → 0.15 M/yr
  var result = App.calc.cfForYear(1000, 100, 50, 10, null, 2025, null, null);
  assertClose(result, 0.15, 0.0001, 'null indexationStartDate → base rate');
});

test('cfForYear: year before indexationStartDate.year → exponent 0', function () {
  var result = App.calc.cfForYear(1000, 100, 50, 10, null, 2022, null, '2023-01-01');
  assertClose(result, 0.15, 0.0001, 'year before start → base rate');
});

test('cfForYear: year === indexationStartDate.year → exponent 1', function () {
  // base = 0.15, exponent 1 → 0.15 * 1.10 = 0.165
  var result = App.calc.cfForYear(1000, 100, 50, 10, null, 2023, null, '2023-01-01');
  assertClose(result, 0.165, 0.0001, 'start year → exponent 1');
});

test('cfForYear: year after indexationStartDate.year → exponent year-startYear+1', function () {
  // 2025, startYear=2023 → exponent 3 → 0.15 * 1.10^3 = 0.15 * 1.331 = 0.19965
  var result = App.calc.cfForYear(1000, 100, 50, 10, null, 2025, null, '2023-01-01');
  assertClose(result, 0.19965, 0.0001, 'year+2 → exponent 3');
});

test('cfForMonth: month before indexationStartDate → base rate', function () {
  // indexation starts June 2023; March 2023 → exponent 0
  var result = App.calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 3, null, '2023-06-01');
  // 0.15 / 12 = 0.0125
  assertClose(result, 0.0125, 0.0001, 'month before idx start → base rate');
});

test('cfForMonth: month after indexationStartDate → indexed rate', function () {
  // indexation starts June 2023; August 2023 → exponent 1
  var result = App.calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 8, null, '2023-06-01');
  // 0.15 * 1.1 / 12 = 0.01375
  assertClose(result, 0.01375, 0.0001, 'month after idx start → exponent 1');
});

test('cfForMonth: indexation start month (day=1) → full indexed rate', function () {
  // indexation starts June 1 2023; June 2023 → exponent 1 (day=1 means full month indexed)
  var result = App.calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 6, null, '2023-06-01');
  assertClose(result, 0.01375, 0.0001, 'start month day=1 → full indexed');
});

test('cfForMonth: indexation start month mid-month → prorated', function () {
  // indexation starts June 16 2023 (June has 30 days)
  // 15 days at base (0.15/12), 15 days at indexed (0.165/12)
  // = (0.15 * 15 + 0.165 * 15) / 30 / 12
  // = (2.25 + 2.475) / 360 = 4.725 / 360 = 0.013125
  var result = App.calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 6, null, '2023-06-16');
  assertClose(result, 0.013125, 0.0001, 'mid-month indexation start → prorated');
});
```

Add `assertClose` helper if not already present (check the test file first):

```js
function assertClose(actual, expected, tolerance, msg) {
  var diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error((msg || '') + ' — expected ' + expected + ' ±' + tolerance + ', got ' + actual);
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Open `employee-seating-dashboard.html` in a browser with test mode, or run the test harness. Verify the new tests fail with "function not defined" or wrong value errors.

If the test runner command is different, check `js/tests/test-harness.js` for how to run tests.

- [ ] **Step 3: Update `cfForYear`**

In `js/calculations.js`, replace the entire `cfForYear` function (currently lines ~555–569):

```js
function cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear, indexationStartDate) {
  var a = area || 0;
  var rent = rentPerSqm || 0;
  var opex = opexPerSqm || 0;
  var idx = (indexationPct || 0) / 100;
  var base = a * (rent + opex);
  var yearsElapsed = 0;
  if (indexationStartDate) {
    var idxYear = parseInt(String(indexationStartDate).substring(0, 4), 10);
    if (!isNaN(idxYear) && year >= idxYear) {
      yearsElapsed = year - idxYear + 1;
    }
  }
  // leaseStartDate and baseYear kept in signature for call-site compatibility but no longer affect exponent
  return base * Math.pow(1 + idx, yearsElapsed) / 1000000;
}
```

- [ ] **Step 4: Update `cfForMonth`**

In `js/calculations.js`, replace the entire `cfForMonth` function (currently lines ~576–593):

```js
function cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear, indexationStartDate) {
  var a = area || 0;
  var rent = rentPerSqm || 0;
  var opex = opexPerSqm || 0;
  var idx = (indexationPct || 0) / 100;
  var base = a * (rent + opex);

  // Helper: monthly CF at a given exponent (in millions, no proration)
  function monthlyAt(exp) {
    return base * Math.pow(1 + idx, exp) / 1000000 / 12;
  }

  // Determine exponent and whether the indexation start month needs day-proration.
  var exponent = 0;
  var idxProrateDay = 0; // > 0 means this month straddles the indexation start
  if (indexationStartDate) {
    var idxStr = String(indexationStartDate);
    var idxYear  = parseInt(idxStr.substring(0, 4), 10);
    var idxMonth = parseInt(idxStr.substring(5, 7), 10);
    var idxDay   = parseInt(idxStr.substring(8, 10), 10) || 1;
    if (!isNaN(idxYear) && !isNaN(idxMonth)) {
      if (year > idxYear || (year === idxYear && month > idxMonth)) {
        exponent = year - idxYear + 1;
      } else if (year === idxYear && month === idxMonth) {
        exponent = 1; // start year → exponent 1
        idxProrateDay = idxDay; // need to prorate within this month
      }
      // year < idxYear OR (year === idxYear && month < idxMonth) → exponent stays 0
    }
  }

  // Lease start check — return 0 for months before the lease begins.
  var lsYear = null; var lsMonth = null; var lsDay = 1;
  if (leaseStartDate) {
    var lsStr2 = String(leaseStartDate);
    lsYear  = parseInt(lsStr2.substring(0, 4), 10);
    lsMonth = parseInt(lsStr2.substring(5, 7), 10);
    lsDay   = parseInt(lsStr2.substring(8, 10), 10) || 1;
    if (!isNaN(lsYear) && !isNaN(lsMonth)) {
      if (year < lsYear || (year === lsYear && month < lsMonth)) { return 0; }
    }
  }

  var dim = daysInMonth(year, month);

  // Compute the raw monthly amount (may be prorated for indexation start month).
  var monthly;
  if (idxProrateDay > 1) {
    // Split month: (idxProrateDay-1) days at exponent 0, rest at exponent 1.
    var baseDays = idxProrateDay - 1;
    var idxDays  = dim - baseDays;
    monthly = (monthlyAt(0) * baseDays + monthlyAt(exponent) * idxDays) / dim;
  } else {
    monthly = monthlyAt(exponent);
  }

  // Prorate for lease start month (if this is the first partial month of the lease).
  if (lsYear !== null && year === lsYear && month === lsMonth && lsDay > 1) {
    monthly = monthly * (dim - lsDay + 1) / dim;
  }

  return monthly;
}
```

- [ ] **Step 5: Update call sites in `getScenarioCFData`**

In `js/calculations.js`, find the `cfForMonth` call in the office monthly values loop (around line 620):

```js
// BEFORE:
          monthlyValues[yr].push(cfForMonth(
            office.area, office.rentPerSqm, office.opexPerSqm,
            office.indexationPct, office.leaseStartDate, yr, m, baseYear
          ));

// AFTER:
          monthlyValues[yr].push(cfForMonth(
            office.area, office.rentPerSqm, office.opexPerSqm,
            office.indexationPct, office.leaseStartDate, yr, m, baseYear,
            office.indexationStartDate
          ));
```

Find the `collectTenantEntries` function (around line 671) where it builds entries from offices. Add `indexationStartDate` to each pushed entry object:

```js
// BEFORE (office with no tenants, around line 678-681):
            entries[key].push({ area: office.area, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate });

// AFTER:
            entries[key].push({ area: office.area, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate });

// BEFORE (office with tenants, around line 685-687):
            entries[key].push({ area: t.area || 0, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate });

// AFTER:
            entries[key].push({ area: t.area || 0, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate });
```

Find the tenant monthly values `cfForMonth` call (around line 702-706):

```js
// BEFORE:
              return s + cfForMonth(
                p.area, p.rentPerSqm, p.opexPerSqm,
                p.indexationPct, p.leaseStartDate, yr, m, baseYear
              );

// AFTER:
              return s + cfForMonth(
                p.area, p.rentPerSqm, p.opexPerSqm,
                p.indexationPct, p.leaseStartDate, yr, m, baseYear,
                p.indexationStartDate
              );
```

- [ ] **Step 6: Build and run tests**

```
python build.py
```

Expected: `Done! -> employee-seating-dashboard.html  (2.9 MB)`

Run the test suite. All new tests must pass. Existing tests must still pass (they don't pass `indexationStartDate`, so they get `undefined` which is treated as `null` → exponent 0 = correct backward behavior).

- [ ] **Step 7: Commit**

```bash
git add js/calculations.js js/tests/calculations.test.js
git commit -m "feat: indexationStartDate controls CF exponent; null → no indexation"
```

---

### Task 3: Office edit form

**Files:**
- Modify: `js/render.offices.js`

**Interfaces:**
- Consumes: `office.indexationStartDate` from Task 1
- Produces: form input wired to read/write `indexationStartDate`

- [ ] **Step 1: Add date input after `idxInput`**

In `js/render.offices.js`, find the block where `idxInput` is created and appended (around line 226-229):

```js
// BEFORE:
    var idxInput = numField('Индексация, %/год', office && office.indexationPct != null ? office.indexationPct : '', 'indexationPct');
    body.appendChild(rentInput.wrap);
    body.appendChild(opexInput.wrap);
    body.appendChild(idxInput.wrap);

// AFTER:
    var idxInput = numField('Индексация, %/год', office && office.indexationPct != null ? office.indexationPct : '', 'indexationPct');
    var idxStartInput = dateField('Дата начала индексации', office ? office.indexationStartDate || '' : '', 'indexationStartDate');
    body.appendChild(rentInput.wrap);
    body.appendChild(opexInput.wrap);
    body.appendChild(idxInput.wrap);
    body.appendChild(idxStartInput.wrap);
```

- [ ] **Step 2: Wire up to save**

In `js/render.offices.js`, find the `data` object built in the submit handler (around line 359-369):

```js
// BEFORE:
          var data = {
            name: nameInput.input.value,
            area: areaInput.input.value,
            leaseStartDate: leaseStartInput.input.value || null,
            leaseEndDate: leaseEndInput.input.value || null,
            rentPerSqm: rentInput.input.value,
            opexPerSqm: opexInput.input.value,
            indexationPct: idxInput.input.value,
            comment: commentInput.input.value,
            isDraft: draftInput.input.checked,
            zones: zones,

// AFTER:
          var data = {
            name: nameInput.input.value,
            area: areaInput.input.value,
            leaseStartDate: leaseStartInput.input.value || null,
            leaseEndDate: leaseEndInput.input.value || null,
            rentPerSqm: rentInput.input.value,
            opexPerSqm: opexInput.input.value,
            indexationPct: idxInput.input.value,
            indexationStartDate: idxStartInput.input.value || null,
            comment: commentInput.input.value,
            isDraft: draftInput.input.checked,
            zones: zones,
```

- [ ] **Step 3: Build**

```
python build.py
```

Expected: `Done! -> employee-seating-dashboard.html  (2.9 MB)`

- [ ] **Step 4: Manual verification**

Open `employee-seating-dashboard.html` in a browser. Go to "Офисы" tab. Edit any office. Verify:
- "Дата начала индексации" date field appears directly below "Индексация, %/год"
- Saving a date persists it (re-open the form → date is pre-filled)
- Clearing the date saves `null` (form shows empty)

- [ ] **Step 5: Commit, push, copy**

```bash
git add js/render.offices.js
git commit -m "feat: add indexationStartDate field to office edit form"
git push
```

Then copy to Documents:
```powershell
Copy-Item "employee-seating-dashboard.html" "\\mr.ru\Service\Personal\dononbaev_m\Documents\Фин модели. Приложение\employee-seating-dashboard.html"
```

---

## Self-Review

1. **Spec coverage:**
   - ✅ Date field on office edit form (Task 3)
   - ✅ Null → no indexation (Tasks 1+2)
   - ✅ Before date → base rate (Task 2, exponent=0)
   - ✅ From date → exponent = year−startYear+1 (Task 2)
   - ✅ Month-level proration by day (Task 2, `idxProrateDay`)
   - ✅ Tenant CF entries also carry `indexationStartDate` (Task 2 call sites)

2. **Placeholder scan:** All steps contain exact code. No TBD.

3. **Type consistency:** `indexationStartDate` used consistently as string `YYYY-MM-DD | null` across all three tasks.

4. **Breaking change documented:** The old `leaseStartDate`/`baseYear`-based exponent is removed. Existing offices with no `indexationStartDate` will show base rate (no growth) — this is intentional per user spec.

5. **Edge cases:**
   - `idxProrateDay = 1` → all days indexed → no proration needed → handled (only prorate when `idxProrateDay > 1`)
   - Lease start and indexation start in the same month → both prorations apply independently (lease proration applied after indexation proration)
   - `indexationPct = 0` → `Math.pow(1, n) = 1` → base rate regardless of date → correct
