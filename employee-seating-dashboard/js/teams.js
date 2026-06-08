/**
 * teams.js
 * CRUD for teams within the active scenario.
 */
window.App = window.App || {};

App.teams = (function () {
  'use strict';

  var U = App.utils;
  var state = App.state;

  function scenario() {
    return state.getActiveScenario();
  }

  function list() {
    return scenario().teams;
  }

  function find(teamId) {
    return U.findById(list(), teamId);
  }

  function add(data) {
    var team = {
      id: U.genId('team'),
      name: data.name || 'Команда',
      employeesCount: U.toNonNegativeInt(data.employeesCount),
      currentOfficeId: data.currentOfficeId || null,
      isVip: !!data.isVip,
      canSplit: data.canSplit !== false, // default: splittable
      comment: data.comment || ''
    };
    state.commit('Добавление команды', function () {
      scenario().teams.push(team);
    });
    return team.id;
  }

  function update(teamId, data) {
    var team = find(teamId);
    if (!team) {
      return;
    }
    state.commit('Изменение команды', function () {
      if (data.name !== undefined) {
        team.name = data.name;
      }
      if (data.employeesCount !== undefined) {
        team.employeesCount = U.toNonNegativeInt(data.employeesCount);
      }
      if (data.currentOfficeId !== undefined) {
        team.currentOfficeId = data.currentOfficeId || null;
      }
      if (data.isVip !== undefined) {
        team.isVip = !!data.isVip;
      }
      if (data.canSplit !== undefined) {
        team.canSplit = !!data.canSplit;
      }
      if (data.comment !== undefined) {
        team.comment = data.comment;
      }
    });
  }

  /** Delete a team and its allocations. Employees keep teamId=null. */
  function remove(teamId) {
    var team = find(teamId);
    if (!team) {
      return false;
    }
    state.commit('Удаление команды', function () {
      var s = scenario();
      s.teams = s.teams.filter(function (t) {
        return t.id !== teamId;
      });
      s.allocations = s.allocations.filter(function (a) {
        return a.teamId !== teamId;
      });
      s.employees.forEach(function (e) {
        if (e.teamId === teamId) {
          e.teamId = null;
        }
      });
    });
    return true;
  }

  return {
    list: list,
    find: find,
    add: add,
    update: update,
    remove: remove
  };
})();
