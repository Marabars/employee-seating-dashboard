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
   * If the employee already has an allocation, it is replaced (move).
   */
  function setEmployeeAllocation(employeeId, targetOfficeId, targetZoneId, comment) {
    var emp = U.findById(scenario().employees, employeeId);
    var teamId = emp ? emp.teamId : null;
    state.commit('Размещение сотрудника', function () {
      var s = scenario();
      s.allocations = s.allocations.filter(function (a) {
        return !(a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId === employeeId);
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
    addTeamAllocation: addTeamAllocation,
    setEmployeeAllocation: setEmployeeAllocation,
    update: update,
    remove: remove,
    sendTeamRemainderToRemote: sendTeamRemainderToRemote
  };
})();
