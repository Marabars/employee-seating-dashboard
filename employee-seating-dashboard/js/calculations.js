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

  /** Find the remote (Удаленка) office of a scenario, if any. */
  function getRemoteOffice(scenario) {
    return (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.REMOTE;
    })[0] || null;
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

  /** Total seats allocated to the remote office. */
  function calculateRemoteCount(scenario) {
    var remote = getRemoteOffice(scenario);
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
   * Double-counting prevention: when a team is placed via a TEAM allocation
   * AND individual members later get EMPLOYEE allocations (e.g. by saving the
   * employee form), the same person would otherwise be counted twice — once in
   * the TEAM seats total and once as an individual. We resolve this as:
   *   total = namedCount + max(0, teamTotal − namedCount)
   *         = max(teamTotal, namedCount)
   * Named employees with individual TO-BE placements are always counted once;
   * the TEAM allocation's anonymous seats are reduced by the named overlap.
   */
  function calculateTeamAllocated(scenario, teamId) {
    // Unique named employees with individual TO-BE/remote placements.
    var namedEmployeeIds = {};
    (scenario.allocations || []).forEach(function (a) {
      if (a.teamId !== teamId || a.type !== C.ALLOCATION_TYPE.EMPLOYEE || !a.employeeId) { return; }
      var office = U.findById(scenario.offices, a.targetOfficeId);
      if (!office || office.phase === C.OFFICE_PHASE.ASIS) { return; }
      namedEmployeeIds[a.employeeId] = true;
    });
    var namedCount = Object.keys(namedEmployeeIds).length;

    // Sum of TEAM-type allocations in TO-BE/remote.
    var teamTotal = (scenario.allocations || []).reduce(function (acc, a) {
      if (a.teamId !== teamId || a.type !== C.ALLOCATION_TYPE.TEAM) { return acc; }
      var office = U.findById(scenario.offices, a.targetOfficeId);
      if (!office || office.phase === C.OFFICE_PHASE.ASIS) { return acc; }
      return acc + (a.employeesCount || 0);
    }, 0);

    // namedCount individual seats + anonymous remainder from team allocations.
    return namedCount + Math.max(0, teamTotal - namedCount);
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
    calculateScenarioKpis: calculateScenarioKpis
  };
})();
