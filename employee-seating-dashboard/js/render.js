/**
 * render.js
 * Central render router + shared UI components. render() rebuilds the active
 * tab from state; the scenarios sidebar, top bar, and validation are always
 * refreshed. Tab-specific rendering lives in render.<tab>.js and registers
 * here via App.render.tabs.
 */
window.App = window.App || {};

App.render = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;
  var calc = App.calc;

  var activeTab = 'dashboard';

  // Tab renderers register themselves: { id, label, render(container, ctx) }.
  var tabs = {};

  function registerTab(id, renderer) {
    tabs[id] = renderer;
  }

  function setActiveTab(id) {
    if (tabs[id]) {
      activeTab = id;
    }
    render();
  }

  function getActiveTab() {
    return activeTab;
  }

  /**
   * Build a render context shared by tabs for the active scenario, so each
   * tab doesn't recompute KPIs/validation.
   */
  function buildContext() {
    var scenario = state.getActiveScenario();
    var messages = App.validation.validateScenario(scenario);
    var kpis = calc.calculateScenarioKpis(scenario, messages);
    return {
      scenario: scenario,
      messages: messages,
      kpis: kpis,
      thresholds: state.getThresholds(),
      viewOnly: state.isViewOnly()
    };
  }

  /** Full re-render of sidebar, top bar, active tab, and view-only banner. */
  function render() {
    var ctx = buildContext();
    renderSidebar(ctx);
    renderTopbar(ctx);
    renderViewOnlyBanner(ctx);

    var container = U.qs('#tab-content');
    U.clear(container);
    var renderer = tabs[activeTab] || tabs.dashboard;
    if (renderer && renderer.render) {
      renderer.render(container, ctx);
    }
    updateNavActive();
    if (App.dragDrop) {
      App.dragDrop.refresh();
    }
  }

  // ---- Sidebar (scenarios) ----------------------------------------------

  function renderSidebar(ctx) {
    var host = U.qs('#scenarios-panel');
    if (!host) {
      return;
    }
    U.clear(host);
    var project = state.getProject();

    host.appendChild(U.el('div', { class: 'sidebar-head' }, [
      U.el('h2', { text: 'Сценарии' }),
      ctx.viewOnly ? null : U.el('button', {
        class: 'btn btn-primary btn-sm',
        title: 'Создать сценарий',
        onclick: function () { App.app.onCreateScenario(); }
      }, '+ Сценарий')
    ]));

    var listEl = U.el('div', { class: 'scenario-list' });
    project.scenarios.forEach(function (s) {
      var isActive = s.id === project.settings.lastSelectedScenarioId;
      var item = U.el('div', {
        class: 'scenario-item' + (isActive ? ' active' : ''),
        onclick: function () { App.scenarios.select(s.id); }
      }, [
        U.el('div', { class: 'scenario-name', text: s.name }),
        s.comment ? U.el('div', { class: 'scenario-comment', text: s.comment }) : null
      ]);

      if (!ctx.viewOnly) {
        var actions = U.el('div', { class: 'scenario-actions' });
        actions.appendChild(iconBtn('✎', 'Переименовать', function (e) {
          e.stopPropagation();
          App.app.onRenameScenario(s.id);
        }));
        actions.appendChild(iconBtn('❏', 'Дублировать', function (e) {
          e.stopPropagation();
          App.scenarios.duplicate(s.id);
        }));
        actions.appendChild(iconBtn('💬', 'Комментарий', function (e) {
          e.stopPropagation();
          App.app.onCommentScenario(s.id);
        }));
        if (project.scenarios.length > 1) {
          actions.appendChild(iconBtn('🗑', 'Удалить', function (e) {
            e.stopPropagation();
            App.app.onDeleteScenario(s.id);
          }));
        }
        item.appendChild(actions);
      }
      listEl.appendChild(item);
    });
    host.appendChild(listEl);
  }

  function iconBtn(symbol, title, onClick) {
    return U.el('button', {
      class: 'icon-btn',
      title: title,
      'aria-label': title,
      onclick: onClick
    }, symbol);
  }

  // ---- Top bar -----------------------------------------------------------

  function renderTopbar(ctx) {
    var host = U.qs('#topbar-status');
    if (!host) {
      return;
    }
    U.clear(host);
    host.appendChild(badge('Предупреждения: ' + ctx.kpis.warningsCount,
      ctx.kpis.warningsCount > 0 ? 'yellow' : 'grey'));
    host.appendChild(badge('Ошибки: ' + ctx.kpis.errorsCount,
      ctx.kpis.errorsCount > 0 ? 'red' : 'grey'));

    // Undo/redo buttons reflect availability.
    var undoBtn = U.qs('#btn-undo');
    var redoBtn = U.qs('#btn-redo');
    if (undoBtn) {
      undoBtn.disabled = ctx.viewOnly || !App.undoRedo.canUndo();
    }
    if (redoBtn) {
      redoBtn.disabled = ctx.viewOnly || !App.undoRedo.canRedo();
    }
  }

  function renderViewOnlyBanner(ctx) {
    var banner = U.qs('#viewonly-banner');
    if (!banner) {
      return;
    }
    banner.style.display = ctx.viewOnly ? 'block' : 'none';
  }

  function updateNavActive() {
    U.qsa('.nav-tab').forEach(function (btn) {
      if (btn.dataset.tab === activeTab) {
        btn.classList.add('active');
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.classList.remove('active');
        btn.removeAttribute('aria-current');
      }
    });
  }

  // ---- Shared components (used by tab renderers) -------------------------

  /** Colored pill badge. */
  function badge(text, color) {
    return U.el('span', { class: 'badge badge-' + (color || 'grey'), text: text });
  }

  /**
   * Progress bar with status color. value/max numeric; overflow shows red.
   * Returns a node.
   */
  function progressBar(occupied, capacity, thresholds) {
    var percent = calc.calculateOccupancyPercent(occupied, capacity);
    var color = calc.statusColor(percent, thresholds);
    var widthPercent = percent === null ? 0 : Math.min(100, percent);
    var bar = U.el('div', { class: 'progress' }, [
      U.el('div', {
        class: 'progress-fill progress-' + color,
        style: 'width:' + widthPercent + '%'
      })
    ]);
    return bar;
  }

  /** KPI card: label + value, optional accent color. */
  function kpiCard(label, value, color) {
    return U.el('div', { class: 'kpi-card' + (color ? ' kpi-' + color : '') }, [
      U.el('div', { class: 'kpi-value', text: String(value) }),
      U.el('div', { class: 'kpi-label', text: label })
    ]);
  }

  /** Empty-state block. */
  function emptyState(text, actionLabel, onAction) {
    var node = U.el('div', { class: 'empty-state' }, [
      U.el('p', { text: text })
    ]);
    if (actionLabel && onAction && !state.isViewOnly()) {
      node.appendChild(U.el('button', {
        class: 'btn btn-primary',
        onclick: onAction
      }, actionLabel));
    }
    return node;
  }

  /** Section wrapper with a title and optional header action button. */
  function section(title, action) {
    var head = U.el('div', { class: 'section-head' }, [
      U.el('h2', { text: title })
    ]);
    if (action && !state.isViewOnly()) {
      head.appendChild(U.el('button', {
        class: 'btn btn-primary btn-sm',
        onclick: action.onClick
      }, action.label));
    }
    return U.el('section', { class: 'panel' }, [head]);
  }

  /** Free/overflow text for capacity vs occupied. */
  function freeOrOverflowText(capacity, occupied) {
    if (!isFinite(capacity)) {
      return 'Без лимита';
    }
    var overflow = calc.calculateOverflow(capacity, occupied);
    if (overflow > 0) {
      return U.formatOverflow(overflow);
    }
    var free = capacity - occupied;
    return 'Свободно: ' + free + ' ' + U.pluralPlaces(free);
  }

  return {
    registerTab: registerTab,
    setActiveTab: setActiveTab,
    getActiveTab: getActiveTab,
    render: render,
    buildContext: buildContext,
    // shared components
    badge: badge,
    progressBar: progressBar,
    kpiCard: kpiCard,
    emptyState: emptyState,
    section: section,
    iconBtn: iconBtn,
    freeOrOverflowText: freeOrOverflowText
  };
})();
