/**
 * validation.import.js
 * Maps and validates Excel rows into canonical entities. Supports RU/EN
 * headers. Valid rows are converted; invalid rows are reported and skipped.
 * Duplicates are treated as errors (ТЗ §20.5).
 */
window.App = window.App || {};

App.importValidation = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;

  /**
   * Build a header->canonical-field index for a sheet by matching the actual
   * column headers against EXCEL_HEADERS aliases.
   * `headerRow` is an array of raw header strings.
   * Returns { fieldName: columnIndex }.
   */
  function mapHeaders(sheetKey, headerRow) {
    var spec = C.EXCEL_HEADERS[sheetKey];
    var index = {};
    headerRow.forEach(function (raw, col) {
      var norm = String(raw || '').trim().toLowerCase();
      Object.keys(spec).forEach(function (field) {
        if (spec[field].indexOf(norm) > -1) {
          index[field] = col;
        }
      });
    });
    return index;
  }

  function cell(row, index, field) {
    var col = index[field];
    if (col === undefined) {
      return undefined;
    }
    return row[col];
  }

  /**
   * Parse the whole workbook (already converted to per-sheet arrays-of-arrays)
   * into entities + a report.
   *
   * sheets: { offices: [[...]], zones: [[...]], teams: [[...]], employees: [[...]] }
   * where the first row of each is the header row.
   *
   * Returns:
   *   { offices, zones, teams, employees, report }
   * report: { imported:{...}, errors:[...], warnings:[...] }
   */
  function parseWorkbook(sheets) {
    var result = {
      offices: [],
      zones: [],
      teams: [],
      employees: [],
      allocations: [],
      report: {
        imported: { offices: 0, zones: 0, teams: 0, employees: 0, allocations: 0 },
        errors: [],
        warnings: []
      }
    };

    parseOffices(sheets.offices, result);
    parseZones(sheets.zones, result);
    parseTeams(sheets.teams, result);
    parseEmployees(sheets.employees, result);
    parseAllocations(sheets.allocations, result);

    return result;
  }

  function rowsAfterHeader(sheet) {
    if (!sheet || sheet.length < 2) {
      return { header: sheet && sheet[0] ? sheet[0] : [], rows: [] };
    }
    return { header: sheet[0], rows: sheet.slice(1) };
  }

  function isEmptyRow(row) {
    return !row || row.every(function (v) {
      return v === undefined || v === null || String(v).trim() === '';
    });
  }

  function parseOffices(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) {
      return;
    }
    var idx = mapHeaders('offices', data.header);
    var names = {};
    data.rows.forEach(function (row, i) {
      if (isEmptyRow(row)) {
        return;
      }
      var rowNo = i + 2;
      var name = String(cell(row, idx, 'office_name') || '').trim();
      if (!name) {
        result.report.errors.push('Offices, строка ' + rowNo + ': пустое название офиса');
        return;
      }
      if (names[name.toLowerCase()]) {
        result.report.errors.push('Offices, строка ' + rowNo + ': дубликат офиса «' + name + '»');
        return;
      }
      // office_type column now carries the phase (AS IS / TO BE).
      var phaseRaw = String(cell(row, idx, 'office_type') || 'tobe').trim().toLowerCase();
      var phase = C.OFFICE_PHASE_ALIASES[phaseRaw] || C.OFFICE_PHASE.TOBE;

      names[name.toLowerCase()] = true;
      var office = {
        name: name,
        phase: phase,
        area: U.toNonNegativeInt(cell(row, idx, 'area')),
        isDraft: U.parseBoolean(cell(row, idx, 'is_draft')),
        comment: String(cell(row, idx, 'comment') || ''),
        // optional inline zone capacities
        cabinet_capacity: cell(row, idx, 'cabinet_capacity'),
        open_space_capacity: cell(row, idx, 'open_space_capacity'),
        vip_capacity: cell(row, idx, 'vip_capacity'),
        capacity: cell(row, idx, 'capacity'),
        // optional money fields
        rent_per_sqm: cell(row, idx, 'rent_per_sqm'),
        opex_per_sqm: cell(row, idx, 'opex_per_sqm'),
        indexation_pct: cell(row, idx, 'indexation_pct')
      };
      result.offices.push(office);
      result.report.imported.offices += 1;
    });
  }

  function parseZones(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) {
      return;
    }
    var idx = mapHeaders('zones', data.header);
    data.rows.forEach(function (row, i) {
      if (isEmptyRow(row)) {
        return;
      }
      var rowNo = i + 2;
      var officeName = String(cell(row, idx, 'office_name') || '').trim();
      var zoneName = String(cell(row, idx, 'zone_name') || '').trim();
      if (!officeName || !zoneName) {
        result.report.errors.push('Zones, строка ' + rowNo + ': требуется офис и название зоны');
        return;
      }
      var typeRaw = String(cell(row, idx, 'zone_type') || 'open_space').trim().toLowerCase();
      var type = C.ZONE_TYPE_ALIASES[typeRaw] || C.ZONE_TYPE.OPEN_SPACE;
      var isVip = U.parseBoolean(cell(row, idx, 'is_vip_zone')) || type === C.ZONE_TYPE.VIP;
      result.zones.push({
        officeName: officeName,
        name: zoneName,
        type: type,
        capacity: U.toNonNegativeInt(cell(row, idx, 'capacity')),
        isVipZone: isVip,
        comment: String(cell(row, idx, 'comment') || '')
      });
      result.report.imported.zones += 1;
    });
  }

  function parseTeams(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) {
      return;
    }
    var idx = mapHeaders('teams', data.header);
    var names = {};
    data.rows.forEach(function (row, i) {
      if (isEmptyRow(row)) {
        return;
      }
      var rowNo = i + 2;
      var name = String(cell(row, idx, 'team_name') || '').trim();
      if (!name) {
        result.report.errors.push('Teams, строка ' + rowNo + ': пустое название команды');
        return;
      }
      if (names[name.toLowerCase()]) {
        result.report.errors.push('Teams, строка ' + rowNo + ': дубликат команды «' + name + '»');
        return;
      }
      names[name.toLowerCase()] = true;
      result.teams.push({
        name: name,
        employeesCount: U.toNonNegativeInt(cell(row, idx, 'employees_count')),
        currentOfficeName: String(cell(row, idx, 'current_office') || '').trim(),
        cabinetName: String(cell(row, idx, 'cabinet') || '').trim(),
        isVip: U.parseBoolean(cell(row, idx, 'is_vip')),
        canSplit: cell(row, idx, 'can_split') === undefined ? true : U.parseBoolean(cell(row, idx, 'can_split')),
        comment: String(cell(row, idx, 'comment') || '')
      });
      result.report.imported.teams += 1;
    });
  }

  function parseEmployees(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) {
      return;
    }
    var idx = mapHeaders('employees', data.header);
    data.rows.forEach(function (row, i) {
      if (isEmptyRow(row)) {
        return;
      }
      var rowNo = i + 2;
      var fullName = String(cell(row, idx, 'full_name') || '').trim();
      if (!fullName) {
        result.report.errors.push('Employees, строка ' + rowNo + ': пустое ФИО');
        return;
      }
      var formatRaw = String(cell(row, idx, 'work_format') || 'office').trim().toLowerCase();
      var workFormat = C.WORK_FORMAT_ALIASES[formatRaw] || C.WORK_FORMAT.OFFICE;
      result.employees.push({
        fullName: fullName,
        position: String(cell(row, idx, 'position') || ''),
        teamName: String(cell(row, idx, 'team_name') || '').trim(),
        currentOfficeName: String(cell(row, idx, 'current_office') || '').trim(),
        cabinetName: String(cell(row, idx, 'cabinet') || '').trim(),
        isVip: U.parseBoolean(cell(row, idx, 'is_vip')),
        workFormat: workFormat,
        comment: String(cell(row, idx, 'comment') || '')
      });
      result.report.imported.employees += 1;
    });
  }

  function parseAllocations(sheet, result) {
    if (!sheet || sheet.length < 2) { return; }
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) { return; }
    var idx = mapHeaders('allocations', data.header);
    data.rows.forEach(function (row) {
      if (isEmptyRow(row)) { return; }
      var typeRaw = String(cell(row, idx, 'type') || '').trim().toLowerCase();
      var entity  = String(cell(row, idx, 'entity') || '').trim();
      if (!entity) { return; }
      var type = (typeRaw === 'employee' || typeRaw === C.ALLOCATION_TYPE.EMPLOYEE)
        ? C.ALLOCATION_TYPE.EMPLOYEE : C.ALLOCATION_TYPE.TEAM;
      result.allocations.push({
        type:       type,
        entity:     entity,
        count:      U.toNonNegativeInt(cell(row, idx, 'count')) || 1,
        officeName: String(cell(row, idx, 'office') || '').trim(),
        zoneName:   String(cell(row, idx, 'zone')   || '').trim(),
        comment:    String(cell(row, idx, 'comment') || '')
      });
      result.report.imported.allocations += 1;
    });
  }

  return {
    mapHeaders: mapHeaders,
    parseWorkbook: parseWorkbook
  };
})();
