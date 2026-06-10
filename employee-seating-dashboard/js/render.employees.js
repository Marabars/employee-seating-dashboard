/**
 * render.employees.js
 * "Сотрудники" tab: table + search + filters (team, current office, target
 * office, VIP, work format, placement status) + CRUD. Shows where each
 * employee is placed in the active scenario.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var E = App.employees;

  // Filter criteria persist across re-renders within a session.
  var criteria = {
    query: '', teamId: '', currentOfficeId: '', targetOfficeId: '',
    isVip: '', workFormat: '', placementStatus: ''
  };

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var panel = R.section('Сотрудники', ctx.viewOnly ? null : {
      label: '+ Сотрудник',
      onClick: function () { openEmployeeForm(); }
    });

    panel.appendChild(renderFilters(scenario));

    var rows = E.filter(criteria);
    if (scenario.employees.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.employees, '+ Сотрудник',
        function () { openEmployeeForm(); }));
      container.appendChild(panel);
      return;
    }

    panel.appendChild(U.el('div', { class: 'muted result-count', text: 'Найдено: ' + rows.length }));

    var table = U.el('table', { class: 'data-table' });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th('ФИО'), th('Должность'), th('Команда'), th('Текущий офис'),
      th('VIP'), th('Формат'), th('AS-IS'), th('TO-BE'), th('')
    ])));
    var tbody = U.el('tbody');

    rows.forEach(function (emp) {
      var team = U.findById(scenario.teams, emp.teamId);
      var currentOffice = U.findById(scenario.offices, emp.currentOfficeId);
      var placement = E.placementOf(scenario, emp);
      var asisOffice = U.findById(scenario.offices, placement.asIs.officeId);
      var tobeOff = U.findById(scenario.offices, placement.tobe.officeId);
      var indivAlloc = (scenario.allocations || []).filter(function (a) {
        return a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId === emp.id;
      })[0];

      var actionsCell = U.el('td', { class: 'cell-actions' });
      if (!ctx.viewOnly) {
        actionsCell.appendChild(R.iconBtn('✎', 'Редактировать', function () { openEmployeeForm(emp); }));
        actionsCell.appendChild(R.iconBtn('📍', 'Разместить', (function (e) { return function () { openEmpPlaceModal(scenario, e); }; })(emp)));
        if (indivAlloc) {
          actionsCell.appendChild(R.iconBtn('✕', 'Снять размещение', (function (id) { return function () {
            App.allocations.remove(id);
          }; })(indivAlloc.id)));
        }
        actionsCell.appendChild(R.iconBtn('🗑', 'Удалить', function () {
          App.modals.confirm('Удалить сотрудника «' + emp.fullName + '»?',
            function () { E.remove(emp.id); }, { danger: true, confirmLabel: 'Удалить' });
        }));
      }

      tbody.appendChild(U.el('tr', {}, [
        U.el('td', { text: emp.fullName }),
        U.el('td', { text: emp.position || '—' }),
        U.el('td', { text: team ? team.name : '—' }),
        U.el('td', { text: currentOffice ? currentOffice.name : '—' }),
        U.el('td', { text: emp.isVip ? 'Да' : '—' }),
        U.el('td', { text: C.WORK_FORMAT_LABEL[emp.workFormat] || emp.workFormat }),
        U.el('td', { class: 'placement-asis' }, [
          R.badge(C.PLACEMENT_STATUS_LABEL[placement.asIs.status], placementColor(placement.asIs.status)),
          asisOffice ? U.el('span', { class: 'muted', text: ' ' + asisOffice.name }) : null
        ]),
        U.el('td', { class: 'placement-tobe' }, [
          R.badge(C.PLACEMENT_STATUS_LABEL[placement.tobe.status], placementColor(placement.tobe.status)),
          tobeOff ? U.el('span', { class: 'muted', text: ' ' + tobeOff.name }) : null
        ]),
        actionsCell
      ]));
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    container.appendChild(panel);
  }

  function th(text) {
    return U.el('th', { text: text });
  }

  function placementColor(status) {
    if (status === C.PLACEMENT_STATUS.PLACED_OFFICE) { return 'green'; }
    if (status === C.PLACEMENT_STATUS.PLACED_REMOTE) { return 'blue'; }
    return 'yellow';
  }

  function renderFilters(scenario) {
    var wrap = U.el('div', { class: 'filters' });

    var search = U.el('input', {
      type: 'search', placeholder: 'Поиск по ФИО', value: criteria.query,
      'aria-label': 'Поиск по ФИО'
    });
    search.addEventListener('input', function () {
      criteria.query = search.value;
      R.render();
      // Keep focus after re-render by refocusing the fresh node.
      var fresh = U.qs('.filters input[type=search]');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
    });
    wrap.appendChild(search);

    wrap.appendChild(selectFilter('teamId', 'Команда',
      scenario.teams.map(function (t) { return { value: t.id, label: t.name }; })));
    wrap.appendChild(selectFilter('currentOfficeId', 'Текущий офис',
      scenario.offices.filter(notRemote).map(officeOpt)));
    wrap.appendChild(selectFilter('targetOfficeId', 'Новый офис',
      scenario.offices.map(officeOpt)));
    wrap.appendChild(selectFilter('isVip', 'VIP',
      [{ value: 'yes', label: 'VIP' }, { value: 'no', label: 'Не VIP' }]));
    wrap.appendChild(selectFilter('workFormat', 'Формат',
      Object.keys(C.WORK_FORMAT).map(function (k) {
        var v = C.WORK_FORMAT[k];
        return { value: v, label: C.WORK_FORMAT_LABEL[v] };
      })));
    wrap.appendChild(selectFilter('placementStatus', 'Статус',
      Object.keys(C.PLACEMENT_STATUS).map(function (k) {
        var v = C.PLACEMENT_STATUS[k];
        return { value: v, label: C.PLACEMENT_STATUS_LABEL[v] };
      })));

    wrap.appendChild(U.el('button', {
      class: 'btn btn-sm btn-secondary',
      onclick: function () {
        criteria = { query: '', teamId: '', currentOfficeId: '', targetOfficeId: '', isVip: '', workFormat: '', placementStatus: '' };
        R.render();
      }
    }, 'Сбросить'));

    return wrap;
  }

  function notRemote(o) {
    return o.type !== C.OFFICE_TYPE.REMOTE;
  }

  function officeOpt(o) {
    return { value: o.id, label: o.name };
  }

  function selectFilter(key, label, options) {
    var sel = U.el('select', { 'aria-label': label });
    sel.appendChild(U.el('option', { value: '' }, label + ': все'));
    options.forEach(function (opt) {
      var o = U.el('option', { value: opt.value }, opt.label);
      if (criteria[key] === opt.value) {
        o.selected = true;
      }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      criteria[key] = sel.value;
      R.render();
    });
    return sel;
  }

  function openEmpPlaceModal(scenario, emp) {
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
      zoneSelect.appendChild(U.el('option', { value: '' }, '— Без зоны'));
      var office = U.findById(scenario.offices, officeSelect.value);
      if (!office || !office.zones || !office.zones.length) { return; }
      office.zones.forEach(function (z) {
        zoneSelect.appendChild(U.el('option', { value: z.id }, z.name + ' (' + (z.capacity || 0) + ' мест)'));
      });
    }

    var current = App.employees.placementOf(scenario, emp);
    if (current.tobe.officeId) { officeSelect.value = current.tobe.officeId; }
    updateZones();
    if (current.tobe.zoneId) { zoneSelect.value = current.tobe.zoneId; }
    officeSelect.addEventListener('change', updateZones);

    App.modals.open({
      title: 'Разместить «' + emp.fullName + '»',
      body: U.el('div', { class: 'place-modal-body' }, [
        U.el('label', { class: 'place-modal-row' }, [U.el('span', { text: 'Офис' }), officeSelect]),
        U.el('label', { class: 'place-modal-row' }, [U.el('span', { text: 'Зона' }), zoneSelect])
      ]),
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Разместить', kind: 'primary', onClick: function () {
          var officeId = officeSelect.value;
          if (!officeId) { App.modals.alert('Выберите офис'); return false; }
          App.allocations.setEmployeeAllocation(emp.id, officeId, zoneSelect.value || null);
          return true;
        }}
      ]
    });
  }

  function openEmployeeForm(emp) {
    var scenario = App.state.getActiveScenario();
    var teamOptions = [{ value: '', label: '—' }].concat(
      scenario.teams.map(function (t) { return { value: t.id, label: t.name }; }));
    var officeOptions = [{ value: '', label: '—' }].concat(
      scenario.offices.filter(notRemote).map(officeOpt));
    var formatOptions = Object.keys(C.WORK_FORMAT).map(function (k) {
      var v = C.WORK_FORMAT[k];
      return { value: v, label: C.WORK_FORMAT_LABEL[v] };
    });

    App.modals.form({
      title: (emp ? 'Редактирование' : 'Добавление') + ' сотрудника',
      fields: [
        { name: 'fullName', label: 'ФИО', type: 'text', value: emp ? emp.fullName : '' },
        { name: 'position', label: 'Должность', type: 'text', value: emp ? emp.position : '' },
        { name: 'teamId', label: 'Команда', type: 'select', options: teamOptions, value: emp ? emp.teamId : '' },
        { name: 'currentOfficeId', label: 'Текущий офис', type: 'select', options: officeOptions, value: emp ? emp.currentOfficeId : '' },
        { name: 'isVip', label: 'VIP / руководство', type: 'checkbox', value: emp ? emp.isVip : false },
        { name: 'workFormat', label: 'Формат работы', type: 'select', options: formatOptions, value: emp ? emp.workFormat : C.WORK_FORMAT.OFFICE },
        { name: 'comment', label: 'Комментарий', type: 'textarea', value: emp ? emp.comment : '' }
      ],
      onSubmit: function (values) {
        if (!values.fullName) {
          App.modals.alert('Укажите ФИО сотрудника');
          return false;
        }
        if (emp) {
          E.update(emp.id, values);
        } else {
          E.add(values);
        }
        return true;
      }
    });
  }

  App.render.registerTab('employees', { label: 'Сотрудники', render: render });
})();
