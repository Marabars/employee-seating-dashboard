/**
 * persistence.js
 * localStorage autosave (debounced) + load. JSON export remains the primary
 * save method; autosave is an optional convenience toggled in settings.
 */
window.App = window.App || {};

App.persistence = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;

  var saveDebounced = U.debounce(saveNow, 600);

  /** Load a previously autosaved project, or null. */
  function load() {
    try {
      var raw = localStorage.getItem(C.STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (e) {
      if (window.console) {
        console.warn('Failed to load autosaved project:', e);
      }
      return null;
    }
  }

  /** Persist the project immediately (only when autosave is enabled). */
  function saveNow() {
    var project = state.getProject();
    if (!project || !project.settings.autosaveEnabled) {
      return;
    }
    try {
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify(project));
    } catch (e) {
      if (window.console) {
        console.warn('Failed to autosave project:', e);
      }
    }
  }

  /** Remove the autosaved project (used when autosave is turned off). */
  function clear() {
    try {
      localStorage.removeItem(C.STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }

  /** Hook: schedule a debounced save after any change. */
  function onChange() {
    var project = state.getProject();
    if (project && project.settings.autosaveEnabled) {
      saveDebounced();
    }
  }

  function isOnboardingDone() {
    try {
      return localStorage.getItem(C.ONBOARDING_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markOnboardingDone() {
    try {
      localStorage.setItem(C.ONBOARDING_KEY, '1');
    } catch (e) {
      // ignore
    }
  }

  return {
    load: load,
    saveNow: saveNow,
    clear: clear,
    onChange: onChange,
    isOnboardingDone: isOnboardingDone,
    markOnboardingDone: markOnboardingDone
  };
})();
