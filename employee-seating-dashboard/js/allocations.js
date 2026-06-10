/**
 * allocations.js
 * CRUD for placements (team / employee) and helper actions like
 * "send remainder to remote". Pure helpers (suggestRemainder, validate count,
 * VIP check) are exposed for drag-and-drop and unit tests.
 */
window.App = window.App || {};

App.allocations = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;
  var calc = App.calc;

  function scenario() {
    return state.getActiveScenario();
  }

  function list() {
    return scenario().allocations;
  }

  function find(allocationId) {
    return U.findById(list(), allocationId);
  }

  function findZone(scenarioObj, zoneId) {
    var found = null;
    (scenarioObj.offices || []).forEach(function (o) {
      (o.zones || []).forEach(function (z) {
        if (z.id === zoneId) {
          found = z;
        }
      });
    });
    return found;
  }

  /** Suggested team count to place = remaining unallocated headcount (>=0). */
  function suggestRemainder(scenarioObj, teamId) {
    var team = U.findById(scenarioObj.teams, teamId);
    if (!team) {
      return 0;
    }
    var remainder = calc.calculateTeamRemainder(scenarioObj, team);
    return remainder > 0 ? remainder : 0;
  }

  /**
   * Pure VIP-conflict check for a drop target. Returns a string warning or
   * null. Used by drag-and-drop before committing (and unit-tested).
   */
  function vipConflict(isVipEntity, zone) {
    if (!zone) {
      return null;
    }
    if (!isVipEntity && zone.isVipZone) {
      return 'Обычная команда/сотрудник размещается в VIP-зоне';
    }
    if (isVipEntity && !zone.isVipZone) {
      return 'VIP размещается не в VIP-зоне';
    }
    return null;
  }

  /**
   * Pure check used at drop time: does placing `teamId` into `targetOfficeId`
   * separate it from any linked team that is already placed in a DIFFERENT
   * office? Returns a warning string or null. Linked teams must share the same
   * office (zones may differ).
   */
  function linkedConflict(scenarioObj, teamId, targetOfficeId) {
    var team = U.findById(scenarioObj.teams, teamId);
    if (!team || !team.linkedTeamIds || !team.linkedTeamIds.length) {
      return null;
    }
    var conflicting = [];
    team.linkedTeamIds.forEach(function (otherId) {
      var other = U.findById(scenarioObj.teams, otherId);
      if (!other) {
        return;
      }
      var otherOffices = {};
      (scenarioObj.allocations || []).forEach(function (a) {
        if (a.teamId === otherId && a.targetOfficeId) {
          otherOffices[a.targetOfficeId] = true;
        }
      });
      var officeIds = Object.keys(otherOffices);
      if (officeIds.length === 0) {
        return; // other team not placed yet — no conflict at this moment
      }
      // Conflict if the other team is placed somewhere, but not in this office.
      if (!otherOffices[targetOfficeId]) {
        conflicting.push(other.name);
      }
    });
    if (conflicting.length) {
      return 'Связанные команды должны быть в одном офисе. Конфликт с: ' + conflicting.join(', ');
    }
    return null;
  }

  /**
   * Create a team allocation. count is clamped to [1, +inf]; the caller (popup)
   * decides the suggested value. Returns the new allocation id.
   */
  function addTeamAllocation(teamId, count, targetOfficeId, targetZoneId, comment) {
    var c = U.toNonNegativeInt(count);
    if (c <= 0) {
      return null;
    }
    var allocation = {
      id: U.genId('allocation'),
      type: C.ALLOCATION_TYPE.TEAM,
      teamId: teamId,
      employeeId: null,
      employeesCount: c,
      targetOfficeId: targetOfficeId,
      targetZoneId: targetZoneId || null,
      comment: comment || ''
    };
    state.commit('Размещение команды', function () {
      scenario().allocations.push(allocation);
    });
    return allocation.id;
  }

  /**
   * Create or move an individual employee allocation (count is always 1).
   * Phase-aware: replaces only the allocation in the SAME office phase as the
   * target (asis / tobe / remote), leaving allocations in other phases intact.
   * This allows an employee to hold both an AS-IS and a TO-BE seat simultaneously.
   */
  function setEmployeeAllocation(employeeId, targetOfficeId, targetZoneId, comment) {
    var emp = U.findById(scenario().employees, employeeId);
    var teamId = emp ? emp.teamId : null;
    state.commit('Размещение сотрудника', function () {
      var s = scenario();
      var targetOffice = U.findById(s.offices, targetOfficeId);
      var targetPhase = targetOffice ? (targetOffice.phase || null) : null;
      s.allocations = s.allocations.filter(function (a) {
        if (!(a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId === employeeId)) {
          return true;
        }
        var existingOffice = U.findById(s.offices, a.targetOfficeId);
        var existingPhase = existingOffice ? (existingOffice.phase || null) : null;
        return existingPhase !== targetPhase; // keep allocations in different phases
      });
      s.allocations.push({
        id: U.genId('allocation'),
        type: C.ALLOCATION_TYPE.EMPLOYEE,
        teamId: teamId,
        employeeId: employeeId,
        employeesCount: 1,
        targetOfficeId: targetOfficeId,
        targetZoneId: targetZoneId || null,
        comment: comment || ''
      });
    });
  }

  /** Update an allocation's editable fields (manual table editing). */
  function update(allocationId, data) {
    var a = find(allocationId);
    if (!a) {
      return;
    }
    state.commit('Изменение размещения', function () {
      if (data.employeesCount !== undefined && a.type === C.ALLOCATION_TYPE.TEAM) {
        a.employeesCount = U.toNonNegativeInt(data.employeesCount);
      }
      if (data.targetOfficeId !== undefined) {
        a.targetOfficeId = data.targetOfficeId;
      }
      if (data.targetZoneId !== undefined) {
        a.targetZoneId = data.targetZoneId || null;
      }
      if (data.comment !== undefined) {
        a.comment = data.comment;
      }
    });
  }

  /** Move an existing allocation to a new office/zone (drag-and-drop). */
  function move(allocationId, targetOfficeId, targetZoneId) {
    var a = find(allocationId);
    if (!a) {
      return false;
    }
    state.commit('Перемещение размещения', function () {
      a.targetOfficeId = targetOfficeId;
      a.targetZoneId = targetZoneId || null;
    });
    return true;
  }

  /**
   * Reduce a team allocation by `amount` seats (pull part of a team back out).
   * If amount >= current count, the allocation is removed entirely.
   */
  function reduceTeamAllocation(allocationId, amount) {
    var a = find(allocationId);
    if (!a || a.type !== C.ALLOCATION_TYPE.TEAM) {
      return false;
    }
    var dec = U.toNonNegativeInt(amount);
    if (dec <= 0) {
      return false;
    }
    state.commit('Уменьшение размещения', function () {
      if (dec >= (a.employeesCount || 0)) {
        var s = scenario();
        s.allocations = s.allocations.filter(function (x) { return x.id !== allocationId; });
      } else {
        a.employeesCount = a.employeesCount - dec;
      }
    });
    return true;
  }

  function remove(allocationId) {
    var a = find(allocationId);
    if (!a) {
      return false;
    }
    state.commit('Удаление размещения', function () {
      var s = scenario();
      s.allocations = s.allocations.filter(function (x) {
        return x.id !== allocationId;
      });
    });
    return true;
  }

  /** Send a team's remaining unallocated headcount to the remote office. */
  function sendTeamRemainderToRemote(teamId) {
    var s = scenario();
    var remote = calc.getRemoteOffice(s);
    if (!remote) {
      return null;
    }
    var remainder = suggestRemainder(s, teamId);
    if (remainder <= 0) {
      return null;
    }
    return addTeamAllocation(teamId, remainder, remote.id, null, 'Остаток на удаленку');
  }

  return {
    list: list,
    find: find,
    findZone: findZone,
    suggestRemainder: suggestRemainder,
    vipConflict: vipConflict,
    linkedConflict: linkedConflict,
    addTeamAllocation: addTeamAllocation,
    setEmployeeAllocation: setEmployeeAllocation,
    update: update,
    move: move,
    reduceTeamAllocation: reduceTeamAllocation,
    remove: remove,
    sendTeamRemainderToRemote: sendTeamRemainderToRemote
  };
})();
