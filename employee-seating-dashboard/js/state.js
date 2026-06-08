/**
 * state.js
 * Single source of truth: the in-memory `project` object (same shape as the
 * JSON export, see 03_DATA_MODEL_EXAMPLE.json). All reads/writes go through
 * here. Mutations are wrapped by commit() so undo/redo can snapshot them.
 *
 * State-first principle: calculations and rendering derive from this object,
 * never from the DOM.
 */
window.App = window.App || {};

App.state = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;

  // The live project. Initialized in init().
  var project = null;

  // Listeners notified after every committed change (render, persistence...).
  var changeListeners = [];

  // ---- Factories ---------------------------------------------------------

  /** Create the system "Удаленка" office that every scenario owns. */
  function createRemoteOffice() {
    return {
      id: U.genId('office_remote'),
      type: C.OFFICE_TYPE.REMOTE,
      name: 'Удаленка',
      isSystem: true,
      unlimitedCapacity: true,
      comment: ''
    };
  }

  /** Create an auto "Опенспейс" zone for a new office that has none. */
  function createDefaultOpenSpaceZone() {
    return {
      id: U.genId('zone'),
      name: 'Опенспейс',
      type: C.ZONE_TYPE.OPEN_SPACE,
      capacity: 0,
      isVipZone: false,
      isSystem: true,
      comment: ''
    };
  }

  /** Create a fresh scenario with only the system remote office. */
  function createScenario(name, comment) {
    return {
      id: U.genId('scenario'),
      name: name || 'Новый сценарий',
      comment: comment || '',
      offices: [createRemoteOffice()],
      teams: [],
      employees: [],
      allocations: []
    };
  }

  /** Create the default project shown on first launch. */
  function createDefaultProject() {
    var scenario = createScenario('Базовый сценарий', '');
    return {
      projectVersion: '1.0.0',
      appName: 'Дашборд рассадки сотрудников',
      settings: {
        thresholds: {
          greenMaxPercent: C.DEFAULT_THRESHOLDS.greenMaxPercent,
          yellowMaxPercent: C.DEFAULT_THRESHOLDS.yellowMaxPercent
        },
        'export': {
          includePersonalDataInPdf: false
        },
        autosaveEnabled: false,
        viewOnlyMode: false,
        lastSelectedScenarioId: scenario.id
      },
      scenarios: [scenario]
    };
  }

  // ---- Init / access -----------------------------------------------------

  /**
   * Initialize state. If `loaded` (a previously persisted/imported project)
   * is provided and valid, adopt it; otherwise build the default project.
   */
  function init(loaded) {
    if (loaded && validateProjectShape(loaded)) {
      project = normalizeProject(loaded);
    } else {
      project = createDefaultProject();
    }
    ensureActiveScenario();
    return project;
  }

  /** Get the live project object (do not mutate directly outside commits). */
  function getProject() {
    return project;
  }

  /** Replace the entire project (used by undo/redo and JSON import). */
  function setProject(next) {
    project = next;
    ensureActiveScenario();
  }

  /** Currently active scenario object. */
  function getActiveScenario() {
    if (!project || !project.scenarios.length) {
      return null;
    }
    var id = project.settings.lastSelectedScenarioId;
    return U.findById(project.scenarios, id) || project.scenarios[0];
  }

  /** Make sure lastSelectedScenarioId points to an existing scenario. */
  function ensureActiveScenario() {
    if (!project || !project.scenarios.length) {
      return;
    }
    var id = project.settings.lastSelectedScenarioId;
    if (!U.findById(project.scenarios, id)) {
      project.settings.lastSelectedScenarioId = project.scenarios[0].id;
    }
  }

  function setActiveScenario(scenarioId) {
    if (U.findById(project.scenarios, scenarioId)) {
      project.settings.lastSelectedScenarioId = scenarioId;
    }
  }

  // ---- Settings ----------------------------------------------------------

  function getSettings() {
    return project.settings;
  }

  function isViewOnly() {
    return !!(project && project.settings && project.settings.viewOnlyMode);
  }

  function getThresholds() {
    return project.settings.thresholds;
  }

  // ---- Commit / change notification --------------------------------------

  /**
   * Run a mutation against the live project and notify listeners.
   *
   * `mutator` performs the change in place (returns nothing). It runs only
   * when not in view-only mode (unless `force` is set, e.g. for settings
   * toggles like leaving view-only itself).
   *
   * `label` describes the action for undo history.
   * `options.skipHistory` lets undo/redo and import suppress snapshotting
   *   (import is one big action; undo/redo restore directly).
   */
  function commit(label, mutator, options) {
    options = options || {};
    if (isViewOnly() && !options.force) {
      return false;
    }
    if (!options.skipHistory && App.undoRedo) {
      App.undoRedo.snapshot(label);
    }
    if (typeof mutator === 'function') {
      mutator();
    }
    notifyChange(label, options);
    return true;
  }

  /** Notify all change listeners (render, persistence). */
  function notifyChange(label, options) {
    changeListeners.forEach(function (fn) {
      try {
        fn(label, options || {});
      } catch (e) {
        // A failing listener must not break others.
        if (window.console) {
          console.error('change listener failed:', e);
        }
      }
    });
  }

  function onChange(fn) {
    changeListeners.push(fn);
  }

  // ---- Validation / normalization of loaded data -------------------------

  /** Minimal structural validation of an imported/loaded project. */
  function validateProjectShape(obj) {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    if (!Array.isArray(obj.scenarios) || obj.scenarios.length === 0) {
      return false;
    }
    for (var i = 0; i < obj.scenarios.length; i++) {
      var s = obj.scenarios[i];
      if (!s || typeof s !== 'object' || !s.id) {
        return false;
      }
      if (!Array.isArray(s.offices) || !Array.isArray(s.teams) ||
          !Array.isArray(s.employees) || !Array.isArray(s.allocations)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Fill in any missing optional fields on a loaded project so the rest of
   * the app can assume a complete shape. Guarantees a remote office and at
   * least one zone per new office.
   */
  function normalizeProject(obj) {
    var p = U.deepClone(obj);
    p.projectVersion = p.projectVersion || '1.0.0';
    p.appName = p.appName || 'Дашборд рассадки сотрудников';
    p.settings = p.settings || {};
    p.settings.thresholds = p.settings.thresholds || {
      greenMaxPercent: C.DEFAULT_THRESHOLDS.greenMaxPercent,
      yellowMaxPercent: C.DEFAULT_THRESHOLDS.yellowMaxPercent
    };
    p.settings['export'] = p.settings['export'] || { includePersonalDataInPdf: false };
    if (typeof p.settings.autosaveEnabled !== 'boolean') {
      p.settings.autosaveEnabled = false;
    }
    if (typeof p.settings.viewOnlyMode !== 'boolean') {
      p.settings.viewOnlyMode = false;
    }

    p.scenarios.forEach(function (s) {
      s.comment = s.comment || '';
      s.offices = s.offices || [];
      s.teams = s.teams || [];
      s.employees = s.employees || [];
      s.allocations = s.allocations || [];

      // Ensure each team has a linkedTeamIds array (forward-compat for older
      // saved projects) and that links are symmetric.
      s.teams.forEach(function (t) {
        if (!Array.isArray(t.linkedTeamIds)) {
          t.linkedTeamIds = [];
        }
      });
      s.teams.forEach(function (t) {
        t.linkedTeamIds.forEach(function (otherId) {
          var other = U.findById(s.teams, otherId);
          if (other && other.linkedTeamIds.indexOf(t.id) === -1) {
            other.linkedTeamIds.push(t.id);
          }
        });
      });

      var hasRemote = s.offices.some(function (o) {
        return o.type === C.OFFICE_TYPE.REMOTE;
      });
      if (!hasRemote) {
        s.offices.push(createRemoteOffice());
      }

      s.offices.forEach(function (o) {
        if (o.type === C.OFFICE_TYPE.NEW) {
          o.zones = o.zones || [];
          if (o.zones.length === 0) {
            o.zones.push(createDefaultOpenSpaceZone());
          }
        }
      });
    });

    if (!p.settings.lastSelectedScenarioId ||
        !U.findById(p.scenarios, p.settings.lastSelectedScenarioId)) {
      p.settings.lastSelectedScenarioId = p.scenarios[0].id;
    }
    return p;
  }

  return {
    // factories (reused by scenarios/offices modules)
    createRemoteOffice: createRemoteOffice,
    createDefaultOpenSpaceZone: createDefaultOpenSpaceZone,
    createScenario: createScenario,
    createDefaultProject: createDefaultProject,
    // lifecycle
    init: init,
    getProject: getProject,
    setProject: setProject,
    // scenario access
    getActiveScenario: getActiveScenario,
    setActiveScenario: setActiveScenario,
    ensureActiveScenario: ensureActiveScenario,
    // settings
    getSettings: getSettings,
    isViewOnly: isViewOnly,
    getThresholds: getThresholds,
    // mutation
    commit: commit,
    notifyChange: notifyChange,
    onChange: onChange,
    // import helpers
    validateProjectShape: validateProjectShape,
    normalizeProject: normalizeProject
  };
})();
