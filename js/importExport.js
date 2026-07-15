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
    addSheetFromHeaders(wb, 'Teams', ['Название команды', 'Количество сотрудников', 'AS-IS офис', 'TO-BE офис', 'VIP', 'Можно делить', 'Связанные команды', 'Комментарий']);
    addSheetFromHeaders(wb, 'Employees', ['ФИО', 'Должность', 'Команда', 'AS-IS офис', 'Кабинет', 'VIP', 'Формат работы', 'Комментарий']);
    addSheetFromHeaders(wb, 'Tenants', ['Название офиса', 'Фаза офиса', 'Арендатор', 'Площадь']);
    addSheetFromHeaders(wb, 'Allocations', ['Тип', 'Название', 'Фаза', 'Количество', 'Офис', 'Зона', 'Комментарий']);
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

    // Teams.
    var teamByName = {};
    scenario.teams.forEach(function (t) { teamByName[t.name.toLowerCase()] = t; });
    parsed.teams.forEach(function (data) {
      var currentOfficeLookup = findOffice(data.currentOfficeName, 'asis');
      var toBeOfficeLookup = findOffice(data.toBeOfficeName, 'tobe');
      var team = {
        id: U.genId('team'),
        name: data.name,
        employeesCount: data.employeesCount,
        currentOfficeId: currentOfficeLookup ? currentOfficeLookup.id : null,
        toBeOfficeId: toBeOfficeLookup ? toBeOfficeLookup.id : null,
        isVip: data.isVip,
        canSplit: data.canSplit,
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

    // Team placement from the Teams sheet office columns — only when no explicit
    // Allocations sheet was provided (which is authoritative and handles splits).
    // Mirrors the employee current_office behaviour so a hand-filled Teams sheet
    // actually places teams. A comma-listed (split) cell won't resolve to a single
    // office and is intentionally left to the Allocations sheet.
    if (!parsed.allocations.length) {
      parsed.teams.forEach(function (data) {
        var team = teamByName[data.name.toLowerCase()];
        if (!team) { return; }
        [[data.currentOfficeName, 'asis'], [data.toBeOfficeName, 'tobe']].forEach(function (pair) {
          var officeName = pair[0];
          if (!officeName) { return; }
          var office = findOffice(officeName, pair[1]);
          if (!office) { return; }
          var zone = null;
          if (data.cabinetName) {
            var cab = data.cabinetName.toLowerCase();
            (office.zones || []).forEach(function (z) { if (z.name.toLowerCase() === cab) { zone = z; } });
          }
          scenario.allocations.push({
            id: U.genId('alloc'),
            type: C.ALLOCATION_TYPE.TEAM,
            teamId: team.id,
            employeeId: null,
            employeesCount: team.employeesCount || 1,
            targetOfficeId: office.id,
            targetZoneId: zone ? zone.id : null,
            comment: ''
          });
        });
      });
    }

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
          canSplit: true,
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

    // Employees.
    parsed.employees.forEach(function (data) {
      var team = teamByName[(data.teamName || '').toLowerCase()];
      var office = findOffice(data.currentOfficeName, 'asis');
      var emp = {
        id: U.genId('employee'),
        fullName: data.fullName,
        position: data.position,
        teamId: team ? team.id : null,
        currentOfficeId: office ? office.id : null,
        isVip: data.isVip,
        workFormat: data.workFormat,
        comment: data.comment
      };
      scenario.employees.push(emp);
      // Place employee in scenario if Текущий офис or Кабинет is specified
      // and no Allocations sheet was provided (avoid duplicates).
      if (office && !parsed.allocations.length) {
        var zone = null;
        if (data.cabinetName) {
          var cab = data.cabinetName.toLowerCase();
          var zones = office.zones || [];
          for (var zi = 0; zi < zones.length; zi++) {
            if (zones[zi].name.toLowerCase() === cab) { zone = zones[zi]; break; }
          }
        }
        scenario.allocations.push({
          id: U.genId('alloc'),
          type: C.ALLOCATION_TYPE.EMPLOYEE,
          teamId: team ? team.id : null,
          employeeId: emp.id,
          targetOfficeId: office.id,
          targetZoneId: zone ? zone.id : null,
          employeesCount: 1,
          comment: ''
        });
      }
    });

    // Apply Allocations sheet rows.
    if (parsed.allocations && parsed.allocations.length) {
      var empByName = {};
      scenario.employees.forEach(function (e) { empByName[e.fullName.toLowerCase()] = e; });
      parsed.allocations.forEach(function (data) {
        var office = findOffice(data.officeName, data.phase);
        if (!office) {
          parsed.report.warnings.push('Размещение «' + data.entity + '»: офис «' + data.officeName + '» не найден — пропущено');
          return;
        }
        var zone = null;
        if (data.zoneName) {
          var zl = data.zoneName.toLowerCase();
          for (var zi = 0; zi < (office.zones || []).length; zi++) {
            if (office.zones[zi].name.toLowerCase() === zl) { zone = office.zones[zi]; break; }
          }
        }
        var alloc = {
          id: U.genId('alloc'),
          targetOfficeId: office.id,
          targetZoneId: zone ? zone.id : null,
          comment: data.comment || ''
        };
        if (data.type === C.ALLOCATION_TYPE.EMPLOYEE) {
          var emp = empByName[(data.entity || '').toLowerCase()];
          if (!emp) {
            parsed.report.warnings.push('Размещение сотрудника «' + data.entity + '»: не найден — пропущено');
            return;
          }
          alloc.type = C.ALLOCATION_TYPE.EMPLOYEE;
          alloc.teamId = emp.teamId || null;
          alloc.employeeId = emp.id;
          alloc.employeesCount = 1;
        } else {
          var team = teamByName[(data.entity || '').toLowerCase()];
          if (!team) {
            parsed.report.warnings.push('Размещение команды «' + data.entity + '»: не найдена — пропущено');
            return;
          }
          alloc.type = C.ALLOCATION_TYPE.TEAM;
          alloc.teamId = team.id;
          alloc.employeeId = null;
          alloc.employeesCount = data.count || 1;
        }
        scenario.allocations.push(alloc);
      });
    }

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
   * Distinct office names where a team is actually placed (via TEAM allocations)
   * in the given phase, comma-joined. AS-IS = asis-phase offices; TO-BE =
   * tobe-phase or remote offices (mirrors setTeamPhaseAllocations). Falls back to
   * the legacy declared office (t.currentOfficeId / t.toBeOfficeId) when the team
   * has no allocation in that phase, so single-office declarations still export.
   */
  function teamPhaseOffices(s, team, phase, legacyOfficeId) {
    var names = [];
    var seen = {};
    (s.allocations || []).forEach(function (a) {
      // Any allocation referencing this team (bulk TEAM seats OR individual
      // named-employee placements), matching the Teams-tab columns.
      if (a.teamId !== team.id) { return; }
      var o = U.findById(s.offices, a.targetOfficeId);
      if (!o) { return; }
      var inPhase = phase === C.OFFICE_PHASE.ASIS
        ? o.phase === C.OFFICE_PHASE.ASIS
        : (o.phase === C.OFFICE_PHASE.TOBE || o.type === C.OFFICE_TYPE.REMOTE);
      if (inPhase && !seen[o.id]) { seen[o.id] = true; names.push(o.name); }
    });
    if (names.length) { return names.join(', '); }
    var legacy = U.findById(s.offices, legacyOfficeId);
    return legacy ? legacy.name : '';
  }

  function buildTeams(scenarios, inc) {
    var aoa = [withScenarioCol(['team_name', 'employees_count', 'current_office', 'to_be_office', 'is_vip', 'can_split', 'linked_teams', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.teams.forEach(function (t) {
        var linkedNames = (t.linkedTeamIds || []).map(function (id) {
          var lt = U.findById(s.teams, id);
          return lt ? lt.name : '';
        }).filter(Boolean).join(', ');
        aoa.push(rowWithScenario(s, [
          t.name, t.employeesCount || 0,
          teamPhaseOffices(s, t, C.OFFICE_PHASE.ASIS, t.currentOfficeId),
          teamPhaseOffices(s, t, C.OFFICE_PHASE.TOBE, t.toBeOfficeId),
          t.isVip ? 'да' : 'нет', t.canSplit === false ? 'нет' : 'да',
          linkedNames, t.comment || ''
        ], inc));
      });
    });
    return aoa;
  }

  function buildEmployees(scenarios, inc) {
    var aoa = [withScenarioCol(['full_name', 'position', 'team_name', 'current_office', 'cabinet', 'is_vip', 'work_format', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.employees.forEach(function (e) {
        var team = U.findById(s.teams, e.teamId);
        var currentOffice = U.findById(s.offices, e.currentOfficeId);
        var placement = App.employees.placementOf(s, e);
        var placementOffice = placement.officeId ? U.findById(s.offices, placement.officeId) : null;
        var placementZone = (placement.zoneId && placementOffice)
          ? U.findById(placementOffice.zones || [], placement.zoneId) : null;
        // Office column reflects the employee's actual placement (matches the
        // cabinet column); fall back to the legacy declared "текущий офис".
        var officeCell = placementOffice ? placementOffice.name : (currentOffice ? currentOffice.name : '');
        aoa.push(rowWithScenario(s, [
          e.fullName, e.position || '', team ? team.name : '',
          officeCell,
          placementZone ? placementZone.name : '',
          e.isVip ? 'да' : 'нет',
          C.WORK_FORMAT_LABEL[e.workFormat] || e.workFormat,
          e.comment || ''
        ], inc));
      });
    });
    return aoa;
  }

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
