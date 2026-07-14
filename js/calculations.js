/**
 * calculations.js
 * All capacity / occupancy / overflow / KPI math. Pure functions over a
 * scenario object — no DOM, no global state reads. This is the spec's
 * "не упрощать" core and is unit-tested in tests.html.
 */
window.App = window.App || {};

App.calc = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;

  /** Office capacity = sum of its zones' capacities. Remote = Infinity. */
  function calculateOfficeCapacity(office) {
    if (!office) {
      return 0;
    }
    if (office.type === C.OFFICE_TYPE.REMOTE) {
      return Infinity;
    }
    // Physical office capacity = sum of its zone capacities (places).
    return U.sumBy(office.zones, 'capacity');
  }

  /**
   * Occupancy of an office = sum of seats allocated to it, with deduplication
   * of overlapping TEAM and EMPLOYEE allocations from the same team.
   *
   * When a team is placed via a TEAM allocation AND one or more of its named
   * members also get individual EMPLOYEE allocations in the same office, the
   * person would otherwise be counted twice (once in the team pool, once
   * individually). We resolve this the same way as calculateTeamAllocated:
   *   team contribution = max(team_seats, named_count)
   * so named employees are counted exactly once regardless of how many team
   * seats exist.
   */
  function calculateOfficeOccupancy(scenario, officeId) {
    var teamSeats = {};  // teamId -> total TEAM-type seats in this office
    var namedIds  = {};  // teamId -> { employeeId: true }
    var noTeam    = 0;   // EMPLOYEE-type seats with no associated team

    (scenario.allocations || []).forEach(function (a) {
      if (a.targetOfficeId !== officeId) { return; }
      if (a.type === C.ALLOCATION_TYPE.TEAM && a.teamId) {
        teamSeats[a.teamId] = (teamSeats[a.teamId] || 0) + (a.employeesCount || 0);
      } else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
        if (a.teamId && a.employeeId) {
          if (!namedIds[a.teamId]) { namedIds[a.teamId] = {}; }
          namedIds[a.teamId][a.employeeId] = true;
        } else {
          noTeam += 1;
        }
      }
    });

    var total = noTeam;
    // Teams with TEAM allocs: dedup against named employees in the same office.
    Object.keys(teamSeats).forEach(function (tid) {
      var named = namedIds[tid] ? Object.keys(namedIds[tid]).length : 0;
      total += Math.max(teamSeats[tid], named);
    });
    // Teams with ONLY individual EMPLOYEE allocs (no TEAM alloc): count them directly.
    Object.keys(namedIds).forEach(function (tid) {
      if (!teamSeats[tid]) {
        total += Object.keys(namedIds[tid]).length;
      }
    });
    return total;
  }

  /**
   * Occupancy of a zone = seats allocated to it, with the same TEAM/EMPLOYEE
   * deduplication as calculateOfficeOccupancy: when a team has both a TEAM
   * allocation and individual EMPLOYEE allocations in the same zone, the person
   * is counted once (max of the two counts), not twice.
   */
  function calculateZoneOccupancy(scenario, zoneId) {
    var teamSeats = {};
    var namedIds  = {};
    var noTeam    = 0;

    (scenario.allocations || []).forEach(function (a) {
      if (a.targetZoneId !== zoneId) { return; }
      if (a.type === C.ALLOCATION_TYPE.TEAM && a.teamId) {
        teamSeats[a.teamId] = (teamSeats[a.teamId] || 0) + (a.employeesCount || 0);
      } else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
        if (a.teamId && a.employeeId) {
          if (!namedIds[a.teamId]) { namedIds[a.teamId] = {}; }
          namedIds[a.teamId][a.employeeId] = true;
        } else {
          noTeam += 1;
        }
      }
    });

    var total = noTeam;
    Object.keys(teamSeats).forEach(function (tid) {
      var named = namedIds[tid] ? Object.keys(namedIds[tid]).length : 0;
      total += Math.max(teamSeats[tid], named);
    });
    Object.keys(namedIds).forEach(function (tid) {
      if (!teamSeats[tid]) {
        total += Object.keys(namedIds[tid]).length;
      }
    });
    return total;
  }

  /** Overflow = max(0, occupied - capacity). */
  function calculateOverflow(capacity, occupied) {
    if (!isFinite(capacity)) {
      return 0;
    }
    var over = occupied - capacity;
    return over > 0 ? over : 0;
  }

  /** Free places = capacity - occupied (may be negative -> overflow). */
  function calculateFreePlaces(capacity, occupied) {
    if (!isFinite(capacity)) {
      return Infinity;
    }
    return capacity - occupied;
  }

  /** Places balance = capacity - occupied (positive = profit, negative = deficit). */
  function calculateBalance(capacity, occupied) {
    if (!isFinite(capacity)) {
      return Infinity;
    }
    return capacity - occupied;
  }

  /** Occupancy percent = occupied / capacity * 100. null when no capacity. */
  function calculateOccupancyPercent(occupied, capacity) {
    if (!isFinite(capacity) || capacity <= 0) {
      return null;
    }
    return (occupied / capacity) * 100;
  }

  /**
   * Map a percent to a status color using editable thresholds.
   * null percent (no capacity / no data) -> grey.
   */
  function statusColor(percent, thresholds) {
    if (percent === null || percent === undefined) {
      return C.STATUS_COLOR.GREY;
    }
    var green = thresholds.greenMaxPercent;
    var yellow = thresholds.yellowMaxPercent;
    if (percent <= green) {
      return C.STATUS_COLOR.GREEN;
    }
    if (percent <= yellow) {
      return C.STATUS_COLOR.YELLOW;
    }
    return C.STATUS_COLOR.RED;
  }

  /**
   * Find the remote (Удаленка) office of a scenario.
   * Pass phase ('asis'/'tobe') to get the phase-specific office.
   * Without phase returns the TOBE remote (backward compat).
   */
  function getRemoteOffice(scenario, phase) {
    var remotes = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.REMOTE;
    });
    if (phase) {
      return remotes.filter(function (o) { return o.phase === phase; })[0] || null;
    }
    // Default: TOBE remote (planning office).
    return remotes.filter(function (o) {
      return o.phase === C.OFFICE_PHASE.TOBE;
    })[0] || remotes[0] || null;
  }

  /** Physical offices of a scenario (both phases). */
  function getPhysicalOffices(scenario) {
    return (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL;
    });
  }

  /** Physical offices filtered by phase ('asis' | 'tobe'). */
  function getOfficesByPhase(scenario, phase) {
    return getPhysicalOffices(scenario).filter(function (o) {
      return o.phase === phase;
    });
  }

  function getTobeOffices(scenario) {
    return getOfficesByPhase(scenario, C.OFFICE_PHASE.TOBE);
  }

  function getAsisOffices(scenario) {
    return getOfficesByPhase(scenario, C.OFFICE_PHASE.ASIS);
  }

  /**
   * Back-compat alias: previously "new offices" meant the planning offices.
   * KPIs/overflow now compute over TO BE offices.
   */
  function getNewOffices(scenario) {
    return getTobeOffices(scenario);
  }

  // ---- Money (lease) ----------------------------------------------------

  /** Annual lease cost = (rent + opex) per sqm * area. null if rates unset. */
  function officeAnnualCost(office) {
    if (!office || office.type === C.OFFICE_TYPE.REMOTE) {
      return null;
    }
    if (office.rentPerSqm == null && office.opexPerSqm == null) {
      return null;
    }
    var rent = office.rentPerSqm || 0;
    var opex = office.opexPerSqm || 0;
    return (rent + opex) * (office.area || 0);
  }

  /**
   * Total lease cost over N years with compound annual indexation.
   * Year k cost = annual * (1+i)^k, summed k=0..N-1. null if no annual cost.
   */
  function officeCostNYears(office, years) {
    var annual = officeAnnualCost(office);
    if (annual == null) {
      return null;
    }
    var i = (office.indexationPct || 0) / 100;
    var total = 0;
    for (var k = 0; k < years; k++) {
      total += annual * Math.pow(1 + i, k);
    }
    return total;
  }

  /** Total seats allocated to the TOBE remote office (used in planning KPIs). */
  function calculateRemoteCount(scenario) {
    var remote = getRemoteOffice(scenario, C.OFFICE_PHASE.TOBE);
    if (!remote) {
      return 0;
    }
    return calculateOfficeOccupancy(scenario, remote.id);
  }

  /** Total seats allocated to the ASIS remote office. */
  function calculateAsisRemoteCount(scenario) {
    var remote = getRemoteOffice(scenario, C.OFFICE_PHASE.ASIS);
    if (!remote) {
      return 0;
    }
    return calculateOfficeOccupancy(scenario, remote.id);
  }

  /**
   * Seats allocated into physical (TO-BE) office zones, with cross-office
   * TEAM/EMPLOYEE deduplication: when a named employee has an individual
   * allocation in a different TOBE office than their team's TEAM allocation,
   * they are counted once across all offices (not twice).
   */
  function calculatePlacedInOffices(scenario) {
    var newOffices = getNewOffices(scenario);
    var newOfficeIds = {};
    newOffices.forEach(function (o) { newOfficeIds[o.id] = true; });

    var teamSeats = {};
    var namedIds  = {};
    var noTeam    = 0;

    (scenario.allocations || []).forEach(function (a) {
      if (!newOfficeIds[a.targetOfficeId]) { return; }
      if (a.type === C.ALLOCATION_TYPE.TEAM && a.teamId) {
        teamSeats[a.teamId] = (teamSeats[a.teamId] || 0) + (a.employeesCount || 0);
      } else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
        if (a.teamId && a.employeeId) {
          if (!namedIds[a.teamId]) { namedIds[a.teamId] = {}; }
          namedIds[a.teamId][a.employeeId] = true;
        } else {
          noTeam += 1;
        }
      }
    });

    var total = noTeam;
    Object.keys(teamSeats).forEach(function (tid) {
      var named = namedIds[tid] ? Object.keys(namedIds[tid]).length : 0;
      total += Math.max(teamSeats[tid], named);
    });
    Object.keys(namedIds).forEach(function (tid) {
      if (!teamSeats[tid]) {
        total += Object.keys(namedIds[tid]).length;
      }
    });
    return total;
  }

  /**
   * Total employees of a scenario. Uses the personal list when present,
   * otherwise the sum of team headcounts (aggregated mode).
   */
  function calculateTotalEmployees(scenario) {
    if (scenario.employees && scenario.employees.length > 0) {
      return scenario.employees.length;
    }
    return U.sumBy(scenario.teams, 'employeesCount');
  }

  /** Sum of capacities of all new offices. */
  function calculateNewOfficesCapacity(scenario) {
    return getNewOffices(scenario).reduce(function (acc, o) {
      return acc + calculateOfficeCapacity(o);
    }, 0);
  }

  /**
   * How many seats a team has already been allocated in the TO-BE plan.
   * Only TO-BE and remote allocations count — AS-IS placements represent
   * the current state, not the planning target, and must not inflate the
   * "distributed" metric.
   *
   * Deduplication is global (same approach as calculatePlacedInOffices):
   *   max(total TEAM seats, distinct named employees)
   * A named team member counts as one of the team's seats even when placed in
   * a different office than the TEAM allocation, so dragging one member out
   * does not create a phantom extra seat.
   */
  function calculateTeamAllocated(scenario, teamId) {
    var teamSeats = 0;
    var namedIds = {};

    (scenario.allocations || []).forEach(function (a) {
      if (a.teamId !== teamId) { return; }
      var office = U.findById(scenario.offices, a.targetOfficeId);
      if (!office || office.phase === C.OFFICE_PHASE.ASIS) { return; }
      if (a.type === C.ALLOCATION_TYPE.TEAM) {
        teamSeats += (a.employeesCount || 0);
      } else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
        namedIds[a.employeeId] = true;
      }
    });

    var named = 0;
    for (var id in namedIds) { if (namedIds.hasOwnProperty(id)) { named += 1; } }
    return Math.max(teamSeats, named);
  }

  /** Remaining unallocated headcount of a team (never below 0 for display). */
  function calculateTeamRemainder(scenario, team) {
    var allocated = calculateTeamAllocated(scenario, team.id);
    return (team.employeesCount || 0) - allocated;
  }

  /**
   * Per-zone free-reserve detail across all new offices.
   * Returns array of { officeId, officeName, zoneId, zoneName, capacity,
   * occupied, free }.
   */
  function calculateReserveByZone(scenario) {
    var rows = [];
    getNewOffices(scenario).forEach(function (office) {
      (office.zones || []).forEach(function (zone) {
        var occupied = calculateZoneOccupancy(scenario, zone.id);
        rows.push({
          officeId: office.id,
          officeName: office.name,
          zoneId: zone.id,
          zoneName: zone.name,
          capacity: zone.capacity || 0,
          occupied: occupied,
          free: (zone.capacity || 0) - occupied
        });
      });
    });
    return rows;
  }

  /** Total office overflow (sum over new offices). */
  function calculateTotalOfficeOverflow(scenario) {
    return getNewOffices(scenario).reduce(function (acc, o) {
      var cap = calculateOfficeCapacity(o);
      var occ = calculateOfficeOccupancy(scenario, o.id);
      return acc + calculateOverflow(cap, occ);
    }, 0);
  }

  /** Total zone overflow (sum over all zones of new offices). */
  function calculateTotalZoneOverflow(scenario) {
    return getNewOffices(scenario).reduce(function (acc, o) {
      return acc + (o.zones || []).reduce(function (zAcc, z) {
        return zAcc + calculateOverflow(z.capacity || 0, calculateZoneOccupancy(scenario, z.id));
      }, 0);
    }, 0);
  }

  /**
   * Count distinct employees that are placed (have an individual allocation
   * or belong to a team with a team allocation). Used for "Не размещено".
   *
   * In aggregated mode (no employee list) we approximate placement by
   * comparing total headcount against allocated seats.
   */
  function calculateUnplacedCount(scenario) {
    var total = calculateTotalEmployees(scenario);
    if (scenario.employees && scenario.employees.length > 0) {
      var placedIds = {};
      (scenario.allocations || []).forEach(function (a) {
        if (a.type !== C.ALLOCATION_TYPE.EMPLOYEE || !a.employeeId) { return; }
        var office = U.findById(scenario.offices, a.targetOfficeId);
        if (!office || office.phase === C.OFFICE_PHASE.ASIS) { return; }
        placedIds[a.employeeId] = true;
      });
      // Team allocations cover headcount of their team; approximate which
      // employees are covered by counting team-allocated TO-BE seats per team
      // and marking that many still-unplaced members of the team as placed.
      var teamSeats = {};
      (scenario.allocations || []).forEach(function (a) {
        if (a.type !== C.ALLOCATION_TYPE.TEAM || !a.teamId) { return; }
        var office = U.findById(scenario.offices, a.targetOfficeId);
        if (!office || office.phase === C.OFFICE_PHASE.ASIS) { return; }
        teamSeats[a.teamId] = (teamSeats[a.teamId] || 0) + (a.employeesCount || 0);
      });
      var placedCount = 0;
      scenario.teams.forEach(function (team) {
        var members = scenario.employees.filter(function (e) {
          return e.teamId === team.id;
        });
        var seats = teamSeats[team.id] || 0;
        members.forEach(function (m) {
          if (placedIds[m.id]) {
            placedCount += 1;
          } else if (seats > 0) {
            placedCount += 1;
            seats -= 1;
          }
        });
      });
      // Employees with no team: only individually-placed ones count.
      scenario.employees.forEach(function (e) {
        if (!e.teamId && placedIds[e.id]) {
          placedCount += 1;
        }
      });
      return Math.max(0, total - placedCount);
    }
    // Aggregated mode: total minus TO-BE/remote allocated seats.
    var allocatedTotal = (scenario.allocations || []).reduce(function (acc, a) {
      var office = U.findById(scenario.offices, a.targetOfficeId);
      if (!office || office.phase === C.OFFICE_PHASE.ASIS) { return acc; }
      return acc + (a.employeesCount || 0);
    }, 0);
    return Math.max(0, total - allocatedTotal);
  }

  /**
   * Move-progress breakdown for the dashboard bar. Returns counts and
   * percentages for "in offices / remote / unplaced".
   *
   * Percentages are computed against a base that is the larger of the total
   * workforce and the actually-distributed headcount. This keeps the three
   * segments partitioning to <= 100% even when a scenario is over-allocated
   * (over-allocation is allowed by the spec and flagged as an error, so the
   * progress bar must degrade gracefully instead of showing 200%/1500%).
   */
  function calculateMoveProgress(scenario) {
    var total = calculateTotalEmployees(scenario);
    var inOffices = calculatePlacedInOffices(scenario);
    var remote = calculateRemoteCount(scenario);
    var distributed = inOffices + remote;
    var unplaced = Math.max(0, total - distributed);

    // Base never smaller than what is distributed, so percentages stay <=100.
    var base = Math.max(total, distributed);
    function pct(n) {
      if (base <= 0) {
        return 0;
      }
      return Math.round((n / base) * 100);
    }

    return {
      total: total,
      inOffices: inOffices,
      remote: remote,
      unplaced: unplaced,
      base: base,
      inOfficesPercent: pct(inOffices),
      remotePercent: pct(remote),
      unplacedPercent: pct(unplaced),
      overAllocated: distributed > total
    };
  }

  /**
   * Compute the full KPI block for a scenario. validationMessages is the
   * array returned by App.validation.validateScenario (optional) so we can
   * report warning/error counts without a circular dependency.
   */
  function calculateScenarioKpis(scenario, validationMessages) {
    var total = calculateTotalEmployees(scenario);
    var remote = calculateRemoteCount(scenario);
    var placedInOffices = calculatePlacedInOffices(scenario);
    var newCapacity = calculateNewOfficesCapacity(scenario);
    var reserveByZone = calculateReserveByZone(scenario);
    var freeReserve = newCapacity - placedInOffices;

    var warnings = 0;
    var errors = 0;
    (validationMessages || []).forEach(function (m) {
      if (m.level === C.LEVEL.WARNING) {
        warnings += 1;
      } else if (m.level === C.LEVEL.ERROR) {
        errors += 1;
      }
    });

    return {
      totalEmployees: total,
      requiredSeats: total - remote,
      // "Всего мест" / "Баланс" are computed over TO BE offices.
      totalPlaces: newCapacity,
      newOfficesCapacity: newCapacity, // alias kept for older callers
      placedInOffices: placedInOffices,
      placesBalance: newCapacity - placedInOffices,
      remoteCount: remote,
      unplacedCount: calculateUnplacedCount(scenario),
      freeReserve: freeReserve,
      reserveByZone: reserveByZone,
      zoneOverflow: calculateTotalZoneOverflow(scenario),
      warningsCount: warnings,
      errorsCount: errors
    };
  }

  /**
   * Annual CF for a given area with rent+opex, applying indexation
   * from leaseStartDate to the projection year.
   * Returns value in millions of RUB (area × (rent+opex) × factor / 1_000_000).
   * 7th param baseYear (number|null) is the fallback indexation origin when leaseStartDate is absent.
   */
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function cfForYear(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, baseYear, indexationStartDate) {
    var a = area || 0;
    var rent = rentPerSqm || 0;
    var opex = opexPerSqm || 0;
    var idx = (indexationPct || 0) / 100;
    var base = a * (rent + opex);
    var yearsElapsed = 0;
    if (indexationStartDate) {
      var idxYear = parseInt(String(indexationStartDate).substring(0, 4), 10);
      if (!isNaN(idxYear) && year >= idxYear) {
        yearsElapsed = year - idxYear + 1;
      }
    }
    return base * Math.pow(1 + idx, yearsElapsed) / 1000000;
  }

  /**
   * Monthly CF (in millions RUB) for a given area with rent+opex.
   * Sums per-day rates over the month's active days: a day is active while the
   * lease runs (from leaseStartDate through leaseEndDate inclusive) and carries
   * the indexation exponent for its date. Returns 0 for months entirely outside
   * the lease. Days are grouped by exponent so a full month stays exact.
   * Month is 1-based (1=January, 12=December).
   */
  function cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, year, month, baseYear, indexationStartDate, leaseEndDate) {
    var a = area || 0;
    var rent = rentPerSqm || 0;
    var opex = opexPerSqm || 0;
    var idx = (indexationPct || 0) / 100;
    var base = a * (rent + opex);
    var dim = daysInMonth(year, month);

    // ---- Active-day bounds within this month ----
    var firstActiveDay = 1;
    var lastActiveDay = dim;

    if (leaseStartDate) {
      var lsStr = String(leaseStartDate);
      var lsYear  = parseInt(lsStr.substring(0, 4), 10);
      var lsMonth = parseInt(lsStr.substring(5, 7), 10);
      var lsDay   = parseInt(lsStr.substring(8, 10), 10) || 1;
      if (!isNaN(lsYear) && !isNaN(lsMonth)) {
        if (year < lsYear || (year === lsYear && month < lsMonth)) { return 0; }
        if (year === lsYear && month === lsMonth) { firstActiveDay = lsDay; }
      }
    }

    if (leaseEndDate) {
      var leStr = String(leaseEndDate);
      var leYear  = parseInt(leStr.substring(0, 4), 10);
      var leMonth = parseInt(leStr.substring(5, 7), 10);
      var leDay   = parseInt(leStr.substring(8, 10), 10) || 1;
      if (!isNaN(leYear) && !isNaN(leMonth)) {
        if (year > leYear || (year === leYear && month > leMonth)) { return 0; }
        if (year === leYear && month === leMonth) { lastActiveDay = leDay; }
      }
    }

    if (lastActiveDay < firstActiveDay) { return 0; }

    // ---- Indexation start (per-day exponent) ----
    var idxYear = null, idxMonth = null, idxDay = 1;
    if (indexationStartDate) {
      var idxStr = String(indexationStartDate);
      idxYear  = parseInt(idxStr.substring(0, 4), 10);
      idxMonth = parseInt(idxStr.substring(5, 7), 10);
      idxDay   = parseInt(idxStr.substring(8, 10), 10) || 1;
      if (isNaN(idxYear) || isNaN(idxMonth)) { idxYear = null; }
    }

    function dayExponent(d) {
      if (idxYear === null) { return 0; }
      if (year < idxYear) { return 0; }
      if (year === idxYear && month < idxMonth) { return 0; }
      if (year === idxYear && month === idxMonth && d < idxDay) { return 0; }
      return year - idxYear + 1;
    }

    // ---- Tally active days by indexation exponent, then combine ----
    // Grouping by exponent (rather than summing per day) keeps a full month
    // at a single exponent exact: count/dim === 1.0, so the result equals the
    // un-prorated monthly amount with no floating-point drift.
    var counts = {};
    for (var d = firstActiveDay; d <= lastActiveDay; d++) {
      var e = dayExponent(d);
      counts[e] = (counts[e] || 0) + 1;
    }
    var monthly = 0;
    for (var key in counts) {
      if (counts.hasOwnProperty(key)) {
        var exp = parseInt(key, 10);
        monthly += base * Math.pow(1 + idx, exp) / 1000000 / 12 * (counts[key] / dim);
      }
    }
    return monthly;
  }

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
      var baseYear = years[0];
      var monthlyValues = {};
      years.forEach(function (yr) {
        monthlyValues[yr] = [];
        for (var m = 1; m <= 12; m++) {
          monthlyValues[yr].push(cfForMonth(
            office.area, office.rentPerSqm, office.opexPerSqm,
            office.indexationPct, office.leaseStartDate, yr, m, baseYear,
            office.indexationStartDate, office.leaseEndDate
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

    function subtotalRow(rows, phase, label) {
      var values = years.map(function (_, i) {
        return rows.reduce(function (s, r) { return s + (r.values[i] || 0); }, 0);
      });
      var monthlyValues = {};
      years.forEach(function (yr) {
        monthlyValues[yr] = [];
        for (var m = 0; m < 12; m++) {
          monthlyValues[yr].push(rows.reduce(function (s, r) {
            return s + ((r.monthlyValues && r.monthlyValues[yr]) ? r.monthlyValues[yr][m] : 0);
          }, 0));
        }
      });
      return {
        name: label || 'Итого',
        phase: phase,
        values: values,
        monthlyValues: monthlyValues,
        rowTotal: values.reduce(function (s, v) { return s + v; }, 0),
        isSubtotal: true
      };
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
      var NO_TENANT = 'Без арендатора';
      offices.forEach(function (office) {
        var tList = office.tenants || [];
        var hasMoney = office.rentPerSqm || office.opexPerSqm;
        if (tList.length === 0) {
          if (office.area && hasMoney) {
            if (!entries[NO_TENANT]) { entries[NO_TENANT] = []; }
            entries[NO_TENANT].push({ area: office.area, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate, leaseEndDate: office.leaseEndDate });
          }
        } else {
          var assignedArea = 0;
          tList.forEach(function (t) {
            var key = t.name || NO_TENANT;
            if (!entries[key]) { entries[key] = []; }
            entries[key].push({ area: t.area || 0, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate, leaseEndDate: office.leaseEndDate });
            assignedArea += (t.area || 0);
          });
          var remaining = (office.area || 0) - assignedArea;
          if (remaining > 0.001 && hasMoney) {
            if (!entries[NO_TENANT]) { entries[NO_TENANT] = []; }
            entries[NO_TENANT].push({ area: remaining, rentPerSqm: office.rentPerSqm, opexPerSqm: office.opexPerSqm, indexationPct: office.indexationPct, leaseStartDate: office.leaseStartDate, indexationStartDate: office.indexationStartDate, leaseEndDate: office.leaseEndDate });
          }
        }
      });
      return entries;
    }

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
                p.indexationPct, p.leaseStartDate, yr, m, baseYear,
                p.indexationStartDate, p.leaseEndDate
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

    var asisTenantRows = buildTenantRows(asisOffices, C.OFFICE_PHASE.ASIS);
    var tobeTenantRows = buildTenantRows(tobeOffices, C.OFFICE_PHASE.TOBE);
    var tenantRows = asisTenantRows.concat([subtotalRow(asisTenantRows, C.OFFICE_PHASE.ASIS, 'Итого AS IS')])
      .concat(tobeTenantRows).concat([subtotalRow(tobeTenantRows, C.OFFICE_PHASE.TOBE, 'Итого TO BE')]);

    return { years: years, officeRows: officeRows, tenantRows: tenantRows };
  }

  return {
    calculateOfficeCapacity: calculateOfficeCapacity,
    calculateOfficeOccupancy: calculateOfficeOccupancy,
    calculateZoneOccupancy: calculateZoneOccupancy,
    calculateOverflow: calculateOverflow,
    calculateFreePlaces: calculateFreePlaces,
    calculateOccupancyPercent: calculateOccupancyPercent,
    statusColor: statusColor,
    calculateBalance: calculateBalance,
    getRemoteOffice: getRemoteOffice,
    getPhysicalOffices: getPhysicalOffices,
    getOfficesByPhase: getOfficesByPhase,
    getTobeOffices: getTobeOffices,
    getAsisOffices: getAsisOffices,
    getNewOffices: getNewOffices,
    officeAnnualCost: officeAnnualCost,
    officeCostNYears: officeCostNYears,
    calculateRemoteCount: calculateRemoteCount,
    calculateAsisRemoteCount: calculateAsisRemoteCount,
    calculatePlacedInOffices: calculatePlacedInOffices,
    calculateTotalEmployees: calculateTotalEmployees,
    calculateNewOfficesCapacity: calculateNewOfficesCapacity,
    calculateTeamAllocated: calculateTeamAllocated,
    calculateTeamRemainder: calculateTeamRemainder,
    calculateReserveByZone: calculateReserveByZone,
    calculateTotalOfficeOverflow: calculateTotalOfficeOverflow,
    calculateTotalZoneOverflow: calculateTotalZoneOverflow,
    calculateUnplacedCount: calculateUnplacedCount,
    calculateMoveProgress: calculateMoveProgress,
    calculateScenarioKpis: calculateScenarioKpis,
    cfForYear: cfForYear,
    cfForMonth: cfForMonth,
    getScenarioCFData: getScenarioCFData
  };
})();
