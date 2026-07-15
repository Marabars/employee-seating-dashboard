# Excel Round-Trip for New Functionality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excel export/import round-trips office lease/indexation dates, office tenants, partial team distribution (multi office/zone/count per phase), and manual CF overrides.

**Architecture:** Extend the header alias maps (`constants.js`) and the parse layer (`validation.import.js`) for new columns/sheets (Tenants, CF, Offices dates, Allocations phase); extend the export builders and `applyImport` (`importExport.js`). CF is exported only as a manual override; without one, CF recomputes from the round-tripped offices.

**Tech Stack:** Vanilla JS ES5, SheetJS (`window.XLSX`). Tests: jsdom in `ui-tests/`.

## Global Constraints

- Vanilla JS **ES5 ONLY**. RU + EN headers via `C.EXCEL_HEADERS` alias arrays (lowercased match).
- Office phase is carried by the Offices `office_type` column; `C.OFFICE_PHASE_ALIASES` maps RU/EN → `'asis'|'tobe'`.
- Dates are `YYYY-MM-DD` strings or `''`/null. CF monthly values are millions RUB (12 per year).
- Tenant object shape: `{ id, name, area }`. `cfOverride` row: `{ id, name, phase, monthly: { "<year>": number[12] } }`; lists `offices` and `tenants`.
- Import is single-scenario.
- Files are CRLF; prefer the Python CRLF-safe replace if a plain Edit reports "not found".
- Repo: `C:\Users\dononbaev_m\AppData\Local\Temp\emp-seating-702461657\employee-seating-dashboard`.

---

### Task 1: Parse layer — aliases + new sheet parsers

**Files:**
- Modify: `js/constants.js` (`EXCEL_HEADERS`)
- Modify: `js/validation.import.js`
- Test: `ui-tests/excel-parse.test.js` (new, jsdom)

**Interfaces:**
- Produces: `App.importValidation.parseWorkbook(sheets)` where `sheets` gains `tenants` and `cf` arrays-of-arrays; result gains `tenants:[{officeName,officePhase,name,area}]`, `cf:[{kind,phase,name,year,monthly:[12]}]`; `offices[]` gain `lease_start_date`/`lease_end_date`/`indexation_start_date`; `allocations[]` gain `phase`.

- [ ] **Step 1: Write the failing test** — create `ui-tests/excel-parse.test.js`:

```js
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/validation.import.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var IV = w.App.importValidation;

var sheets = {
  offices: [['Название офиса', 'Тип офиса', 'Площадь', 'Аренда, ₽/м²', 'Эксплуатация, ₽/м²', 'Индексация, %/год', 'Дата начала аренды', 'Дата окончания аренды', 'Дата начала индексации', 'Черновик', 'Комментарий'],
            ['A', 'TO BE', 100, 1000, 50, 10, '2026-01-01', '2028-08-30', '2026-06-01', 'нет', '']],
  zones: [],
  teams: [],
  employees: [],
  allocations: [['Тип', 'Название', 'Фаза', 'Количество', 'Офис', 'Зона', 'Комментарий'],
                ['team', 'Alpha', 'tobe', 5, 'A', 'Z', '']],
  tenants: [['Название офиса', 'Фаза офиса', 'Арендатор', 'Площадь'],
            ['A', 'tobe', 'МР Групп', 40]],
  cf: [['Тип', 'Фаза', 'Название', 'Год', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
       ['office', 'tobe', 'A', 2026, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]
};
var parsed = IV.parseWorkbook(sheets);

console.log('excel parse: new columns/sheets');
assert(parsed.offices[0].lease_end_date === '2028-08-30', 'office lease_end_date parsed');
assert(parsed.offices[0].indexation_start_date === '2026-06-01', 'office indexation_start_date parsed');
assert(parsed.allocations[0].phase === 'tobe', 'allocation phase parsed');
assert(parsed.tenants && parsed.tenants[0].name === 'МР Групп' && parsed.tenants[0].area === 40, 'tenant parsed');
assert(parsed.cf && parsed.cf[0].kind === 'office' && parsed.cf[0].year === 2026 && parsed.cf[0].monthly.length === 12 && parsed.cf[0].monthly[0] === 1, 'cf row parsed monthly');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail** — `cd ui-tests && node excel-parse.test.js` → fails (lease_end_date undefined; parsed.tenants/cf undefined).

- [ ] **Step 3: `constants.js` — extend `EXCEL_HEADERS`.** Replace the `offices` map's `lease_start_date`/`is_draft` lines and the `allocations` map, and add `tenants` + `cf` maps. In `EXCEL_HEADERS.offices`, replace:

```js
      lease_start_date: ['lease_start_date', 'дата начала аренды'],
      is_draft: ['is_draft', 'черновик'],
```

with:

```js
      lease_start_date: ['lease_start_date', 'дата начала аренды'],
      lease_end_date: ['lease_end_date', 'дата окончания аренды', 'окончание аренды'],
      indexation_start_date: ['indexation_start_date', 'дата начала индексации'],
      is_draft: ['is_draft', 'черновик'],
```

Replace the whole `allocations` map with:

```js
    allocations: {
      type:    ['type',    'тип'],
      entity:  ['entity',  'название'],
      phase:   ['phase',   'фаза'],
      count:   ['count',   'количество'],
      office:  ['office',  'офис'],
      zone:    ['zone',    'зона'],
      comment: ['comment', 'комментарий']
    },
```

Add these two maps inside `EXCEL_HEADERS` (e.g. after `employees`):

```js
    ,
    tenants: {
      office_name: ['office_name', 'название офиса'],
      office_phase: ['office_phase', 'фаза офиса', 'фаза'],
      tenant_name: ['tenant_name', 'арендатор', 'название арендатора'],
      area: ['area', 'площадь', 'площадь, м²'],
      comment: ['comment', 'комментарий']
    },
    cf: {
      kind: ['kind', 'тип'],
      phase: ['phase', 'фаза'],
      name: ['name', 'название', 'офис/арендатор'],
      year: ['year', 'год'],
      m1: ['m1', 'янв', 'jan'], m2: ['m2', 'фев', 'feb'], m3: ['m3', 'мар', 'mar'],
      m4: ['m4', 'апр', 'apr'], m5: ['m5', 'май', 'may'], m6: ['m6', 'июн', 'jun'],
      m7: ['m7', 'июл', 'jul'], m8: ['m8', 'авг', 'aug'], m9: ['m9', 'сен', 'sep'],
      m10: ['m10', 'окт', 'oct'], m11: ['m11', 'ноя', 'nov'], m12: ['m12', 'дек', 'dec']
    }
```

(Ensure the object stays valid: the leading `,` joins after the `employees` block's closing `}`.)

- [ ] **Step 4: `validation.import.js` — result arrays + report + wiring.** In `parseWorkbook`'s `result` literal, add `tenants: []` and `cf: []`, and in `report.imported` add `tenants: 0, cf: 0`. After `parseAllocations(sheets.allocations, result);` add:

```js
    parseTenants(sheets.tenants, result);
    parseCF(sheets.cf, result);
```

- [ ] **Step 5: `validation.import.js` — offices dates.** In `parseOffices`, in the pushed `office` object, after `indexation_pct: cell(row, idx, 'indexation_pct')` add:

```js
        ,
        lease_start_date: cell(row, idx, 'lease_start_date'),
        lease_end_date: cell(row, idx, 'lease_end_date'),
        indexation_start_date: cell(row, idx, 'indexation_start_date')
```

- [ ] **Step 6: `validation.import.js` — allocation phase.** In `parseAllocations`, in the pushed object add a `phase` field:

```js
      var allocPhaseRaw = String(cell(row, idx, 'phase') || '').trim().toLowerCase();
      result.allocations.push({
        type:       type,
        entity:     entity,
        phase:      allocPhaseRaw ? (C.OFFICE_PHASE_ALIASES[allocPhaseRaw] || null) : null,
        count:      U.toNonNegativeInt(cell(row, idx, 'count')) || 1,
        officeName: String(cell(row, idx, 'office') || '').trim(),
        zoneName:   String(cell(row, idx, 'zone')   || '').trim(),
        comment:    String(cell(row, idx, 'comment') || '')
      });
```

(Replace the existing `result.allocations.push({...})` block with the above; add the `allocPhaseRaw` line just before it.)

- [ ] **Step 7: `validation.import.js` — new parsers.** Add before the `return {` at the end:

```js
  function parseTenants(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) { return; }
    var idx = mapHeaders('tenants', data.header);
    data.rows.forEach(function (row) {
      if (isEmptyRow(row)) { return; }
      var officeName = String(cell(row, idx, 'office_name') || '').trim();
      var name = String(cell(row, idx, 'tenant_name') || '').trim();
      if (!officeName || !name) { return; }
      var phaseRaw = String(cell(row, idx, 'office_phase') || '').trim().toLowerCase();
      result.tenants.push({
        officeName: officeName,
        officePhase: phaseRaw ? (C.OFFICE_PHASE_ALIASES[phaseRaw] || null) : null,
        name: name,
        area: Math.max(0, parseFloat(cell(row, idx, 'area')) || 0)
      });
      result.report.imported.tenants += 1;
    });
  }

  function parseCF(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) { return; }
    var idx = mapHeaders('cf', data.header);
    var mkeys = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];
    data.rows.forEach(function (row) {
      if (isEmptyRow(row)) { return; }
      var name = String(cell(row, idx, 'name') || '').trim();
      var year = parseInt(cell(row, idx, 'year'), 10);
      if (!name || isNaN(year)) { return; }
      var kindRaw = String(cell(row, idx, 'kind') || 'office').trim().toLowerCase();
      var kind = (kindRaw.indexOf('tenant') > -1 || kindRaw.indexOf('аренда') > -1) ? 'tenant' : 'office';
      var phaseRaw = String(cell(row, idx, 'phase') || 'tobe').trim().toLowerCase();
      var phase = C.OFFICE_PHASE_ALIASES[phaseRaw] || C.OFFICE_PHASE.TOBE;
      var monthly = [];
      for (var mi = 0; mi < 12; mi++) { monthly.push(parseFloat(cell(row, idx, mkeys[mi])) || 0); }
      result.cf.push({ kind: kind, phase: phase, name: name, year: year, monthly: monthly });
      result.report.imported.cf += 1;
    });
  }
```

- [ ] **Step 8: Run → pass** — `node excel-parse.test.js` all pass.

- [ ] **Step 9: Commit**

```bash
git add js/constants.js js/validation.import.js ui-tests/excel-parse.test.js
git commit -m "feat: parse Excel lease dates, tenants, CF, allocation phase"
```

---

### Task 2: Export builders + template + buildWorkbook hook

**Files:**
- Modify: `js/importExport.js`
- Test: `ui-tests/excel-export.test.js` (new, jsdom)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `App.importExport.buildWorkbook(scenarios, includeScenarioCol)` → XLSX workbook with sheets incl. new Offices date columns, `phase` in Allocations, `Tenants`, `CF`.

- [ ] **Step 1: Write the failing test** — create `ui-tests/excel-export.test.js`:

```js
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
var w = dom.window;
['libs/xlsx.full.min.js', 'js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js',
 'js/teams.js', 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js',
 'js/validation.import.js', 'js/modals.js', 'js/importExport.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, XLSX = w.XLSX;

var scen = { id: 's1', name: 'S', comment: '', cfOverride: { offices: [{ id: 'c1', name: 'A', phase: 'tobe', monthly: { '2026': [2,2,2,2,2,2,2,2,2,2,2,2] } }], tenants: [] },
  offices: [{ id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1000, opexPerSqm: 50, indexationPct: 10, leaseStartDate: '2026-01-01', leaseEndDate: '2028-08-30', indexationStartDate: '2026-06-01', zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 't', name: 'МР Групп', area: 40 }] }],
  teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, canSplit: true, linkedTeamIds: [], isVip: false }],
  employees: [],
  allocations: [{ id: 'a', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 5, targetOfficeId: 'o1', targetZoneId: 'z' }] };

var wb = App.importExport.buildWorkbook([scen], false);
function aoa(name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []; }

console.log('excel export builders');
var offH = aoa('Offices')[0];
assert(offH.indexOf('lease_end_date') > -1 && offH.indexOf('indexation_start_date') > -1, 'Offices has date columns');
var allH = aoa('Allocations')[0];
assert(allH.indexOf('phase') > -1, 'Allocations has phase column');
var ten = aoa('Tenants');
assert(ten.length >= 2 && ten[1].indexOf('МР Групп') > -1, 'Tenants sheet has the tenant row');
var cf = aoa('CF');
assert(cf.length >= 2 && cf[1].indexOf(2026) > -1, 'CF sheet has an override row for 2026');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail** — `node excel-export.test.js` → fails (`buildWorkbook` undefined).

- [ ] **Step 3: `buildOffices` dates.** Replace the header array and the row array in `buildOffices`:

Header — replace `['office_name', 'office_type', 'area', 'rent_per_sqm', 'opex_per_sqm', 'indexation_pct', 'is_draft', 'comment']` with:

```js
    var aoa = [withScenarioCol(['office_name', 'office_type', 'area', 'rent_per_sqm', 'opex_per_sqm', 'indexation_pct', 'lease_start_date', 'lease_end_date', 'indexation_start_date', 'is_draft', 'comment'], inc)];
```

Row — replace the `aoa.push(rowWithScenario(s, [ ... o.isDraft ? 'да' : 'нет', o.comment || '' ], inc));` with:

```js
        aoa.push(rowWithScenario(s, [
          o.name, phaseOut, o.area || 0,
          (o.rentPerSqm !== null && o.rentPerSqm !== undefined) ? o.rentPerSqm : '',
          (o.opexPerSqm !== null && o.opexPerSqm !== undefined) ? o.opexPerSqm : '',
          (o.indexationPct !== null && o.indexationPct !== undefined) ? o.indexationPct : '',
          o.leaseStartDate || '', o.leaseEndDate || '', o.indexationStartDate || '',
          o.isDraft ? 'да' : 'нет', o.comment || ''
        ], inc));
```

- [ ] **Step 4: `buildAllocations` phase.** Replace the header and row:

Header → `['type', 'entity', 'phase', 'count', 'office', 'zone', 'comment']`. Row → insert the office phase after `entity`:

```js
  function buildAllocations(scenarios, inc) {
    var aoa = [withScenarioCol(['type', 'entity', 'phase', 'count', 'office', 'zone', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.allocations.forEach(function (a) {
        var office = U.findById(s.offices, a.targetOfficeId);
        var zone = office && office.zones ? U.findById(office.zones, a.targetZoneId) : null;
        var entity;
        if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
          var emp = U.findById(s.employees, a.employeeId);
          entity = emp ? emp.fullName : '';
        } else {
          var team = U.findById(s.teams, a.teamId);
          entity = team ? team.name : '';
        }
        var phaseOut = office ? (office.type === C.OFFICE_TYPE.REMOTE ? 'remote' : (office.phase || '')) : '';
        aoa.push(rowWithScenario(s, [
          a.type, entity, phaseOut, a.employeesCount,
          office ? office.name : '', zone ? zone.name : '', a.comment || ''
        ], inc));
      });
    });
    return aoa;
  }
```

- [ ] **Step 5: New `buildTenants` and `buildCF`.** Add after `buildAllocations`:

```js
  function buildTenants(scenarios, inc) {
    var aoa = [withScenarioCol(['office_name', 'office_phase', 'tenant_name', 'area'], inc)];
    scenarios.forEach(function (s) {
      s.offices.filter(function (o) { return o.type === C.OFFICE_TYPE.PHYSICAL; }).forEach(function (o) {
        (o.tenants || []).forEach(function (t) {
          aoa.push(rowWithScenario(s, [o.name, o.phase || 'tobe', t.name || '', t.area || 0], inc));
        });
      });
    });
    return aoa;
  }

  function buildCF(scenarios, inc) {
    var aoa = [withScenarioCol(['kind', 'phase', 'name', 'year', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'], inc)];
    scenarios.forEach(function (s) {
      var ov = s.cfOverride;
      if (!ov) { return; }
      ['offices', 'tenants'].forEach(function (listKey) {
        var kind = listKey === 'tenants' ? 'tenant' : 'office';
        (ov[listKey] || []).forEach(function (r) {
          Object.keys(r.monthly || {}).forEach(function (yr) {
            var m = r.monthly[yr] || [];
            var row = [kind, r.phase, r.name, parseInt(yr, 10)];
            for (var i = 0; i < 12; i++) { row.push(m[i] || 0); }
            aoa.push(rowWithScenario(s, row, inc));
          });
        });
      });
    });
    return aoa;
  }
```

- [ ] **Step 6: `buildWorkbook` + `doExportExcel`.** Replace `doExportExcel` with a `buildWorkbook` that returns the workbook, and a thin `doExportExcel` that writes it:

```js
  function buildWorkbook(scenarios, includeScenarioCol) {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildSummary(scenarios, includeScenarioCol)), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildOffices(scenarios, includeScenarioCol)), 'Offices');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildZones(scenarios, includeScenarioCol)), 'Zones');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildTeams(scenarios, includeScenarioCol)), 'Teams');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildEmployees(scenarios, includeScenarioCol)), 'Employees');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildTenants(scenarios, includeScenarioCol)), 'Tenants');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildAllocations(scenarios, includeScenarioCol)), 'Allocations');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildCF(scenarios, includeScenarioCol)), 'CF');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildWarnings(scenarios, includeScenarioCol)), 'Warnings');
    return wb;
  }

  function doExportExcel(scenarios, includeScenarioCol) {
    XLSX.writeFile(buildWorkbook(scenarios, includeScenarioCol), includeScenarioCol ? 'seating-all-scenarios.xlsx' : 'seating-scenario.xlsx');
  }
```

- [ ] **Step 7: Template + import sheet list.** In `downloadExcelTemplate`, update the Offices/Allocations headers and add Tenants + CF:

```js
    addSheetFromHeaders(wb, 'Offices', ['Название офиса', 'Тип офиса', 'Площадь', 'Аренда, ₽/м²', 'Эксплуатация, ₽/м²', 'Индексация, %/год', 'Дата начала аренды', 'Дата окончания аренды', 'Дата начала индексации', 'Черновик', 'Комментарий']);
    addSheetFromHeaders(wb, 'Zones', ['Название офиса', 'Фаза офиса', 'Название зоны', 'Тип зоны', 'Вместимость', 'VIP-зона', 'Комментарий']);
    addSheetFromHeaders(wb, 'Teams', ['Название команды', 'Количество сотрудников', 'AS-IS офис', 'TO-BE офис', 'VIP', 'Можно делить', 'Связанные команды', 'Комментарий']);
    addSheetFromHeaders(wb, 'Employees', ['ФИО', 'Должность', 'Команда', 'AS-IS офис', 'Кабинет', 'VIP', 'Формат работы', 'Комментарий']);
    addSheetFromHeaders(wb, 'Tenants', ['Название офиса', 'Фаза офиса', 'Арендатор', 'Площадь']);
    addSheetFromHeaders(wb, 'Allocations', ['Тип', 'Название', 'Фаза', 'Количество', 'Офис', 'Зона', 'Комментарий']);
    addSheetFromHeaders(wb, 'CF', ['Тип', 'Фаза', 'Название', 'Год', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']);
```

In `importExcelDialog`, extend the `sheets` object:

```js
          var sheets = {
            offices: sheetToAoa(wb, 'Offices'),
            zones: sheetToAoa(wb, 'Zones'),
            teams: sheetToAoa(wb, 'Teams'),
            employees: sheetToAoa(wb, 'Employees'),
            tenants: sheetToAoa(wb, 'Tenants'),
            allocations: sheetToAoa(wb, 'Allocations'),
            cf: sheetToAoa(wb, 'CF')
          };
```

- [ ] **Step 8: Export `buildWorkbook`.** In the module `return { ... }`, add `buildWorkbook: buildWorkbook,` next to `exportExcel`.

- [ ] **Step 9: Run + build** — `node excel-export.test.js` all pass; `python build.py`.

- [ ] **Step 10: Commit**

```bash
git add js/importExport.js employee-seating-dashboard.html ui-tests/excel-export.test.js
git commit -m "feat: Excel export includes lease dates, tenants, CF override, allocation phase"
```

---

### Task 3: applyImport wiring + full round-trip test

**Files:**
- Modify: `js/importExport.js` (`makeOffice`, `applyImport`, exports)
- Test: `ui-tests/excel-roundtrip.test.js` (new, jsdom)

**Interfaces:**
- Consumes: `parseWorkbook` (Task 1), `buildWorkbook` (Task 2).
- Produces: `applyImport` sets office dates, `office.tenants`, `scenario.cfOverride`, and phase-aware team/employee allocations. Adds `App.importExport.applyImportParsed(parsed, mode, name)`.

- [ ] **Step 1: Write the failing round-trip test** — create `ui-tests/excel-roundtrip.test.js`:

```js
'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body><div id="dnd-live"></div></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window; w.scrollTo = function () {};
['libs/xlsx.full.min.js', 'js/constants.js', 'js/utils.js', 'js/state.js', 'js/scenarios.js', 'js/offices.js',
 'js/teams.js', 'js/employees.js', 'js/calculations.js', 'js/allocations.js', 'js/validation.js',
 'js/validation.import.js', 'js/modals.js', 'js/undoRedo.js', 'js/importExport.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App, XLSX = w.XLSX;
App.render = { render: function () {} };

// Seed a source project/scenario with all the new data.
App.state.setProject({ projectVersion: '1.0.0', appName: 't',
  settings: { thresholds: { greenMaxPercent: 85, yellowMaxPercent: 100 }, viewOnlyMode: false, lastSelectedScenarioId: 'src', cfSettings: { startYear: 2026, endYear: 2026 } },
  scenarios: [{ id: 'src', name: 'Src', comment: '', cfOverride: { offices: [{ id: 'c1', name: 'A', phase: 'tobe', monthly: { '2026': [2,2,2,2,2,2,2,2,2,2,2,2] } }], tenants: [] },
    offices: [
      { id: 'o1', type: 'physical', phase: 'tobe', name: 'A', area: 100, rentPerSqm: 1000, opexPerSqm: 50, indexationPct: 10, leaseStartDate: '2026-01-01', leaseEndDate: '2028-08-30', indexationStartDate: '2026-06-01', zones: [{ id: 'z', name: 'Z', capacity: 50, isVipZone: false }], tenants: [{ id: 't', name: 'МР Групп', area: 40 }] },
      { id: 'r1', type: 'remote', phase: 'tobe', name: 'Удаленка', unlimitedCapacity: true, isSystem: true },
      { id: 'r0', type: 'remote', phase: 'asis', name: 'Удаленка AS', unlimitedCapacity: true, isSystem: true }
    ],
    teams: [{ id: 'tm', name: 'Alpha', employeesCount: 10, canSplit: true, linkedTeamIds: [], isVip: false, currentOfficeId: null, toBeOfficeId: 'o1' }],
    employees: [],
    allocations: [{ id: 'a', type: 'team', teamId: 'tm', employeeId: null, employeesCount: 5, targetOfficeId: 'o1', targetZoneId: 'z' }] }] });
App.state.setActiveScenario('src');
var src = App.state.getActiveScenario();

// Export -> binary -> read back -> parse.
var wb = App.importExport.buildWorkbook([src], false);
var bin = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
var wb2 = XLSX.read(bin, { type: 'array' });
function toAoa(name) { var ws = wb2.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) : []; }
var sheets = { offices: toAoa('Offices'), zones: toAoa('Zones'), teams: toAoa('Teams'), employees: toAoa('Employees'), tenants: toAoa('Tenants'), allocations: toAoa('Allocations'), cf: toAoa('CF') };
var parsed = App.importValidation.parseWorkbook(sheets);
App.importExport.applyImportParsed(parsed, 'new', 'RT');

var dst = App.state.getActiveScenario();
console.log('excel round-trip');
var office = dst.offices.filter(function (o) { return o.name === 'A' && o.phase === 'tobe'; })[0];
assert(!!office, 'office A imported');
assert(office.leaseEndDate === '2028-08-30' && office.indexationStartDate === '2026-06-01', 'office dates round-trip');
assert((office.tenants || []).filter(function (t) { return t.name === 'МР Групп' && t.area === 40; }).length === 1, 'tenant round-trip');
var teamAlloc = dst.allocations.filter(function (a) { return a.type === 'team' && a.employeesCount === 5; })[0];
var to = teamAlloc && App.utils.findById(dst.offices, teamAlloc.targetOfficeId);
assert(!!teamAlloc && to && to.name === 'A' && to.phase === 'tobe', 'team allocation (office+count+phase) round-trip');
assert(dst.cfOverride && dst.cfOverride.offices.filter(function (r) { return r.name === 'A' && r.monthly['2026'][0] === 2; }).length === 1, 'cfOverride round-trip (monthly)');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run → fail** — `node excel-roundtrip.test.js` → fails (`applyImportParsed` undefined; dates/tenants/cf not applied).

- [ ] **Step 3: `makeOffice` dates.** In `makeOffice`, add the three date fields to the `state.createOffice` data object (after `indexationPct`):

```js
  function makeOffice(data) {
    return state.createOffice(data.phase, {
      name: data.name,
      area: data.area,
      isDraft: data.isDraft,
      comment: data.comment,
      rentPerSqm: numericOrNull(data.rent_per_sqm),
      opexPerSqm: numericOrNull(data.opex_per_sqm),
      indexationPct: numericOrNull(data.indexation_pct),
      leaseStartDate: dateOrNull(data.lease_start_date),
      leaseEndDate: dateOrNull(data.lease_end_date),
      indexationStartDate: dateOrNull(data.indexation_start_date)
    });
  }

  function dateOrNull(v) {
    var s = (v === undefined || v === null) ? '' : String(v).trim();
    return s || null;
  }
```

Also update EXISTING offices on import: after `var office = existing || makeOffice(data);` in the offices loop, add (so re-import updates dates on an existing office):

```js
      if (existing) {
        if (data.lease_start_date !== undefined) { existing.leaseStartDate = dateOrNull(data.lease_start_date); }
        if (data.lease_end_date !== undefined) { existing.leaseEndDate = dateOrNull(data.lease_end_date); }
        if (data.indexation_start_date !== undefined) { existing.indexationStartDate = dateOrNull(data.indexation_start_date); }
      }
```

- [ ] **Step 4: Apply tenants.** In `applyImport`, right after the Zones `parsed.zones.forEach(...)` block, add:

```js
    // Tenants (office tenant list).
    (parsed.tenants || []).forEach(function (t) {
      var office = findOffice(t.officeName, t.officePhase);
      if (!office || office.type !== C.OFFICE_TYPE.PHYSICAL) {
        parsed.report.warnings.push('Арендатор «' + t.name + '»: офис «' + t.officeName + '» не найден');
        return;
      }
      office.tenants = office.tenants || [];
      var ex = office.tenants.filter(function (x) { return (x.name || '').toLowerCase() === t.name.toLowerCase(); })[0];
      if (ex) { ex.area = t.area; }
      else { office.tenants.push({ id: U.genId('tenant'), name: t.name, area: t.area }); }
    });
```

- [ ] **Step 5: Phase-aware allocations.** In `applyImport`'s Allocations block, change the office lookup to use the row phase:

Replace `var office = findOffice(data.officeName, null);` with:

```js
        var office = findOffice(data.officeName, data.phase);
```

- [ ] **Step 6: Reconstruct cfOverride.** In `applyImport`, just before `state.notifyChange('Импорт Excel', ...)`, add:

```js
    // CF manual override (only when a non-empty CF sheet was provided).
    if (parsed.cf && parsed.cf.length) {
      var ov = { offices: [], tenants: [] };
      var byKey = {};
      parsed.cf.forEach(function (r) {
        var listKey = r.kind === 'tenant' ? 'tenants' : 'offices';
        var k = listKey + '|' + r.phase + '|' + r.name.toLowerCase();
        var row = byKey[k];
        if (!row) {
          row = { id: U.genId('cfrow'), name: r.name, phase: r.phase, monthly: {} };
          byKey[k] = row;
          ov[listKey].push(row);
        }
        row.monthly[String(r.year)] = r.monthly.slice();
      });
      scenario.cfOverride = ov;
    }
```

- [ ] **Step 7: Export `applyImportParsed`.** In the module `return { ... }`, add:

```js
    applyImportParsed: applyImport,
```

(and keep existing exports). Also confirm `parseWorkbook` result count display in `chooseImportMode` still works — the new `imported.tenants`/`imported.cf` counts exist; optionally add two `<li>` lines showing them (not required).

- [ ] **Step 8: Run → pass; build** — `node excel-roundtrip.test.js` all pass. `python build.py`. Re-run `excel-parse`, `excel-export`, and the existing ui-tests + `run_tests.js` (76/76).

- [ ] **Step 9: Manual verify** — In the app: set office rent + lease dates + a tenant; distribute a team across two offices; manually edit CF (pencil). Reports → «Экспорт Excel (активный)». Re-import the file into a new scenario → dates, tenant, team distribution, and CF all match.

- [ ] **Step 10: Commit**

```bash
git add js/importExport.js employee-seating-dashboard.html ui-tests/excel-roundtrip.test.js
git commit -m "feat: Excel import applies lease dates, tenants, CF override, phase-aware distribution"
```

---

## Self-Review

1. **Spec coverage:** lease dates (T1 parse, T2 export, T3 apply); tenants (T1/T2/T3); allocation phase + distribution round-trip (T1/T2/T3); CF override monthly export-only + reconstruct (T2 `buildCF` guarded by `cfOverride`, T3 reconstruct guarded by non-empty CF); computed-vs-override rule (buildCF skips null override; applyImport sets override only when CF rows present). ✅
2. **Placeholder scan:** no TBD; full code in each step. `<scratch>/run_tests.js` is the session unit runner.
3. **Type consistency:** parsed field names (`lease_end_date`, `indexation_start_date`, `phase`, `tenants[].name/area`, `cf[].{kind,phase,name,year,monthly}`) match between `validation.import.js` (producer) and `importExport.js` (consumer); `buildWorkbook`/`applyImportParsed` names match the tests; tenant shape `{id,name,area}` matches `render.offices.js`.
4. **Line numbers** approximate; anchor on shown snippets.
