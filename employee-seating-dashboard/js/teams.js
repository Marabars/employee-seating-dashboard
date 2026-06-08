/**
 * teams.js
 * CRUD for teams within the active scenario.
 *
 * Teams can declare dependencies on other teams via `linkedTeamIds`. The
 * relationship is symmetric and kept consistent in both directions: linked
 * teams must be placed in the same office (see validation.js).
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
      linkedTeamIds: [],
      comment: data.comment || ''
    };
    state.commit('Добавление команды', function () {
      scenario().teams.push(team);
      if (Array.isArray(data.linkedTeamIds)) {
        applyLinks(scenario(), team, data.linkedTeamIds);
      }
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
      if (data.linkedTeamIds !== undefined) {
        applyLinks(scenario(), team, data.linkedTeamIds || []);
      }
    });
  }

  /**
   * Make `team.linkedTeamIds` equal to `nextIds` and keep the relationship
   * symmetric: every team gains/loses the back-reference accordingly.
   * A team cannot link to itself or to a missing team.
   */
  function applyLinks(scenarioObj, team, nextIds) {
    var valid = {};
    nextIds.forEach(function (id) {
      if (id && id !== team.id && U.findById(scenarioObj.teams, id)) {
        valid[id] = true;
      }
    });
    var nextSet = Object.keys(valid);
    var prevSet = (team.linkedTeamIds || []).slice();

    team.linkedTeamIds = nextSet;

    // Add back-references for newly linked teams.
    nextSet.forEach(function (otherId) {
      var other = U.findById(scenarioObj.teams, otherId);
      if (!other) {
        return;
      }
      other.linkedTeamIds = other.linkedTeamIds || [];
      if (other.linkedTeamIds.indexOf(team.id) === -1) {
        other.linkedTeamIds.push(team.id);
      }
    });

    // Remove back-references from teams no longer linked.
    prevSet.forEach(function (otherId) {
      if (valid[otherId]) {
        return;
      }
      var other = U.findById(scenarioObj.teams, otherId);
      if (other && other.linkedTeamIds) {
        other.linkedTeamIds = other.linkedTeamIds.filter(function (id) {
          return id !== team.id;
        });
      }
    });
  }

  /** Delete a team, its allocations, and any link references to it. */
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
      s.teams.forEach(function (t) {
        if (t.linkedTeamIds && t.linkedTeamIds.length) {
          t.linkedTeamIds = t.linkedTeamIds.filter(function (id) {
            return id !== teamId;
          });
        }
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
