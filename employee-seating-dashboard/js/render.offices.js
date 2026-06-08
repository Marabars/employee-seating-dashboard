/**
 * render.offices.js
 * "Офисы" tab: table of offices, add old/new office, edit, delete,
 * manage zones (add/edit/remove/capacity), draft flag.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var O = App.offices;

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var panel = R.section('Офисы', ctx.viewOnly ? null : {
      label: '+ Новый офис',
      onClick: function () { openOfficeForm('new'); }
    });

    if (!ctx.viewOnly) {
      panel.querySelector('.section-head').appendChild(U.el('button', {
        class: 'btn btn-sm btn-secondary',
        onclick: function () { openOfficeForm('old'); }
      }, '+ Старый офис'));
    }

    var physical = scenario.offices.filter(function (o) {
      return o.type !== C.OFFICE_TYPE.REMOTE;
    });

    if (physical.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.offices, '+ Новый офис',
        function () { openOfficeForm('new'); }));
      container.appendChild(panel);
      return;
    }

    var table = U.el('table', { class: 'data-table' });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th('Название'), th('Тип'), th('Площадь'), th('Вместимость'),
      th('Занято'), th('Зоны'), th('Черновик'), th('')
    ])));
    var tbody = U.el('tbody');

    physical.forEach(function (office) {
      var capacity = calc.calculateOfficeCapacity(office);
      var occupied = calc.calculateOfficeOccupancy(scenario, office.id);
      var zonesText = office.type === C.OFFICE_TYPE.NEW ?
        (office.zones || []).length + ' зон' : '—';

      var actionsCell = U.el('td', { class: 'cell-actions' });
      if (!ctx.viewOnly) {
        actionsCell.appendChild(R.iconBtn('✎', 'Редактировать', function () {
          openOfficeForm(office.type, office);
        }));
        if (office.type === C.OFFICE_TYPE.NEW) {
          actionsCell.appendChild(R.iconBtn('▦', 'Зоны', function () {
            openZonesEditor(office.id);
          }));
        }
        actionsCell.appendChild(R.iconBtn('🗑', 'Удалить', function () {
          App.modals.confirm('Удалить офис «' + office.name + '»? Связанные размещения будут удалены.',
            function () { O.removeOffice(office.id); }, { danger: true, confirmLabel: 'Удалить' });
        }));
      }

      tbody.appendChild(U.el('tr', {}, [
        U.el('td', { text: office.name }),
        U.el('td', { text: C.OFFICE_TYPE_LABEL[office.type] }),
        U.el('td', { text: String(office.area || 0) }),
        U.el('td', { text: office.type === C.OFFICE_TYPE.OLD ? String(office.currentCapacity || 0) : String(capacity) }),
        U.el('td', { text: String(occupied) }),
        U.el('td', { text: zonesText }),
        U.el('td', { text: office.isDraft ? 'Да' : '—' }),
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

  /** Open the add/edit form for an old or new office. */
  function openOfficeForm(type, office) {
    var isOld = type === C.OFFICE_TYPE.OLD;
    var fields = [
      { name: 'name', label: 'Название', type: 'text', value: office ? office.name : '' },
      { name: 'area', label: 'Площадь', type: 'number', min: 0, value: office ? office.area : '' }
    ];
    if (isOld) {
      fields.push({ name: 'currentCapacity', label: 'Текущая вместимость', type: 'number', min: 0, value: office ? office.currentCapacity : '' });
    }
    fields.push({ name: 'isDraft', label: 'Черновик', type: 'checkbox', value: office ? office.isDraft : false });
    fields.push({ name: 'comment', label: 'Комментарий', type: 'textarea', value: office ? office.comment : '' });

    App.modals.form({
      title: (office ? 'Редактирование' : 'Добавление') + ' — ' + (isOld ? 'старый офис' : 'новый офис'),
      fields: fields,
      onSubmit: function (values) {
        if (!values.name) {
          App.modals.alert('Укажите название офиса');
          return false;
        }
        if (office) {
          O.updateOffice(office.id, values);
        } else if (isOld) {
          O.addOldOffice(values);
        } else {
          O.addNewOffice(values); // auto "Опенспейс" zone is created
        }
        return true;
      }
    });
  }

  /** Zones editor for a new office. */
  function openZonesEditor(officeId) {
    var office = O.find(officeId);
    if (!office) {
      return;
    }
    var body = U.el('div', { class: 'zones-editor' });

    function rebuild() {
      U.clear(body);
      (office.zones || []).forEach(function (zone) {
        var occ = calc.calculateZoneOccupancy(App.state.getActiveScenario(), zone.id);
        body.appendChild(U.el('div', { class: 'zone-edit-row' }, [
          U.el('span', { class: 'zone-edit-name', text: zone.name + (zone.isVipZone ? ' ★' : '') }),
          U.el('span', { class: 'muted', text: 'Занято: ' + occ }),
          U.el('span', { text: 'Вместимость: ' + (zone.capacity || 0) }),
          R.iconBtn('✎', 'Изменить зону', function () { openZoneForm(officeId, zone, rebuild); }),
          R.iconBtn('🗑', 'Удалить зону', function () {
            O.removeZone(officeId, zone.id);
            office = O.find(officeId);
            rebuild();
          })
        ]));
      });
      body.appendChild(U.el('div', { class: 'zones-editor-actions' }, [
        U.el('button', { class: 'btn btn-sm btn-secondary', onclick: function () { openZoneForm(officeId, null, rebuild); } }, '+ Зона')
      ]));
    }
    rebuild();

    App.modals.open({
      title: 'Зоны офиса «' + office.name + '»',
      body: body,
      buttons: [{ label: 'Готово', kind: 'primary' }]
    });
  }

  function openZoneForm(officeId, zone, afterSave) {
    var typeOptions = [
      { value: C.ZONE_TYPE.OPEN_SPACE, label: 'Опенспейс' },
      { value: C.ZONE_TYPE.CABINET, label: 'Кабинеты' },
      { value: C.ZONE_TYPE.VIP, label: 'VIP-кабинеты' }
    ];
    App.modals.form({
      title: (zone ? 'Изменение' : 'Добавление') + ' зоны',
      fields: [
        { name: 'name', label: 'Название', type: 'text', value: zone ? zone.name : '' },
        { name: 'type', label: 'Тип зоны', type: 'select', options: typeOptions, value: zone ? zone.type : C.ZONE_TYPE.OPEN_SPACE },
        { name: 'capacity', label: 'Вместимость (мест)', type: 'number', min: 0, value: zone ? zone.capacity : 0,
          help: 'Для VIP-кабинетов: 1 кабинет = 1 место.' },
        { name: 'comment', label: 'Комментарий', type: 'textarea', value: zone ? zone.comment : '' }
      ],
      onSubmit: function (values) {
        if (!values.name) {
          App.modals.alert('Укажите название зоны');
          return false;
        }
        if (zone) {
          O.updateZone(officeId, zone.id, values);
        } else {
          O.addZone(officeId, values);
        }
        if (afterSave) {
          setTimeout(afterSave, 0);
        }
        return true;
      }
    });
  }

  App.render.registerTab('offices', { label: 'Офисы', render: render });
})();
