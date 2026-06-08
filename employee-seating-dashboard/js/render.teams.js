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

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var panel = R.section('Команды', ctx.viewOnly ? null : {
      label: '+ Команда',
      onClick: function () { openTeamForm(); }
    });

    if (scenario.teams.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.teams, '+ Команда',
        function () { openTeamForm(); }));
      container.appendChild(panel);
      return;
    }

    var table = U.el('table', { class: 'data-table' });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th(''), th('Команда'), th('Численность'), th('Текущий офис'),
      th('VIP'), th('Делимая'), th('Распределено'), th('Остаток'), th('')
    ])));
    var tbody = U.el('tbody');

    scenario.teams.forEach(function (team) {
      var allocated = calc.calculateTeamAllocated(scenario, team.id);
      var remainder = calc.calculateTeamRemainder(scenario, team);
      var currentOffice = U.findById(scenario.offices, team.currentOfficeId);
      var isExpanded = !!expanded[team.id];

      var actionsCell = U.el('td', { class: 'cell-actions' });
      if (!ctx.viewOnly) {
        actionsCell.appendChild(R.iconBtn('✎', 'Редактировать', function () { openTeamForm(team); }));
        if (remainder > 0) {
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
        U.el('td', { text: team.isVip ? 'Да' : '—' }),
        U.el('td', { text: team.canSplit === false ? 'Нет' : 'Да' }),
        U.el('td', { text: String(allocated) }),
        U.el('td', { text: String(remainder), class: remainder < 0 ? 'cell-error' : (remainder > 0 ? 'cell-warn' : '') }),
        actionsCell
      ]));

      if (isExpanded) {
        tbody.appendChild(U.el('tr', { class: 'expand-row' }, U.el('td', { colspan: '9' }, [
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
        var label = a.type === C.ALLOCATION_TYPE.EMPLOYEE ? 'Сотрудник' : (a.employeesCount + ' чел.');
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
        var row = U.el('div', { class: 'composition-row member-row' }, [
          U.el('span', { class: 'member-name', text: emp.fullName }),
          emp.position ? U.el('span', { class: 'muted member-pos', text: emp.position }) : null,
          U.el('span', { class: 'muted', text: C.PLACEMENT_STATUS_LABEL[placement.status] })
        ]);
        if (!viewOnly) {
          row.appendChild(R.iconBtn('✎', 'Редактировать ФИО', function () { openMemberForm(scenario, team, emp); }));
          row.appendChild(R.iconBtn('↔', 'Перенести в другую команду', function () { openReassignPopup(scenario, emp); }));
          row.appendChild(R.iconBtn('✕', 'Убрать из команды', function () {
            App.employees.update(emp.id, { teamId: '' });
          }));
        }
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

    // 4) Add a named employee directly to this team.
    if (!viewOnly) {
      wrap.appendChild(U.el('button', {
        class: 'btn btn-sm btn-secondary member-add',
        onclick: function () { openMemberForm(scenario, team, null); }
      }, '＋ Добавить сотрудника с ФИО'));
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

  function openTeamForm(team) {
    var scenario = App.state.getActiveScenario();
    var officeOptions = [{ value: '', label: '—' }];
    scenario.offices.forEach(function (o) {
      if (o.type !== C.OFFICE_TYPE.REMOTE) {
        officeOptions.push({ value: o.id, label: o.name });
      }
    });

    // Other teams available to link with (exclude the team being edited).
    var linkOptions = scenario.teams
      .filter(function (t) { return !team || t.id !== team.id; })
      .map(function (t) { return { value: t.id, label: t.name }; });

    App.modals.form({
      title: (team ? 'Редактирование' : 'Добавление') + ' команды',
      fields: [
        { name: 'name', label: 'Название команды', type: 'text', value: team ? team.name : '' },
        { name: 'employeesCount', label: 'Количество сотрудников', type: 'number', min: 0, value: team ? team.employeesCount : 0 },
        { name: 'currentOfficeId', label: 'Текущий офис', type: 'select', options: officeOptions, value: team ? team.currentOfficeId : '' },
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
        if (team) {
          T.update(team.id, values);
        } else {
          T.add(values);
        }
        return true;
      }
    });
  }

  App.render.registerTab('teams', { label: 'Команды', render: render });
})();
