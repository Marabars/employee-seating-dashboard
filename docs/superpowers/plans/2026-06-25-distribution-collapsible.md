# Distribution Tab — Collapsible Offices and Zones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the user to collapse/expand individual offices and individual zones on the "Распределение" tab to reduce visual noise when working with many offices.

**Architecture:** Two module-level state objects (`collapsedOffices`, `collapsedZones`) hold collapsed IDs. `renderOfficeTarget` checks these objects and conditionally renders zone content. Toggle buttons (▾/▸) on each office header and zone header trigger `R.render()`. No data model changes — purely presentation state.

**Tech Stack:** Vanilla JS ES5 (no arrow functions, no `const`/`let`, no template literals). DOM builder `U.el(tag, attrs, children)`. All state mutations via `state.commit()` for data; UI collapse state is module-level variables (not persisted).

## Global Constraints

- Vanilla JS ES5 ONLY — no arrow functions, no `const`/`let`, no template literals, no `class`, no destructuring
- DOM construction exclusively via `U.el(tag, attrs, children)` — never `innerHTML`
- No new files — all changes in `js/render.distribution.js` and `styles.css`
- Collapse state is module-level (resets on full page reload — intentional, not a bug)
- Default state: all offices and zones EXPANDED (same as today)
- Build: `python build.py` in the repo root produces `employee-seating-dashboard.html`
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`

---

### Task 1: Collapsible offices

**Files:**
- Modify: `js/render.distribution.js`

**What changes:**

Add two module-level state objects right below the existing `var expandedTeams = {};` declaration:

```js
var collapsedOffices = {};
var collapsedZones = {};
```

In `renderOfficeTarget(scenario, office, ctx)` (line ~170), change the office header so it has a collapse toggle button, and skip rendering zone boxes when the office is collapsed.

**Current office header (inside `renderOfficeTarget`):**

```js
var box = U.el('div', {
  class: 'drop-target office-target',
  dataset: { dropOffice: office.id },
  'aria-dropeffect': 'move'
}, [
  U.el('div', { class: 'target-head' }, [
    U.el('h3', { text: office.name }),
    U.el('span', { class: 'target-stat', text: occupied + ' / ' + capacity })
  ]),
  R.progressBar(occupied, capacity, ctx.thresholds),
  U.el('div', { class: 'target-free', text: R.freeOrOverflowText(capacity, occupied) })
]);

(office.zones || []).forEach(function (zone) {
  // ... zone rendering
  box.appendChild(zoneBox);
});
return box;
```

**New office rendering:**

```js
function renderOfficeTarget(scenario, office, ctx) {
  var capacity = calc.calculateOfficeCapacity(office);
  var occupied = calc.calculateOfficeOccupancy(scenario, office.id);
  var isCollapsed = !!collapsedOffices[office.id];

  var toggleBtn = R.iconBtn(isCollapsed ? '▸' : '▾', isCollapsed ? 'Раскрыть офис' : 'Свернуть офис',
    (function (oid, col) {
      return function (e) {
        e.stopPropagation();
        collapsedOffices[oid] = !col;
        R.render();
      };
    })(office.id, isCollapsed)
  );

  var box = U.el('div', {
    class: 'drop-target office-target',
    dataset: { dropOffice: office.id },
    'aria-dropeffect': 'move'
  }, [
    U.el('div', { class: 'target-head' }, [
      toggleBtn,
      U.el('h3', { text: office.name }),
      U.el('span', { class: 'target-stat', text: occupied + ' / ' + capacity })
    ]),
    R.progressBar(occupied, capacity, ctx.thresholds),
    U.el('div', { class: 'target-free', text: R.freeOrOverflowText(capacity, occupied) })
  ]);

  if (!isCollapsed) {
    (office.zones || []).forEach(function (zone) {
      var zOcc = calc.calculateZoneOccupancy(scenario, zone.id);
      var zoneBox = U.el('div', {
        class: 'drop-target zone-target' + (zone.isVipZone ? ' vip' : ''),
        dataset: { dropOffice: office.id, dropZone: zone.id },
        'aria-dropeffect': 'move'
      }, [
        U.el('div', { class: 'target-head' }, [
          U.el('span', { text: zone.name + (zone.isVipZone ? ' ★' : '') }),
          U.el('span', { class: 'target-stat', text: zOcc + ' / ' + (zone.capacity || 0) })
        ]),
        R.progressBar(zOcc, zone.capacity || 0, ctx.thresholds),
        U.el('div', { class: 'target-free', text: R.freeOrOverflowText(zone.capacity || 0, zOcc) })
      ]);
      allocationsIn(scenario, office.id, zone.id).forEach(function (a) {
        zoneBox.appendChild(allocationChip(scenario, a, ctx));
      });
      box.appendChild(zoneBox);
    });
  }
  return box;
}
```

- [ ] **Step 1: Add state variables**

In `js/render.distribution.js`, after line `var expandedTeams = {};` (currently line ~19), add:

```js
var collapsedOffices = {};
var collapsedZones = {};
```

- [ ] **Step 2: Replace `renderOfficeTarget` with the new version above**

Find the entire `renderOfficeTarget` function (lines ~170–208) and replace it with the new version shown above. The new version:
- Creates `isCollapsed` from `collapsedOffices[office.id]`
- Adds `toggleBtn` using `R.iconBtn` with a IIFE closure for the click handler
- Puts `toggleBtn` as the first child of `.target-head`
- Wraps the zone forEach in `if (!isCollapsed) { ... }`

- [ ] **Step 3: Build and verify manually**

```
cd C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard
python build.py
```

Open `employee-seating-dashboard.html` in a browser. Go to "Распределение" tab. Verify:
- Each office has a ▾ button in its header
- Clicking ▾ collapses the office (zones disappear), button becomes ▸
- Clicking ▸ expands it back
- Other offices are unaffected
- Drag-and-drop to the office box still works when collapsed (office-level drop target stays)

- [ ] **Step 4: Commit**

```bash
git add js/render.distribution.js
git commit -m "feat: collapsible offices on distribution tab"
```

---

### Task 2: Collapsible zones

**Files:**
- Modify: `js/render.distribution.js`

**What changes:**

Add a collapse toggle to each zone header. When collapsed, the allocation chips inside the zone are hidden (zone box stays as a drop target).

In the zone rendering block inside `renderOfficeTarget` (now inside the `if (!isCollapsed)` block from Task 1), add:

```js
var isZoneCollapsed = !!collapsedZones[zone.id];

var zoneToggleBtn = R.iconBtn(isZoneCollapsed ? '▸' : '▾', isZoneCollapsed ? 'Раскрыть зону' : 'Свернуть зону',
  (function (zid, zcol) {
    return function (e) {
      e.stopPropagation();
      collapsedZones[zid] = !zcol;
      R.render();
    };
  })(zone.id, isZoneCollapsed)
);

var zoneBox = U.el('div', {
  class: 'drop-target zone-target' + (zone.isVipZone ? ' vip' : ''),
  dataset: { dropOffice: office.id, dropZone: zone.id },
  'aria-dropeffect': 'move'
}, [
  U.el('div', { class: 'target-head' }, [
    zoneToggleBtn,
    U.el('span', { text: zone.name + (zone.isVipZone ? ' ★' : '') }),
    U.el('span', { class: 'target-stat', text: zOcc + ' / ' + (zone.capacity || 0) })
  ]),
  R.progressBar(zOcc, zone.capacity || 0, ctx.thresholds),
  U.el('div', { class: 'target-free', text: R.freeOrOverflowText(zone.capacity || 0, zOcc) })
]);

if (!isZoneCollapsed) {
  allocationsIn(scenario, office.id, zone.id).forEach(function (a) {
    zoneBox.appendChild(allocationChip(scenario, a, ctx));
  });
}
box.appendChild(zoneBox);
```

**Full updated zone block** (replace the zone forEach from Task 1 result):

```js
if (!isCollapsed) {
  (office.zones || []).forEach(function (zone) {
    var zOcc = calc.calculateZoneOccupancy(scenario, zone.id);
    var isZoneCollapsed = !!collapsedZones[zone.id];

    var zoneToggleBtn = R.iconBtn(isZoneCollapsed ? '▸' : '▾', isZoneCollapsed ? 'Раскрыть зону' : 'Свернуть зону',
      (function (zid, zcol) {
        return function (e) {
          e.stopPropagation();
          collapsedZones[zid] = !zcol;
          R.render();
        };
      })(zone.id, isZoneCollapsed)
    );

    var zoneBox = U.el('div', {
      class: 'drop-target zone-target' + (zone.isVipZone ? ' vip' : ''),
      dataset: { dropOffice: office.id, dropZone: zone.id },
      'aria-dropeffect': 'move'
    }, [
      U.el('div', { class: 'target-head' }, [
        zoneToggleBtn,
        U.el('span', { text: zone.name + (zone.isVipZone ? ' ★' : '') }),
        U.el('span', { class: 'target-stat', text: zOcc + ' / ' + (zone.capacity || 0) })
      ]),
      R.progressBar(zOcc, zone.capacity || 0, ctx.thresholds),
      U.el('div', { class: 'target-free', text: R.freeOrOverflowText(zone.capacity || 0, zOcc) })
    ]);

    if (!isZoneCollapsed) {
      allocationsIn(scenario, office.id, zone.id).forEach(function (a) {
        zoneBox.appendChild(allocationChip(scenario, a, ctx));
      });
    }
    box.appendChild(zoneBox);
  });
}
```

- [ ] **Step 1: Update zone rendering block inside `renderOfficeTarget`**

Replace the inner zone forEach (already wrapped in `if (!isCollapsed)`) with the full updated block above.

- [ ] **Step 2: Build and verify manually**

```
python build.py
```

Open `employee-seating-dashboard.html`. Go to "Распределение". Verify:
- Each zone has a ▾ button in its header
- Clicking ▾ collapses that zone (allocation chips disappear), button becomes ▸
- Zone is still a valid drop target when collapsed (can drag a team onto it)
- Collapsing a zone does not affect other zones or the parent office
- Collapsing the parent office also hides collapsed zones (they're just not rendered)

- [ ] **Step 3: Commit**

```bash
git add js/render.distribution.js
git commit -m "feat: collapsible zones on distribution tab"
```

---

### Task 3: CSS — toggle button styling

**Files:**
- Modify: `styles.css`

The `R.iconBtn` produces a `.icon-btn` element that already has base styling. The toggle buttons sit inside `.target-head`, which uses `display: flex`. No new classes are needed; however, the toggle button should have a slightly dimmer appearance to not compete with the office/zone name.

- [ ] **Step 1: Add CSS for collapse toggle buttons inside target headers**

Find the `.target-head` rule in `styles.css` and check it already has `display: flex; align-items: center; gap: 8px;`. If it does not have `gap`, add it. Then add one new rule:

```css
.target-head .icon-btn {
  font-size: 0.75em;
  opacity: 0.7;
  padding: 0 2px;
  min-width: 16px;
}
```

Add this rule immediately after the `.target-head` block.

- [ ] **Step 2: Build and verify**

```
python build.py
```

Check that toggle buttons look small and unobtrusive next to office/zone names.

- [ ] **Step 3: Commit, push, and copy**

```bash
git add styles.css
git commit -m "style: subtle toggle buttons in distribution target headers"
git push
```

Then copy `employee-seating-dashboard.html` to `\\mr.ru\Service\Personal\dononbaev_m\Documents\Фин модели. Приложение\employee-seating-dashboard.html`.

---

## Self-Review

1. **Spec coverage:** User asked for collapsible offices and zones — both covered (Tasks 1+2). CSS polish in Task 3.

2. **Placeholder scan:** All steps contain exact code to write. No TBD.

3. **Type consistency:** `collapsedOffices` and `collapsedZones` used consistently by `office.id` and `zone.id` respectively throughout. `R.iconBtn` signature matches existing usage in the file.

4. **ES5 compliance:** All code uses `var`, `function`, no arrow functions, no template literals — confirmed.

5. **Drop target preserved:** Both collapsed office box and collapsed zone box remain in the DOM with their `data-drop-*` attributes, so drag-and-drop still works.
