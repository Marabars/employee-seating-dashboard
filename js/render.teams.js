/**
 * render.teams.js
 * "Команды" tab: table with CRUD, headcount, current office, VIP, can-split,
 * expandable employees, allocations & remainder, "send remainder to remote".
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var T = App.teams;

  var expanded = {};

  // Filter criteria persist across re-renders within a session.
  var criteria = {
    query: '', currentOfficeId: '', toBeOfficeId: '', isVip: '', placementStatus: ''
  };

  // ---- Drag helpers for member assignment --------------------------------
  function bindDragSource(el, empId) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', empId);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function () { el.classList.remove('dragging'); });
  }

  function bindDropZone(el, onDrop) {
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      el.classList.add('drop-hover');
    });
    el.addEventListener('dragleave', function (e) {
      if (!el.contains(e.relatedTarget)) { el.classList.remove('drop-hover'); }
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drop-hover');
      var empId = e.dataTransfer.getData('text/plain');
      if (empId) { onDrop(empId); }
    });
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var panel = R.section('Команды', ctx.viewOnly ? null : {
      label: '+ Команда',
      onClick: function () { openTeamForm(); }
    });
    panel.classList.add('panel-has-filters');

    if (scenario.teams.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.teams, '+ Команда',
        function () { openTeamForm(); }));
      container.appendChild(panel);
      return;
    }

    panel.appendChild(renderFilters(scenario));

    var teams = filterTeams(scenario);
    panel.appendChild(U.el('div', { class: 'muted result-count', text: 'Найдено: ' + teams.length }));

    var table = U.el('table', { class: 'data-table' });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th(''), th('Команда'), th('Численность'), th('AS-IS офис'), th('TO-BE офис'),
      th('VIP'), th('Делимая'), th('Распределено'), th('Остаток'), th('')
    ])));
    var tbody = U.el('tbody');

    teams.forEach(function (team) {
      var allocated = calc.calculateTeamAllocated(scenario, team.id);
      var remainder = calc.calculateTeamRemainder(scenario, team);
      var currentOffice = U.findById(scenario.offices, team.currentOfficeId);
      var toBeOffice = U.findById(scenario.offices, team.toBeOfficeId);
      var isExpanded = !!expanded[team.id];

      var actionsCell = U.el('td', { class: 'cell-actions' });
      if (!ctx.viewOnly) {
        actionsCell.appendChild(R.iconBtn('✎', 'Редактировать', function () { openTeamForm(team); }));
        actionsCell.appendChild(R.iconBtn('⊞', 'Копировать', function () { copyTeam(team); }));
        if (remainder > 0) {
          actionsCell.appendChild(R.iconBtn('📍', 'Разместить', (function (t) { return function () { openTeamPlaceModal(scenario, t); }; })(team)));
          actionsCell.appendChild(R.iconBtn('→💻', 'Остаток на удаленку', function () {
            App.allocations.sendTeamRemainderToRemote(team.id);
          }));
        }
        actionsCell.appendChild(R.iconBtn('🗑', 'Удалить', function () {
          App.modals.confirm('Удалить команду «' + team.name + '»?',
            function () { T.remove(team.id); }, { danger: true, confirmLabel: 'Удалить' });
        }));
      }

      var linkedNames = (team.linkedTeamIds || []).map(function (id) {
        var t = U.findById(scenario.teams, id);
        return t ? t.name : null;
      }).filter(Boolean);
      var nameCell = U.el('td', {}, [
        U.el('span', { text: team.name }),
        linkedNames.length ? U.el('span', {
          class: 'link-indicator',
          title: 'Связана с: ' + linkedNames.join(', ')
        }, ' 🔗') : null
      ]);

      tbody.appendChild(U.el('tr', {}, [
        U.el('td', {}, R.iconBtn(isExpanded ? '▾' : '▸', 'Раскрыть', function () {
          expanded[team.id] = !isExpanded;
          R.render();
        })),
        nameCell,
        U.el('td', { text: String(team.employeesCount || 0) }),
        U.el('td', { text: currentOffice ? currentOffice.name : '—' }),
        U.el('td', { class: 'cell-tobe', text: toBeOffice ? toBeOffice.name : '—' }),
        U.el('td', { text: team.isVip ? 'Да' : '—' }),
        U.el('td', { text: team.canSplit === false ? 'Нет' : 'Да' }),
        U.el('td', { text: String(allocated) }),
        U.el('td', { text: String(remainder), class: remainder < 0 ? 'cell-error' : (remainder > 0 ? 'cell-warn' : '') }),
        actionsCell
      ]));

      if (isExpanded) {
        tbody.appendChild(U.el('tr', { class: 'expand-row' }, U.el('td', { colspan: '10' }, [
          renderTeamDetail(scenario, team)
        ])));
      }
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    container.appendChild(panel);
  }

  function th(text) {
    return U.el('th', { text: text });
  }

  function filterTeams(scenario) {
    var q = criteria.query.trim().toLowerCase();
    return scenario.teams.filter(function (team) {
      if (q && team.name.toLowerCase().indexOf(q) === -1) { return false; }
      if (criteria.currentOfficeId && team.currentOfficeId !== criteria.currentOfficeId) { return false; }
      if (criteria.toBeOfficeId && team.toBeOfficeId !== criteria.toBeOfficeId) { return false; }
      if (criteria.isVip === 'yes' && !team.isVip) { return false; }
      if (criteria.isVip === 'no' && team.isVip) { return false; }
      if (criteria.placementStatus) {
        var allocated = calc.calculateTeamAllocated(scenario, team.id);
        var remainder = calc.calculateTeamRemainder(scenario, team);
        if (criteria.placementStatus === 'full' && remainder !== 0) { return false; }
        if (criteria.placementStatus === 'partial' && !(allocated > 0 && remainder > 0)) { return false; }
        if (criteria.placementStatus === 'unallocated' && allocated > 0) { return false; }
      }
      return true;
    });
  }

  function renderFilters(scenario) {
    var wrap = U.el('div', { class: 'filters' });

    var search = U.el('input', {
      type: 'search', placeholder: 'Поиск по команде', value: criteria.query,
      'aria-label': 'Поиск по команде'
    });
    search.addEventListener('input', function () {
      criteria.query = search.value;
      R.render();
      var fresh = U.qs('.filters input[type=search]');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
    });
    wrap.appendChild(search);

    wrap.appendChild(selectFilter('currentOfficeId', 'AS-IS офис',
      scenario.offices
        .filter(function (o) { return o.phase === C.OFFICE_PHASE.ASIS; })
        .map(function (o) { return { value: o.id, label: o.name }; })));

    wrap.appendChild(selectFilter('toBeOfficeId', 'TO-BE офис',
      scenario.offices
        .filter(function (o) { return o.phase === C.OFFICE_PHASE.TOBE || o.type === C.OFFICE_TYPE.REMOTE; })
        .map(function (o) {
          var suffix = o.type === C.OFFICE_TYPE.REMOTE ? ' (удаленка)' : '';
          return { value: o.id, label: o.name + suffix };
        })));

    wrap.appendChild(selectFilter('isVip', 'VIP',
      [{ value: 'yes', label: 'VIP' }, { value: 'no', label: 'Не VIP' }]));

    wrap.appendChild(selectFilter('placementStatus', 'Распределение',
      [
        { value: 'full', label: 'Полностью' },
        { value: 'partial', label: 'Частично' },
        { value: 'unallocated', label: 'Не распределены' }
      ]));

    wrap.appendChild(U.el('button', {
      class: 'btn btn-sm btn-secondary',
      onclick: function () {
        criteria = { query: '', currentOfficeId: '', toBeOfficeId: '', isVip: '', placementStatus: '' };
        R.render();
      }
    }, 'Сбросить'));

    return wrap;
  }

  function selectFilter(key, label, options) {
    var sel = U.el('select', { 'aria-label': label });
    sel.appendChild(U.el('option', { value: '' }, label + ': все'));
    options.forEach(function (opt) {
      var o = U.el('option', { value: opt.value }, opt.label);
      if (criteria[key] === opt.value) { o.selected = true; }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      criteria[key] = sel.value;
      R.render();
    });
    return sel;
  }

  function renderTeamDetail(scenario, team) {
    var wrap = U.el('div', { class: 'team-detail' });

    // Linked teams (must move together).
    var linkedNames = (team.linkedTeamIds || []).map(function (id) {
      var t = U.findById(scenario.teams, id);
      return t ? t.name : null;
    }).filter(Boolean);
    if (linkedNames.length) {
      wrap.appendChild(U.el('div', { class: 'team-linked' }, [
        U.el('h4', { text: 'Связанные команды (один офис)' }),
        U.el('div', { class: 'composition-row', text: linkedNames.join(', ') })
      ]));
    }

    // Allocations of this team.
    var allocs = scenario.allocations.filter(function (a) {
      return a.teamId === team.id;
    });
    var viewOnly = App.state.isViewOnly();

    if (allocs.length > 0) {
      var allocList = U.el('div', { class: 'team-detail-allocs' }, [U.el('h4', { text: 'Размещения' })]);
      allocs.forEach(function (a) {
        var office = U.findById(scenario.offices, a.targetOfficeId);
        var zone = office && office.zones ? U.findById(office.zones, a.targetZoneId) : null;
        var place = (office ? office.name : '—') + (zone ? ' / ' + zone.name : '');
        var label;
        if (a.type === C.ALLOCATION_TYPE.EMPLOYEE) {
          var allocEmp = U.findById(scenario.employees, a.employeeId);
          label = allocEmp ? allocEmp.fullName : 'Сотрудник';
        } else {
          label = a.employeesCount + ' чел.';
        }
        var row = U.el('div', { class: 'composition-row alloc-row' }, [
          U.el('span', { class: 'alloc-row-label', text: label + ' → ' + place })
        ]);
        if (!viewOnly) {
          if (a.type === C.ALLOCATION_TYPE.TEAM && a.employeesCount > 1) {
            row.appendChild(R.iconBtn('−', 'Вытащить часть', function () { openReducePopup(a); }));
          }
          row.appendChild(R.iconBtn('🗑', 'Убрать размещение', function () { App.allocations.remove(a.id); }));
        }
        allocList.appendChild(row);
      });
      wrap.appendChild(allocList);
    } else {
      wrap.appendChild(U.el('p', { class: 'muted', text: 'Нет размещений' }));
    }

    wrap.appendChild(renderMembers(scenario, team, viewOnly));
    return wrap;
  }

  /**
   * Members section: named employees (ФИО) at the top, then a summary line
   * "N с ФИО, команда X человек", then the unnamed remainder "ещё M сотрудников".
   * A team of X people may consist of named and unnamed members; named ones
   * are the employees whose teamId points here.
   */
  function renderMembers(scenario, team, viewOnly) {
    var members = scenario.employees.filter(function (e) {
      return e.teamId === team.id;
    });
    var headcount = team.employeesCount || 0;
    var namedCount = members.length;
    var remainder = headcount - namedCount; // may be negative if over-named

    var wrap = U.el('div', { class: 'team-detail-members' }, [
      U.el('h4', { text: 'Сотрудники команды' })
    ]);

    // 1) Named employees on top.
    if (namedCount > 0) {
      members.forEach(function (emp) {
        var placement = App.employees.placementOf(scenario, emp);
        var asIsOffice = U.findById(scenario.offices, placement.asIs.officeId);
        var tobeOffice = U.findById(scenario.offices, placement.tobe.officeId);
        var asisText = asIsOffice ? asIsOffice.name : C.PLACEMENT_STATUS_LABEL[placement.asIs.status];
        var tobeText = tobeOffice ? tobeOffice.name : C.PLACEMENT_STATUS_LABEL[placement.tobe.status];
        var placementEl = U.el('span', { class: 'placement-dual' }, [
          U.el('span', { class: 'placement-asis', text: 'AS-IS: ' + asisText }),
          U.el('span', { class: 'placement-tobe', text: 'TO-BE: ' + tobeText })
        ]);
        var isPlaced = placement.tobe.status === C.PLACEMENT_STATUS.PLACED_OFFICE || placement.tobe.status === C.PLACEMENT_STATUS.PLACED_REMOTE;
        var row = U.el('div', { class: 'composition-row member-row' + (isPlaced ? ' zone-member-placed-here' : '') }, [
          U.el('span', { class: 'member-drag-handle', text: '⠿' }),
          U.el('span', { class: 'member-name', text: emp.fullName }),
          emp.position ? U.el('span', { class: 'muted member-pos', text: emp.position }) : null,
          placementEl
        ]);
        if (!viewOnly) {
          row.appendChild(R.iconBtn('✎', 'Редактировать ФИО', function () { openMemberForm(scenario, team, emp); }));
          row.appendChild(R.iconBtn('↔', 'Перенести в другую команду', function () { openReassignPopup(scenario, emp); }));
          row.appendChild(R.iconBtn('✕', 'Убрать из команды', function () {
            App.employees.update(emp.id, { teamId: '' });
          }));
        }
        if (!viewOnly) { bindDragSource(row, emp.id); }
        wrap.appendChild(row);
      });
    }

    // 2) Summary line.
    wrap.appendChild(U.el('div', { class: 'member-summary', text:
      namedCount + ' ' + pluralEmployees(namedCount) + ' с ФИО · команда ' +
      headcount + ' ' + pluralPeople(headcount)
    }));

    // 3) Unnamed remainder.
    if (remainder > 0) {
      wrap.appendChild(U.el('div', { class: 'member-rest', text:
        'ещё ' + remainder + ' ' + pluralEmployees(remainder) + ' без ФИО' }));
    } else if (remainder < 0) {
      wrap.appendChild(U.el('div', { class: 'member-rest member-over', text:
        'указано на ' + (-remainder) + ' ' + pluralEmployees(-remainder) +
        ' больше численности команды — увеличьте «Количество сотрудников»' }));
    } else if (namedCount > 0) {
      wrap.appendChild(U.el('div', { class: 'member-rest', text: 'все сотрудники указаны по ФИО' }));
    }

    // 4) Drop zone on the member wrap: assign unassigned employees by drag.
    if (!viewOnly) {
      bindDropZone(wrap, function (empId) {
        var emp = App.employees.find(empId);
        if (emp && emp.teamId !== team.id) {
          App.employees.update(empId, { teamId: team.id });
        }
      });

      wrap.appendChild(U.el('button', {
        class: 'btn btn-sm btn-secondary member-add',
        onclick: function () { openMemberForm(scenario, team, null); }
      }, '＋ Добавить нового сотрудника'));

      // Unassigned pool: search + click/drag to assign.
      // Dropping a member row here unassigns them from the team.
      var unassigned = scenario.employees.filter(function (e) { return !e.teamId; });
      var poolSection = U.el('div', { class: 'team-unassigned-pool' });
      var poolLabel = '▸ Нераспределённые сотрудники (' + unassigned.length + ')';
      var poolLabelOpen = '▾ Нераспределённые сотрудники (' + unassigned.length + ')';
      var poolToggle = U.el('button', { class: 'btn btn-sm btn-secondary pool-toggle', onclick: function () {
        var hidden = poolBody.style.display === 'none';
        poolBody.style.display = hidden ? '' : 'none';
        poolToggle.textContent = hidden ? poolLabelOpen : poolLabel;
      } }, poolLabel);
      poolSection.appendChild(poolToggle);

      var poolBody = U.el('div', { class: 'pool-body' });
      poolBody.style.display = 'none';
      var searchInput = U.el('input', { type: 'text', placeholder: 'Поиск по ФИО...', class: 'member-pool-search' });
      poolBody.appendChild(searchInput);
      var poolList = U.el('div', { class: 'member-pool-list' });

      function renderPool(q) {
        U.clear(poolList);
        var lq = (q || '').toLowerCase().trim();
        var filtered = lq ? unassigned.filter(function (e) {
          return e.fullName.toLowerCase().indexOf(lq) !== -1;
        }) : unassigned;
        if (filtered.length === 0) {
          poolList.appendChild(U.el('div', { class: 'muted', text: lq ? 'Нет совпадений' : 'Нет нераспределённых сотрудников' }));
          return;
        }
        filtered.forEach(function (emp) {
          var item = U.el('div', { class: 'member-pool-item' });
          item.appendChild(U.el('span', { class: 'member-drag-handle', text: '⢿' }));
          item.appendChild(U.el('span', { class: 'member-name', text: emp.fullName }));
          if (emp.position) { item.appendChild(U.el('span', { class: 'muted', text: ' · ' + emp.position })); }
          var addBtn = U.el('button', { class: 'btn btn-xs btn-secondary', onclick: function (ev) {
            ev.stopPropagation();
            App.employees.update(emp.id, { teamId: team.id });
          } }, '→');
          item.appendChild(addBtn);
          bindDragSource(item, emp.id);
          poolList.appendChild(item);
        });
      }

      bindDropZone(poolSection, function (empId) {
        var emp = App.employees.find(empId);
        if (emp && emp.teamId) { App.employees.update(empId, { teamId: '' }); }
      });

      searchInput.addEventListener('input', function () { renderPool(searchInput.value); });
      renderPool('');
      poolBody.appendChild(poolList);
      poolSection.appendChild(poolBody);
      wrap.appendChild(poolSection);
    }
    return wrap;
  }

  /** Russian plural for "сотрудник". */
  function pluralEmployees(n) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) { return 'сотрудников'; }
    if (last === 1) { return 'сотрудник'; }
    if (last > 1 && last < 5) { return 'сотрудника'; }
    return 'сотрудников';
  }

  /** Russian plural for "человек". */
  function pluralPeople(n) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) { return 'человек'; }
    if (last === 1) { return 'человек'; }
    if (last > 1 && last < 5) { return 'человека'; }
    return 'человек';
  }

  /**
   * Add or edit a named employee in the context of a team. When `emp` is null,
   * a new employee is created and assigned to the team.
   */
  function openMemberForm(scenario, team, emp) {
    var formatOptions = Object.keys(C.WORK_FORMAT).map(function (k) {
      var v = C.WORK_FORMAT[k];
      return { value: v, label: C.WORK_FORMAT_LABEL[v] };
    });
    App.modals.form({
      title: (emp ? 'Редактирование' : 'Добавление') + ' сотрудника · команда «' + team.name + '»',
      fields: [
        { name: 'fullName', label: 'ФИО', type: 'text', value: emp ? emp.fullName : '' },
        { name: 'position', label: 'Должность', type: 'text', value: emp ? emp.position : '' },
        { name: 'isVip', label: 'VIP / руководство', type: 'checkbox', value: emp ? emp.isVip : !!team.isVip },
        { name: 'workFormat', label: 'Формат работы', type: 'select', options: formatOptions,
          value: emp ? emp.workFormat : C.WORK_FORMAT.OFFICE },
        { name: 'comment', label: 'Комментарий', type: 'textarea', value: emp ? emp.comment : '' }
      ],
      onSubmit: function (values) {
        if (!values.fullName) {
          App.modals.alert('Укажите ФИО сотрудника');
          return false;
        }
        if (emp) {
          App.employees.update(emp.id, values);
        } else {
          values.teamId = team.id;
          App.employees.add(values);
        }
        return true;
      }
    });
  }

  /** Pull part of a team allocation back out. */
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

  /** Move an employee to another team (or out of any team). */
  function openReassignPopup(scenario, emp) {
    var options = [{ value: '', label: '— Без команды' }].concat(
      scenario.teams.map(function (t) { return { value: t.id, label: t.name }; }));
    App.modals.form({
      title: 'Перенести «' + emp.fullName + '» в команду',
      fields: [
        { name: 'teamId', label: 'Команда', type: 'select', options: options, value: emp.teamId || '' }
      ],
      submitLabel: 'Перенести',
      onSubmit: function (values) {
        App.employees.update(emp.id, { teamId: values.teamId || '' });
        return true;
      }
    });
  }

  function copyTeam(team) {
    T.add({
      name: 'Копия — ' + team.name,
      employeesCount: team.employeesCount,
      currentOfficeId: team.currentOfficeId || null,
      isVip: team.isVip,
      canSplit: team.canSplit !== false,
      linkedTeamIds: [],
      comment: team.comment || ''
    });
  }

  function openTeamPlaceModal(scenario, team) {
    var officeSelect = U.el('select', { class: 'place-select' });
    officeSelect.appendChild(U.el('option', { value: '' }, '— Выберите офис'));
    scenario.offices.forEach(function (o) {
      var suffix = o.type === C.OFFICE_TYPE.REMOTE ? ' (удаленка)'
        : (o.phase ? ' (' + C.OFFICE_PHASE_LABEL[o.phase] + ')' : '');
      officeSelect.appendChild(U.el('option', { value: o.id }, o.name + suffix));
    });

    var zoneSelect = U.el('select', { class: 'place-select' });
    function updateZones() {
      U.clear(zoneSelect);
      zoneSelect.appendChild(U.el('option', { value: '' }, '— Вся площадь'));
      var office = U.findById(scenario.offices, officeSelect.value);
      if (!office || !office.zones || !office.zones.length) { return; }
      office.zones.forEach(function (z) {
        zoneSelect.appendChild(U.el('option', { value: z.id }, z.name + ' (' + (z.capacity || 0) + ' мест)'));
      });
    }
    updateZones();
    officeSelect.addEventListener('change', updateZones);

    var remainder = calc.calculateTeamRemainder(scenario, team);
    var countInput = U.el('input', { type: 'number', min: '1', class: 'place-count',
      value: String(Math.max(1, remainder)) });

    App.modals.open({
      title: 'Разместить команду «' + team.name + '»',
      body: U.el('div', { class: 'place-modal-body' }, [
        U.el('label', { class: 'place-modal-row' }, [U.el('span', { text: 'Офис' }), officeSelect]),
        U.el('label', { class: 'place-modal-row' }, [U.el('span', { text: 'Зона' }), zoneSelect]),
        U.el('label', { class: 'place-modal-row' }, [U.el('span', { text: 'Количество' }), countInput])
      ]),
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Разместить', kind: 'primary', onClick: function () {
          var officeId = officeSelect.value;
          if (!officeId) { App.modals.alert('Выберите офис'); return false; }
          var count = parseInt(countInput.value, 10);
          if (!count || count <= 0) { App.modals.alert('Укажите количество больше нуля'); return false; }
          App.allocations.addTeamAllocation(team.id, count, officeId, zoneSelect.value || null);
          return true;
        }}
      ]
    });
  }

  function openTeamForm(team) {
    var scenario = App.state.getActiveScenario();
    var asisOptions = [{ value: '', label: '—' }];
    var tobeOptions = [{ value: '', label: '—' }];
    scenario.offices.forEach(function (o) {
      if (o.type === C.OFFICE_TYPE.REMOTE) { return; }
      if (!o.phase || o.phase === 'asis') { asisOptions.push({ value: o.id, label: o.name }); }
      if (!o.phase || o.phase === 'tobe') { tobeOptions.push({ value: o.id, label: o.name }); }
    });

    // Snapshot of current office IDs for change detection in onSubmit.
    var prevAsisOfficeId = team ? (team.currentOfficeId || null) : null;
    var prevTobeOfficeId = team ? (team.toBeOfficeId || null) : null;

    // Other teams available to link with (exclude the team being edited).
    var linkOptions = scenario.teams
      .filter(function (t) { return !team || t.id !== team.id; })
      .map(function (t) { return { value: t.id, label: t.name }; });

    // Named members (ФИО) currently assigned to this team — pre-fill the list.
    var existingMembers = team ? scenario.employees.filter(function (e) {
      return e.teamId === team.id;
    }).map(function (e) {
      return { id: e.id, fullName: e.fullName };
    }) : [];

    App.modals.form({
      title: (team ? 'Редактирование' : 'Добавление') + ' команды',
      fields: [
        { name: 'name', label: 'Название команды', type: 'text', value: team ? team.name : '' },
        { name: 'color', label: 'Цвет команды', type: 'color', value: team ? (team.color || '#4f8ef7') : '#4f8ef7', 'class': 'team-color-input' },
        { name: 'employeesCount', label: 'Количество сотрудников', type: 'number', min: 0, value: team ? team.employeesCount : 0,
          help: 'Общая численность команды. Если ФИО указано больше — значение поднимется автоматически.' },
        { name: 'members', label: 'Сотрудники с ФИО', type: 'namelist', value: existingMembers,
          help: 'Именованные сотрудники команды. Остальные до численности считаются без ФИО.' },
        { name: 'currentOfficeId', label: 'AS-IS офис (сейчас)', type: 'select', options: asisOptions, value: team ? team.currentOfficeId : '' },
        { name: 'toBeOfficeId', label: 'TO-BE офис (план)', type: 'select', options: tobeOptions, value: team ? team.toBeOfficeId : '' },
        { name: 'isVip', label: 'VIP / руководство', type: 'checkbox', value: team ? team.isVip : false },
        { name: 'canSplit', label: 'Можно делить', type: 'checkbox', value: team ? team.canSplit !== false : true },
        { name: 'linkedTeamIds', label: 'Связанные команды (переезжают вместе, в одном офисе)',
          type: 'checkboxgroup', options: linkOptions, value: team ? (team.linkedTeamIds || []) : [],
          help: 'Связанные команды должны размещаться в одном офисе (зоны могут отличаться). Иначе — ошибка.' },
        { name: 'comment', label: 'Комментарий', type: 'textarea', value: team ? team.comment : '' }
      ],
      onSubmit: function (values) {
        if (!values.name) {
          App.modals.alert('Укажите название команды');
          return false;
        }
        var members = values.members || [];
        var namedCount = members.length;
        values.employeesCount = Math.max(U.toNonNegativeInt(values.employeesCount), namedCount);
        delete values.members;

        var newAsisId = values.currentOfficeId || null;
        var newTobeId = values.toBeOfficeId || null;
        var headcount = values.employeesCount;

        var teamId;
        if (team) {
          T.update(team.id, values);
          teamId = team.id;
          syncMembers(team.id, existingMembers, members);
        } else {
          teamId = T.add(values);
          syncMembers(teamId, [], members);
        }

        // Sync AS-IS allocation: on office change OR when office is set but no
        // team allocation exists yet (e.g. after Excel import sets only the profile field).
        var sA = App.state.getActiveScenario();
        var existingAsisAllocs = sA.allocations.filter(function (a) {
          if (a.teamId !== teamId || a.type !== C.ALLOCATION_TYPE.TEAM) { return false; }
          var o = U.findById(sA.offices, a.targetOfficeId);
          return o && o.phase === 'asis';
        });
        if (newAsisId !== prevAsisOfficeId || (newAsisId && existingAsisAllocs.length === 0)) {
          existingAsisAllocs.forEach(function (a) { App.allocations.remove(a.id); });
          if (newAsisId) {
            App.allocations.addTeamAllocation(teamId, headcount, newAsisId, null);
          }
        }

        // Sync TO-BE allocation: same logic.
        var sT = App.state.getActiveScenario();
        var existingTobeAllocs = sT.allocations.filter(function (a) {
          if (a.teamId !== teamId || a.type !== C.ALLOCATION_TYPE.TEAM) { return false; }
          var o = U.findById(sT.offices, a.targetOfficeId);
          return o && (o.phase === 'tobe' || o.type === C.OFFICE_TYPE.REMOTE);
        });
        if (newTobeId !== prevTobeOfficeId || (newTobeId && existingTobeAllocs.length === 0)) {
          existingTobeAllocs.forEach(function (a) { App.allocations.remove(a.id); });
          if (newTobeId) {
            App.allocations.addTeamAllocation(teamId, headcount, newTobeId, null);
          }
        }

        return true;
      }
    });
  }

  /**
   * Reconcile a team's named members against the form's namelist rows.
   * - rows with an id: update the existing employee's ФИО;
   * - rows without an id: create a new employee assigned to the team;
   * - previously-named employees missing from rows: detach from the team
   *   (teamId cleared, not deleted — same as "Убрать из команды").
   */
  function syncMembers(teamId, previous, rows) {
    var keptIds = {};
    rows.forEach(function (row) {
      if (row.id) {
        keptIds[row.id] = true;
        App.employees.update(row.id, { fullName: row.fullName });
      } else {
        App.employees.add({ fullName: row.fullName, teamId: teamId });
      }
    });
    previous.forEach(function (prev) {
      if (!keptIds[prev.id]) {
        App.employees.update(prev.id, { teamId: '' });
      }
    });
  }

  App.render.registerTab('teams', { label: 'Команды', render: render });
})();
