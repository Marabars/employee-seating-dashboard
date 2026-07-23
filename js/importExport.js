/**
 * importExport.js
 * JSON export/import, Excel template/import/export (SheetJS), PDF (jsPDF +
 * html2canvas), PNG (html2canvas), and an office-fragment PNG export.
 *
 * Libraries are loaded locally from libs/ (no CDN). Each export checks the
 * library is present and surfaces a friendly message if not.
 */
window.App = window.App || {};

App.importExport = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;
  var calc = App.calc;

  // Synthetic tenant label for un-let office area (mirrors calculations.js CF-by-tenant).
  // Exported for readability; skipped on import so it never becomes a real tenant.
  var NO_TENANT_LABEL = 'Без арендатора';

  // ---- JSON --------------------------------------------------------------

  function doExportJson(project, selectedScenarios) {
    var exportProject = JSON.parse(JSON.stringify(project));
    exportProject.scenarios = selectedScenarios;
    var blob = new Blob([JSON.stringify(exportProject, null, 2)], { type: 'application/json' });
    U.downloadBlob(blob, 'seating-project.json');
  }

  function exportJson() {
    var project = state.getProject();
    var scenarios = project.scenarios || [];
    if (scenarios.length <= 1) {
      doExportJson(project, scenarios);
      return;
    }
    var items = scenarios.map(function (s) {
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.style.marginRight = '8px';
      cb.style.flexShrink = '0';
      return { scenario: s, checkbox: cb };
    });
    var rows = items.map(function (item) {
      var row = U.el('label', { class: 'import-name-row' });
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'pointer';
      row.appendChild(item.checkbox);
      row.appendChild(U.el('span', { text: item.scenario.name }));
      return row;
    });
    App.modals.open({
      title: 'Экспорт JSON',
      body: U.el('div', {}, [
        U.el('p', { text: 'Выберите сценарии для экспорта:' }),
        U.el('div', { class: 'import-names-list' }, rows)
      ]),
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Экспорт', kind: 'primary', onClick: function () {
          var selected = items.filter(function (i) { return i.checkbox.checked; })
                              .map(function (i) { return i.scenario; });
          if (!selected.length) { App.modals.alert('Выберите хотя бы один сценарий.'); return false; }
          doExportJson(project, selected);
          return true;
        }}
      ]
    });
  }

  function importJsonDialog() {
    pickFile('.json,application/json', function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(reader.result);
          if (!state.validateProjectShape(obj)) {
            App.modals.alert('Файл не похож на проект приложения (нет корректных сценариев).');
            return;
          }
          var incoming = state.normalizeProject(obj);
          showJsonImportDialog(incoming.scenarios);
        } catch (e) {
          App.modals.alert('Не удалось прочитать JSON: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function showJsonImportDialog(incomingScenarios) {
    var project = state.getProject();
    var existingNames = project.scenarios.map(function (s) { return s.name; });

    var nameInputs = incomingScenarios.map(function (s) {
      var suggested = s.name;
      if (existingNames.indexOf(suggested) >= 0) {
        var suffix = 2;
        while (existingNames.indexOf(suggested + ' (' + suffix + ')') >= 0) { suffix++; }
        suggested = suggested + ' (' + suffix + ')';
      }
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.style.flexShrink = '0';
      var input = U.el('input', { type: 'text', class: 'import-scenario-name', value: suggested });
      return { scenario: s, input: input, checkbox: cb };
    });

    var rows = nameInputs.map(function (item) {
      var row = U.el('div', { class: 'import-name-row' });
      row.style.alignItems = 'center';
      row.appendChild(item.checkbox);
      row.appendChild(U.el('span', { class: 'import-name-orig', text: item.scenario.name + ' → ' }));
      row.appendChild(item.input);
      return row;
    });

    App.modals.open({
      title: 'Импорт JSON — ' + incomingScenarios.length + ' сцен.',
      body: U.el('div', {}, [
        U.el('p', { text: 'Сценарии будут добавлены в текущий проект. Существующие данные не изменятся.' }),
        U.el('div', { class: 'import-names-list' }, rows)
      ]),
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Добавить', kind: 'primary', onClick: function () {
          App.undoRedo.checkpoint();
          var proj = state.getProject();
          var added = 0;
          nameInputs.forEach(function (item) {
            if (!item.checkbox.checked) { return; }
            var name = item.input.value.trim() || item.scenario.name;
            var fresh = reIdScenario(item.scenario, name);
            proj.scenarios.push(fresh);
            added++;
          });
          if (!added) { App.modals.alert('Выберите хотя бы один сценарий.'); return false; }
          proj.settings.lastSelectedScenarioId =
            proj.scenarios[proj.scenarios.length - 1].id;
          state.notifyChange('Импорт JSON', { skipHistory: true });
          App.modals.alert('Добавлено сценариев: ' + added + '.');
          return true;
        }}
      ]
    });
  }

  function reIdScenario(scenario, newName) {
    var s = JSON.parse(JSON.stringify(scenario));
    s.id = U.genId('scenario');
    s.name = newName;

    var officeMap = {};
    var zoneMap = {};
    var teamMap = {};
    var empMap = {};

    (s.offices || []).forEach(function (o) {
      var old = o.id;
      o.id = U.genId('office');
      officeMap[old] = o.id;
      (o.zones || []).forEach(function (z) {
        var oldZ = z.id;
        z.id = U.genId('zone');
        zoneMap[oldZ] = z.id;
      });
    });

    (s.teams || []).forEach(function (t) {
      var old = t.id;
      t.id = U.genId('team');
      teamMap[old] = t.id;
    });

    (s.employees || []).forEach(function (e) {
      var old = e.id;
      e.id = U.genId('employee');
      empMap[old] = e.id;
    });

    (s.teams || []).forEach(function (t) {
      if (t.currentOfficeId) { t.currentOfficeId = officeMap[t.currentOfficeId] || null; }
      if (t.toBeOfficeId) { t.toBeOfficeId = officeMap[t.toBeOfficeId] || null; }
      t.linkedTeamIds = (t.linkedTeamIds || []).map(function (id) {
        return teamMap[id] || null;
      }).filter(Boolean);
    });

    (s.employees || []).forEach(function (e) {
      if (e.teamId) { e.teamId = teamMap[e.teamId] || null; }
      if (e.currentOfficeId) { e.currentOfficeId = officeMap[e.currentOfficeId] || null; }
    });

    (s.allocations || []).forEach(function (a) {
      a.id = U.genId('alloc');
      if (a.targetOfficeId) { a.targetOfficeId = officeMap[a.targetOfficeId] || null; }
      if (a.targetZoneId) { a.targetZoneId = zoneMap[a.targetZoneId] || null; }
      if (a.teamId) { a.teamId = teamMap[a.teamId] || null; }
      if (a.employeeId) { a.employeeId = empMap[a.employeeId] || null; }
    });

    return s;
  }

  // ---- Excel template ----------------------------------------------------

  function downloadExcelTemplate() {
    if (!window.XLSX) {
      libMissing('xlsx');
      return;
    }
    var wb = XLSX.utils.book_new();
    // Russian headers (the importer accepts both RU and EN — see EXCEL_HEADERS).
    addSheetFromHeaders(wb, 'Offices', ['Название офиса', 'Тип офиса', 'Площадь', 'Аренда, ₽/м²', 'Эксплуатация, ₽/м²', 'Индексация, %/год', 'Дата начала аренды', 'Дата окончания аренды', 'Дата начала индексации', 'Черновик', 'Комментарий']);
    addSheetFromHeaders(wb, 'Zones', ['Название офиса', 'Фаза офиса', 'Название зоны', 'Тип зоны', 'Вместимость', 'VIP-зона', 'Комментарий']);
    addSheetFromHeaders(wb, 'Teams', ['Название команды', 'Количество сотрудников', 'VIP', 'Связанные команды', 'Комментарий', 'Фаза', 'Офис', 'Зона', 'Кол-во']);
    addSheetFromHeaders(wb, 'Employees', ['ФИО', 'Должность', 'Команда', 'AS-IS офис', 'AS-IS зона', 'VIP', 'Формат работы', 'TO-BE офис', 'TO-BE зона', 'VIP (TO-BE)', 'Формат работы (TO-BE)', 'Комментарий']);
    addSheetFromHeaders(wb, 'Tenants', ['Название офиса', 'Фаза офиса', 'Арендатор', 'Площадь']);
    addSheetFromHeaders(wb, 'Allocations', ['Тип', 'Название', 'AS-IS (офис/зона)', 'TO-BE (офис/зона)']);
    addSheetFromHeaders(wb, 'CF', ['Тип', 'Фаза', 'Название', 'Год', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']);
    XLSX.writeFile(wb, 'seating-template.xlsx');
  }

  function addSheetFromHeaders(wb, name, headers) {
    var ws = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // ---- Excel import ------------------------------------------------------

  function importExcelDialog() {
    if (!window.XLSX) {
      libMissing('xlsx');
      return;
    }
    pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = new Uint8Array(reader.result);
          var wb = XLSX.read(data, { type: 'array' });
          var sheets = {
            offices: sheetToAoa(wb, 'Offices'),
            zones: sheetToAoa(wb, 'Zones'),
            teams: sheetToAoa(wb, 'Teams'),
            employees: sheetToAoa(wb, 'Employees'),
            tenants: sheetToAoa(wb, 'Tenants'),
            allocations: sheetToAoa(wb, 'Allocations'),
            cf: sheetToAoa(wb, 'CF')
          };
          var parsed = App.importValidation.parseWorkbook(sheets);
          chooseImportMode(parsed);
        } catch (e) {
          App.modals.alert('Не удалось прочитать Excel: ' + e.message);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function sheetToAoa(wb, name) {
    var ws = wb.Sheets[name];
    if (!ws) {
      return [];
    }
    return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  }

  /** Ask whether to create a new scenario or update the current one. */
  function chooseImportMode(parsed) {
    var nameInput = U.el('input', {
      type: 'text',
      placeholder: 'Название нового сценария',
      class: 'import-scenario-name',
      value: 'Импорт ' + new Date().toLocaleDateString('ru-RU')
    });
    App.modals.open({
      title: 'Импорт Excel',
      body: U.el('div', {}, [
        U.el('p', { text: 'Куда импортировать данные?' }),
        U.el('label', { class: 'import-name-label' }, [
          U.el('span', { text: 'Название сценария: ' }),
          nameInput
        ]),
        U.el('ul', { class: 'import-summary' }, [
          U.el('li', { text: 'Офисов: ' + parsed.report.imported.offices }),
          U.el('li', { text: 'Зон: ' + parsed.report.imported.zones }),
          U.el('li', { text: 'Команд: ' + parsed.report.imported.teams }),
          U.el('li', { text: 'Сотрудников: ' + parsed.report.imported.employees }),
          U.el('li', { text: 'Размещений: ' + parsed.report.imported.allocations }),
          U.el('li', { text: 'Ошибочных строк: ' + parsed.report.errors.length })
        ])
      ]),
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Новый сценарий', kind: 'primary', onClick: function () {
          applyImport(parsed, 'new', nameInput.value.trim() || nameInput.placeholder);
          return true;
        } },
        { label: 'Обновить текущий', kind: 'primary', onClick: function () { applyImport(parsed, 'update'); return true; } }
      ]
    });
  }

  /**
   * Apply parsed entities into a new or current scenario. Import is one
   * coarse undo action. Cross-references (zone office, team/employee links)
   * are resolved by name.
   */
  function applyImport(parsed, mode, scenarioName) {
    App.undoRedo.checkpoint();

    var project = state.getProject();
    var scenario;
    if (mode === 'new') {
      scenario = state.createScenario(scenarioName || ('Импорт ' + new Date().toLocaleDateString('ru-RU')), '');
      project.scenarios.push(scenario);
      project.settings.lastSelectedScenarioId = scenario.id;
    } else {
      scenario = state.getActiveScenario();
    }

    // Two-level office registry: exact name+phase lookup + smart plain-name fallback.
    var officeByName = {};       // name → last office (fallback when no phase ambiguity)
    var officeByNamePhase = {};  // name|phase → office (preferred)

    function registerOffice(o) {
      officeByName[o.name.toLowerCase()] = o;
      if (o.phase) { officeByNamePhase[o.name.toLowerCase() + '|' + o.phase] = o; }
    }

    /**
     * Strict lookup: exact name+phase only, no fallback.
     * Used when creating/merging offices so a same-name office in a different
     * phase is never mistaken for an existing match.
     */
    function findOfficeStrict(name, phase) {
      var n = (name || '').toLowerCase();
      if (!n) { return null; }
      if (phase) { return officeByNamePhase[n + '|' + phase] || null; }
      return officeByName[n] || null;
    }

    /**
     * Smart lookup for cross-references (teams, employees, zones).
     * Prefers the requested phase; falls back to plain name only when there is
     * no phase ambiguity (i.e. the name does NOT appear in BOTH phases).
     */
    function findOffice(name, preferPhase) {
      var n = (name || '').toLowerCase();
      if (!n) { return null; }
      if (preferPhase && officeByNamePhase[n + '|' + preferPhase]) {
        return officeByNamePhase[n + '|' + preferPhase];
      }
      // Fallback to plain name is safe only when there is exactly one phase for this name.
      var hasAsis = !!officeByNamePhase[n + '|asis'];
      var hasTobe = !!officeByNamePhase[n + '|tobe'];
      if (hasAsis && hasTobe) { return null; } // ambiguous — refuse to guess
      return officeByName[n] || null;
    }

    scenario.offices.forEach(registerOffice);

    // Offices — strict phase match so same-name AS-IS and TO-BE both get created.
    parsed.offices.forEach(function (data) {
      var existing = findOfficeStrict(data.name, data.phase);
      var office = existing || makeOffice(data);
      if (!existing) {
        scenario.offices.push(office);
      } else {
        if (data.lease_start_date !== undefined) { existing.leaseStartDate = dateOrNull(data.lease_start_date); }
        if (data.lease_end_date !== undefined) { existing.leaseEndDate = dateOrNull(data.lease_end_date); }
        if (data.indexation_start_date !== undefined) { existing.indexationStartDate = dateOrNull(data.indexation_start_date); }
      }
      registerOffice(office);
      // Inline zone capacities (cabinet/open_space/vip columns).
      if (office.type === C.OFFICE_TYPE.PHYSICAL) {
        applyInlineZones(office, data);
      }
    });

    // Zones (explicit sheet rows). Deduplicates by name to prevent doubling on re-import.
    parsed.zones.forEach(function (z) {
      var office = findOffice(z.officeName, z.officePhase);
      if (!office || office.type !== C.OFFICE_TYPE.PHYSICAL) {
        parsed.report.warnings.push('Зона «' + z.name + '»: офис «' + z.officeName + '» не найден');
        return;
      }
      office.zones = office.zones || [];
      removeAutoOpenSpaceIfEmpty(office);
      var zNameLower = z.name.toLowerCase();
      var existing = office.zones.filter(function (ez) { return ez.name.toLowerCase() === zNameLower; })[0];
      if (existing) {
        existing.capacity = z.capacity;
        existing.type = z.type;
        existing.isVipZone = z.isVipZone;
        existing.comment = z.comment;
      } else {
        office.zones.push({
          id: U.genId('zone'),
          name: z.name,
          type: z.type,
          capacity: z.capacity,
          isVipZone: z.isVipZone,
          isSystem: false,
          comment: z.comment
        });
      }
    });

    // Tenants (office tenant list).
    (parsed.tenants || []).forEach(function (t) {
      // Synthetic "Без арендатора" is a computed export artifact — never a real tenant.
      if ((t.name || '').trim().toLowerCase() === NO_TENANT_LABEL.toLowerCase()) { return; }
      var office = findOffice(t.officeName, t.officePhase);
      if (!office || office.type !== C.OFFICE_TYPE.PHYSICAL) {
        parsed.report.warnings.push('Арендатор «' + t.name + '»: офис «' + t.officeName + '» не найден');
        return;
      }
      office.tenants = office.tenants || [];
      var exT = office.tenants.filter(function (x) { return (x.name || '').toLowerCase() === t.name.toLowerCase(); })[0];
      if (exT) { exT.area = t.area; }
      else { office.tenants.push({ id: U.genId('tenant'), name: t.name, area: t.area }); }
    });

    // Resolve a zone by name within an office; "—"/"-"/"Без зоны"/empty → no zone.
    function resolveZone(office, zoneName) {
      var n = (zoneName || '').trim().toLowerCase();
      if (!n || n === '—' || n === '-' || n === 'без зоны') { return null; }
      var found = null;
      (office.zones || []).forEach(function (z) { if ((z.name || '').trim().toLowerCase() === n) { found = z; } });
      return found;
    }

    // Teams (attributes only; placements are applied further below).
    var teamByName = {};
    scenario.teams.forEach(function (t) { teamByName[t.name.toLowerCase()] = t; });
    parsed.teams.forEach(function (data) {
      var team = {
        id: U.genId('team'),
        name: data.name,
        employeesCount: data.employeesCount,
        currentOfficeId: null,
        toBeOfficeId: null,
        isVip: data.isVip,
        linkedTeamIds: [],
        comment: data.comment
      };
      scenario.teams.push(team);
      teamByName[team.name.toLowerCase()] = team;
    });

    // Resolve linked team names to IDs (requires all teams to exist first).
    parsed.teams.forEach(function (data) {
      if (!data.linkedTeamNames) { return; }
      var team = teamByName[data.name.toLowerCase()];
      if (!team) { return; }
      data.linkedTeamNames.split(',').forEach(function (raw) {
        var n = raw.trim().toLowerCase();
        if (!n) { return; }
        var linked = teamByName[n];
        if (linked && linked.id !== team.id && team.linkedTeamIds.indexOf(linked.id) === -1) {
          team.linkedTeamIds.push(linked.id);
        }
      });
    });

    // Auto-create teams referenced by employees but missing from the Teams sheet.
    var autoCreatedTeams = 0;
    parsed.employees.forEach(function (data) {
      var name = (data.teamName || '').trim();
      if (!name) { return; }
      if (!teamByName[name.toLowerCase()]) {
        var newTeam = {
          id: U.genId('team'),
          name: name,
          employeesCount: 0,
          currentOfficeId: null,
          isVip: false,
          linkedTeamIds: [],
          comment: ''
        };
        scenario.teams.push(newTeam);
        teamByName[name.toLowerCase()] = newTeam;
        autoCreatedTeams++;
      }
    });
    if (autoCreatedTeams > 0) {
      parsed.report.warnings.push('Автоматически создано команд: ' + autoCreatedTeams);
    }

    // Employees: create + place per phase from the AS-IS / TO-BE blocks.
    parsed.employees.forEach(function (data) {
      var team = teamByName[(data.teamName || '').toLowerCase()];
      var emp = {
        id: U.genId('employee'),
        fullName: data.fullName,
        position: data.position,
        teamId: team ? team.id : null,
        currentOfficeId: null,
        isVip: data.isVip,
        workFormat: data.workFormat,
        comment: data.comment
      };
      scenario.employees.push(emp);
      [[data.asisOfficeName, data.asisZoneName, C.OFFICE_PHASE.ASIS],
       [data.tobeOfficeName, data.tobeZoneName, C.OFFICE_PHASE.TOBE]].forEach(function (spec) {
        var officeName = spec[0];
        if (!officeName) { return; }
        var office = findOffice(officeName, spec[2]);
        if (!office) {
          parsed.report.warnings.push('Сотрудник «' + emp.fullName + '»: офис «' + officeName + '» не найден — пропущено');
          return;
        }
        var zone = resolveZone(office, spec[1]);
        if (spec[2] === C.OFFICE_PHASE.ASIS) { emp.currentOfficeId = office.id; }
        scenario.allocations.push({
          id: U.genId('alloc'),
          type: C.ALLOCATION_TYPE.EMPLOYEE,
          teamId: team ? team.id : null,
          employeeId: emp.id,
          employeesCount: 1,
          targetOfficeId: office.id,
          targetZoneId: zone ? zone.id : null,
          comment: ''
        });
      });
    });

    // Team placements from the Teams sheet (one row per placement). The Teams
    // and Employees sheets are the source of placements on import; the
    // Allocations sheet is exported for reference only and is NOT applied here.
    parsed.teams.forEach(function (data) {
      var team = teamByName[data.name.toLowerCase()];
      if (!team) { return; }
      var placements = (data.placements && data.placements.length) ? data.placements.slice() : [];
      // Legacy combined columns (older files): "Офис / Зона (N)" per phase.
      if (!placements.length && (data.currentOfficeName || data.toBeOfficeName)) {
        parsePlacementCell(data.currentOfficeName).forEach(function (p) {
          placements.push({ phase: C.OFFICE_PHASE.ASIS, officeName: p.officeName, zoneName: p.zoneName, count: p.count });
        });
        parsePlacementCell(data.toBeOfficeName).forEach(function (p) {
          placements.push({ phase: C.OFFICE_PHASE.TOBE, officeName: p.officeName, zoneName: p.zoneName, count: p.count });
        });
      }
      placements.forEach(function (p) {
        var office = findOffice(p.officeName, p.phase);
        if (!office) {
          parsed.report.warnings.push('Распределение «' + team.name + '»: офис «' + p.officeName + '» не найден — пропущено');
          return;
        }
        var zone = resolveZone(office, p.zoneName);
        var count = (p.count !== null && p.count !== undefined) ? p.count : (team.employeesCount || 1);
        if (count <= 0) { return; }
        var isAsis = office.phase === C.OFFICE_PHASE.ASIS;
        if (isAsis && !team.currentOfficeId) { team.currentOfficeId = office.id; }
        if (!isAsis && !team.toBeOfficeId) { team.toBeOfficeId = office.id; }
        scenario.allocations.push({
          id: U.genId('alloc'),
          type: C.ALLOCATION_TYPE.TEAM,
          teamId: team.id,
          employeeId: null,
          employeesCount: count,
          targetOfficeId: office.id,
          targetZoneId: zone ? zone.id : null,
          comment: ''
        });
      });
    });

    // Ensure employeesCount >= named count (import bypasses App.employees.add).
    scenario.teams.forEach(function (team) {
      var named = scenario.employees.filter(function (e) { return e.teamId === team.id; }).length;
      if (team.employeesCount < named) { team.employeesCount = named; }
    });

    // CF manual override (only when a non-empty CF sheet was provided).
    if (parsed.cf && parsed.cf.length) {
      var ov = { offices: [], tenants: [] };
      var cfByKey = {};
      parsed.cf.forEach(function (r) {
        var listKey = r.kind === 'tenant' ? 'tenants' : 'offices';
        var k = listKey + '|' + r.phase + '|' + r.name.toLowerCase();
        var crow = cfByKey[k];
        if (!crow) {
          crow = { id: U.genId('cfrow'), name: r.name, phase: r.phase, monthly: {} };
          cfByKey[k] = crow;
          ov[listKey].push(crow);
        }
        crow.monthly[String(r.year)] = r.monthly.slice();
      });
      scenario.cfOverride = ov;
    }

    state.notifyChange('Импорт Excel', { skipHistory: true });
    showImportReport(parsed.report);
  }

  function dateOrNull(v) {
    var s = (v === undefined || v === null) ? '' : String(v).trim();
    return s || null;
  }

  /**
   * Parse a Teams-sheet distribution cell into placement rows. Each line is
   * "Офис / Зона (N)"; zone and "(N)" are optional. Returns
   * [{ officeName, zoneName|null, count|null }]. count null → caller decides
   * (whole team). A plain "Офис" line (hand-filled) still resolves.
   */
  function parsePlacementCell(raw) {
    var out = [];
    String(raw === undefined || raw === null ? '' : raw).split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) { return; }
      var count = null;
      var m = t.match(/\((\d+)\)\s*$/);
      if (m) { count = parseInt(m[1], 10); t = t.slice(0, m.index).trim(); }
      var parts = t.split(' / ');
      var officeName = (parts.shift() || '').trim();
      var zoneName = parts.length ? parts.join(' / ').trim() : null;
      if (officeName) { out.push({ officeName: officeName, zoneName: zoneName || null, count: count }); }
    });
    return out;
  }

  function makeOffice(data) {
    // Build a physical office in the parsed phase via the state factory.
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

  function numericOrNull(v) {
    if (v === undefined || v === null || String(v).trim() === '') { return null; }
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function removeAutoOpenSpaceIfEmpty(office) {
    if (office.zones && office.zones.length === 1 && office.zones[0].isSystem &&
        (office.zones[0].capacity || 0) === 0) {
      office.zones = [];
    }
  }

  /** Convert cabinet/open_space/vip capacity columns into zones. Deduplicates by name. */
  function applyInlineZones(office, data) {
    var inline = [];
    if (numeric(data.cabinet_capacity) > 0) {
      inline.push({ name: 'Кабинеты', type: C.ZONE_TYPE.CABINET, capacity: numeric(data.cabinet_capacity), isVipZone: false });
    }
    if (numeric(data.open_space_capacity) > 0) {
      inline.push({ name: 'Опенспейс', type: C.ZONE_TYPE.OPEN_SPACE, capacity: numeric(data.open_space_capacity), isVipZone: false });
    }
    if (numeric(data.vip_capacity) > 0) {
      inline.push({ name: 'VIP-кабинеты', type: C.ZONE_TYPE.VIP, capacity: numeric(data.vip_capacity), isVipZone: true });
    }
    if (inline.length === 0) {
      return;
    }
    removeAutoOpenSpaceIfEmpty(office);
    office.zones = office.zones || [];
    inline.forEach(function (z) {
      var nameLower = z.name.toLowerCase();
      var existing = office.zones.filter(function (ez) { return ez.name.toLowerCase() === nameLower; })[0];
      if (existing) {
        existing.capacity = z.capacity;
        existing.type = z.type;
        existing.isVipZone = z.isVipZone;
      } else {
        office.zones.push({
          id: U.genId('zone'), name: z.name, type: z.type, capacity: z.capacity,
          isVipZone: z.isVipZone, isSystem: false, comment: ''
        });
      }
    });
  }

  function numeric(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  function showImportReport(report) {
    var body = U.el('div', {}, [
      U.el('h3', { text: 'Результат импорта' }),
      U.el('ul', {}, [
        U.el('li', { text: 'Импортировано офисов: ' + report.imported.offices }),
        U.el('li', { text: 'Импортировано зон: ' + report.imported.zones }),
        U.el('li', { text: 'Импортировано команд: ' + report.imported.teams }),
        U.el('li', { text: 'Импортировано сотрудников: ' + report.imported.employees }),
        U.el('li', { text: 'Импортировано размещений: ' + (report.imported.allocations || 0) }),
        U.el('li', { text: 'Ошибок: ' + report.errors.length }),
        U.el('li', { text: 'Предупреждений: ' + report.warnings.length })
      ])
    ]);
    if (report.errors.length) {
      body.appendChild(U.el('h4', { text: 'Ошибки' }));
      var ul = U.el('ul', { class: 'import-errors' });
      report.errors.slice(0, 50).forEach(function (e) { ul.appendChild(U.el('li', { text: e })); });
      body.appendChild(ul);
    }
    App.modals.open({ title: 'Импорт Excel', body: body, buttons: [{ label: 'OK', kind: 'primary' }] });
  }

  // ---- Excel export ------------------------------------------------------

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

  function exportExcel(allScenarios) {
    if (!window.XLSX) { libMissing('xlsx'); return; }
    var project = state.getProject();
    if (!allScenarios) {
      doExportExcel([state.getActiveScenario()], false);
      return;
    }
    var scenarios = project.scenarios || [];
    if (scenarios.length <= 1) {
      doExportExcel(scenarios, false);
      return;
    }
    var items = scenarios.map(function (s) {
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.style.marginRight = '8px';
      cb.style.flexShrink = '0';
      return { scenario: s, checkbox: cb };
    });
    var rows = items.map(function (item) {
      var row = U.el('label', { class: 'import-name-row' });
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'pointer';
      row.appendChild(item.checkbox);
      row.appendChild(U.el('span', { text: item.scenario.name }));
      return row;
    });
    App.modals.open({
      title: 'Экспорт Excel',
      body: U.el('div', {}, [
        U.el('p', { text: 'Выберите сценарии для экспорта:' }),
        U.el('div', { class: 'import-names-list' }, rows)
      ]),
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Экспорт', kind: 'primary', onClick: function () {
          var selected = items.filter(function (i) { return i.checkbox.checked; })
                              .map(function (i) { return i.scenario; });
          if (!selected.length) { App.modals.alert('Выберите хотя бы один сценарий.'); return false; }
          doExportExcel(selected, selected.length > 1);
          return true;
        }}
      ]
    });
  }

  function withScenarioCol(header, includeScenario) {
    return includeScenario ? ['scenario_name'].concat(header) : header;
  }

  function rowWithScenario(scenario, row, includeScenario) {
    return includeScenario ? [scenario.name].concat(row) : row;
  }

  function buildSummary(scenarios, inc) {
    var aoa = [withScenarioCol(['kpi', 'value'], inc)];
    scenarios.forEach(function (s) {
      var k = calc.calculateScenarioKpis(s, App.validation.validateScenario(s));
      [
        ['Всего сотрудников', k.totalEmployees],
        ['Требуется посадочных мест', k.requiredSeats],
        ['Вместимость новых офисов', k.newOfficesCapacity],
        ['Распределено в офисы', k.placedInOffices],
        ['На удаленке', k.remoteCount],
        ['Не размещено', k.unplacedCount],
        ['Свободный резерв', k.freeReserve],
        ['Переполнение офисов', k.officeOverflow],
        ['Переполнение зон', k.zoneOverflow],
        ['Предупреждения', k.warningsCount],
        ['Ошибки', k.errorsCount]
      ].forEach(function (r) {
        aoa.push(rowWithScenario(s, r, inc));
      });
    });
    return aoa;
  }

  function buildOffices(scenarios, inc) {
    var aoa = [withScenarioCol(['office_name', 'office_type', 'area', 'rent_per_sqm', 'opex_per_sqm', 'indexation_pct', 'lease_start_date', 'lease_end_date', 'indexation_start_date', 'is_draft', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.offices.forEach(function (o) {
        var phaseOut = o.type === C.OFFICE_TYPE.REMOTE ? 'remote' : (o.phase || '');
        aoa.push(rowWithScenario(s, [
          o.name, phaseOut, o.area || 0,
          (o.rentPerSqm !== null && o.rentPerSqm !== undefined) ? o.rentPerSqm : '',
          (o.opexPerSqm !== null && o.opexPerSqm !== undefined) ? o.opexPerSqm : '',
          (o.indexationPct !== null && o.indexationPct !== undefined) ? o.indexationPct : '',
          o.leaseStartDate || '', o.leaseEndDate || '', o.indexationStartDate || '',
          o.isDraft ? 'да' : 'нет', o.comment || ''
        ], inc));
      });
    });
    return aoa;
  }

  function buildZones(scenarios, inc) {
    var aoa = [withScenarioCol(['office_name', 'office_phase', 'zone_name', 'zone_type', 'capacity', 'is_vip_zone', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.offices.filter(function (o) { return o.type === C.OFFICE_TYPE.PHYSICAL; }).forEach(function (o) {
        var phaseOut = o.phase || 'tobe';
        (o.zones || []).forEach(function (z) {
          aoa.push(rowWithScenario(s, [
            o.name, phaseOut, z.name, z.type, z.capacity || 0,
            z.isVipZone ? 'да' : 'нет', z.comment || ''
          ], inc));
        });
      });
    });
    return aoa;
  }

  /**
   * A team's actual placement in a phase as human-readable lines
   * "Офис / Зона (N)" (one per office+zone), newline-joined — mirrors the
   * "Команды" tab. Count = max(bulk TEAM seats, named employees) per office/zone.
   * AS-IS = asis offices; TO-BE = tobe or remote offices. Falls back to the
   * legacy declared office name when the team has no allocation in that phase.
   */
  function teamPhasePlacements(s, team, phase, legacyOfficeId) {
    var byKey = {};
    var order = [];
    (s.allocations || []).forEach(function (a) {
      if (a.teamId !== team.id) { return; }
      var o = U.findById(s.offices, a.targetOfficeId);
      if (!o) { return; }
      var inPhase = phase === C.OFFICE_PHASE.ASIS
        ? o.phase === C.OFFICE_PHASE.ASIS
        : (o.phase === C.OFFICE_PHASE.TOBE || o.type === C.OFFICE_TYPE.REMOTE);
      if (!inPhase) { return; }
      var zoneId = a.targetZoneId || '';
      var key = a.targetOfficeId + '|' + zoneId;
      if (!byKey[key]) {
        var zone = zoneId ? U.findById(o.zones || [], zoneId) : null;
        byKey[key] = { officeName: o.name, zoneName: zone ? zone.name : null, teamSeats: 0, named: 0 };
        order.push(key);
      }
      if (a.type === C.ALLOCATION_TYPE.TEAM) { byKey[key].teamSeats += (a.employeesCount || 0); }
      else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) { byKey[key].named += 1; }
    });
    if (order.length) {
      return order.map(function (k) {
        var e = byKey[k];
        var count = Math.max(e.teamSeats, e.named);
        return e.officeName + (e.zoneName ? ' / ' + e.zoneName : '') + ' (' + count + ')';
      }).join('\n');
    }
    var legacy = U.findById(s.offices, legacyOfficeId);
    return legacy ? legacy.name : '';
  }

  /**
   * A team's placements as structured rows [{phase, officeName, zoneName, count}],
   * grouped by office/zone per phase (count = max(bulk seats, named employees)).
   */
  function teamPlacementRows(s, team) {
    var out = [];
    [C.OFFICE_PHASE.ASIS, C.OFFICE_PHASE.TOBE].forEach(function (phase) {
      var byKey = {}; var order = [];
      (s.allocations || []).forEach(function (a) {
        if (a.teamId !== team.id) { return; }
        var o = U.findById(s.offices, a.targetOfficeId);
        if (!o) { return; }
        var inPhase = phase === C.OFFICE_PHASE.ASIS
          ? o.phase === C.OFFICE_PHASE.ASIS
          : (o.phase === C.OFFICE_PHASE.TOBE || o.type === C.OFFICE_TYPE.REMOTE);
        if (!inPhase) { return; }
        var zoneId = a.targetZoneId || '';
        var key = a.targetOfficeId + '|' + zoneId;
        if (!byKey[key]) {
          var zone = zoneId ? U.findById(o.zones || [], zoneId) : null;
          byKey[key] = { phase: phase, officeName: o.name, zoneName: zone ? zone.name : '', teamSeats: 0, named: 0 };
          order.push(key);
        }
        if (a.type === C.ALLOCATION_TYPE.TEAM) { byKey[key].teamSeats += (a.employeesCount || 0); }
        else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) { byKey[key].named += 1; }
      });
      order.forEach(function (k) {
        var e = byKey[k];
        out.push({ phase: e.phase, officeName: e.officeName, zoneName: e.zoneName, count: Math.max(e.teamSeats, e.named) });
      });
    });
    return out;
  }

  function buildTeams(scenarios, inc) {
    var aoa = [withScenarioCol(['team_name', 'employees_count', 'is_vip', 'linked_teams', 'comment',
      'phase', 'office', 'zone', 'count'], inc)];
    scenarios.forEach(function (s) {
      s.teams.forEach(function (t) {
        var linkedNames = (t.linkedTeamIds || []).map(function (id) {
          var lt = U.findById(s.teams, id);
          return lt ? lt.name : '';
        }).filter(Boolean).join(', ');
        var base = [t.name, t.employeesCount || 0, t.isVip ? 'да' : 'нет', linkedNames, t.comment || ''];
        var places = teamPlacementRows(s, t);
        if (!places.length) {
          aoa.push(rowWithScenario(s, base.concat(['', '', '', '']), inc));
        } else {
          places.forEach(function (p) {
            aoa.push(rowWithScenario(s, base.concat([
              p.phase === C.OFFICE_PHASE.ASIS ? 'AS-IS' : 'TO-BE',
              p.officeName, p.zoneName || '', p.count
            ]), inc));
          });
        }
      });
    });
    return aoa;
  }

  /** Office/zone names for an employee in a phase (from placementOf), or ['', '']. */
  function empPhaseOfficeZone(s, e, phase) {
    var pl = App.employees.placementOf(s, e);
    var ph = phase === C.OFFICE_PHASE.ASIS ? pl.asIs : pl.tobe;
    if (!ph || !ph.officeId) { return ['', '']; }
    var o = U.findById(s.offices, ph.officeId);
    if (!o) { return ['', '']; }
    var z = ph.zoneId ? U.findById(o.zones || [], ph.zoneId) : null;
    return [o.name, z ? z.name : ''];
  }

  function buildEmployees(scenarios, inc) {
    var aoa = [withScenarioCol(['full_name', 'position', 'team_name',
      'current_office', 'cabinet', 'is_vip', 'work_format',
      'to_be_office', 'to_be_zone', 'to_be_is_vip', 'to_be_work_format', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.employees.forEach(function (e) {
        var team = U.findById(s.teams, e.teamId);
        var asis = empPhaseOfficeZone(s, e, C.OFFICE_PHASE.ASIS);
        var tobe = empPhaseOfficeZone(s, e, C.OFFICE_PHASE.TOBE);
        var vip = e.isVip ? 'да' : 'нет';
        var fmt = C.WORK_FORMAT_LABEL[e.workFormat] || e.workFormat;
        aoa.push(rowWithScenario(s, [
          e.fullName, e.position || '', team ? team.name : '',
          asis[0], asis[1], vip, fmt,      // AS-IS block
          tobe[0], tobe[1], vip, fmt,      // TO-BE block (vip/work_format mirror AS-IS)
          e.comment || ''
        ], inc));
      });
    });
    return aoa;
  }

  /** An employee's placement in a phase as "Офис / Зона" (effective, incl. team
   * fallback). Empty when unplaced in that phase. */
  function empPhasePlacement(s, e, phase) {
    var pl = App.employees.placementOf(s, e);
    var ph = phase === C.OFFICE_PHASE.ASIS ? pl.asIs : pl.tobe;
    if (!ph || !ph.officeId) { return ''; }
    var o = U.findById(s.offices, ph.officeId);
    if (!o) { return ''; }
    var z = ph.zoneId ? U.findById(o.zones || [], ph.zoneId) : null;
    return o.name + (z ? ' / ' + z.name : '');
  }

  /**
   * One row per entity (team + employee) with AS-IS / TO-BE placement columns
   * ("Офис / Зона"; teams add "(N)"). On import, employee rows are applied per
   * phase; team rows are informational (the Teams sheet is authoritative).
   */
  function buildAllocations(scenarios, inc) {
    var aoa = [withScenarioCol(['type', 'entity', 'as_is', 'to_be'], inc)];
    scenarios.forEach(function (s) {
      s.teams.forEach(function (t) {
        aoa.push(rowWithScenario(s, [
          C.ALLOCATION_TYPE.TEAM, t.name,
          teamPhasePlacements(s, t, C.OFFICE_PHASE.ASIS, t.currentOfficeId),
          teamPhasePlacements(s, t, C.OFFICE_PHASE.TOBE, t.toBeOfficeId)
        ], inc));
      });
      s.employees.forEach(function (e) {
        aoa.push(rowWithScenario(s, [
          C.ALLOCATION_TYPE.EMPLOYEE, e.fullName,
          empPhasePlacement(s, e, C.OFFICE_PHASE.ASIS),
          empPhasePlacement(s, e, C.OFFICE_PHASE.TOBE)
        ], inc));
      });
    });
    return aoa;
  }

  function buildTenants(scenarios, inc) {
    var aoa = [withScenarioCol(['office_name', 'office_phase', 'tenant_name', 'area'], inc)];
    scenarios.forEach(function (s) {
      s.offices.filter(function (o) { return o.type === C.OFFICE_TYPE.PHYSICAL; }).forEach(function (o) {
        var phaseOut = o.phase || 'tobe';
        var hasMoney = o.rentPerSqm || o.opexPerSqm;
        var tList = o.tenants || [];
        var assigned = 0;
        tList.forEach(function (t) {
          aoa.push(rowWithScenario(s, [o.name, phaseOut, t.name || '', t.area || 0], inc));
          assigned += (t.area || 0);
        });
        // Remaining (or whole) office area as the computed "Без арендатора" row,
        // matching the CF-by-tenant breakdown. Only when the office carries rent/opex.
        var remaining = (o.area || 0) - assigned;
        if (hasMoney && remaining > 0.001) {
          aoa.push(rowWithScenario(s, [o.name, phaseOut, NO_TENANT_LABEL, remaining], inc));
        }
      });
    });
    return aoa;
  }

  function buildCF(scenarios, inc) {
    var aoa = [withScenarioCol(['kind', 'phase', 'name', 'year', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'], inc)];
    var cfS = {};
    try { var st = state.getSettings(); cfS = (st && st.cfSettings) || {}; } catch (e) { cfS = {}; }
    var startY = cfS.startYear || 2026;
    var endY = cfS.endYear || 2030;
    var cfYears = [];
    for (var yy = startY; yy <= endY; yy++) { cfYears.push(yy); }
    scenarios.forEach(function (s) {
      // Manual override when present; otherwise the computed CF (same numbers the
      // Финансы/Визуализация tabs show), so the sheet is never empty.
      var ov = s.cfOverride || calc.buildOverrideFromComputed(s, cfYears);
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

  function buildWarnings(scenarios, inc) {
    var aoa = [withScenarioCol(['level', 'code', 'message'], inc)];
    scenarios.forEach(function (s) {
      App.validation.validateScenario(s).forEach(function (m) {
        aoa.push(rowWithScenario(s, [m.level, m.code, m.message], inc));
      });
    });
    return aoa;
  }

  // ---- PDF ---------------------------------------------------------------

  function exportPdf() {
    var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFCtor) {
      libMissing('jspdf');
      return;
    }
    var project = state.getProject();
    var includeNames = project.settings['export'].includePersonalDataInPdf;
    var doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
    var margin = 40;
    var y = margin;
    var pageHeight = doc.internal.pageSize.getHeight();
    var pageWidth = doc.internal.pageSize.getWidth();
    var maxWidth = pageWidth - margin * 2;

    // Use the embedded PT Sans (Cyrillic) when libs/pdf-fonts.js is loaded.
    // Fall back to a core font otherwise (Latin-only).
    var fontName = pdfFontAvailable(doc) ? 'PTSans' : 'helvetica';

    function line(text, size, bold) {
      var fontSize = size || 11;
      doc.setFontSize(fontSize);
      doc.setFont(fontName, bold ? 'bold' : 'normal');
      // Wrap long lines to the page width so Cyrillic text never overflows.
      var wrapped = doc.splitTextToSize(String(text), maxWidth);
      wrapped.forEach(function (segment) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(segment, margin, y);
        y += fontSize + 6;
      });
    }

    line('Дашборд рассадки сотрудников — Отчет', 16, true);
    y += 6;

    // Scenario comparison.
    line('Сравнение сценариев (KPI):', 13, true);
    project.scenarios.forEach(function (s) {
      var k = calc.calculateScenarioKpis(s, App.validation.validateScenario(s));
      line('• ' + s.name, 12, true);
      line('  Всего: ' + k.totalEmployees + ', Требуется мест: ' + k.requiredSeats +
        ', Вместимость: ' + k.newOfficesCapacity + ', В офисах: ' + k.placedInOffices +
        ', Удаленка: ' + k.remoteCount + ', Не размещено: ' + k.unplacedCount);
      line('  Резерв: ' + k.freeReserve + ', Переполнение офисов: ' + k.officeOverflow +
        ', Переполнение зон: ' + k.zoneOverflow + ', Предупреждений: ' + k.warningsCount +
        ', Ошибок: ' + k.errorsCount);
    });

    // Office cards + warnings per scenario.
    project.scenarios.forEach(function (s) {
      y += 6;
      line('Сценарий: ' + s.name, 13, true);
      calc.getNewOffices(s).forEach(function (o) {
        var cap = calc.calculateOfficeCapacity(o);
        var occ = calc.calculateOfficeOccupancy(s, o.id);
        var over = calc.calculateOverflow(cap, occ);
        line('  Офис ' + o.name + ': ' + occ + '/' + cap + (over > 0 ? ' — ' + U.formatOverflow(over) : ''));
        (o.zones || []).forEach(function (z) {
          var zOcc = calc.calculateZoneOccupancy(s, z.id);
          line('    Зона ' + z.name + ': ' + zOcc + '/' + (z.capacity || 0));
        });
      });
      var messages = App.validation.validateScenario(s);
      if (messages.length) {
        line('  Сообщения:', 12, true);
        messages.forEach(function (m) {
          if (!includeNames && m.entityType === 'employee') {
            return; // optionally hide personal data
          }
          line('   [' + levelLabelRu(m.level) + '] ' + m.message);
        });
      }
    });

    doc.save('seating-report.pdf');
  }

  /** Whether the PTSans Cyrillic font is registered with this jsPDF doc. */
  function pdfFontAvailable(doc) {
    try {
      var list = doc.getFontList();
      return !!(list && list.PTSans);
    } catch (e) {
      return false;
    }
  }

  function levelLabelRu(level) {
    if (level === C.LEVEL.ERROR) { return 'Ошибка'; }
    if (level === C.LEVEL.WARNING) { return 'Предупреждение'; }
    return 'Инфо';
  }

  // ---- PNG ---------------------------------------------------------------

  function exportPng() {
    if (!window.html2canvas) {
      libMissing('html2canvas');
      return;
    }
    // Make sure we are on the dashboard so the full board is rendered.
    if (App.render.getActiveTab() !== 'dashboard') {
      App.render.setActiveTab('dashboard');
    }
    var target = U.qs('#tab-content');
    window.html2canvas(target, { backgroundColor: '#0a0814', scale: 1 }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        if (blob) {
          U.downloadBlob(blob, 'seating-dashboard.png');
        }
      });
    })['catch'](function (e) {
      App.modals.alert('Не удалось создать PNG: ' + e.message);
    });
  }

  /** Export a single office card fragment as PNG (nice-to-have). */
  function exportOfficeFragment(officeId) {
    if (!window.html2canvas) {
      libMissing('html2canvas');
      return;
    }
    var card = U.qs('[data-drop-office="' + officeId + '"]');
    if (!card) {
      App.modals.alert('Карточка офиса не найдена на экране.');
      return;
    }
    window.html2canvas(card, { backgroundColor: '#0a0814' }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        if (blob) {
          U.downloadBlob(blob, 'office-fragment.png');
        }
      });
    });
  }

  // ---- Shared helpers ----------------------------------------------------

  function pickFile(accept, onFile) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) {
        onFile(input.files[0]);
      }
    });
    input.click();
  }

  function libMissing(name) {
    App.modals.alert('Библиотека ' + name + ' не найдена в папке libs/. ' +
      'Положите соответствующий .js файл в libs/ и перезагрузите страницу.');
  }

  return {
    exportJson: exportJson,
    importJsonDialog: importJsonDialog,
    downloadExcelTemplate: downloadExcelTemplate,
    importExcelDialog: importExcelDialog,
    exportExcel: exportExcel,
    buildWorkbook: buildWorkbook,
    applyImportParsed: applyImport,
    exportPdf: exportPdf,
    exportPng: exportPng,
    exportOfficeFragment: exportOfficeFragment
  };
})();
