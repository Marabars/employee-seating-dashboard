/**
 * scenarios.js
 * Scenario management: create / duplicate / rename / delete / switch / comment.
 * All mutations go through App.state.commit so undo/redo and persistence work.
 */
window.App = window.App || {};

App.scenarios = (function () {
  'use strict';

  var U = App.utils;
  var state = App.state;

  function list() {
    return state.getProject().scenarios;
  }

  function create(name) {
    var scenario = state.createScenario(name || 'Новый сценарий', '');
    state.commit('Создание сценария', function () {
      var p = state.getProject();
      p.scenarios.push(scenario);
      p.settings.lastSelectedScenarioId = scenario.id;
    });
    return scenario.id;
  }

  /** Duplicate a scenario (deep clone) with new ids for every entity. */
  function duplicate(scenarioId) {
    var src = U.findById(list(), scenarioId);
    if (!src) {
      return null;
    }
    var copy = U.deepClone(src);
    remapIds(copy);
    copy.name = src.name + ' (копия)';
    state.commit('Дублирование сценария', function () {
      var p = state.getProject();
      p.scenarios.push(copy);
      p.settings.lastSelectedScenarioId = copy.id;
    });
    return copy.id;
  }

  /**
   * Assign fresh ids to a cloned scenario and all nested entities, keeping
   * cross-references (zone/team/employee/allocation links) consistent.
   */
  function remapIds(scenario) {
    var map = {};

    scenario.id = U.genId('scenario');

    (scenario.offices || []).forEach(function (office) {
      var newOfficeId = U.genId('office');
      map[office.id] = newOfficeId;
      office.id = newOfficeId;
      (office.zones || []).forEach(function (zone) {
        var newZoneId = U.genId('zone');
        map[zone.id] = newZoneId;
        zone.id = newZoneId;
      });
    });

    (scenario.teams || []).forEach(function (team) {
      var newTeamId = U.genId('team');
      map[team.id] = newTeamId;
      team.id = newTeamId;
      if (team.currentOfficeId && map[team.currentOfficeId]) {
        team.currentOfficeId = map[team.currentOfficeId];
      }
    });

    // Remap linked-team references now that all team ids are known.
    (scenario.teams || []).forEach(function (team) {
      if (Array.isArray(team.linkedTeamIds)) {
        team.linkedTeamIds = team.linkedTeamIds
          .map(function (id) { return map[id] || null; })
          .filter(Boolean);
      }
    });

    (scenario.employees || []).forEach(function (emp) {
      var newEmpId = U.genId('employee');
      map[emp.id] = newEmpId;
      emp.id = newEmpId;
      if (emp.teamId && map[emp.teamId]) {
        emp.teamId = map[emp.teamId];
      }
      if (emp.currentOfficeId && map[emp.currentOfficeId]) {
        emp.currentOfficeId = map[emp.currentOfficeId];
      }
    });

    (scenario.allocations || []).forEach(function (a) {
      a.id = U.genId('allocation');
      if (a.teamId && map[a.teamId]) {
        a.teamId = map[a.teamId];
      }
      if (a.employeeId && map[a.employeeId]) {
        a.employeeId = map[a.employeeId];
      }
      if (a.targetOfficeId && map[a.targetOfficeId]) {
        a.targetOfficeId = map[a.targetOfficeId];
      }
      if (a.targetZoneId && map[a.targetZoneId]) {
        a.targetZoneId = map[a.targetZoneId];
      }
    });
  }

  function rename(scenarioId, newName) {
    var s = U.findById(list(), scenarioId);
    if (!s || !newName) {
      return;
    }
    state.commit('Переименование сценария', function () {
      s.name = newName;
    });
  }

  function setComment(scenarioId, comment) {
    var s = U.findById(list(), scenarioId);
    if (!s) {
      return;
    }
    state.commit('Комментарий к сценарию', function () {
      s.comment = comment || '';
    });
  }

  /** Delete a scenario. The last remaining scenario cannot be deleted. */
  function remove(scenarioId) {
    var scenarios = list();
    if (scenarios.length <= 1) {
      return false;
    }
    state.commit('Удаление сценария', function () {
      var p = state.getProject();
      p.scenarios = p.scenarios.filter(function (s) {
        return s.id !== scenarioId;
      });
      if (p.settings.lastSelectedScenarioId === scenarioId) {
        p.settings.lastSelectedScenarioId = p.scenarios[0].id;
      }
    });
    return true;
  }

  function select(scenarioId) {
    // Switching scenarios is a navigation action, not an undoable edit.
    state.commit('Переключение сценария', function () {
      state.setActiveScenario(scenarioId);
    }, { skipHistory: true, force: true });
  }

  return {
    list: list,
    create: create,
    duplicate: duplicate,
    rename: rename,
    setComment: setComment,
    remove: remove,
    select: select
  };
})();
