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
      tenants: [],
      cf: [],
      report: {
        imported: { offices: 0, zones: 0, teams: 0, employees: 0, allocations: 0, tenants: 0, cf: 0 },
        errors: [],
        warnings: []
      }
    };

    parseOffices(sheets.offices, result);
    parseZones(sheets.zones, result);
    parseTeams(sheets.teams, result);
    parseEmployees(sheets.employees, result);
    parseAllocations(sheets.allocations, result);
    parseTenants(sheets.tenants, result);
    parseCF(sheets.cf, result);

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
    var seen = {}; // key: name|phase — same name is allowed in different phases
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
      // office_type column now carries the phase (AS IS / TO BE).
      var phaseRaw = String(cell(row, idx, 'office_type') || 'tobe').trim().toLowerCase();
      var phase = C.OFFICE_PHASE_ALIASES[phaseRaw] || C.OFFICE_PHASE.TOBE;

      var key = name.toLowerCase() + '|' + phase;
      if (seen[key]) {
        result.report.errors.push('Offices, строка ' + rowNo + ': дубликат офиса «' + name + '» (фаза ' + phase + ')');
        return;
      }
      seen[key] = true;
      var office = {
        name: name,
        phase: phase,
        area: Math.max(0, parseFloat(cell(row, idx, 'area')) || 0),
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
        indexation_pct: cell(row, idx, 'indexation_pct'),
        lease_start_date: cell(row, idx, 'lease_start_date'),
        lease_end_date: cell(row, idx, 'lease_end_date'),
        indexation_start_date: cell(row, idx, 'indexation_start_date')
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
      var officePhaseRaw = String(cell(row, idx, 'office_phase') || '').trim().toLowerCase();
      var officePhase = officePhaseRaw ? (C.OFFICE_PHASE_ALIASES[officePhaseRaw] || null) : null;
      result.zones.push({
        officeName: officeName,
        officePhase: officePhase, // null when column absent — falls back to plain name lookup
        name: zoneName,
        type: type,
        capacity: U.toNonNegativeInt(cell(row, idx, 'capacity')),
        isVipZone: isVip,
        comment: String(cell(row, idx, 'comment') || '')
      });
      result.report.imported.zones += 1;
    });
  }

  /**
   * Teams: one row per placement. Rows with the same team_name belong to one
   * team; team attributes come from its first row, and each row contributes a
   * placement { phase, officeName, zoneName, count }. Legacy files with combined
   * current_office/to_be_office columns are still accepted (one row per team).
   */
  function parseTeams(sheet, result) {
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) { return; }
    var idx = mapHeaders('teams', data.header);
    var hasRowFormat = (idx.office !== undefined || idx.phase !== undefined);
    var byName = {};
    data.rows.forEach(function (row, i) {
      if (isEmptyRow(row)) { return; }
      var rowNo = i + 2;
      var name = String(cell(row, idx, 'team_name') || '').trim();
      if (!name) {
        result.report.errors.push('Teams, строка ' + rowNo + ': пустое название команды');
        return;
      }
      var key = name.toLowerCase();
      var team = byName[key];
      if (!team) {
        team = {
          name: name,
          employeesCount: U.toNonNegativeInt(cell(row, idx, 'employees_count')),
          isVip: U.parseBoolean(cell(row, idx, 'is_vip')),
          linkedTeamNames: String(cell(row, idx, 'linked_teams') || '').trim(),
          comment: String(cell(row, idx, 'comment') || ''),
          placements: [],
          // Legacy combined columns (used only when the row format is absent).
          currentOfficeName: String(cell(row, idx, 'current_office') || '').trim(),
          toBeOfficeName: String(cell(row, idx, 'to_be_office') || '').trim()
        };
        byName[key] = team;
        result.teams.push(team);
        result.report.imported.teams += 1;
      }
      if (hasRowFormat) {
        var officeName = String(cell(row, idx, 'office') || '').trim();
        if (officeName) {
          var phaseRaw = String(cell(row, idx, 'phase') || '').trim().toLowerCase();
          team.placements.push({
            phase: phaseRaw ? (C.OFFICE_PHASE_ALIASES[phaseRaw] || null) : null,
            officeName: officeName,
            zoneName: String(cell(row, idx, 'zone') || '').trim(),
            count: U.toNonNegativeInt(cell(row, idx, 'count')) || null
          });
        }
      }
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
        isVip: U.parseBoolean(cell(row, idx, 'is_vip')),
        workFormat: workFormat,
        comment: String(cell(row, idx, 'comment') || ''),
        // AS-IS block (office + zone) and TO-BE block (office + zone).
        asisOfficeName: String(cell(row, idx, 'current_office') || '').trim(),
        asisZoneName: String(cell(row, idx, 'cabinet') || '').trim(),
        tobeOfficeName: String(cell(row, idx, 'to_be_office') || '').trim(),
        tobeZoneName: String(cell(row, idx, 'to_be_zone') || '').trim()
      });
      result.report.imported.employees += 1;
    });
  }

  function parseAllocations(sheet, result) {
    if (!sheet || sheet.length < 2) { return; }
    var data = rowsAfterHeader(sheet);
    if (!data.rows.length) { return; }
    var idx = mapHeaders('allocations', data.header);
    // New per-entity format has AS-IS / TO-BE columns; legacy format has
    // per-allocation phase/office/zone columns.
    var isEntityFormat = (idx.as_is !== undefined || idx.to_be !== undefined);
    data.rows.forEach(function (row) {
      if (isEmptyRow(row)) { return; }
      var typeRaw = String(cell(row, idx, 'type') || '').trim().toLowerCase();
      var entity  = String(cell(row, idx, 'entity') || '').trim();
      if (!entity) { return; }
      var type = (typeRaw === 'employee' || typeRaw === C.ALLOCATION_TYPE.EMPLOYEE)
        ? C.ALLOCATION_TYPE.EMPLOYEE : C.ALLOCATION_TYPE.TEAM;
      if (isEntityFormat) {
        result.allocations.push({
          kind:   'entity',
          type:   type,
          entity: entity,
          asIs:   String(cell(row, idx, 'as_is') || '').trim(),
          toBe:   String(cell(row, idx, 'to_be') || '').trim()
        });
      } else {
        var allocPhaseRaw = String(cell(row, idx, 'phase') || '').trim().toLowerCase();
        result.allocations.push({
          kind:       'row',
          type:       type,
          entity:     entity,
          phase:      allocPhaseRaw ? (C.OFFICE_PHASE_ALIASES[allocPhaseRaw] || null) : null,
          count:      U.toNonNegativeInt(cell(row, idx, 'count')) || 1,
          officeName: String(cell(row, idx, 'office') || '').trim(),
          zoneName:   String(cell(row, idx, 'zone')   || '').trim(),
          comment:    String(cell(row, idx, 'comment') || '')
        });
      }
      result.report.imported.allocations += 1;
    });
  }

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

  return {
    mapHeaders: mapHeaders,
    parseWorkbook: parseWorkbook
  };
})();
