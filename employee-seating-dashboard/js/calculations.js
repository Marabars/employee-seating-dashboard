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
    if (office.type !== C.OFFICE_TYPE.NEW) {
      return 0; // old offices do not participate in new-office capacity
    }
    return U.sumBy(office.zones, 'capacity');
  }

  /** Occupancy of an office = sum of allocations into that office. */
  function calculateOfficeOccupancy(scenario, officeId) {
    return (scenario.allocations || []).reduce(function (acc, a) {
      return acc + (a.targetOfficeId === officeId ? (a.employeesCount || 0) : 0);
    }, 0);
  }

  /** Occupancy of a zone = sum of allocations into that zone. */
  function calculateZoneOccupancy(scenario, zoneId) {
    return (scenario.allocations || []).reduce(function (acc, a) {
      return acc + (a.targetZoneId === zoneId ? (a.employeesCount || 0) : 0);
    }, 0);
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

  /** All new offices of a scenario. */
  function getNewOffices(scenario) {
    return (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.NEW;
    });
  }

  /** Total seats allocated to the remote office. */
  function calculateRemoteCount(scenario) {
    var remote = getRemoteOffice(scenario);
    if (!remote) {
      return 0;
    }
    return calculateOfficeOccupancy(scenario, remote.id);
  }

  /** Seats allocated into physical (new) office zones. */
  function calculatePlacedInOffices(scenario) {
    return getNewOffices(scenario).reduce(function (acc, o) {
      return acc + calculateOfficeOccupancy(scenario, o.id);
    }, 0);
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

  /** How many seats a team has already been allocated (team + employee). */
  function calculateTeamAllocated(scenario, teamId) {
    return (scenario.allocations || []).reduce(function (acc, a) {
      return acc + (a.teamId === teamId ? (a.employeesCount || 0) : 0);
    }, 0);
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
        if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
          placedIds[a.employeeId] = true;
        }
      });
      // Team allocations cover headcount of their team; approximate which
      // employees are covered by counting team-allocated seats per team and
      // marking that many still-unplaced members of the team as placed.
      var teamSeats = {};
      (scenario.allocations || []).forEach(function (a) {
        if (a.type === C.ALLOCATION_TYPE.TEAM && a.teamId) {
          teamSeats[a.teamId] = (teamSeats[a.teamId] || 0) + (a.employeesCount || 0);
        }
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
    // Aggregated mode: total minus everything allocated anywhere.
    var allocatedTotal = (scenario.allocations || []).reduce(function (acc, a) {
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
      newOfficesCapacity: newCapacity,
      placedInOffices: placedInOffices,
      remoteCount: remote,
      unplacedCount: calculateUnplacedCount(scenario),
      freeReserve: freeReserve,
      reserveByZone: reserveByZone,
      officeOverflow: calculateTotalOfficeOverflow(scenario),
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
    getRemoteOffice: getRemoteOffice,
    getNewOffices: getNewOffices,
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
