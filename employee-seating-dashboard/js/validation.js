/**
 * validation.js
 * Produces an array of status messages for a scenario:
 *   { level, code, message, entityType, entityId }
 * Levels: error | warning | info. Pure over a scenario object.
 */
window.App = window.App || {};

App.validation = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var calc = App.calc;

  function msg(level, code, message, entityType, entityId) {
    return {
      level: level,
      code: code,
      message: message,
      entityType: entityType || null,
      entityId: entityId || null
    };
  }

  /** Lookup helpers within a scenario. */
  function findOffice(scenario, id) {
    return U.findById(scenario.offices, id);
  }

  function findZone(scenario, zoneId) {
    var found = null;
    (scenario.offices || []).forEach(function (o) {
      (o.zones || []).forEach(function (z) {
        if (z.id === zoneId) {
          found = z;
        }
      });
    });
    return found;
  }

  function findTeam(scenario, id) {
    return U.findById(scenario.teams, id);
  }

  function findEmployee(scenario, id) {
    return U.findById(scenario.employees, id);
  }

  /**
   * Main entry point. Returns all messages for the scenario.
   */
  function validateScenario(scenario) {
    var out = [];
    if (!scenario) {
      return out;
    }

    validateTeams(scenario, out);
    validateLinkedTeams(scenario, out);
    validateEmployeesDuplicates(scenario, out);
    validateEmployeesUnplaced(scenario, out);
    validateOfficeAndZoneOverflow(scenario, out);
    validateVipConflicts(scenario, out);
    validateDraftOffices(scenario, out);
    validateRemoteInfo(scenario, out);

    return out;
  }

  /** Set of office ids a team currently occupies (via its team allocations). */
  function officeSetOfTeam(scenario, teamId) {
    var set = {};
    (scenario.allocations || []).forEach(function (a) {
      if (a.teamId === teamId && a.targetOfficeId) {
        set[a.targetOfficeId] = true;
      }
    });
    return set;
  }

  function setsEqual(a, b) {
    var ak = Object.keys(a);
    var bk = Object.keys(b);
    if (ak.length !== bk.length) {
      return false;
    }
    for (var i = 0; i < ak.length; i++) {
      if (!b[ak[i]]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Linked teams must move together: they must occupy the same set of offices
   * (zones may differ). If at least one of a linked pair is placed and their
   * office sets differ, that's an error. Each pair is reported once.
   */
  function validateLinkedTeams(scenario, out) {
    var reported = {};
    (scenario.teams || []).forEach(function (team) {
      var linked = team.linkedTeamIds || [];
      if (!linked.length) {
        return;
      }
      var officesA = officeSetOfTeam(scenario, team.id);
      linked.forEach(function (otherId) {
        var pairKey = [team.id, otherId].sort().join('|');
        if (reported[pairKey]) {
          return;
        }
        var other = findTeam(scenario, otherId);
        if (!other) {
          return;
        }
        var officesB = officeSetOfTeam(scenario, otherId);
        var aPlaced = Object.keys(officesA).length > 0;
        var bPlaced = Object.keys(officesB).length > 0;

        // Only meaningful once at least one of them is placed.
        if (!aPlaced && !bPlaced) {
          return;
        }
        if (!setsEqual(officesA, officesB)) {
          reported[pairKey] = true;
          out.push(msg(
            C.LEVEL.ERROR,
            C.CODE.LINKED_TEAMS_SEPARATED,
            'Связанные команды «' + team.name + '» и «' + other.name +
              '» должны находиться в одном офисе, но размещены раздельно',
            'team',
            team.id
          ));
        }
      });
    });
  }

  /** Team over-allocation (error), partial allocation & illegal split (warn). */
  function validateTeams(scenario, out) {
    (scenario.teams || []).forEach(function (team) {
      var allocated = calc.calculateTeamAllocated(scenario, team.id);
      var headcount = team.employeesCount || 0;

      if (allocated > headcount) {
        out.push(msg(
          C.LEVEL.ERROR,
          C.CODE.TEAM_OVERALLOCATED,
          'Команда «' + team.name + '» распределена больше численности: ' +
            allocated + ' из ' + headcount,
          'team',
          team.id
        ));
      } else if (allocated < headcount && allocated > 0) {
        out.push(msg(
          C.LEVEL.WARNING,
          C.CODE.TEAM_PARTIAL,
          'Команда «' + team.name + '» распределена не полностью: ' +
            allocated + ' из ' + headcount,
          'team',
          team.id
        ));
      }

      // Illegal split: a non-splittable team spread across >1 target.
      if (team.canSplit === false) {
        var targets = {};
        (scenario.allocations || []).forEach(function (a) {
          if (a.teamId === team.id) {
            var key = (a.targetOfficeId || '') + ':' + (a.targetZoneId || '');
            targets[key] = true;
          }
        });
        if (Object.keys(targets).length > 1) {
          out.push(msg(
            C.LEVEL.WARNING,
            C.CODE.TEAM_SPLIT_FORBIDDEN,
            'Команда «' + team.name + '» отмечена как неделимая, но разделена между несколькими местами',
            'team',
            team.id
          ));
        }
      }
    });
  }

  /** Employee placed more than once (error). */
  function validateEmployeesDuplicates(scenario, out) {
    var seen = {};
    (scenario.allocations || []).forEach(function (a) {
      if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
        if (seen[a.employeeId]) {
          var emp = findEmployee(scenario, a.employeeId);
          out.push(msg(
            C.LEVEL.ERROR,
            C.CODE.EMPLOYEE_DUPLICATE,
            'Сотрудник «' + (emp ? emp.fullName : a.employeeId) + '» размещен более одного раза',
            'employee',
            a.employeeId
          ));
        }
        seen[a.employeeId] = true;
      }
    });
  }

  /**
   * Unplaced employees (warning). Only meaningful in personal mode.
   * An employee is "placed" if individually allocated OR covered by a team
   * allocation seat (approximated as in calculations).
   */
  function validateEmployeesUnplaced(scenario, out) {
    if (!scenario.employees || scenario.employees.length === 0) {
      return;
    }
    var placedIds = {};
    (scenario.allocations || []).forEach(function (a) {
      if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
        placedIds[a.employeeId] = true;
      }
    });
    var teamSeats = {};
    (scenario.allocations || []).forEach(function (a) {
      if (a.type === C.ALLOCATION_TYPE.TEAM && a.teamId) {
        teamSeats[a.teamId] = (teamSeats[a.teamId] || 0) + (a.employeesCount || 0);
      }
    });

    scenario.employees.forEach(function (emp) {
      if (placedIds[emp.id]) {
        return;
      }
      var seats = teamSeats[emp.teamId];
      if (emp.teamId && seats > 0) {
        teamSeats[emp.teamId] = seats - 1; // consume a seat for this member
        return;
      }
      out.push(msg(
        C.LEVEL.WARNING,
        C.CODE.EMPLOYEE_UNPLACED,
        'Сотрудник «' + emp.fullName + '» не размещен',
        'employee',
        emp.id
      ));
    });
  }

  /** Office and zone overflow (warning), formatted "Переполнение: N мест". */
  function validateOfficeAndZoneOverflow(scenario, out) {
    calc.getNewOffices(scenario).forEach(function (office) {
      var cap = calc.calculateOfficeCapacity(office);
      var occ = calc.calculateOfficeOccupancy(scenario, office.id);
      var over = calc.calculateOverflow(cap, occ);
      if (over > 0) {
        out.push(msg(
          C.LEVEL.WARNING,
          C.CODE.OFFICE_OVERFLOW,
          office.name + ' — ' + U.formatOverflow(over),
          'office',
          office.id
        ));
      }
      (office.zones || []).forEach(function (zone) {
        var zOver = calc.calculateOverflow(zone.capacity || 0, calc.calculateZoneOccupancy(scenario, zone.id));
        if (zOver > 0) {
          out.push(msg(
            C.LEVEL.WARNING,
            C.CODE.ZONE_OVERFLOW,
            'Зона ' + zone.name + ' — ' + U.formatOverflow(zOver),
            'zone',
            zone.id
          ));
        }
      });
    });
  }

  /**
   * VIP conflicts (warning):
   *  - non-VIP team/employee placed in a VIP zone;
   *  - VIP team/employee placed in a non-VIP zone.
   */
  function validateVipConflicts(scenario, out) {
    (scenario.allocations || []).forEach(function (a) {
      if (!a.targetZoneId) {
        return; // remote / officeless allocations have no zone
      }
      var zone = findZone(scenario, a.targetZoneId);
      if (!zone) {
        return;
      }
      var isVipEntity = false;
      var label = '';
      if (a.type === C.ALLOCATION_TYPE.TEAM) {
        var team = findTeam(scenario, a.teamId);
        if (!team) {
          return;
        }
        isVipEntity = !!team.isVip;
        label = 'Команда «' + team.name + '»';
      } else {
        var emp = findEmployee(scenario, a.employeeId);
        if (!emp) {
          return;
        }
        isVipEntity = !!emp.isVip;
        label = 'Сотрудник «' + emp.fullName + '»';
      }

      if (!isVipEntity && zone.isVipZone) {
        out.push(msg(
          C.LEVEL.WARNING,
          C.CODE.NON_VIP_IN_VIP,
          label + ' размещен(а) в VIP-зоне «' + zone.name + '»',
          a.type === C.ALLOCATION_TYPE.TEAM ? 'team' : 'employee',
          a.type === C.ALLOCATION_TYPE.TEAM ? a.teamId : a.employeeId
        ));
      } else if (isVipEntity && !zone.isVipZone) {
        out.push(msg(
          C.LEVEL.WARNING,
          C.CODE.VIP_NOT_IN_VIP,
          label + ' (VIP) размещен(а) не в VIP-зоне «' + zone.name + '»',
          a.type === C.ALLOCATION_TYPE.TEAM ? 'team' : 'employee',
          a.type === C.ALLOCATION_TYPE.TEAM ? a.teamId : a.employeeId
        ));
      }
    });
  }

  /** Draft office with zero capacity used in the scenario (warning). */
  function validateDraftOffices(scenario, out) {
    calc.getNewOffices(scenario).forEach(function (office) {
      if (!office.isDraft) {
        return;
      }
      var cap = calc.calculateOfficeCapacity(office);
      var used = calc.calculateOfficeOccupancy(scenario, office.id) > 0;
      if (cap === 0 && used) {
        out.push(msg(
          C.LEVEL.WARNING,
          C.CODE.DRAFT_ZERO_CAPACITY,
          'Черновой офис «' + office.name + '» с нулевой вместимостью используется в сценарии',
          'office',
          office.id
        ));
      }
    });
  }

  /** Remote info messages. */
  function validateRemoteInfo(scenario, out) {
    var remoteCount = calc.calculateRemoteCount(scenario);
    if (remoteCount > 0) {
      out.push(msg(
        C.LEVEL.INFO,
        C.CODE.HAS_REMOTE,
        'Есть сотрудники на удаленке: ' + remoteCount,
        'office',
        null
      ));
    }
  }

  return {
    validateScenario: validateScenario
  };
})();
