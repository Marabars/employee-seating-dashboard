# CF Dashboard & Visualization Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Finance tab, move all CF functionality to Dashboard money mode (including tenant tables), fix CF calculations to use day-level lease start precision with correct totals, and replace pie charts with horizontal bar charts on the Visualization tab.

**Architecture:** Four independent source files are modified in dependency order: app.js (nav hiding) → calculations.js (CF math fix) → render.dashboard.js (tenant CF + lease dates) → render.visualization.js (bar charts). Each task is self-contained and independently testable.

**Tech Stack:** Vanilla JS ES5, pure SVG (no libraries), existing `U.el()`/`R.cfTable()` DOM helpers, `state.commit()` for mutations, `python build.py` for bundle.

## Global Constraints

- **ES5 only** — no arrow functions, no `const`/`let`, no template literals, no `class`, no spread/rest, no destructuring
- **DOM**: use `U.el(tag, attrs, children)` exclusively — never set `innerHTML`
- **State mutations**: only via `state.commit(label, fn, opts)` — never mutate state directly
- **Build**: after each task run `python build.py` from the repo root — verify output ends with `Done! -> employee-seating-dashboard.html`
- **No external libraries** for visualization — pure inline SVG via `document.createElementNS`
- **Working directory**: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`

---

## File Map

| File | Change |
|------|--------|
| `js/app.js` | Add `hidden: true` to Finance tab; filter hidden tabs in `buildNav` |
| `js/calculations.js` | `cfForMonth` day precision; derive `values` from monthly sums; fix `rowTotal` |
| `js/render.dashboard.js` | Tenant CF tables per phase; lease start+end dates on all office cards |
| `js/render.visualization.js` | Full rewrite: horizontal bar charts, dual-phase toggle, top-10 teams |
| `styles.css` | Replace pie-chart viz styles with bar-chart styles |

---

### Task 1: Hide Finance tab from navigation

**Files:**
- Modify: `js/app.js:38-60`

**Interfaces:**
- Produces: Finance tab stays registered in `App.render.tabs` (so the tab renderer still works if navigated to directly), but `buildNav` skips it.

- [ ] **Step 1: Add `hidden` flag to Finance entry in TABS**

In `js/app.js`, find the TABS array (line 38) and change the finance entry:

```js
var TABS = [
  { id: 'dashboard',   label: 'Дашборд' },
  { id: 'distribution', label: 'Распределение' },
  { id: 'offices',     label: 'Офисы' },
  { id: 'teams',       label: 'Команды' },
  { id: 'employees',   label: 'Сотрудники' },
  { id: 'comparison',  label: 'Сравнение сценариев' },
  { id: 'reports',     label: 'Отчеты' },
  { id: 'finance',     label: 'Финансы', hidden: true },
  { id: 'visualization', label: 'Визуализация' }
];
```

- [ ] **Step 2: Filter hidden tabs in `buildNav`**

In `js/app.js`, find `buildNav` and add a guard at the top of the forEach:

```js
function buildNav() {
  var nav = U.qs('#main-nav');
  U.clear(nav);
  TABS.forEach(function (tab) {
    if (tab.hidden) { return; }
    var btn = U.el('button', {
      class: 'nav-tab',
      dataset: { tab: tab.id },
      onclick: function () { App.render.setActiveTab(tab.id); }
    }, tab.label);
    nav.appendChild(btn);
  });
}
```

- [ ] **Step 3: Build and verify**

```
python build.py
```

Expected: `Done! -> employee-seating-dashboard.html`. Open the HTML in a browser — verify "Финансы" tab is **gone** from the nav bar but the rest of the tabs appear normally.

- [ ] **Step 4: Commit**

```
git add js/app.js employee-seating-dashboard.html
git commit -m "feat: hide Finance tab from navigation (reversible via hidden flag)"
```

---

### Task 2: Fix CF calculations — day precision + correct row totals

**Files:**
- Modify: `js/calculations.js:551-703`

**Interfaces:**
- Consumes: `leaseStartDate` stored as `YYYY-MM-DD` string (or `YYYY-MM` for legacy data, or null)
- Produces:
  - `cfForMonth(area, rent, opex, idx, leaseStartDate, year, month, baseYear)` — returns 0 before lease start; pro-rated monthly value for the start month (day precision); full monthly value otherwise
  - `buildOfficeRow` derives `values` (per-year) from sum of `monthlyValues` — fixes the "Итого" column inflating annual totals
  - `buildTenantRows` same derivation

**Key bug being fixed:** Previously `values[i] = cfForYear(...)` returned the full 12-month annual cost regardless of when the lease started in that year. `rowTotal = sum(values)` was therefore inflated. The fix: compute `monthlyValues` first, then `values[i] = sum(monthlyValues[yr])`.

- [ ] **Step 1: Add `daysInMonth` helper just before `cfForYear`**

Find `cfForYear` at line ~551 and insert before it:

```js
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
```

- [ ] **Step 2: Rewrite `cfForMonth` with day precision**

Replace the entire `cfForMonth` function (currently lines ~572-582):

```js
function cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear) {
  if (leaseStartDate) {
    var lsStr = String(leaseStartDate);
    var lsYear  = parseInt(lsStr.substring(0, 4), 10);
    var lsMonth = parseInt(lsStr.substring(5, 7), 10);
    var lsDay   = parseInt(lsStr.substring(8, 10), 10) || 1;
    if (!isNaN(lsYear) && !isNaN(lsMonth)) {
      if (year < lsYear || (year === lsYear && month < lsMonth)) { return 0; }
      var monthly = cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear) / 12;
      if (year === lsYear && month === lsMonth && lsDay > 1) {
        var dim = daysInMonth(year, month);
        return monthly * (dim - lsDay + 1) / dim;
      }
      return monthly;
    }
  }
  return cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear) / 12;
}
```

- [ ] **Step 3: Rewrite `buildOfficeRow` to derive values from monthly sums**

Find `buildOfficeRow` inside `getScenarioCFData` (line ~603) and replace:

```js
function buildOfficeRow(office) {
  var baseYear = years[0];
  var monthlyValues = {};
  years.forEach(function (yr) {
    monthlyValues[yr] = [];
    for (var m = 1; m <= 12; m++) {
      monthlyValues[yr].push(cfForMonth(
        office.area, office.rentPerSqm, office.opexPerSqm,
        office.indexationPct, office.leaseStartDate, yr, m, baseYear
      ));
    }
  });
  var values = years.map(function (yr) {
    return monthlyValues[yr].reduce(function (s, v) { return s + v; }, 0);
  });
  return {
    name: office.name,
    phase: office.phase,
    values: values,
    monthlyValues: monthlyValues,
    rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
    isSubtotal: false
  };
}
```

- [ ] **Step 4: Rewrite `buildTenantRows` with the same monthly-first derivation**

Find `buildTenantRows` (line ~679) and replace the inner row builder:

```js
function buildTenantRows(offices, phase) {
  var baseYear = years[0];
  var entries = collectTenantEntries(offices);
  var rows = Object.keys(entries).map(function (name) {
    var parts = entries[name];
    var monthlyValues = {};
    years.forEach(function (yr) {
      monthlyValues[yr] = [];
      for (var m = 1; m <= 12; m++) {
        monthlyValues[yr].push(parts.reduce(function (s, p) {
          return s + cfForMonth(
            p.area, p.rentPerSqm, p.opexPerSqm,
            p.indexationPct, p.leaseStartDate, yr, m, baseYear
          );
        }, 0));
      }
    });
    var values = years.map(function (yr) {
      return monthlyValues[yr].reduce(function (s, v) { return s + v; }, 0);
    });
    return {
      name: name,
      phase: phase,
      values: values,
      monthlyValues: monthlyValues,
      rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
      isSubtotal: false
    };
  });
  rows.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return rows;
}
```

Note: `subtotalRow` does NOT need changes — it already sums `r.values[i]` across rows, and those values are now monthly-derived, so the sum is correct.

- [ ] **Step 5: Open `tests.html` in a browser to verify unit tests still pass**

Open `tests.html` directly in a browser. All tests should be green. If any fail, fix before proceeding.

- [ ] **Step 6: Build and verify**

```
python build.py
```

Expected: `Done! -> employee-seating-dashboard.html`. Open the HTML, go to Dashboard → switch to "₽ Деньги (аренда)" → expand a year to months. Verify that the sum of displayed months equals the year column value. For an office with leaseStartDate of e.g. "2025-10-15":
- Year 2025: Jan–Sep = 0, Oct = ~52% of monthly rate, Nov = full month, Dec = full month
- Year column 2025 = sum of those 3 partial/full months (NOT the full annual rate)

- [ ] **Step 7: Commit**

```
git add js/calculations.js employee-seating-dashboard.html
git commit -m "fix: CF calculations use day-level lease precision; derive year values from monthly sums"
```

---

### Task 3: Dashboard — tenant CF tables + lease start date on office cards

**Files:**
- Modify: `js/render.dashboard.js`

**Interfaces:**
- Consumes: `calc.getScenarioCFData(scenario, startYear, endYear)` — returns `{ years, officeRows, tenantRows, asisTenantRows, tobeTenantRows }`. Note: `tenantRows` contains rows for BOTH phases with `phase` field = `C.OFFICE_PHASE.ASIS` or `C.OFFICE_PHASE.TOBE`.
- Consumes: `office.leaseStartDate` (string `YYYY-MM-DD` or null), `office.leaseEndDate` (same)
- Produces: no new public API

**Important:** Check the actual return shape of `getScenarioCFData`. The `tenantRows` array is the combined array (asis + subtotal + tobe + subtotal). Filter by `r.phase === phase` to get per-phase rows. Do NOT include subtotal rows in the per-phase filter — subtotals have the same `phase` field, so they will appear automatically when included (they have `isSubtotal: true` which the `cfTable` renderer handles correctly).

- [ ] **Step 1: Add `dashExpandedTenantCFYears` module variable**

Find the module-level variables block at the top of the IIFE (lines ~18-28), add after `dashExpandedCFYears`:

```js
var dashExpandedTenantCFYears = {};
```

- [ ] **Step 2: Add `buildDashTenantCFTable` function**

Add this function immediately after the existing `buildDashCFTable` function (after line ~157):

```js
function buildDashTenantCFTable(scenario, phase, startYear, endYear) {
  var data = calc.getScenarioCFData(scenario, startYear, endYear);
  if (data.years.length === 0) { return null; }
  var phaseRows = data.tenantRows.filter(function (r) { return r.phase === phase; });
  if (phaseRows.length === 0) { return null; }
  var wrap = U.el('div', { class: 'dash-cf-block' });
  var phaseLabel = phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
  wrap.appendChild(U.el('div', { class: 'section-title', text: 'CF по арендаторам ' + phaseLabel + ' (млн руб./год)' }));
  wrap.appendChild(R.cfTable({
    rows: phaseRows,
    years: data.years,
    expandedYears: dashExpandedTenantCFYears,
    onToggleYear: function (yr) {
      dashExpandedTenantCFYears[yr] = !dashExpandedTenantCFYears[yr];
      R.render();
    },
    firstColLabel: 'Арендатор',
    showPhaseHeaders: false
  }));
  return wrap;
}
```

- [ ] **Step 3: Add tenant CF table calls in `renderOfficesBlock`**

Find the TO BE section (around line ~207-215):

```js
if (tobe.length && !hideTobe) {
  panel.appendChild(U.el('h3', { class: 'phase-head phase-tobe', text: 'TO BE — план переезда' }));
  var gT = U.el('div', { class: 'office-grid' });
  tobe.forEach(function (o) { gT.appendChild(renderOfficeCard(scenario, o, ctx)); });
  panel.appendChild(gT);
  if (moneyMode && cf) {
    var cfDataTobe = buildDashCFTable(scenario, C.OFFICE_PHASE.TOBE, cf.startYear, cf.endYear);
    if (cfDataTobe) { panel.appendChild(cfDataTobe); }
    var cfTenantTobe = buildDashTenantCFTable(scenario, C.OFFICE_PHASE.TOBE, cf.startYear, cf.endYear);
    if (cfTenantTobe) { panel.appendChild(cfTenantTobe); }
  }
}
```

And for the AS IS section (around line ~217-225):

```js
if (asis.length && !hideAsis) {
  panel.appendChild(U.el('h3', { class: 'phase-head phase-asis', text: 'AS IS — как есть' }));
  var gA = U.el('div', { class: 'office-grid' });
  asis.forEach(function (o) { gA.appendChild(renderOfficeCard(scenario, o, ctx)); });
  panel.appendChild(gA);
  if (moneyMode && cf) {
    var cfDataAsis = buildDashCFTable(scenario, C.OFFICE_PHASE.ASIS, cf.startYear, cf.endYear);
    if (cfDataAsis) { panel.appendChild(cfDataAsis); }
    var cfTenantAsis = buildDashTenantCFTable(scenario, C.OFFICE_PHASE.ASIS, cf.startYear, cf.endYear);
    if (cfTenantAsis) { panel.appendChild(cfTenantAsis); }
  }
}
```

- [ ] **Step 4: Update office card to show both lease dates for all phases**

Find the lease date block in `renderOfficeCard` (around line ~289-294):

```js
if (office.phase === C.OFFICE_PHASE.ASIS && office.leaseEndDate) {
  card.appendChild(U.el('div', { class: 'office-card-lease' }, [
    U.el('span', { text: 'Дата окончания договора:' }),
    U.el('span', { class: 'office-card-lease-date', text: office.leaseEndDate })
  ]));
}
```

Replace with (shows both dates, for any phase that has them):

```js
if (office.leaseStartDate || office.leaseEndDate) {
  var leaseParts = [];
  if (office.leaseStartDate) {
    leaseParts.push(U.el('span', { class: 'lease-label', text: 'Начало: ' }));
    leaseParts.push(U.el('span', { class: 'office-card-lease-date', text: office.leaseStartDate }));
  }
  if (office.leaseStartDate && office.leaseEndDate) {
    leaseParts.push(U.el('span', { class: 'lease-sep', text: ' — ' }));
  }
  if (office.leaseEndDate) {
    leaseParts.push(U.el('span', { class: 'lease-label', text: 'Окончание: ' }));
    leaseParts.push(U.el('span', { class: 'office-card-lease-date', text: office.leaseEndDate }));
  }
  card.appendChild(U.el('div', { class: 'office-card-lease' }, leaseParts));
}
```

- [ ] **Step 5: Build and verify**

```
python build.py
```

Open the HTML. On Dashboard → money mode → both phases should now show:
1. Office CF table per phase
2. **New** Tenant CF table per phase (visible only if tenants/offices have rates)
3. Office cards show lease start and end dates (not just end, not just AS IS)

- [ ] **Step 6: Commit**

```
git add js/render.dashboard.js employee-seating-dashboard.html
git commit -m "feat: tenant CF tables on dashboard; lease start+end dates on all office cards"
```

---

### Task 4: Visualization — horizontal bar charts with dual-phase toggle

**Files:**
- Modify: `js/render.visualization.js` (full rewrite)
- Modify: `styles.css` (replace pie styles with bar styles)

**Interfaces:**
- Consumes: `calc.calculateOfficeCapacity(office)`, `seatsForTeamInOffice(scenario, teamId, officeId)` (keep existing), `team.color` (keep palette fallback)
- Produces: `App.render.registerTab('visualization', ...)` — same registration, different renderer

**Behavior:**
- Both AS IS and TO BE sections rendered simultaneously (like dashboard)
- `hideVizAsis` / `hideVizTobe` module flags with toggle buttons (same UX as dashboard phase toggles)
- Each office = one card with a horizontal SVG bar
- Top 10 teams sorted by seats descending per office; teams beyond 10 are silently excluded
- Bar = background "capacity" rect + colored team rects on top
- Legend below bar: color dot, team name, seat count (no percentage)
- Empty office (0 allocations): card shown with a message "Нет размещений" instead of bar

**SVG approach:** `viewBox="0 0 1000 36"` — 1000 coordinate units wide, 36 high. Background rect full width (muted color). Team rects accumulate from x=0. Scale: `segWidth = (seats / total) * 1000`.

- [ ] **Step 1: Replace viz CSS in `styles.css`**

Find the existing viz styles block (lines ~936-947) and replace:

```css
/* ── Visualization tab ───────────────────────────────────────────────────── */
.viz-section-head { font-size: 0.8rem; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-muted); margin: 20px 0 8px; padding-bottom: 6px;
  border-bottom: 1px solid var(--border); }
.viz-office-card { background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.viz-office-title { font-weight: 600; font-size: 1em; margin-bottom: 2px; }
.viz-office-meta { font-size: 0.8em; color: var(--text-muted); margin-bottom: 12px; }
.viz-bar-wrap { width: 100%; overflow: hidden; border-radius: 6px; margin-bottom: 12px; }
.viz-bar-svg { display: block; width: 100%; height: 36px; border-radius: 6px; }
.viz-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 4px; }
.viz-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.82em; }
.viz-legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
.viz-legend-name { color: var(--text); }
.viz-legend-seats { color: var(--text-muted); }
.viz-empty { color: var(--text-muted); font-style: italic; padding: 4px 0; }
```

- [ ] **Step 2: Rewrite `js/render.visualization.js`**

Replace the entire file content with:

```js
/**
 * render.visualization.js
 * "Визуализация" tab: horizontal stacked-bar charts per office,
 * with independent AS IS / TO BE section toggles.
 * Top 10 teams by seats shown per office, sorted descending.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;

  var hideVizAsis = false;
  var hideVizTobe = false;

  var PALETTE = [
    '#4f8ef7','#f7934f','#4fcc7a','#f74f7a','#c74ff7',
    '#f7d94f','#4ff7e8','#f74fc4','#7af74f','#f7574f',
    '#4f74f7','#f7b24f','#a04ff7','#4ff7a0'
  ];

  function teamColor(team, index) {
    return (team.color && team.color !== '#000000') ? team.color : PALETTE[index % PALETTE.length];
  }

  function seatsForTeamInOffice(scenario, teamId, officeId) {
    var teamSeats = 0;
    var namedCount = 0;
    (scenario.allocations || []).forEach(function (a) {
      if (a.targetOfficeId !== officeId || a.teamId !== teamId) { return; }
      if (a.type === C.ALLOCATION_TYPE.TEAM) {
        teamSeats += (a.employeesCount || 0);
      } else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
        namedCount += 1;
      }
    });
    return Math.max(teamSeats, namedCount);
  }

  function getOfficeBarData(scenario, office) {
    var allEntries = [];
    (scenario.teams || []).forEach(function (team, idx) {
      var seats = seatsForTeamInOffice(scenario, team.id, office.id);
      if (seats > 0) {
        allEntries.push({ name: team.name, seats: seats, color: teamColor(team, idx) });
      }
    });
    allEntries.sort(function (a, b) { return b.seats - a.seats; });
    var top10 = allEntries.slice(0, 10);
    var capacity = calc.calculateOfficeCapacity(office);
    var total = capacity === Infinity ? allEntries.reduce(function (s, e) { return s + e.seats; }, 0) : capacity;
    var occupied = allEntries.reduce(function (s, e) { return s + e.seats; }, 0);
    return { entries: top10, total: total, occupied: occupied };
  }

  function renderBar(entries, total) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'viz-bar-svg');
    svg.setAttribute('viewBox', '0 0 1000 36');
    svg.setAttribute('preserveAspectRatio', 'none');

    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', '1000'); bg.setAttribute('height', '36');
    bg.setAttribute('fill', 'rgba(255,255,255,0.07)');
    svg.appendChild(bg);

    if (total <= 0) { return svg; }

    var offset = 0;
    entries.forEach(function (entry) {
      var w = Math.max(1, (entry.seats / total) * 1000);
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(offset));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', '36');
      rect.setAttribute('fill', entry.color);
      var title = document.createElementNS(NS, 'title');
      title.textContent = entry.name + ': ' + entry.seats + ' мест';
      rect.appendChild(title);
      svg.appendChild(rect);
      offset += w;
    });
    return svg;
  }

  function renderLegend(entries) {
    var wrap = U.el('div', { class: 'viz-legend' });
    entries.forEach(function (entry) {
      var dot = U.el('span', { class: 'viz-legend-dot' });
      dot.style.background = entry.color;
      wrap.appendChild(U.el('div', { class: 'viz-legend-item' }, [
        dot,
        U.el('span', { class: 'viz-legend-name', text: entry.name }),
        U.el('span', { class: 'viz-legend-seats', text: entry.seats + ' м.' })
      ]));
    });
    return wrap;
  }

  function renderOfficeCard(scenario, office) {
    var data = getOfficeBarData(scenario, office);
    var capacity = calc.calculateOfficeCapacity(office);
    var capLabel = capacity === Infinity ? '∞' : String(capacity);

    var card = U.el('div', { class: 'viz-office-card' });
    card.appendChild(U.el('div', { class: 'viz-office-title', text: office.name }));
    card.appendChild(U.el('div', {
      class: 'viz-office-meta',
      text: 'Занято: ' + data.occupied + ' / ' + capLabel + ' мест'
    }));

    if (data.entries.length === 0) {
      card.appendChild(U.el('div', { class: 'viz-empty', text: 'Нет размещений' }));
      return card;
    }

    card.appendChild(U.el('div', { class: 'viz-bar-wrap' }, [renderBar(data.entries, data.total)]));
    card.appendChild(renderLegend(data.entries));
    return card;
  }

  function renderPhaseSection(scenario, phase, label, hide) {
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('div', { class: 'viz-section-head', text: label }));
    if (hide) { return wrap; }
    var offices = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL && o.phase === phase;
    });
    if (offices.length === 0) {
      wrap.appendChild(U.el('p', { class: 'muted', text: 'Нет офисов для данной фазы.' }));
      return wrap;
    }
    offices.forEach(function (office) {
      wrap.appendChild(renderOfficeCard(scenario, office));
    });
    return wrap;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;

    var phaseToggles = U.el('div', { class: 'phase-vis-toggles', style: 'margin-bottom:16px;' });
    var tobeBtn = U.el('button', {
      class: 'btn btn-sm ' + (hideVizTobe ? 'btn-secondary' : 'btn-primary') + ' phase-vis-btn',
      title: hideVizTobe ? 'Показать TO BE' : 'Скрыть TO BE',
      onclick: function () { hideVizTobe = !hideVizTobe; R.render(); }
    }, (hideVizTobe ? '▸' : '▾') + ' TO BE');
    var asisBtn = U.el('button', {
      class: 'btn btn-sm ' + (hideVizAsis ? 'btn-secondary' : 'btn-primary') + ' phase-vis-btn',
      title: hideVizAsis ? 'Показать AS IS' : 'Скрыть AS IS',
      onclick: function () { hideVizAsis = !hideVizAsis; R.render(); }
    }, (hideVizAsis ? '▸' : '▾') + ' AS IS');
    phaseToggles.appendChild(tobeBtn);
    phaseToggles.appendChild(asisBtn);
    container.appendChild(phaseToggles);

    container.appendChild(renderPhaseSection(scenario, C.OFFICE_PHASE.TOBE, 'TO BE', hideVizTobe));
    container.appendChild(renderPhaseSection(scenario, C.OFFICE_PHASE.ASIS, 'AS IS', hideVizAsis));
  }

  App.render.registerTab('visualization', { label: 'Визуализация', render: render });
})();
```

**Note on Unicode escapes:** The Cyrillic text strings use Unicode escapes (`Занято` = "Занято", etc.) to avoid encoding issues. Alternatively you can write the strings directly in Cyrillic — both are valid in ES5.

- [ ] **Step 3: Build and verify**

```
python build.py
```

Open the HTML → Visualization tab. Verify:
1. Both AS IS and TO BE sections appear
2. Each section has toggle buttons
3. Each office has a horizontal colored bar card
4. Legend shows team names + seat counts
5. Office with no allocations shows "Нет размещений" (but card still renders)
6. Toggling AS IS / TO BE hides/shows that section

- [ ] **Step 4: Commit**

```
git add js/render.visualization.js styles.css employee-seating-dashboard.html
git commit -m "feat: replace pie charts with horizontal bar charts on visualization tab"
```

---

### Task 5: Final build, push, copy to user folder

- [ ] **Step 1: Final rebuild**

```
python build.py
```

Expected: `Done! -> employee-seating-dashboard.html`

- [ ] **Step 2: Push to GitHub**

```
git push origin main
```

- [ ] **Step 3: Copy to user folder**

```
copy employee-seating-dashboard.html "\\mr.ru\Service\Personal\dononbaev_m\Documents\Фин модели. Приложение\employee-seating-dashboard.html"
```

---

## Self-Review

**Spec coverage:**
1. ✅ Hide Finance tab — Task 1
2. ✅ CF by tenants on dashboard per phase — Task 3 `buildDashTenantCFTable`
3. ✅ Fix rowTotal bug (annual rate instead of monthly sum) — Task 2 `buildOfficeRow`
4. ✅ Day-level lease precision (Oct 15 = 15/31 of monthly) — Task 2 `cfForMonth`
5. ✅ Horizontal bar charts — Task 4
6. ✅ AS IS / TO BE toggles preserved on Visualization — Task 4 `hideVizAsis/hideVizTobe`
7. ✅ Top 10 teams by seats descending — Task 4 `getOfficeBarData` `.sort() .slice(0, 10)`
8. ✅ Teams beyond top 10 not shown — Task 4 (no "other" segment)
9. ✅ Lease start date shown on dashboard cards — Task 3 Step 4
10. ✅ Lease start date in office form — already exists in `render.offices.js:206`, no change needed

**No placeholders found.**

**Type consistency:** `dashExpandedTenantCFYears` defined in Task 3 Step 1, used in Task 3 Step 2. `hideVizAsis`/`hideVizTobe` defined at module level in Task 4 and used only in Task 4. `cfForMonth` signature unchanged. ✅
