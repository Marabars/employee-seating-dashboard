/**
 * undoRedo.js
 * Snapshot-based undo/redo over the whole project (past/present/future model
 * from the DnD skill's state-management reference, adapted to vanilla).
 *
 * snapshot(label) is called by state.commit BEFORE a mutation, capturing the
 * pre-change project. undo() restores it; redo() re-applies.
 */
window.App = window.App || {};

App.undoRedo = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;

  var past = [];   // snapshots before each committed change
  var future = []; // snapshots undone, available to redo

  /** Capture the current project as a snapshot to enable undo. */
  function snapshot() {
    var project = state.getProject();
    if (!project) {
      return;
    }
    past.push(U.deepClone(project));
    if (past.length > C.HISTORY_LIMIT) {
      past.shift();
    }
    // Any new change invalidates the redo stack.
    future = [];
  }

  /**
   * Record a coarse-grained checkpoint that cannot be stepped through
   * (used by import: it is one big action). Clears redo, no per-step entries.
   */
  function checkpoint() {
    var project = state.getProject();
    if (!project) {
      return;
    }
    past.push(U.deepClone(project));
    if (past.length > C.HISTORY_LIMIT) {
      past.shift();
    }
    future = [];
  }

  function canUndo() {
    return past.length > 0;
  }

  function canRedo() {
    return future.length > 0;
  }

  function undo() {
    if (!past.length || state.isViewOnly()) {
      return false;
    }
    var current = U.deepClone(state.getProject());
    future.push(current);
    var previous = past.pop();
    state.setProject(previous);
    state.notifyChange('Отмена', { skipHistory: true });
    return true;
  }

  function redo() {
    if (!future.length || state.isViewOnly()) {
      return false;
    }
    var current = U.deepClone(state.getProject());
    past.push(current);
    var next = future.pop();
    state.setProject(next);
    state.notifyChange('Повтор', { skipHistory: true });
    return true;
  }

  function reset() {
    past = [];
    future = [];
  }

  /** Global keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo). */
  function bindHotkeys() {
    document.addEventListener('keydown', function (e) {
      var mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        return;
      }
      var key = e.key.toLowerCase();
      // Skip when typing in inputs so text editing keeps native undo.
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) {
        return;
      }
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'y') || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    });
  }

  return {
    snapshot: snapshot,
    checkpoint: checkpoint,
    canUndo: canUndo,
    canRedo: canRedo,
    undo: undo,
    redo: redo,
    reset: reset,
    bindHotkeys: bindHotkeys
  };
})();
