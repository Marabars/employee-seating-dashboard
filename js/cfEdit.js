/**
 * cfEdit.js
 * Shared Cash Flow edit controller. One CF table editable at a time across the
 * whole app (Финансы + Dashboard). Holds the working draft (a copy of
 * scenario.cfOverride) and the edit key; both tabs delegate here so there is a
 * single edit state and one cfOverride. App.render is referenced lazily (it
 * loads after this file).
 */
window.App = window.App || {};

App.cfEdit = (function () {
  'use strict';

  var U = App.utils;
  var calc = App.calc;
  var state = App.state;

  var editingKey = null; // e.g. 'finance-office', 'dash-tenant-tobe'
  var draft = null;      // { offices:[...], tenants:[...] } | null

  function render() { App.render.render(); }
  function isEditing(key) { return editingKey === key; }
  function anyEditing() { return editingKey !== null; }
  function getDraft() { return draft; }
  function listOf(listKey) { return listKey === 'tenants' ? draft.tenants : draft.offices; }

  function enterEdit(scenario, years, key) {
    draft = calc.buildOverrideFromComputed(scenario, years);
    editingKey = key;
    render();
  }
  function save(scenario) {
    var d = draft;
    // Clear edit state BEFORE commit: commit -> notifyChange renders synchronously,
    // so the state must already be cleared for that render to show view mode.
    editingKey = null; draft = null;
    state.commit('Правка CF', function () { scenario.cfOverride = d; });
  }
  function cancel() { editingKey = null; draft = null; render(); }
  function reset(scenario) {
    editingKey = null; draft = null;
    state.commit('Сброс CF (пересчёт из офисов)', function () { scenario.cfOverride = null; });
  }
  function editCell(listKey, rowId, year, monthIndex, value) {
    if (!draft) { return; }
    var list = listOf(listKey);
    var row = null;
    list.forEach(function (r) { if (r.id === rowId) { row = r; } });
    if (!row) { return; }
    var ys = String(year);
    if (!row.monthly[ys] || row.monthly[ys].length !== 12) {
      row.monthly[ys] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (monthIndex === null) {
      var per = value / 12;
      for (var m = 0; m < 12; m++) { row.monthly[ys][m] = per; }
    } else {
      row.monthly[ys][monthIndex] = value;
    }
    render();
  }
  function addRow(listKey, name, phase) {
    if (!draft || !name) { return; }
    listOf(listKey).push({ id: U.genId('cfrow'), name: name, phase: phase, monthly: {} });
    render();
  }
  function deleteRow(listKey, rowId) {
    if (!draft) { return; }
    var list = listOf(listKey);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === rowId) { list.splice(i, 1); break; }
    }
    render();
  }
  function effectiveScenario(scenario) {
    if (!editingKey || !draft) { return scenario; }
    var copy = {};
    for (var k in scenario) { if (scenario.hasOwnProperty(k)) { copy[k] = scenario[k]; } }
    copy.cfOverride = draft;
    return copy;
  }

  return {
    isEditing: isEditing, anyEditing: anyEditing, getDraft: getDraft,
    enterEdit: enterEdit, save: save, cancel: cancel, reset: reset,
    editCell: editCell, addRow: addRow, deleteRow: deleteRow,
    effectiveScenario: effectiveScenario
  };
})();
