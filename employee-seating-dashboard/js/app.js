/**
 * app.js
 * Bootstrap: initialize state (from autosave if present), wire navigation,
 * top-bar actions, settings menu, scenario action handlers, undo/redo
 * buttons, and trigger the first render + onboarding.
 *
 * This file runs last (after all modules are defined).
 */
window.App = window.App || {};

App.app = (function () {
  'use strict';

  var U = App.utils;
  var state = App.state;

  function init() {
    // Load autosaved project if available (autosave may be enabled in it).
    var loaded = App.persistence.load();
    state.init(loaded);

    // Re-render and autosave on every committed change.
    state.onChange(function () {
      App.render.render();
      App.persistence.onChange();
    });

    buildNav();
    bindTopbar();
    App.undoRedo.bindHotkeys();

    App.render.setActiveTab('dashboard');
    App.onboarding.maybeShow();
  }

  // ---- Navigation --------------------------------------------------------

  var TABS = [
    { id: 'dashboard', label: 'Дашборд' },
    { id: 'distribution', label: 'Распределение' },
    { id: 'offices', label: 'Офисы' },
    { id: 'teams', label: 'Команды' },
    { id: 'employees', label: 'Сотрудники' },
    { id: 'comparison', label: 'Сравнение сценариев' },
    { id: 'reports', label: 'Отчеты' },
    { id: 'finance', label: 'Финансы' }
  ];

  function buildNav() {
    var nav = U.qs('#main-nav');
    U.clear(nav);
    TABS.forEach(function (tab) {
      var btn = U.el('button', {
        class: 'nav-tab',
        dataset: { tab: tab.id },
        onclick: function () { App.render.setActiveTab(tab.id); }
      }, tab.label);
      nav.appendChild(btn);
    });
  }

  // ---- Top bar (undo/redo, settings) ------------------------------------

  function bindTopbar() {
    U.qs('#btn-undo').addEventListener('click', function () { App.undoRedo.undo(); });
    U.qs('#btn-redo').addEventListener('click', function () { App.undoRedo.redo(); });
    U.qs('#btn-settings').addEventListener('click', openSettings);
    U.qs('#btn-onboarding').addEventListener('click', function () { App.onboarding.show(); });
  }

  function openSettings() {
    var settings = state.getSettings();
    App.modals.form({
      title: 'Настройки',
      fields: [
        { name: 'greenMaxPercent', label: 'Порог зеленого статуса (%)', type: 'number', min: 0,
          value: settings.thresholds.greenMaxPercent },
        { name: 'yellowMaxPercent', label: 'Порог желтого статуса (%)', type: 'number', min: 0,
          value: settings.thresholds.yellowMaxPercent },
        { name: 'autosaveEnabled', label: 'Автосохранение в браузере', type: 'checkbox',
          value: settings.autosaveEnabled },
        { name: 'includePersonalDataInPdf', label: 'Включать ФИО сотрудников в PDF', type: 'checkbox',
          value: settings['export'].includePersonalDataInPdf },
        { name: 'viewOnlyMode', label: 'Режим «Только просмотр»', type: 'checkbox',
          value: settings.viewOnlyMode }
      ],
      onSubmit: function (values) {
        // Settings changes bypass view-only lock (force) and are undoable as
        // a normal change, but toggling view-only itself must always apply.
        state.commit('Изменение настроек', function () {
          var s = state.getSettings();
          s.thresholds.greenMaxPercent = U.toNonNegativeInt(values.greenMaxPercent);
          s.thresholds.yellowMaxPercent = U.toNonNegativeInt(values.yellowMaxPercent);
          var autosaveWasOn = s.autosaveEnabled;
          s.autosaveEnabled = !!values.autosaveEnabled;
          s['export'].includePersonalDataInPdf = !!values.includePersonalDataInPdf;
          s.viewOnlyMode = !!values.viewOnlyMode;
          if (autosaveWasOn && !s.autosaveEnabled) {
            App.persistence.clear();
          }
        }, { force: true, skipHistory: true });
        // Persist immediately if autosave just turned on.
        App.persistence.saveNow();
        return true;
      }
    });
  }

  // ---- Scenario action handlers (called from the sidebar) ----------------

  function onCreateScenario() {
    App.modals.form({
      title: 'Новый сценарий',
      fields: [{ name: 'name', label: 'Название', type: 'text', value: '' }],
      onSubmit: function (values) {
        App.scenarios.create(values.name || 'Новый сценарий');
        return true;
      }
    });
  }

  function onRenameScenario(scenarioId) {
    var s = U.findById(App.scenarios.list(), scenarioId);
    if (!s) {
      return;
    }
    App.modals.form({
      title: 'Переименование сценария',
      fields: [{ name: 'name', label: 'Название', type: 'text', value: s.name }],
      onSubmit: function (values) {
        if (!values.name) {
          App.modals.alert('Укажите название');
          return false;
        }
        App.scenarios.rename(scenarioId, values.name);
        return true;
      }
    });
  }

  function onCommentScenario(scenarioId) {
    var s = U.findById(App.scenarios.list(), scenarioId);
    if (!s) {
      return;
    }
    App.modals.form({
      title: 'Комментарий к сценарию',
      fields: [{ name: 'comment', label: 'Комментарий', type: 'textarea', value: s.comment }],
      onSubmit: function (values) {
        App.scenarios.setComment(scenarioId, values.comment);
        return true;
      }
    });
  }

  function onDeleteScenario(scenarioId) {
    var s = U.findById(App.scenarios.list(), scenarioId);
    if (!s) {
      return;
    }
    if (App.scenarios.list().length <= 1) {
      App.modals.alert('Последний сценарий удалить нельзя.');
      return;
    }
    App.modals.confirm('Удалить сценарий «' + s.name + '»? Это действие можно отменить (Ctrl+Z).',
      function () { App.scenarios.remove(scenarioId); },
      { danger: true, confirmLabel: 'Удалить' });
  }

  return {
    init: init,
    onCreateScenario: onCreateScenario,
    onRenameScenario: onRenameScenario,
    onCommentScenario: onCommentScenario,
    onDeleteScenario: onDeleteScenario,
    openSettings: openSettings
  };
})();

// Kick off once the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { App.app.init(); });
} else {
  App.app.init();
}
