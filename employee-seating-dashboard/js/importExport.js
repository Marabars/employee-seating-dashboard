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

  function exportJson() {
    var project = state.getProject();
    var blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    U.downloadBlob(blob, 'seating-project.json');
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
          // Import is one coarse action in undo history.
          App.undoRedo.checkpoint();
          state.setProject(state.normalizeProject(obj));
          state.notifyChange('Импорт JSON', { skipHistory: true });
          App.modals.alert('Проект импортирован.');
        } catch (e) {
          App.modals.alert('Не удалось прочитать JSON: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // ---- Excel template ----------------------------------------------------

  function downloadExcelTemplate() {
    if (!window.XLSX) {
      libMissing('xlsx');
      return;
    }
    var wb = XLSX.utils.book_new();
    // Russian headers (the importer accepts both RU and EN — see EXCEL_HEADERS).
    addSheetFromHeaders(wb, 'Offices', ['Название офиса', 'Тип офиса', 'Площадь', 'Аренда, ₽/м²', 'Эксплуатация, ₽/м²', 'Индексация, %/год', 'Черновик', 'Комментарий']);
    addSheetFromHeaders(wb, 'Zones', ['Название офиса', 'Название зоны', 'Тип зоны', 'Вместимость', 'VIP-зона', 'Комментарий']);
    addSheetFromHeaders(wb, 'Teams', ['Название команды', 'Количество сотрудников', 'Текущий офис', 'VIP', 'Можно делить', 'Комментарий']);
    addSheetFromHeaders(wb, 'Employees', ['ФИО', 'Должность', 'Команда', 'Текущий офис', 'Кабинет', 'VIP', 'Формат работы', 'Комментарий']);
    addSheetFromHeaders(wb, 'Allocations', ['Тип', 'Название', 'Количество', 'Офис', 'Зона', 'Комментарий']);
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
            allocations: sheetToAoa(wb, 'Allocations')
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

    var officeByName = {};
    scenario.offices.forEach(function (o) { officeByName[o.name.toLowerCase()] = o; });

    // Offices.
    parsed.offices.forEach(function (data) {
      var existing = officeByName[data.name.toLowerCase()];
      var office = existing || makeOffice(data);
      if (!existing) {
        scenario.offices.push(office);
        officeByName[data.name.toLowerCase()] = office;
      }
      // Inline zone capacities (cabinet/open_space/vip columns).
      if (office.type === C.OFFICE_TYPE.PHYSICAL) {
        applyInlineZones(office, data);
      }
    });

    // Zones (explicit sheet rows).
    parsed.zones.forEach(function (z) {
      var office = officeByName[z.officeName.toLowerCase()];
      if (!office || office.type !== C.OFFICE_TYPE.PHYSICAL) {
        parsed.report.warnings.push('Зона «' + z.name + '»: офис «' + z.officeName + '» не найден');
        return;
      }
      office.zones = office.zones || [];
      // Remove auto open-space placeholder if it is the only system zone.
      removeAutoOpenSpaceIfEmpty(office);
      office.zones.push({
        id: U.genId('zone'),
        name: z.name,
        type: z.type,
        capacity: z.capacity,
        isVipZone: z.isVipZone,
        isSystem: false,
        comment: z.comment
      });
    });

    // Teams.
    var teamByName = {};
    scenario.teams.forEach(function (t) { teamByName[t.name.toLowerCase()] = t; });
    parsed.teams.forEach(function (data) {
      var team = {
        id: U.genId('team'),
        name: data.name,
        employeesCount: data.employeesCount,
        currentOfficeId: officeByName[(data.currentOfficeName || '').toLowerCase()] ?
          officeByName[(data.currentOfficeName || '').toLowerCase()].id : null,
        isVip: data.isVip,
        canSplit: data.canSplit,
        comment: data.comment
      };
      scenario.teams.push(team);
      teamByName[team.name.toLowerCase()] = team;
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
      var office = officeByName[(data.currentOfficeName || '').toLowerCase()];
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
        var office = officeByName[(data.officeName || '').toLowerCase()];
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

    state.notifyChange('Импорт Excel', { skipHistory: true });
    showImportReport(parsed.report);
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
      indexationPct: numericOrNull(data.indexation_pct)
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

  /** Convert cabinet/open_space/vip capacity columns into zones. */
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
      office.zones.push({
        id: U.genId('zone'), name: z.name, type: z.type, capacity: z.capacity,
        isVipZone: z.isVipZone, isSystem: false, comment: ''
      });
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

  function exportExcel(allScenarios) {
    if (!window.XLSX) {
      libMissing('xlsx');
      return;
    }
    var project = state.getProject();
    var scenarios = allScenarios ? project.scenarios : [state.getActiveScenario()];
    var wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildSummary(scenarios, allScenarios)), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildOffices(scenarios, allScenarios)), 'Offices');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildZones(scenarios, allScenarios)), 'Zones');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildTeams(scenarios, allScenarios)), 'Teams');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildEmployees(scenarios, allScenarios)), 'Employees');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildAllocations(scenarios, allScenarios)), 'Allocations');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildWarnings(scenarios, allScenarios)), 'Warnings');

    XLSX.writeFile(wb, allScenarios ? 'seating-all-scenarios.xlsx' : 'seating-scenario.xlsx');
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
    var aoa = [withScenarioCol(['office_name', 'office_type', 'area', 'rent_per_sqm', 'opex_per_sqm', 'indexation_pct', 'is_draft', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.offices.forEach(function (o) {
        var phaseOut = o.type === C.OFFICE_TYPE.REMOTE ? 'remote' : (o.phase || '');
        aoa.push(rowWithScenario(s, [
          o.name, phaseOut, o.area || 0,
          (o.rentPerSqm !== null && o.rentPerSqm !== undefined) ? o.rentPerSqm : '',
          (o.opexPerSqm !== null && o.opexPerSqm !== undefined) ? o.opexPerSqm : '',
          (o.indexationPct !== null && o.indexationPct !== undefined) ? o.indexationPct : '',
          o.isDraft ? 'да' : 'нет', o.comment || ''
        ], inc));
      });
    });
    return aoa;
  }

  function buildZones(scenarios, inc) {
    var aoa = [withScenarioCol(['office_name', 'zone_name', 'zone_type', 'capacity', 'is_vip_zone', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.offices.filter(function (o) { return o.type === C.OFFICE_TYPE.PHYSICAL; }).forEach(function (o) {
        (o.zones || []).forEach(function (z) {
          aoa.push(rowWithScenario(s, [
            o.name, z.name, z.type, z.capacity || 0,
            z.isVipZone ? 'да' : 'нет', z.comment || ''
          ], inc));
        });
      });
    });
    return aoa;
  }

  function buildTeams(scenarios, inc) {
    var aoa = [withScenarioCol(['team_name', 'employees_count', 'current_office', 'is_vip', 'can_split', 'comment'], inc)];
    scenarios.forEach(function (s) {
      s.teams.forEach(function (t) {
        var currentOffice = U.findById(s.offices, t.currentOfficeId);
        aoa.push(rowWithScenario(s, [
          t.name, t.employeesCount || 0,
          currentOffice ? currentOffice.name : '',
          t.isVip ? 'да' : 'нет', t.canSplit === false ? 'нет' : 'да', t.comment || ''
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
        aoa.push(rowWithScenario(s, [
          e.fullName, e.position || '', team ? team.name : '',
          currentOffice ? currentOffice.name : '',
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
    var aoa = [withScenarioCol(['type', 'entity', 'count', 'office', 'zone', 'comment'], inc)];
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
        aoa.push(rowWithScenario(s, [
          a.type, entity, a.employeesCount,
          office ? office.name : '', zone ? zone.name : '', a.comment || ''
        ], inc));
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
    exportPdf: exportPdf,
    exportPng: exportPng,
    exportOfficeFragment: exportOfficeFragment
  };
})();
