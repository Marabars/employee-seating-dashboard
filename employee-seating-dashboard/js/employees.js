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
   * Returns one of C.PLACEMENT_STATUS.* and the target office id (if any).
   */
  function placementOf(scenarioObj, employee) {
    var indiv = (scenarioObj.allocations || []).filter(function (a) {
      return a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId === employee.id;
    })[0];
    if (indiv) {
      var office = U.findById(scenarioObj.offices, indiv.targetOfficeId);
      if (office && office.type === C.OFFICE_TYPE.REMOTE) {
        return { status: C.PLACEMENT_STATUS.PLACED_REMOTE, officeId: indiv.targetOfficeId, zoneId: indiv.targetZoneId };
      }
      return { status: C.PLACEMENT_STATUS.PLACED_OFFICE, officeId: indiv.targetOfficeId, zoneId: indiv.targetZoneId };
    }
    // No individual allocation: treat as unplaced for the personal view.
    // (Team allocations cover headcount but not specific named members.)
    return { status: C.PLACEMENT_STATUS.UNPLACED, officeId: null, zoneId: null };
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
