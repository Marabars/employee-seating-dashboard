/**
 * dragDrop.js
 * Native HTML5 drag-and-drop wiring, adapted from the implementing-drag-drop
 * skill to vanilla + state-first architecture.
 *
 * Key points:
 *  - Sources carry {kind, id} via dataTransfer (JSON, text/plain fallback).
 *  - dragover calls preventDefault (mandatory) so drop fires.
 *  - drop runs business logic over state (create/move allocation) + commit,
 *    NOT direct DOM moves — render() rebuilds from state.
 *  - Team drop -> quantity popup (suggests remainder); employee drop -> direct.
 *  - VIP conflicts surface as warnings via validation after commit.
 *  - Keyboard alternative + ARIA live announcements for accessibility.
 *
 * Pure helpers (validateDrop / calculateAutoScroll / findNearestDropTarget)
 * are ported from the skill's scripts/calculate_drop_position.js.
 */
window.App = window.App || {};

App.dragDrop = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;
  var alloc = App.allocations;

  // Keyboard "grab" state for the accessible alternative.
  var grabbed = null; // { kind, id }
  var autoScrollTimer = null;

  // ---- Ported pure helpers (from skill scripts) --------------------------

  /** Validate a drop against rules, including a custom validator. */
  function validateDrop(draggedItem, dropTarget, rules) {
    rules = rules || {};
    if (rules.customValidator) {
      var res = rules.customValidator(draggedItem, dropTarget);
      if (res && res.valid === false) {
        return res;
      }
    }
    return { valid: true, reason: null };
  }

  /** Auto-scroll speed based on cursor proximity to a scroll container's edges. */
  function calculateAutoScroll(cursor, container, threshold) {
    threshold = threshold || 50;
    var rect = container.getBoundingClientRect();
    var maxSpeed = 14;
    var speed = { x: 0, y: 0 };
    if (cursor.y < rect.top + threshold) {
      speed.y = -Math.min(((rect.top + threshold - cursor.y) / threshold) * maxSpeed, maxSpeed);
    } else if (cursor.y > rect.bottom - threshold) {
      speed.y = Math.min(((cursor.y - (rect.bottom - threshold)) / threshold) * maxSpeed, maxSpeed);
    }
    return speed;
  }

  /** Nearest drop target to a cursor among candidate elements. */
  function findNearestDropTarget(cursor, dropTargets, maxDistance) {
    maxDistance = maxDistance || Infinity;
    var nearest = null;
    var min = maxDistance;
    dropTargets.forEach(function (t) {
      var r = t.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = Math.sqrt(Math.pow(cursor.x - cx, 2) + Math.pow(cursor.y - cy, 2));
      if (d < min) {
        min = d;
        nearest = t;
      }
    });
    return { target: nearest, distance: min };
  }

  // ---- Accessibility announcements --------------------------------------

  function announce(message) {
    var region = U.qs('#dnd-live');
    if (region) {
      region.textContent = message;
      setTimeout(function () {
        if (region.textContent === message) {
          region.textContent = '';
        }
      }, 1200);
    }
  }

  // ---- Drag source / drop target wiring ----------------------------------

  /**
   * Re-bind DnD handlers after each render. We use event delegation on
   * document for dragstart/dragend, and per-target listeners for drop zones.
   */
  function refresh() {
    if (state.isViewOnly()) {
      return; // sources are rendered with draggable="false" in view-only
    }
    bindSources();
    bindDropZones();
  }

  function bindSources() {
    U.qsa('[data-drag-kind]').forEach(function (source) {
      if (source._dndBound) {
        return;
      }
      source._dndBound = true;
      source.setAttribute('tabindex', '0');
      source.setAttribute('aria-grabbed', 'false');
      source.setAttribute('aria-roledescription', 'перетаскиваемый элемент');

      source.addEventListener('dragstart', function (e) {
        var payload = { kind: source.dataset.dragKind, id: source.dataset.dragId };
        try {
          e.dataTransfer.setData('application/json', JSON.stringify(payload));
        } catch (err) {
          // some browsers restrict custom types on file://; keep text fallback
        }
        e.dataTransfer.setData('text/plain', payload.kind + ':' + payload.id);
        e.dataTransfer.effectAllowed = 'move';
        source.classList.add('dragging');
        source.setAttribute('aria-grabbed', 'true');
        announce('Взято: ' + sourceLabel(payload));
      });

      source.addEventListener('dragend', function () {
        source.classList.remove('dragging');
        source.setAttribute('aria-grabbed', 'false');
        stopAutoScroll();
      });

      // Keyboard alternative: Space/Enter to grab, then activate a target.
      source.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          var payload = { kind: source.dataset.dragKind, id: source.dataset.dragId };
          grabbed = payload;
          announce('Взято с клавиатуры: ' + sourceLabel(payload) + '. Перейдите к зоне и нажмите Enter, чтобы разместить. Esc — отмена.');
        } else if (e.key === 'Escape') {
          grabbed = null;
          announce('Перетаскивание отменено.');
        }
      });
    });
  }

  function bindDropZones() {
    U.qsa('[data-drop-office]').forEach(function (zone) {
      if (zone._dndBound) {
        return;
      }
      zone._dndBound = true;

      zone.addEventListener('dragover', function (e) {
        e.preventDefault(); // MANDATORY so drop fires
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drop-hover');
        handleAutoScroll({ x: e.clientX, y: e.clientY });
      });
      zone.addEventListener('dragenter', function (e) {
        e.preventDefault();
        zone.classList.add('drop-hover');
      });
      zone.addEventListener('dragleave', function () {
        zone.classList.remove('drop-hover');
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drop-hover');
        stopAutoScroll();
        var payload = readPayload(e.dataTransfer);
        if (payload) {
          performDrop(payload, targetOf(zone));
        }
      });

      // Keyboard drop target.
      zone.setAttribute('tabindex', '0');
      zone.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && grabbed) {
          e.preventDefault();
          var payload = grabbed;
          grabbed = null;
          performDrop(payload, targetOf(zone));
        }
      });
    });
  }

  function targetOf(zoneEl) {
    return {
      officeId: zoneEl.dataset.dropOffice,
      zoneId: zoneEl.dataset.dropZone || null
    };
  }

  function readPayload(dt) {
    try {
      var json = dt.getData('application/json');
      if (json) {
        return JSON.parse(json);
      }
    } catch (e) {
      // fall through
    }
    var text = dt.getData('text/plain');
    if (text && text.indexOf(':') > -1) {
      var parts = text.split(':');
      return { kind: parts[0], id: parts.slice(1).join(':') };
    }
    return null;
  }

  function sourceLabel(payload) {
    var scenario = state.getActiveScenario();
    if (payload.kind === 'team') {
      var team = U.findById(scenario.teams, payload.id);
      return team ? 'команда ' + team.name : 'команда';
    }
    if (payload.kind === 'employee') {
      var emp = U.findById(scenario.employees, payload.id);
      return emp ? 'сотрудник ' + emp.fullName : 'сотрудник';
    }
    return 'элемент';
  }

  // ---- Drop business logic ----------------------------------------------

  function performDrop(payload, target) {
    var scenario = state.getActiveScenario();
    var office = U.findById(scenario.offices, target.officeId);
    if (!office) {
      return;
    }
    var zone = target.zoneId ? alloc.findZone(scenario, target.zoneId) : null;
    var isRemote = office.type === C.OFFICE_TYPE.REMOTE;

    if (payload.kind === 'employee') {
      dropEmployee(scenario, payload.id, office, zone, isRemote);
    } else if (payload.kind === 'team') {
      dropTeam(scenario, payload.id, office, zone, isRemote);
    } else if (payload.kind === 'allocation') {
      dropAllocation(scenario, payload.id, office, zone, isRemote);
    }
  }

  /**
   * Move an existing allocation to a new office/zone. If the target is a
   * physical (new) office and no specific zone was chosen (dropped on the
   * office body), ask which zone to move into.
   */
  function dropAllocation(scenario, allocationId, office, zone, isRemote) {
    var a = U.findById(scenario.allocations, allocationId);
    if (!a) {
      return;
    }
    function applyMove(zoneId) {
      var z = zoneId ? alloc.findZone(scenario, zoneId) : null;
      if (!isRemote && z) {
        var isVipEntity = entityIsVip(scenario, a);
        var conflict = alloc.vipConflict(isVipEntity, z);
        if (conflict) {
          announce('Предупреждение: ' + conflict);
        }
      }
      alloc.move(allocationId, office.id, zoneId);
      announce('Размещение перемещено в ' + office.name + (z ? ' / ' + z.name : ''));
    }

    if (!isRemote && !zone) {
      // Dropped on the office body -> must pick a zone.
      pickZone(office, a.targetZoneId, function (zoneId) {
        applyMove(zoneId);
      });
      return;
    }
    applyMove(zone ? zone.id : null);
  }

  function entityIsVip(scenario, allocation) {
    if (allocation.type === C.ALLOCATION_TYPE.TEAM) {
      var team = U.findById(scenario.teams, allocation.teamId);
      return !!(team && team.isVip);
    }
    var emp = U.findById(scenario.employees, allocation.employeeId);
    return !!(emp && emp.isVip);
  }

  function dropEmployee(scenario, employeeId, office, zone, isRemote) {
    var emp = U.findById(scenario.employees, employeeId);
    if (!emp) {
      return;
    }
    // VIP check (warning only — placement still proceeds, per ТЗ §9.2).
    if (!isRemote && zone) {
      var conflict = alloc.vipConflict(!!emp.isVip, zone);
      if (conflict) {
        announce('Предупреждение: ' + conflict);
      }
    }
    alloc.setEmployeeAllocation(employeeId, office.id, zone ? zone.id : null, '');
    announce('Сотрудник ' + emp.fullName + ' размещён в ' + office.name + (zone ? ' / ' + zone.name : ''));
  }

  function dropTeam(scenario, teamId, office, zone, isRemote) {
    var team = U.findById(scenario.teams, teamId);
    if (!team) {
      return;
    }
    var suggested = alloc.suggestRemainder(scenario, teamId);
    if (suggested <= 0) {
      suggested = team.employeesCount || 1;
    }

    // Non-splittable team already placed elsewhere -> warn before opening popup.
    var alreadyPlaced = scenario.allocations.some(function (a) {
      return a.teamId === teamId;
    });
    var splitWarn = (team.canSplit === false && alreadyPlaced)
      ? 'Команда отмечена как неделимая и уже частично размещена.'
      : null;

    // For physical offices the placement must target a zone. If the team was
    // dropped on the office body, the popup includes a zone selector.
    var needZone = !isRemote;
    openCountPopup(team, suggested, splitWarn, office, zone, needZone, function (count, comment, zoneId) {
      var z = zoneId ? alloc.findZone(scenario, zoneId) : null;
      if (!isRemote && z) {
        var conflict = alloc.vipConflict(!!team.isVip, z);
        if (conflict) {
          announce('Предупреждение: ' + conflict);
        }
      }
      var linkWarn = alloc.linkedConflict(scenario, teamId, office.id);
      if (linkWarn) {
        announce('Предупреждение: ' + linkWarn);
      }
      alloc.addTeamAllocation(teamId, count, office.id, zoneId || null, comment);
      announce('Команда ' + team.name + ': размещено ' + count + ' в ' + office.name + (z ? ' / ' + z.name : ''));
    });
  }

  /**
   * Quantity popup for team allocation. When needZone is true and no zone was
   * pre-selected (team dropped on the office body), a zone selector is shown
   * so a team is always placed into a specific zone of a physical office.
   */
  function openCountPopup(team, suggested, warningText, office, zone, needZone, onConfirm) {
    var fields = [];
    if (warningText) {
      fields.push({ name: '_warn', label: warningText, type: 'text', value: '', help: 'Предупреждение' });
    }
    fields.push({ name: 'count', label: 'Количество сотрудников', type: 'number', min: 1, value: suggested,
      help: 'Предложен остаток команды: ' + suggested });

    var zoneRequired = needZone && (office.zones || []).length > 0;
    if (zoneRequired) {
      var zoneOptions = (office.zones || []).map(function (z) {
        return { value: z.id, label: z.name + (z.isVipZone ? ' ★' : '') };
      });
      fields.push({ name: 'zoneId', label: 'Зона офиса «' + office.name + '»', type: 'select',
        options: zoneOptions, value: zone ? zone.id : zoneOptions[0].value });
    }
    fields.push({ name: 'comment', label: 'Комментарий', type: 'textarea', value: '' });

    App.modals.form({
      title: 'Размещение команды «' + team.name + '»',
      fields: fields,
      submitLabel: 'Разместить',
      onSubmit: function (values) {
        var count = U.toNonNegativeInt(values.count);
        if (count <= 0) {
          App.modals.alert('Количество должно быть больше нуля');
          return false;
        }
        var zoneId = zoneRequired ? values.zoneId : (zone ? zone.id : null);
        onConfirm(count, values.comment || '', zoneId);
        return true;
      }
    });
  }

  /** Simple zone picker for moving an existing allocation onto an office body. */
  function pickZone(office, currentZoneId, onPick) {
    var zones = office.zones || [];
    if (zones.length === 0) {
      onPick(null);
      return;
    }
    var options = zones.map(function (z) {
      return { value: z.id, label: z.name + (z.isVipZone ? ' ★' : '') };
    });
    App.modals.form({
      title: 'Выбор зоны — «' + office.name + '»',
      fields: [
        { name: 'zoneId', label: 'Зона', type: 'select', options: options,
          value: currentZoneId || options[0].value }
      ],
      submitLabel: 'Переместить',
      onSubmit: function (values) {
        onPick(values.zoneId);
        return true;
      }
    });
  }

  // ---- Auto-scroll during drag ------------------------------------------

  function handleAutoScroll(cursor) {
    var scrollers = U.qsa('.dnd-scroll');
    if (!scrollers.length) {
      return;
    }
    stopAutoScroll();
    var active = null;
    var speed = null;
    scrollers.forEach(function (sc) {
      var r = sc.getBoundingClientRect();
      if (cursor.x >= r.left && cursor.x <= r.right && cursor.y >= r.top && cursor.y <= r.bottom) {
        var s = calculateAutoScroll(cursor, sc, 50);
        if (s.y !== 0) {
          active = sc;
          speed = s;
        }
      }
    });
    if (active && speed) {
      autoScrollTimer = setInterval(function () {
        active.scrollTop += speed.y;
      }, 16);
    }
  }

  function stopAutoScroll() {
    if (autoScrollTimer) {
      clearInterval(autoScrollTimer);
      autoScrollTimer = null;
    }
  }

  return {
    refresh: refresh,
    // exposed for unit tests
    validateDrop: validateDrop,
    calculateAutoScroll: calculateAutoScroll,
    findNearestDropTarget: findNearestDropTarget
  };
})();
