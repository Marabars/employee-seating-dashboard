/**
 * employees.js
 * CRUD for employees plus search/filter helpers and per-employee placement
 * status derivation.
 */
window.App = window.App || {};

App.employees = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;

  function scenario() {
    return state.getActiveScenario();
  }

  function list() {
    return scenario().employees;
  }

  function find(employeeId) {
    return U.findById(list(), employeeId);
  }

  /**
   * Raise a team's employeesCount to match its named-employee count if
   * the count has fallen below. Called inside a commit callback so it
   * stays in the same undo step as the triggering employee change.
   * Rule: employeesCount >= namedCount (can be higher, never lower).
   */
  function bumpTeamCount(teamId) {
    if (!teamId) { return; }
    var s = scenario();
    var team = U.findById(s.teams, teamId);
    if (!team) { return; }
    var named = s.employees.filter(function (e) { return e.teamId === teamId; }).length;
    if (team.employeesCount < named) { team.employeesCount = named; }
  }

  function add(data) {
    var emp = {
      id: U.genId('employee'),
      fullName: data.fullName || 'Без имени',
      position: data.position || '',
      teamId: data.teamId || null,
      currentOfficeId: data.currentOfficeId || null,
      isVip: !!data.isVip,
      workFormat: data.workFormat || C.WORK_FORMAT.OFFICE,
      comment: data.comment || ''
    };
    state.commit('Добавление сотрудника', function () {
      scenario().employees.push(emp);
      bumpTeamCount(emp.teamId);
    });
    return emp.id;
  }

  function update(employeeId, data) {
    var emp = find(employeeId);
    if (!emp) {
      return;
    }
    state.commit('Изменение сотрудника', function () {
      if (data.fullName !== undefined) {
        emp.fullName = data.fullName;
      }
      if (data.position !== undefined) {
        emp.position = data.position;
      }
      if (data.teamId !== undefined) {
        emp.teamId = data.teamId || null;
        bumpTeamCount(emp.teamId);
      }
      if (data.currentOfficeId !== undefined) {
        emp.currentOfficeId = data.currentOfficeId || null;
      }
      if (data.isVip !== undefined) {
        emp.isVip = !!data.isVip;
      }
      if (data.workFormat !== undefined) {
        emp.workFormat = data.workFormat;
      }
      if (data.comment !== undefined) {
        emp.comment = data.comment;
      }
    });
  }

  /** Delete an employee and any individual allocations referencing them. */
  function remove(employeeId) {
    var emp = find(employeeId);
    if (!emp) {
      return false;
    }
    state.commit('Удаление сотрудника', function () {
      var s = scenario();
      s.employees = s.employees.filter(function (e) {
        return e.id !== employeeId;
      });
      s.allocations = s.allocations.filter(function (a) {
        return a.employeeId !== employeeId;
      });
    });
    return true;
  }

  /**
   * Derive an employee's placement status in the active scenario.
   * Returns { status, officeId, zoneId, asIs, tobe } where asIs/tobe are
   * each { status, officeId, zoneId } for their respective office phases.
   * Top-level status/officeId/zoneId reflect the TO-BE placement for
   * backward compatibility with existing callers.
   */
  function placementOf(scenarioObj, employee) {
    var allocs = (scenarioObj.allocations || []).filter(function (a) {
      return a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId === employee.id;
    });

    function resolvePhase(phase) {
      var alloc = null;
      for (var i = 0; i < allocs.length; i++) {
        var office = U.findById(scenarioObj.offices, allocs[i].targetOfficeId);
        if (!office) { continue; }
        if (office.type === C.OFFICE_TYPE.REMOTE) {
          // Remote has no phase — counts for both views
          if (!alloc) { alloc = allocs[i]; }
          continue;
        }
        if (office.phase === phase) { alloc = allocs[i]; break; }
      }
      if (!alloc) { return { status: C.PLACEMENT_STATUS.UNPLACED, officeId: null, zoneId: null }; }
      var tgtOffice = U.findById(scenarioObj.offices, alloc.targetOfficeId);
      var st = (tgtOffice && tgtOffice.type === C.OFFICE_TYPE.REMOTE)
        ? C.PLACEMENT_STATUS.PLACED_REMOTE
        : C.PLACEMENT_STATUS.PLACED_OFFICE;
      return { status: st, officeId: alloc.targetOfficeId, zoneId: alloc.targetZoneId };
    }

    var asIs = resolvePhase('asis');
    var tobe = resolvePhase('tobe');
    // top-level fields mirror TO-BE for backward compat
    return { status: tobe.status, officeId: tobe.officeId, zoneId: tobe.zoneId, asIs: asIs, tobe: tobe };
  }

  /**
   * Filter + search employees. criteria fields (all optional):
   *  query, teamId, currentOfficeId, targetOfficeId, isVip ('yes'|'no'),
   *  workFormat, placementStatus.
   */
  function filter(criteria) {
    criteria = criteria || {};
    var s = scenario();
    var q = (criteria.query || '').trim().toLowerCase();

    return s.employees.filter(function (emp) {
      if (q && emp.fullName.toLowerCase().indexOf(q) === -1) {
        return false;
      }
      if (criteria.teamId && emp.teamId !== criteria.teamId) {
        return false;
      }
      if (criteria.currentOfficeId && emp.currentOfficeId !== criteria.currentOfficeId) {
        return false;
      }
      if (criteria.isVip === 'yes' && !emp.isVip) {
        return false;
      }
      if (criteria.isVip === 'no' && emp.isVip) {
        return false;
      }
      if (criteria.workFormat && emp.workFormat !== criteria.workFormat) {
        return false;
      }
      var placement = placementOf(s, emp);
      if (criteria.targetOfficeId && placement.officeId !== criteria.targetOfficeId) {
        return false;
      }
      if (criteria.placementStatus && placement.status !== criteria.placementStatus) {
        return false;
      }
      return true;
    });
  }

  return {
    list: list,
    find: find,
    add: add,
    update: update,
    remove: remove,
    placementOf: placementOf,
    filter: filter
  };
})();
