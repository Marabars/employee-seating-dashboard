# CF Visualization — Grouped AS-IS/TO-BE + Tenants Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three CF charts (TO-BE offices, AS-IS offices, МР Групп) with two grouped charts — offices and tenants — each showing an AS IS bar and a TO BE bar per year (sub-labelled), stacked by office/tenant.

**Architecture:** Extend `renderStackedBarSVG` (only caller is `renderCFSection`) to render multiple stacked bars ("groups") per year with sub-labels; rewrite `renderCFSection` to build two grouped cards from `getScenarioCFData`.

**Tech Stack:** Vanilla JS ES5, inline SVG. Tests: jsdom in `ui-tests/`.

## Global Constraints

- Vanilla JS **ES5 ONLY**; SVG via `document.createElementNS`.
- Grouped year shape: `{ year, groups: [{ label, segments:[{key,name,value}] }] }`; single-bar back-compat: `{ year, segments:[...] }`.
- Each chart auto-scales to its own data (no shared scale).
- Colors: `officeColor(name) || PALETTE[i]`, keyed by row.id; same name → same color across phases.
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.

---

### Task 1: Grouped bars + two-card CF section

**Files:**
- Modify: `js/render.visualization.js` (`renderStackedBarSVG`, `renderCFSection`)
- Test: `ui-tests/cf-viz.test.js` (new, jsdom)

**Interfaces:**
- `renderStackedBarSVG(yearsData, colorFn, opts)` renders `groups` per year with `label` sub-labels.
- `renderCFSection(scenario)` returns a section with two `.viz-cf-card`s (offices, tenants).

- [ ] **Step 1: Write the failing test** — create `ui-tests/cf-viz.test.js`:

```js
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var shell = '<!DOCTYPE html><body><div id="dnd-live"></div><div id="topbar-status"></div>' +
  '<button id="btn-undo"></button><button id="btn-redo"></button><button id="btn-onboarding"></button><button id="btn-settings"></button>' +
  '<div id="viewonly-banner" style="display:none"></div><nav id="main-nav"></nav><aside id="scenarios-panel"></aside><main id="tab-content"></main></body>';
var dom = new JSDOM(shell, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
if (w.HTMLCanvasElement) { w.HTMLCanvasElement.prototype.getContext = function () { return { font: '', measureText: function (t) { return { width: t.length * 7 }; } }; }; }
['js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js', 'js/teams.js', 'js/employees.js',
 'js/calculations.js', 'js/allocations.js', 'js/cfEdit.js', 'js/validation.js', 'js/modals.js', 'js/render.js',
 'js/render.visualization.js', 'js/undoRedo.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, U = App.utils;
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 's1', cfSettings: { startYear: 2026, endYear: 2027 } },
  scenarios: [{ id: 's1', name: 'S', comment: '', cfOverride: null,
    offices: [
      { id: 't1', type: 'physical', phase: 'tobe', name: 'TobeA', area: 100, rentPerSqm: 1000, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z1', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 'te1', name: 'МР Групп', area: 40 }] },
      { id: 'a1', type: 'physical', phase: 'asis', name: 'AsisA', area: 100, rentPerSqm: 800, opexPerSqm: 0, indexationPct: 0, leaseStartDate: null, leaseEndDate: null, indexationStartDate: null, zones: [{ id: 'z2', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 'te2', name: 'МР Групп', area: 30 }] },
      { id: 'rem', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true }
    ], teams: [], employees: [], allocations: [] }] });
App.state.setActiveScenario('s1');
App.render.setActiveTab('visualization');
App.render.render();

console.log('CF viz: grouped office + tenant charts');
var tc = w.document.getElementById('tab-content');
var section = U.qsa('.viz-cf-section', tc)[0];
assert(!!section, 'CF section present');
var cards = U.qsa('.viz-cf-card', section);
assert(cards.length === 2, 'exactly two CF cards (offices + tenants) — got ' + cards.length);
var titles = cards.map(function (c) { return (U.qsa('.viz-cf-chart-title', c)[0] || {}).textContent || ''; });
assert(titles.filter(function (t) { return /офисам/i.test(t); }).length === 1, 'office chart card present');
assert(titles.filter(function (t) { return /арендатор/i.test(t); }).length === 1, 'tenant chart card present');
assert(titles.filter(function (t) { return /МР Групп/i.test(t); }).length === 0, 'МР Групп card removed');
// office chart SVG has AS IS / TO BE sub-labels
var texts = [];
U.qsa('svg text', cards[0]).forEach(function (t) { texts.push(t.textContent); });
assert(texts.indexOf('AS IS') > -1 && texts.indexOf('TO BE') > -1, 'office chart has AS IS / TO BE sub-labels');
var rects = U.qsa('svg rect', cards[0]);
assert(rects.length >= 2, 'office chart draws bars (rects) — got ' + rects.length);
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail** — `cd ui-tests && node cf-viz.test.js` → fails (three cards incl. МР Групп; no "AS IS"/"TO BE" sub-labels).

- [ ] **Step 3: Rewrite `renderStackedBarSVG`.** Replace the entire function (lines ~358–466) with:

```js
  function renderStackedBarSVG(yearsData, colorFn, opts) {
    var showTotals = opts && opts.showTotals;

    function groupsOf(yd) { return yd.groups ? yd.groups : [{ label: null, segments: yd.segments || [] }]; }
    function stackSum(segs) { return segs.reduce(function (a, s) { return a + (s.value > 0 ? s.value : 0); }, 0); }
    var hasLabels = yearsData.length && groupsOf(yearsData[0])[0].label != null;

    var svgW = 500; var svgH = 420;
    var padL = 60; var padR = 14; var padT = showTotals ? 36 : 20; var padB = hasLabels ? 64 : 50;
    var chartW = svgW - padL - padR;
    var chartH = svgH - padT - padB;

    var maxTotal = 0;
    yearsData.forEach(function (yd) {
      groupsOf(yd).forEach(function (g) { var s = stackSum(g.segments); if (s > maxTotal) { maxTotal = s; } });
    });

    var niceSteps = Math.max(1, Math.ceil((opts && opts.maxScale ? opts.maxScale : maxTotal) / 250));
    var maxScale = niceSteps * 250;

    var nCols = yearsData.length || 1;
    var colW = chartW / nCols;

    var NS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) { e.textContent = text; }
      return e;
    }

    var svg = svgEl('svg', { viewBox: '0 0 ' + svgW + ' ' + svgH, width: '100%' });
    svg.style.display = 'block'; svg.style.overflow = 'visible';

    for (var gi = 0; gi <= niceSteps; gi++) {
      var yVal = gi * 250;
      var yPx = padT + chartH * (1 - yVal / maxScale);
      svg.appendChild(svgEl('line', {
        x1: padL, x2: svgW - padR, y1: yPx, y2: yPx,
        stroke: gi === 0 ? 'rgba(128,128,128,0.45)' : 'rgba(128,128,128,0.18)',
        'stroke-dasharray': gi > 0 ? '4,3' : 'none'
      }));
      if (gi > 0) {
        svg.appendChild(svgEl('text', { x: padL - 5, y: yPx + 4, 'text-anchor': 'end', 'font-size': '11', fill: 'rgba(210,210,210,0.85)' }, String(yVal)));
      }
    }

    svg.appendChild(svgEl('text', {
      transform: 'translate(11,' + (padT + chartH / 2) + ') rotate(-90)',
      'text-anchor': 'middle', 'font-size': '10', fill: 'rgba(180,180,180,0.8)'
    }, 'млн. руб.'));

    var yBase = padT + chartH;
    yearsData.forEach(function (yd, bi) {
      var groups = groupsOf(yd);
      var nG = groups.length || 1;
      var groupAreaW = colW * 0.78;
      var gap = nG > 1 ? groupAreaW * 0.12 : 0;
      var barW = (groupAreaW - gap * (nG - 1)) / nG;
      var colStart = padL + bi * colW + (colW - groupAreaW) / 2;

      groups.forEach(function (grp, gj) {
        var barX = colStart + gj * (barW + gap);
        var yStack = 0;
        grp.segments.forEach(function (seg) {
          if (seg.value <= 0) { return; }
          var h = (seg.value / maxScale) * chartH;
          var rectY = yBase - yStack - h;
          var rect = svgEl('rect', { x: barX, y: rectY, width: barW, height: h, fill: colorFn(seg.key), rx: 2 });
          rect.appendChild(svgEl('title', {}, (seg.name || seg.key) + ': ' + seg.value.toFixed(1) + ' млн. руб.'));
          svg.appendChild(rect);
          if (h >= 16) {
            svg.appendChild(svgEl('text', {
              x: barX + barW / 2, y: rectY + h / 2 + 4, 'text-anchor': 'middle',
              'font-size': '11', fill: DARK_PURPLE, 'font-weight': 'bold'
            }, seg.value.toFixed(1)));
          }
          yStack += h;
        });
        if (showTotals && yStack > 0) {
          svg.appendChild(svgEl('text', {
            x: barX + barW / 2, y: yBase - yStack - 5, 'text-anchor': 'middle',
            'font-size': '11', fill: 'rgba(255,255,255,0.92)', 'font-weight': '600'
          }, stackSum(grp.segments).toFixed(2).replace('.', ',')));
        }
        if (grp.label) {
          svg.appendChild(svgEl('text', {
            x: barX + barW / 2, y: yBase + 14, 'text-anchor': 'middle',
            'font-size': '10', fill: 'rgba(210,210,210,0.85)'
          }, grp.label));
        }
      });

      svg.appendChild(svgEl('text', {
        x: padL + bi * colW + colW / 2, y: yBase + (hasLabels ? 30 : 16),
        'text-anchor': 'middle', 'font-size': '11', fill: 'rgba(210,210,210,0.85)'
      }, String(yd.year)));
    });

    svg.appendChild(svgEl('text', {
      x: padL + chartW / 2, y: svgH - 4, 'text-anchor': 'middle',
      'font-size': '10', fill: 'rgba(180,180,180,0.75)'
    }, 'Год'));

    return svg;
  }
```

- [ ] **Step 4: Rewrite `renderCFSection`.** Replace the entire function (lines ~481–574) with:

```js
  function renderCFSection(scenario) {
    var settings = App.state.getSettings();
    var cfSettings = (settings && settings.cfSettings) || {};
    var startY = cfSettings.startYear || 2026;
    var endY = cfSettings.endYear || 2030;
    var years = [];
    for (var y = startY; y <= endY; y++) { years.push(y); }

    var cfData = calc.getScenarioCFData(scenario, startY, endY);
    function yearIndex(yr) { return cfData.years.indexOf(yr); }
    function rowsOf(list, phase) {
      return list.filter(function (r) { return r.phase === phase && !r.isSubtotal; });
    }
    var tobeOfficeRows = rowsOf(cfData.officeRows, C.OFFICE_PHASE.TOBE);
    var asisOfficeRows = rowsOf(cfData.officeRows, C.OFFICE_PHASE.ASIS);
    var tobeTenantRows = rowsOf(cfData.tenantRows, C.OFFICE_PHASE.TOBE);
    var asisTenantRows = rowsOf(cfData.tenantRows, C.OFFICE_PHASE.ASIS);

    function buildColorMap(rowsArrays) {
      var map = {}; var i = 0;
      rowsArrays.forEach(function (rows) {
        rows.forEach(function (r) {
          if (map[r.id] === undefined) { map[r.id] = officeColor(r.name) || PALETTE[i % PALETTE.length]; i++; }
        });
      });
      return map;
    }
    var officeColorMap = buildColorMap([tobeOfficeRows, asisOfficeRows]);
    var tenantColorMap = buildColorMap([tobeTenantRows, asisTenantRows]);

    function segsFor(rows, idx) {
      return rows.map(function (r) { return { key: r.id, name: r.name, value: idx >= 0 ? (r.values[idx] || 0) : 0 }; });
    }
    function groupedData(asisRows, tobeRows) {
      return years.map(function (yr) {
        var idx = yearIndex(yr);
        return { year: yr, groups: [
          { label: 'AS IS', segments: segsFor(asisRows, idx) },
          { label: 'TO BE', segments: segsFor(tobeRows, idx) }
        ] };
      });
    }
    function legendOf(rowsArrays, colorMap) {
      var seen = {}; var items = [];
      rowsArrays.forEach(function (rows) {
        rows.forEach(function (r) {
          var k = (r.name || '').toLowerCase();
          if (!seen[k]) { seen[k] = true; items.push({ name: r.name, color: colorMap[r.id] }); }
        });
      });
      return items;
    }

    var section = U.el('div', { class: 'viz-cf-section' });
    section.appendChild(U.el('div', { class: 'viz-section-title', text: 'CF по аренде' }));
    var row = U.el('div', { class: 'viz-cf-row' });

    var card1 = U.el('div', { class: 'viz-cf-card' });
    card1.appendChild(U.el('div', { class: 'viz-cf-chart-title', text: 'CF по аренде по годам по офисам (AS IS / TO BE)' }));
    card1.appendChild(renderStackedBarSVG(groupedData(asisOfficeRows, tobeOfficeRows), function (key) { return officeColorMap[key] || '#aaa'; }, { showTotals: true }));
    card1.appendChild(renderChartLegend(legendOf([tobeOfficeRows, asisOfficeRows], officeColorMap)));

    var card2 = U.el('div', { class: 'viz-cf-card' });
    card2.appendChild(U.el('div', { class: 'viz-cf-chart-title', text: 'CF по аренде по годам по арендаторам (AS IS / TO BE)' }));
    card2.appendChild(renderStackedBarSVG(groupedData(asisTenantRows, tobeTenantRows), function (key) { return tenantColorMap[key] || '#aaa'; }, { showTotals: true }));
    card2.appendChild(renderChartLegend(legendOf([tobeTenantRows, asisTenantRows], tenantColorMap)));

    row.appendChild(card1);
    row.appendChild(card2);
    section.appendChild(row);
    return section;
  }
```

- [ ] **Step 5: Run → pass; build** — `node cf-viz.test.js` all pass. `python build.py`. Re-run `node <scratch>/run_tests.js .` (76/76) and the other ui-tests.

- [ ] **Step 6: Manual verify** — «Визуализация» CF block shows two cards; the office chart has two bars per year labelled AS IS / TO BE (stacked by office); the tenant chart likewise; no МР Групп card.

- [ ] **Step 7: Commit**

```bash
git add js/render.visualization.js employee-seating-dashboard.html ui-tests/cf-viz.test.js
git commit -m "feat: grouped AS-IS/TO-BE CF charts by office and by tenant; drop МР Групп chart"
```

---

## Self-Review

1. **Spec coverage:** МР Групп removed (renderCFSection no longer builds it); tenant chart added (card2, grouped by tenant); office chart merged into grouped AS IS/TO BE (card1); sub-labels via `grp.label`; independent scales (no `maxScale` passed). ✅
2. **Placeholder scan:** no TBD; full code. `<scratch>/run_tests.js` = session unit runner.
3. **Type consistency:** grouped year shape `{year, groups:[{label, segments}]}` produced by `groupedData` and consumed by `renderStackedBarSVG.groupsOf`; segment `{key,name,value}` unchanged; `legendOf` uses `colorMap[r.id]` matching `buildColorMap` keys.
4. **Line numbers** approximate; anchor on full-function replacement.
