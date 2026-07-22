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

  /** CF years from settings (mirrors the finance/dashboard CF tables). */
  function cfYears() {
    var st = state.getSettings();
    var cf = (st && st.cfSettings) || {};
    var sy = cf.startYear || 2026;
    var ey = cf.endYear || 2030;
    var ys = [];
    for (var y = sy; y <= ey; y++) { ys.push(y); }
    return ys;
  }
  /** Manually-added CF rows (id prefix 'cfrow_') — not tied to an office/tenant. */
  function isManualRow(r) { return r && typeof r.id === 'string' && r.id.indexOf('cfrow_') === 0; }
  function manualRowsOf(ov) {
    var out = { offices: [], tenants: [] };
    if (!ov) { return out; }
    (ov.offices || []).forEach(function (r) { if (isManualRow(r)) { out.offices.push(r); } });
    (ov.tenants || []).forEach(function (r) { if (isManualRow(r)) { out.tenants.push(r); } });
    return out;
  }

  /**
   * "Пересчитать": recompute the office/card-derived CF rows from the current
   * offices, while preserving rows the user added manually via the pencil. When
   * there are no manual rows, drop the override entirely (fully live recompute).
   */
  function reset(scenario) {
    var manual = manualRowsOf(draft || scenario.cfOverride);
    editingKey = null; draft = null;
    state.commit('Пересчёт CF из офисов', function () {
      // Clear first so buildOverrideFromComputed recomputes from offices/cards
      // (getScenarioCFData would otherwise echo the existing override).
      scenario.cfOverride = null;
      if (!manual.offices.length && !manual.tenants.length) { return; }
      var computed = calc.buildOverrideFromComputed(scenario, cfYears());
      scenario.cfOverride = {
        offices: computed.offices.concat(manual.offices),
        tenants: computed.tenants.concat(manual.tenants)
      };
    });
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
