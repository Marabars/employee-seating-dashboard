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

      tbody.appendChild(U.el('tr', {}, [
        U.el('td', {}, R.iconBtn(isExpanded ? '▾' : '▸', 'Раскрыть', function () {
          expanded[team.id] = !isExpanded;
          R.render();
        })),
        U.el('td', { text: team.name }),
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

    // Members of this team (by ФИО) with reassignment / removal.
    var members = scenario.employees.filter(function (e) {
      return e.teamId === team.id;
    });
    var memberWrap = U.el('div', { class: 'team-detail-members' }, [U.el('h4', { text: 'Сотрудники команды (' + members.length + ')' })]);
    if (members.length > 0) {
      members.forEach(function (emp) {
        var placement = App.employees.placementOf(scenario, emp);
        var row = U.el('div', { class: 'composition-row member-row' }, [
          U.el('span', { class: 'member-name', text: emp.fullName }),
          U.el('span', { class: 'muted', text: C.PLACEMENT_STATUS_LABEL[placement.status] })
        ]);
        if (!viewOnly) {
          row.appendChild(R.iconBtn('↔', 'Перенести в другую команду', function () { openReassignPopup(scenario, emp); }));
          row.appendChild(R.iconBtn('✕', 'Убрать из команды', function () {
            App.employees.update(emp.id, { teamId: '' });
          }));
        }
        memberWrap.appendChild(row);
      });
    } else {
      memberWrap.appendChild(U.el('p', { class: 'muted', text: 'В списке нет сотрудников этой команды (работа по численности).' }));
    }
    wrap.appendChild(memberWrap);
    return wrap;
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
    var officeOptions = [{ value: '', label: '—' }];
    App.state.getActiveScenario().offices.forEach(function (o) {
      if (o.type !== C.OFFICE_TYPE.REMOTE) {
        officeOptions.push({ value: o.id, label: o.name });
      }
    });

    App.modals.form({
      title: (team ? 'Редактирование' : 'Добавление') + ' команды',
      fields: [
        { name: 'name', label: 'Название команды', type: 'text', value: team ? team.name : '' },
        { name: 'employeesCount', label: 'Количество сотрудников', type: 'number', min: 0, value: team ? team.employeesCount : 0 },
        { name: 'currentOfficeId', label: 'Текущий офис', type: 'select', options: officeOptions, value: team ? team.currentOfficeId : '' },
        { name: 'isVip', label: 'VIP / руководство', type: 'checkbox', value: team ? team.isVip : false },
        { name: 'canSplit', label: 'Можно делить', type: 'checkbox', value: team ? team.canSplit !== false : true },
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
