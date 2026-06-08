/**
 * render.distribution.js
 * "Распределение" tab — the main drag-and-drop workspace.
 * Left: teams + employees + search/filters (drag sources).
 * Right: offices + zones + remote (drop targets).
 * Plus a manual allocation table and "send remainder to remote".
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;

  var search = '';

  function render(container, ctx) {
    var scenario = ctx.scenario;

    var layout = U.el('div', { class: 'distribution-layout' });
    layout.appendChild(renderSources(scenario, ctx));
    layout.appendChild(renderTargets(scenario, ctx));
    container.appendChild(layout);

    container.appendChild(renderAllocationTable(scenario, ctx));
  }

  // ---- Left: drag sources ------------------------------------------------

  function renderSources(scenario, ctx) {
    var col = U.el('div', { class: 'dist-col dist-sources' });
    col.appendChild(U.el('h2', { text: 'Команды и сотрудники' }));

    var searchInput = U.el('input', {
      type: 'search', placeholder: 'Поиск', value: search, 'aria-label': 'Поиск команд и сотрудников'
    });
    searchInput.addEventListener('input', function () {
      search = searchInput.value;
      R.render();
      var fresh = U.qs('.dist-sources input[type=search]');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
    });
    col.appendChild(searchInput);

    var scroll = U.el('div', { class: 'dnd-scroll' });
    var q = search.trim().toLowerCase();

    // Teams.
    scroll.appendChild(U.el('h3', { text: 'Команды' }));
    var teams = scenario.teams.filter(function (t) {
      return !q || t.name.toLowerCase().indexOf(q) > -1;
    });
    if (teams.length === 0) {
      scroll.appendChild(U.el('p', { class: 'muted', text: 'Нет команд' }));
    }
    teams.forEach(function (team) {
      var remainder = calc.calculateTeamRemainder(scenario, team);
      var chip = U.el('div', {
        class: 'drag-source team-source' + (team.isVip ? ' vip' : ''),
        draggable: ctx.viewOnly ? 'false' : 'true',
        dataset: { dragKind: 'team', dragId: team.id }
      }, [
        U.el('span', { class: 'drag-handle', text: '⋮⋮', 'aria-hidden': 'true' }),
        U.el('span', { class: 'drag-label', text: team.name }),
        U.el('span', { class: 'drag-sub', text: 'Остаток: ' + remainder })
      ]);
      if (!ctx.viewOnly && remainder > 0) {
        chip.appendChild(R.iconBtn('→💻', 'Остаток на удаленку', function (e) {
          e.stopPropagation();
          App.allocations.sendTeamRemainderToRemote(team.id);
        }));
      }
      scroll.appendChild(chip);
    });

    // Employees.
    scroll.appendChild(U.el('h3', { text: 'Сотрудники' }));
    var employees = scenario.employees.filter(function (e) {
      return !q || e.fullName.toLowerCase().indexOf(q) > -1;
    });
    if (employees.length === 0) {
      scroll.appendChild(U.el('p', { class: 'muted', text: 'Список сотрудников пуст (можно работать по командам)' }));
    }
    employees.forEach(function (emp) {
      var placement = App.employees.placementOf(scenario, emp);
      scroll.appendChild(U.el('div', {
        class: 'drag-source employee-source' + (emp.isVip ? ' vip' : ''),
        draggable: ctx.viewOnly ? 'false' : 'true',
        dataset: { dragKind: 'employee', dragId: emp.id }
      }, [
        U.el('span', { class: 'drag-handle', text: '⋮⋮', 'aria-hidden': 'true' }),
        U.el('span', { class: 'drag-label', text: emp.fullName }),
        U.el('span', { class: 'drag-sub', text: C.PLACEMENT_STATUS_LABEL[placement.status] })
      ]));
    });

    col.appendChild(scroll);
    return col;
  }

  // ---- Right: drop targets ----------------------------------------------

  function renderTargets(scenario, ctx) {
    var col = U.el('div', { class: 'dist-col dist-targets dnd-scroll' });
    col.appendChild(U.el('h2', { text: 'Офисы и зоны' }));

    var newOffices = calc.getNewOffices(scenario);
    if (newOffices.length === 0) {
      col.appendChild(R.emptyState(C.EMPTY_STATES.offices, 'Перейти к офисам',
        function () { R.setActiveTab('offices'); }));
    }
    newOffices.forEach(function (office) {
      col.appendChild(renderOfficeTarget(scenario, office, ctx));
    });

    // Remote drop target.
    var remote = calc.getRemoteOffice(scenario);
    if (remote) {
      var occ = calc.calculateOfficeOccupancy(scenario, remote.id);
      var remoteBox = U.el('div', {
        class: 'drop-target remote-target',
        dataset: { dropOffice: remote.id },
        'aria-dropeffect': 'move'
      }, [
        U.el('h3', { text: 'Удаленка' }),
        U.el('div', { class: 'muted', text: 'Без лимита · Размещено: ' + occ })
      ]);
      allocationsIn(scenario, remote.id, null).forEach(function (a) {
        remoteBox.appendChild(allocationChip(scenario, a, ctx));
      });
      col.appendChild(remoteBox);
    }
    return col;
  }

  function renderOfficeTarget(scenario, office, ctx) {
    var capacity = calc.calculateOfficeCapacity(office);
    var occupied = calc.calculateOfficeOccupancy(scenario, office.id);

    var box = U.el('div', {
      class: 'drop-target office-target',
      dataset: { dropOffice: office.id },
      'aria-dropeffect': 'move'
    }, [
      U.el('div', { class: 'target-head' }, [
        U.el('h3', { text: office.name }),
        U.el('span', { class: 'target-stat', text: occupied + ' / ' + capacity })
      ]),
      R.progressBar(occupied, capacity, ctx.thresholds),
      U.el('div', { class: 'target-free', text: R.freeOrOverflowText(capacity, occupied) })
    ]);

    (office.zones || []).forEach(function (zone) {
      var zOcc = calc.calculateZoneOccupancy(scenario, zone.id);
      var zoneBox = U.el('div', {
        class: 'drop-target zone-target' + (zone.isVipZone ? ' vip' : ''),
        dataset: { dropOffice: office.id, dropZone: zone.id },
        'aria-dropeffect': 'move'
      }, [
        U.el('div', { class: 'target-head' }, [
          U.el('span', { text: zone.name + (zone.isVipZone ? ' ★' : '') }),
          U.el('span', { class: 'target-stat', text: zOcc + ' / ' + (zone.capacity || 0) })
        ]),
        R.progressBar(zOcc, zone.capacity || 0, ctx.thresholds),
        U.el('div', { class: 'target-free', text: R.freeOrOverflowText(zone.capacity || 0, zOcc) })
      ]);
      // Allocation chips placed into this zone — draggable to move between zones.
      allocationsIn(scenario, office.id, zone.id).forEach(function (a) {
        zoneBox.appendChild(allocationChip(scenario, a, ctx));
      });
      box.appendChild(zoneBox);
    });
    return box;
  }

  /** Allocations whose target is the given office + zone. */
  function allocationsIn(scenario, officeId, zoneId) {
    return scenario.allocations.filter(function (a) {
      return a.targetOfficeId === officeId && (a.targetZoneId || null) === (zoneId || null);
    });
  }

  /**
   * A draggable chip representing an existing allocation. Can be dragged to
   * another zone/office; offers a quick "вытащить" (reduce) and remove.
   */
  function allocationChip(scenario, a, ctx) {
    var label;
    if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
      var emp = U.findById(scenario.employees, a.employeeId);
      label = (emp ? emp.fullName : 'Сотрудник');
    } else {
      var team = U.findById(scenario.teams, a.teamId);
      label = (team ? team.name : 'Команда') + ' · ' + a.employeesCount + ' чел.';
    }
    var chip = U.el('div', {
      class: 'alloc-chip',
      draggable: ctx.viewOnly ? 'false' : 'true',
      dataset: { dragKind: 'allocation', dragId: a.id },
      title: 'Перетащите в другую зону или офис'
    }, [
      U.el('span', { class: 'drag-handle', text: '⋮⋮', 'aria-hidden': 'true' }),
      U.el('span', { class: 'alloc-chip-label', text: label })
    ]);
    if (!ctx.viewOnly) {
      if (a.type === C.ALLOCATION_TYPE.TEAM && a.employeesCount > 1) {
        chip.appendChild(R.iconBtn('−', 'Вытащить часть', function (e) {
          e.stopPropagation();
          openReducePopup(a);
        }));
      }
      chip.appendChild(R.iconBtn('🗑', 'Убрать размещение', function (e) {
        e.stopPropagation();
        App.allocations.remove(a.id);
      }));
    }
    return chip;
  }

  /** Popup to pull part of a team allocation back out. */
  function openReducePopup(a) {
    App.modals.form({
      title: 'Вытащить сотрудников из размещения',
      fields: [
        { name: 'amount', label: 'Сколько вытащить', type: 'number', min: 1, value: 1,
          help: 'Сейчас размещено: ' + a.employeesCount + '. Если вытащить всё — размещение удалится.' }
      ],
      submitLabel: 'Вытащить',
      onSubmit: function (values) {
        var amount = U.toNonNegativeInt(values.amount);
        if (amount <= 0) {
          App.modals.alert('Укажите количество больше нуля');
          return false;
        }
        App.allocations.reduceTeamAllocation(a.id, amount);
        return true;
      }
    });
  }

  // ---- Manual allocation table ------------------------------------------

  function renderAllocationTable(scenario, ctx) {
    var panel = R.section('Таблица размещений');
    if (scenario.allocations.length === 0) {
      panel.appendChild(U.el('p', { class: 'muted', text: C.EMPTY_STATES.allocations }));
      return panel;
    }

    var table = U.el('table', { class: 'data-table' });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th('Тип'), th('Команда / сотрудник'), th('Кол-во'), th('Офис'), th('Зона'), th('Комментарий'), th('')
    ])));
    var tbody = U.el('tbody');

    scenario.allocations.forEach(function (a) {
      var office = U.findById(scenario.offices, a.targetOfficeId);
      var zone = office && office.zones ? U.findById(office.zones, a.targetZoneId) : null;
      var entityName;
      if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
        var emp = U.findById(scenario.employees, a.employeeId);
        entityName = emp ? emp.fullName : '—';
      } else {
        var team = U.findById(scenario.teams, a.teamId);
        entityName = team ? team.name : '—';
      }

      var actionsCell = U.el('td', { class: 'cell-actions' });
      if (!ctx.viewOnly) {
        actionsCell.appendChild(R.iconBtn('✎', 'Редактировать', function () { openAllocationForm(a); }));
        actionsCell.appendChild(R.iconBtn('🗑', 'Удалить', function () { App.allocations.remove(a.id); }));
      }

      tbody.appendChild(U.el('tr', {}, [
        U.el('td', { text: a.type === C.ALLOCATION_TYPE.EMPLOYEE ? 'Сотрудник' : 'Команда' }),
        U.el('td', { text: entityName }),
        U.el('td', { text: String(a.employeesCount) }),
        U.el('td', { text: office ? office.name : '—' }),
        U.el('td', { text: zone ? zone.name : '—' }),
        U.el('td', { text: a.comment || '' }),
        actionsCell
      ]));
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    return panel;
  }

  function th(text) {
    return U.el('th', { text: text });
  }

  /** Manual edit of an allocation (office/zone/count/comment). */
  function openAllocationForm(a) {
    var scenario = App.state.getActiveScenario();
    var officeOptions = scenario.offices.map(function (o) {
      return { value: o.id, label: o.name };
    });

    // Build zone options for the currently selected office.
    function zoneOptionsFor(officeId) {
      var office = U.findById(scenario.offices, officeId);
      var opts = [{ value: '', label: '— (без зоны)' }];
      if (office && office.zones) {
        office.zones.forEach(function (z) {
          opts.push({ value: z.id, label: z.name });
        });
      }
      return opts;
    }

    var fields = [
      { name: 'targetOfficeId', label: 'Офис', type: 'select', options: officeOptions, value: a.targetOfficeId },
      { name: 'targetZoneId', label: 'Зона', type: 'select', options: zoneOptionsFor(a.targetOfficeId), value: a.targetZoneId || '' },
      { name: 'comment', label: 'Комментарий', type: 'textarea', value: a.comment || '' }
    ];
    if (a.type === C.ALLOCATION_TYPE.TEAM) {
      fields.splice(0, 0, { name: 'employeesCount', label: 'Количество', type: 'number', min: 1, value: a.employeesCount });
    }

    App.modals.form({
      title: 'Изменение размещения',
      fields: fields,
      onSubmit: function (values) {
        App.allocations.update(a.id, values);
        return true;
      }
    });
  }

  App.render.registerTab('distribution', { label: 'Распределение', render: render });
})();
