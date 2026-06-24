# Finance CF Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить к каждому офису дату начала аренды и арендаторов (с разбивкой площади), и вывести новую вкладку "Финансы" с таблицами Cash Flow по офисам и по арендаторам с учётом ежегодной индексации.

**Architecture:** Расширяем модель офиса двумя новыми полями: `leaseStartDate` (строка 'YYYY-MM-DD') и `tenants` (массив `{id, name, area}`). CF рассчитывается как `area × (rent + opex) × (1 + idx%)^n` где `n` — число полных лет от `leaseStartDate` до проекционного года. Новая вкладка "Финансы" рендерит две таблицы (по офисам и по арендаторам) с горизонтом, заданным в настройках проекта.

**Tech Stack:** Vanilla JS (ES5, no modules), same build pipeline (`python build.py` inlines all JS/CSS into `employee-seating-dashboard.html`).

## Global Constraints

- Vanilla JS ES5 — никаких стрелочных функций, `const`/`let`, template literals, spread/rest
- Все изменения в `js/` подхватываются `build.py` через `<script src="...">` в `index.html`
- Новый файл регистрируется через `App.render.registerTab(id, { label, render })`
- Данные офиса хранятся в `scenario.offices[]`, мутации только через `state.commit()`
- Суммы CF отображаются в млн руб., 2 знака после запятой
- `build.py` запускать после каждого Task

---

## Файлы, затрагиваемые в плане

| Файл | Действие | Что меняется |
|------|----------|-------------|
| `js/state.js` | Modify | `createOffice()` + `normalizeProject()` — добавить `leaseStartDate`, `tenants`, `cfSettings` |
| `js/offices.js` | Modify | `updateOffice()` — обработать новые поля |
| `js/constants.js` | Modify | `EXCEL_HEADERS.offices` — добавить `lease_start_date` |
| `js/render.offices.js` | Modify | `openOfficeForm()` — поля даты начала + редактор арендаторов |
| `js/calculations.js` | Modify | Добавить `calculateOfficeCF`, `calculateTenantsCF`, `getScenarioCFData` |
| `js/render.finance.js` | **Create** | Новая вкладка "Финансы" — CF таблицы + настройка горизонта |
| `index.html` | Modify | Добавить `<script src="js/render.finance.js">` |
| `styles.css` | Modify | Стили для CF таблиц |

---

### Task 1: Data model — leaseStartDate, tenants, cfSettings

**Files:**
- Modify: `js/state.js`
- Modify: `js/offices.js`
- Modify: `js/constants.js`

**Interfaces:**
- Produces: офис с полями `leaseStartDate: string|null`, `tenants: [{id,name,area}]`; настройки проекта с `cfSettings: {startYear, endYear}`

- [ ] **Step 1: Обновить `createOffice` в state.js**

Найти функцию `createOffice(phase, data)` (≈строка 58) и добавить новые поля:

```js
function createOffice(phase, data) {
  data = data || {};
  var office = {
    id: U.genId('office'),
    type: C.OFFICE_TYPE.PHYSICAL,
    phase: phase === C.OFFICE_PHASE.ASIS ? C.OFFICE_PHASE.ASIS : C.OFFICE_PHASE.TOBE,
    name: data.name || 'Офис',
    area: U.toNonNegativeInt(data.area),
    isDraft: !!data.isDraft,
    comment: data.comment || '',
    zones: [],
    rentPerSqm: (data.rentPerSqm === undefined || data.rentPerSqm === '') ? null : Number(data.rentPerSqm),
    opexPerSqm: (data.opexPerSqm === undefined || data.opexPerSqm === '') ? null : Number(data.opexPerSqm),
    indexationPct: (data.indexationPct === undefined || data.indexationPct === '') ? null : Number(data.indexationPct),
    leaseEndDate: data.leaseEndDate || null,
    leaseStartDate: data.leaseStartDate || null,          // NEW
    tenants: Array.isArray(data.tenants) ? data.tenants : []  // NEW
  };
  (data.zones || []).forEach(function (z) {
    office.zones.push(makeZoneObject(z));
  });
  if (office.zones.length === 0) {
    office.zones.push(createDefaultOpenSpaceZone());
  }
  return office;
}
```

- [ ] **Step 2: Обновить `createDefaultProject` — добавить cfSettings**

В функции `createDefaultProject` (≈строка 111), добавить `cfSettings` в settings:

```js
function createDefaultProject() {
  var scenario = createScenario('Базовый сценарий', '');
  var yr = new Date().getFullYear();
  return {
    projectVersion: '1.0.0',
    appName: 'Дашборд рассадки сотрудников',
    settings: {
      thresholds: {
        greenMaxPercent: C.DEFAULT_THRESHOLDS.greenMaxPercent,
        yellowMaxPercent: C.DEFAULT_THRESHOLDS.yellowMaxPercent
      },
      'export': { includePersonalDataInPdf: false },
      autosaveEnabled: false,
      viewOnlyMode: false,
      showMoveProgress: false,
      cfSettings: { startYear: yr, endYear: yr + 4 },   // NEW
      lastSelectedScenarioId: scenario.id
    },
    scenarios: [scenario]
  };
}
```

- [ ] **Step 3: Обновить `normalizeProject` — заполнить новые поля офиса и cfSettings**

В функции `normalizeProject` (≈строка 274), в блоке нормализации физических офисов (`s.offices.forEach`) добавить после `if (o.leaseEndDate === undefined)`:

```js
if (o.leaseStartDate === undefined) { o.leaseStartDate = null; }
if (!Array.isArray(o.tenants)) { o.tenants = []; }
```

В том же `normalizeProject`, после блока `p.settings.showMoveProgress`:

```js
if (!p.settings.cfSettings || typeof p.settings.cfSettings.startYear !== 'number') {
  var yr = new Date().getFullYear();
  p.settings.cfSettings = { startYear: yr, endYear: yr + 4 };
}
```

- [ ] **Step 4: Обновить `updateOffice` в offices.js**

Найти `updateOffice` (≈строка 46) и добавить обработку новых полей после блока `leaseEndDate`:

```js
if (data.leaseStartDate !== undefined) {
  office.leaseStartDate = data.leaseStartDate || null;
}
if (data.tenants !== undefined) {
  office.tenants = Array.isArray(data.tenants) ? data.tenants : [];
}
```

- [ ] **Step 5: Добавить `lease_start_date` в EXCEL_HEADERS в constants.js**

Найти `EXCEL_HEADERS.offices` и добавить поле:

```js
offices: {
  office_name: ['office_name', 'название офиса'],
  office_type: ['office_type', 'тип офиса', 'фаза', 'phase'],
  area: ['area', 'площадь'],
  capacity: ['capacity', 'вместимость'],
  cabinet_capacity: ['cabinet_capacity', 'кабинеты'],
  open_space_capacity: ['open_space_capacity', 'опенспейс'],
  vip_capacity: ['vip_capacity', 'vip-кабинеты'],
  rent_per_sqm: ['rent_per_sqm', 'аренда', 'аренда руб/м2', 'аренда, ₽/м²'],
  opex_per_sqm: ['opex_per_sqm', 'эксплуатация', 'эксплуатация руб/м2', 'эксплуатация, ₽/м²'],
  indexation_pct: ['indexation_pct', 'индексация', 'индексация %'],
  lease_start_date: ['lease_start_date', 'дата начала аренды'],  // NEW
  is_draft: ['is_draft', 'черновик'],
  comment: ['comment', 'комментарий']
},
```

- [ ] **Step 6: Build и commit**

```bash
cd C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard
python build.py
git add js/state.js js/offices.js js/constants.js employee-seating-dashboard.html
git commit -m "feat: add leaseStartDate, tenants, cfSettings to data model"
```

---

### Task 2: Office form UI — leaseStartDate + tenant editor

**Files:**
- Modify: `js/render.offices.js`

**Interfaces:**
- Consumes: `office.leaseStartDate`, `office.tenants`, `scenario.offices` (для datalist)
- Produces: форма сохраняет `leaseStartDate` и `tenants: [{id,name,area}]` через `O.updateOffice`

- [ ] **Step 1: Добавить поле leaseStartDate в `openOfficeForm`**

В функции `openOfficeForm` (≈строка 197), после строки с `leaseEndInput`:

```js
var leaseStartInput = dateField('Дата начала договора аренды', office ? office.leaseStartDate : '', 'leaseStartDate');
body.appendChild(leaseStartInput.wrap);
```

Вставить ПЕРЕД `leaseEndInput`, чтобы порядок был: начало → конец.

Итоговый порядок полей в теле формы:
```
nameInput → areaInput → leaseStartInput → leaseEndInput → phaseSelect → rentInput → opexInput → idxInput
```

- [ ] **Step 2: Добавить редактор арендаторов в `openOfficeForm`**

После блока `idxInput` (до `// Zones editor`), добавить редактор арендаторов:

```js
// ---- Tenants editor ----------------------------------------
// Collect unique tenant names from all offices in the scenario for datalist
var allTenantNames = [];
var seenNames = {};
var currentScenario = App.state.getActiveScenario();
(currentScenario.offices || []).forEach(function (o) {
  (o.tenants || []).forEach(function (t) {
    if (t.name && !seenNames[t.name]) {
      seenNames[t.name] = true;
      allTenantNames.push(t.name);
    }
  });
});

var tenantDatalistId = 'tenant-names-list-' + (office ? office.id : 'new');
var datalist = U.el('datalist', { id: tenantDatalistId });
allTenantNames.forEach(function (n) {
  datalist.appendChild(U.el('option', { value: n }));
});
body.appendChild(datalist);

// Working copy of tenants
var tenants = (office && Array.isArray(office.tenants) ? office.tenants : [])
  .map(function (t) { return { id: t.id || U.genId('tenant'), name: t.name || '', area: t.area || 0 }; });

body.appendChild(U.el('h4', { text: 'Арендаторы' }));
var tenantsWrap = U.el('div', { class: 'form-tenants' });
body.appendChild(tenantsWrap);

function rebuildTenants() {
  U.clear(tenantsWrap);
  if (tenants.length === 0) {
    tenantsWrap.appendChild(U.el('div', { class: 'muted', text: 'Нет арендаторов — используется вся площадь офиса.' }));
  }
  tenants.forEach(function (t, i) {
    var row = U.el('div', { class: 'form-tenant-row' });

    var nameInp = U.el('input', {
      type: 'text', value: t.name,
      placeholder: 'Арендатор', list: tenantDatalistId
    });
    nameInp.addEventListener('input', function () { t.name = nameInp.value; });

    var areaInp = U.el('input', {
      type: 'number', min: '0', step: 'any', value: t.area || '',
      placeholder: 'Площадь, м²'
    });
    areaInp.addEventListener('input', function () { t.area = parseFloat(areaInp.value) || 0; });

    var del = R.iconBtn('🗑', 'Удалить арендатора', function () {
      tenants.splice(i, 1);
      rebuildTenants();
    });
    row.appendChild(nameInp);
    row.appendChild(U.el('span', { class: 'muted', text: 'м²' }));
    row.appendChild(areaInp);
    row.appendChild(del);
    tenantsWrap.appendChild(row);
  });

  var addBtn = U.el('button', { class: 'btn btn-sm btn-secondary', type: 'button', onclick: function () {
    tenants.push({ id: U.genId('tenant'), name: '', area: 0 });
    rebuildTenants();
  } }, '+ Арендатор');
  tenantsWrap.appendChild(addBtn);
}
rebuildTenants();
// ---- end Tenants editor ------------------------------------
```

- [ ] **Step 3: Добавить сохранение полей в onSubmit**

В блоке `{ label: 'Сохранить', kind: 'primary', onClick: function () {`, добавить `leaseStartDate` и `tenants` в объект `data`:

```js
var data = {
  name: nameInput.input.value,
  area: areaInput.input.value,
  leaseStartDate: leaseStartInput.input.value || null,   // NEW
  leaseEndDate: leaseEndInput.input.value || null,
  rentPerSqm: rentInput.input.value,
  opexPerSqm: opexInput.input.value,
  indexationPct: idxInput.input.value,
  comment: commentInput.input.value,
  isDraft: draftInput.input.checked,
  zones: zones,
  tenants: tenants.filter(function (t) { return t.name; }),  // NEW — skip empty rows
  phase: phaseSelect.value
};
```

- [ ] **Step 4: Добавить CSS стили для строк арендаторов в styles.css**

В конец файла `styles.css`:

```css
/* ── Office form: tenant rows ────────────────────────────────────────────── */
.form-tenants { margin: 4px 0 12px 0; }
.form-tenant-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.form-tenant-row input[type=text] { flex: 1; }
.form-tenant-row input[type=number] { width: 110px; }
```

- [ ] **Step 5: Build и commit**

```bash
python build.py
git add js/render.offices.js styles.css employee-seating-dashboard.html
git commit -m "feat: office form — leaseStartDate field and tenants editor"
```

---

### Task 3: CF calculation functions

**Files:**
- Modify: `js/calculations.js`

**Interfaces:**
- Produces:
  - `calc.calculateOfficeCFRow(office, years)` → `{officeName, phase, values: [number], total: number}`
  - `calc.getScenarioCFData(scenario, startYear, endYear)` → `{ years, officeRows, tenantRows }`

- [ ] **Step 1: Добавить вспомогательную функцию `cfForYear`**

В конец `calculations.js`, перед блоком `return {`, добавить:

```js
/**
 * Annual CF for a given area with rent+opex, applying indexation
 * from leaseStartDate to the projection year.
 * Returns value in millions of RUB (area × (rent+opex) × factor / 1_000_000).
 */
function cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year) {
  var a = area || 0;
  var rent = rentPerSqm || 0;
  var opex = opexPerSqm || 0;
  var idx = (indexationPct || 0) / 100;
  var base = a * (rent + opex);
  var yearsElapsed = 0;
  if (leaseStartDate) {
    var startYear = parseInt(String(leaseStartDate).substring(0, 4), 10);
    if (!isNaN(startYear)) {
      yearsElapsed = Math.max(0, year - startYear);
    }
  }
  var factor = Math.pow(1 + idx, yearsElapsed);
  return base * factor / 1000000;
}
```

- [ ] **Step 2: Добавить `getScenarioCFData`**

Сразу после `cfForYear`:

```js
/**
 * Build CF data for the Finance tab.
 * Returns:
 *   { years: [2026,2027,...], officeRows: [...], tenantRows: [...] }
 *
 * officeRows: array of { name, phase, values: [number per year], rowTotal: number }
 *   sorted: AS-IS offices first, then TO-BE offices, each group ends with a subtotal row.
 *
 * tenantRows: same structure, grouped by tenant name across all offices per phase.
 */
function getScenarioCFData(scenario, startYear, endYear) {
  var years = [];
  for (var y = startYear; y <= endYear; y++) { years.push(y); }

  // ---- CF by office ----
  var physicalOffices = (scenario.offices || []).filter(function (o) {
    return o.type === C.OFFICE_TYPE.PHYSICAL;
  });

  function buildOfficeRow(office) {
    var values = years.map(function (yr) {
      return cfForYear(office.area, office.rentPerSqm, office.opexPerSqm, office.indexationPct, office.leaseStartDate, yr);
    });
    var rowTotal = values.reduce(function (s, v) { return s + v; }, 0);
    return { name: office.name, phase: office.phase, values: values, rowTotal: rowTotal, isSubtotal: false };
  }

  function subtotalRow(rows, phase, label) {
    var values = years.map(function (_, i) {
      return rows.reduce(function (s, r) { return s + (r.values[i] || 0); }, 0);
    });
    return { name: label || 'Итого', phase: phase, values: values, rowTotal: values.reduce(function (s, v) { return s + v; }, 0), isSubtotal: true };
  }

  var asisOffices = physicalOffices.filter(function (o) { return o.phase === C.OFFICE_PHASE.ASIS; });
  var tobeOffices = physicalOffices.filter(function (o) { return o.phase === C.OFFICE_PHASE.TOBE; });
  var asisOfficeRows = asisOffices.map(buildOfficeRow);
  var tobeOfficeRows = tobeOffices.map(buildOfficeRow);
  var officeRows = asisOfficeRows.concat([subtotalRow(asisOfficeRows, C.OFFICE_PHASE.ASIS, 'Итого AS IS')])
    .concat(tobeOfficeRows).concat([subtotalRow(tobeOfficeRows, C.OFFICE_PHASE.TOBE, 'Итого TO BE')]);

  // ---- CF by tenant ----
  // Collect { tenantName, area, officeRef } per phase
  function collectTenantEntries(offices) {
    var entries = {}; // tenantName -> { area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate }[]
    offices.forEach(function (office) {
      var tList = office.tenants || [];
      if (tList.length === 0) {
        // Treat whole office as single anonymous tenant
        if (office.area && (office.rentPerSqm || office.opexPerSqm)) {
          var key = '(без арендатора)';
          if (!entries[key]) { entries[key] = []; }
          entries[key].push({ area: office.area, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate });
        }
      } else {
        tList.forEach(function (t) {
          var key = t.name || '(без имени)';
          if (!entries[key]) { entries[key] = []; }
          entries[key].push({ area: t.area || 0, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate });
        });
      }
    });
    return entries;
  }

  function buildTenantRows(offices, phase) {
    var entries = collectTenantEntries(offices);
    var rows = Object.keys(entries).map(function (name) {
      var parts = entries[name];
      var values = years.map(function (yr) {
        return parts.reduce(function (s, p) {
          return s + cfForYear(p.area, p.rentPerSqm, p.opexPerSqm, p.indexationPct, p.leaseStartDate, yr);
        }, 0);
      });
      return { name: name, phase: phase, values: values, rowTotal: values.reduce(function (s, v) { return s + v; }, 0), isSubtotal: false };
    });
    rows.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return rows;
  }

  var asisTenantRows = buildTenantRows(asisOffices, C.OFFICE_PHASE.ASIS);
  var tobeTenantRows = buildTenantRows(tobeOffices, C.OFFICE_PHASE.TOBE);
  var tenantRows = asisTenantRows.concat([subtotalRow(asisTenantRows, C.OFFICE_PHASE.ASIS, 'Итого AS IS')])
    .concat(tobeTenantRows).concat([subtotalRow(tobeTenantRows, C.OFFICE_PHASE.TOBE, 'Итого TO BE')]);

  return { years: years, officeRows: officeRows, tenantRows: tenantRows };
}
```

- [ ] **Step 3: Экспортировать новые функции**

В блоке `return {` в `calculations.js` добавить:

```js
getScenarioCFData: getScenarioCFData,
```

- [ ] **Step 4: Build и commit**

```bash
python build.py
git add js/calculations.js employee-seating-dashboard.html
git commit -m "feat: add CF calculation functions to calculations.js"
```

---

### Task 4: Finance tab — render.finance.js

**Files:**
- Create: `js/render.finance.js`
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `calc.getScenarioCFData(scenario, startYear, endYear)`, `state.getSettings().cfSettings`
- Produces: вкладка "Финансы" с двумя CF таблицами и элементами управления горизонтом

- [ ] **Step 1: Создать js/render.finance.js**

```js
/**
 * render.finance.js
 * "Финансы" tab: Cash Flow tables by office and by tenant.
 * CF = area × (rent_per_sqm + opex_per_sqm) × (1 + idx%)^yearsFromLeaseStart
 * Values shown in millions of RUB, 2 decimal places.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var state = App.state;

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var settings = state.getSettings();
    var cf = settings.cfSettings || { startYear: 2026, endYear: 2030 };

    // ---- Year range controls ----
    var controlsPanel = R.section('Параметры прогноза');
    var controlsRow = U.el('div', { class: 'cf-controls' });

    function yearStepper(label, key) {
      var val = cf[key];
      var dec = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '−' });
      var inc = U.el('button', { class: 'btn btn-sm btn-secondary cf-step', text: '+' });
      var display = U.el('span', { class: 'cf-year-val', text: String(val) });
      dec.addEventListener('click', function () {
        cf[key] = Math.max(2000, cf[key] - 1);
        if (key === 'startYear' && cf.startYear > cf.endYear) { cf.endYear = cf.startYear; }
        if (key === 'endYear' && cf.endYear < cf.startYear) { cf.startYear = cf.endYear; }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
      });
      inc.addEventListener('click', function () {
        cf[key] = Math.min(2100, cf[key] + 1);
        if (key === 'startYear' && cf.startYear > cf.endYear) { cf.endYear = cf.startYear; }
        if (key === 'endYear' && cf.endYear < cf.startYear) { cf.startYear = cf.endYear; }
        state.commit('CF горизонт', function () {
          state.getSettings().cfSettings = { startYear: cf.startYear, endYear: cf.endYear };
        }, { skipHistory: true });
      });
      return U.el('div', { class: 'cf-stepper' }, [
        U.el('span', { class: 'cf-stepper-label', text: label }),
        dec, display, inc
      ]);
    }

    controlsRow.appendChild(yearStepper('С года:', 'startYear'));
    controlsRow.appendChild(yearStepper('По год:', 'endYear'));
    controlsPanel.appendChild(controlsRow);
    container.appendChild(controlsPanel);

    // ---- CF Data ----
    var data = calc.getScenarioCFData(scenario, cf.startYear, cf.endYear);
    if (data.years.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Некорректный диапазон лет' }));
      return;
    }

    // ---- Helper: render one CF table ----
    function renderCFTable(title, rows, years) {
      var panel = R.section(title);
      if (rows.length === 0) {
        panel.appendChild(U.el('p', { class: 'muted', text: 'Нет данных' }));
        return panel;
      }
      var wrap = U.el('div', { class: 'cf-table-wrap' });
      var table = U.el('table', { class: 'cf-table data-table' });

      // Header
      var headerCells = [U.el('th', { text: 'Офис / Фаза' })];
      years.forEach(function (yr) {
        headerCells.push(U.el('th', { class: 'cf-year-col', text: String(yr) }));
      });
      headerCells.push(U.el('th', { class: 'cf-year-col', text: 'Итого' }));
      table.appendChild(U.el('thead', {}, U.el('tr', {}, headerCells)));

      // Body — split AS-IS and TO-BE with a divider row
      var tbody = U.el('tbody');
      var lastPhase = null;
      rows.forEach(function (row) {
        // Phase section header
        if (row.phase !== lastPhase && !row.isSubtotal) {
          lastPhase = row.phase;
          var phaseLabel = row.phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
          var headerRow = U.el('tr', { class: 'cf-phase-header' }, [
            U.el('td', { colspan: String(years.length + 2), text: phaseLabel })
          ]);
          tbody.appendChild(headerRow);
        }
        var rowClass = row.isSubtotal ? 'cf-subtotal-row' : '';
        var cells = [U.el('td', { class: 'cf-name-col' + (row.isSubtotal ? ' cf-bold' : ''), text: row.name })];
        row.values.forEach(function (v) {
          cells.push(U.el('td', { class: 'cf-val-col', text: formatM(v) }));
        });
        cells.push(U.el('td', { class: 'cf-val-col cf-bold', text: formatM(row.rowTotal) }));
        tbody.appendChild(U.el('tr', { class: rowClass }, cells));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      panel.appendChild(wrap);
      return panel;
    }

    container.appendChild(renderCFTable('CF по офисам (млн руб./год)', data.officeRows, data.years));
    container.appendChild(renderCFTable('CF по арендаторам (млн руб./год)', data.tenantRows, data.years));
  }

  function formatM(v) {
    if (!v || isNaN(v)) { return '—'; }
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  App.render.registerTab('finance', { label: 'Финансы', render: render });
})();
```

- [ ] **Step 2: Добавить `<script src="js/render.finance.js">` в index.html**

Найти строку `<script src="js/render.reports.js"></script>` (≈строка 80) и вставить ПОСЛЕ неё:

```html
<script src="js/render.finance.js"></script>
```

- [ ] **Step 3: Добавить CSS стили в styles.css**

В конец `styles.css`:

```css
/* ── Finance tab: CF controls ────────────────────────────────────────────── */
.cf-controls { display: flex; gap: 24px; align-items: center; padding: 8px 0 4px; flex-wrap: wrap; }
.cf-stepper { display: flex; align-items: center; gap: 6px; }
.cf-stepper-label { font-size: 0.875em; color: var(--text-muted); }
.cf-year-val { min-width: 40px; text-align: center; font-weight: 600; }
.cf-step { padding: 2px 8px; min-width: 28px; }

/* ── Finance tab: CF tables ──────────────────────────────────────────────── */
.cf-table-wrap { overflow-x: auto; margin-top: 8px; }
.cf-table { width: 100%; border-collapse: collapse; font-size: 0.875em; }
.cf-table th, .cf-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
.cf-table th { color: var(--text-muted); font-weight: 500; }
.cf-year-col { text-align: right; }
.cf-val-col { text-align: right; color: var(--text); }
.cf-name-col { min-width: 160px; }
.cf-bold { font-weight: 600; }
.cf-phase-header td { background: var(--surface-2); color: var(--text-muted); font-size: 0.8em; letter-spacing: 0.05em; text-transform: uppercase; padding: 4px 10px; }
.cf-subtotal-row { background: var(--surface-2); }
.cf-subtotal-row td { border-top: 2px solid var(--border); }
```

- [ ] **Step 4: Build и commit**

```bash
python build.py
git add js/render.finance.js index.html styles.css employee-seating-dashboard.html
git commit -m "feat: add Finance tab with CF tables by office and by tenant"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Проверка плана

### Покрытие требований

| Требование | Task |
|---|---|
| Дата начала аренды на офисе | Task 1 + Task 2 |
| Дата окончания — уже есть | — |
| Выбор арендатора (dropdown/new) | Task 2 — datalist с автодополнением |
| Несколько арендаторов на офис с разбивкой площади | Task 2 — tenant editor |
| CF по офисам в млн (AS IS + TO BE в параллели) | Task 3 + Task 4 |
| CF по арендаторам | Task 3 + Task 4 |
| Индексация от даты начала аренды, раз в год | Task 3 — `cfForYear()` |
| Настройка горизонта прогноза | Task 1 (cfSettings) + Task 4 (steppers) |

### Граничные случаи учтены

- Офис без `leaseStartDate` → `yearsElapsed = 0`, CF плоский (без роста) ✓
- Офис без арендаторов → показывается как `(без арендатора)` в таблице по арендаторам ✓
- `startYear > endYear` — степперы защищают от этого ✓
- Новый проект получает `cfSettings` по умолчанию ✓
- Старый проект (без `cfSettings`) — `normalizeProject` добавляет значение по умолчанию ✓
