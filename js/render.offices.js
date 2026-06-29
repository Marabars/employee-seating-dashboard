/**
 * render.offices.js
 * "Офисы" tab split into AS IS and TO BE sections. Each section lists its
 * offices and has its own "+ Офис" button. The office form includes an
 * inline zone editor (with a live capacity total) and money fields. AS IS
 * can be collapsed to give TO BE more room.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var O = App.offices;

  // UI-only: whether the AS IS section is collapsed.
  var asisCollapsed = false;
  var _dragOfficeId = null;

  // ---- Office DnD helpers ------------------------------------------------
  function bindOfficeDragSource(tr, officeId) {
    tr.setAttribute('draggable', 'true');
    tr.addEventListener('dragstart', function (e) {
      _dragOfficeId = officeId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', officeId);
      tr.classList.add('office-dragging');
    });
    tr.addEventListener('dragend', function () {
      _dragOfficeId = null;
      tr.classList.remove('office-dragging');
    });
  }

  function bindOfficeDropRow(tr, officeId, targetPhase) {
    tr.addEventListener('dragover', function (e) {
      if (!_dragOfficeId || _dragOfficeId === officeId) { return; }
      e.preventDefault();
      e.stopPropagation();
      var rect = tr.getBoundingClientRect();
      var above = e.clientY < rect.top + rect.height / 2;
      tr.classList.toggle('office-drop-above', above);
      tr.classList.toggle('office-drop-below', !above);
    });
    tr.addEventListener('dragleave', function (e) {
      if (!tr.contains(e.relatedTarget)) {
        tr.classList.remove('office-drop-above', 'office-drop-below');
      }
    });
    tr.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      tr.classList.remove('office-drop-above', 'office-drop-below');
      var draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === officeId) { return; }
      var rect = tr.getBoundingClientRect();
      O.moveOffice(draggedId, officeId, e.clientY < rect.top + rect.height / 2, targetPhase);
    });
  }

  function bindOfficeDropSection(panel, phase) {
    panel.addEventListener('dragover', function (e) {
      if (!_dragOfficeId) { return; }
      e.preventDefault();
      panel.classList.add('drop-hover');
    });
    panel.addEventListener('dragleave', function (e) {
      if (!panel.contains(e.relatedTarget)) { panel.classList.remove('drop-hover'); }
    });
    panel.addEventListener('drop', function (e) {
      e.preventDefault();
      panel.classList.remove('drop-hover');
      var draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId) { O.moveOffice(draggedId, null, false, phase); }
    });
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;
    container.appendChild(renderPhaseSection(scenario, ctx, C.OFFICE_PHASE.TOBE));
    container.appendChild(renderPhaseSection(scenario, ctx, C.OFFICE_PHASE.ASIS));
  }

  function renderPhaseSection(scenario, ctx, phase) {
    var isAsis = phase === C.OFFICE_PHASE.ASIS;
    var title = (isAsis ? 'AS IS — как есть' : 'TO BE — план переезда');
    var panel = U.el('section', { class: 'panel phase-section ' + (isAsis ? 'phase-asis' : 'phase-tobe') });

    var head = U.el('div', { class: 'section-head' });
    var titleWrap = U.el('div', { class: 'phase-title-wrap' });
    if (isAsis) {
      titleWrap.appendChild(U.el('button', {
        class: 'icon-btn',
        title: asisCollapsed ? 'Развернуть' : 'Свернуть',
        onclick: function () { asisCollapsed = !asisCollapsed; R.render(); }
      }, asisCollapsed ? '▸' : '▾'));
    }
    titleWrap.appendChild(U.el('h2', { text: title }));
    head.appendChild(titleWrap);
    if (!ctx.viewOnly) {
      head.appendChild(U.el('button', {
        class: 'btn btn-sm btn-primary',
        onclick: function () { openOfficeForm(phase, null); }
      }, '+ Офис'));
    }
    panel.appendChild(head);
    if (!ctx.viewOnly) { bindOfficeDropSection(panel, phase); }

    if (isAsis && asisCollapsed) {
      return panel;
    }

    var offices = calc.getOfficesByPhase(scenario, phase);
    if (offices.length === 0) {
      panel.appendChild(R.emptyState(
        'Пока нет офисов в этой части. Добавьте офис.',
        '+ Офис', function () { openOfficeForm(phase, null); }));
      return panel;
    }

    var table = U.el('table', { class: 'data-table' });
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th(''), th('Название'), th('Статус'), th('Площадь, м²'), th('Вместимость, шт. мест'),
      th('Занято'), th('Баланс'), th('Зоны'), th('Черновик'), th('')
    ])));
    var tbody = U.el('tbody');

    offices.forEach(function (office) {
      var capacity = calc.calculateOfficeCapacity(office);
      var occupied = calc.calculateOfficeOccupancy(scenario, office.id);
      var balance = calc.calculateBalance(capacity, occupied);

      var actionsCell = U.el('td', { class: 'cell-actions' });
      if (!ctx.viewOnly) {
        actionsCell.appendChild(R.iconBtn('✎', 'Редактировать', function () { openOfficeForm(phase, office); }));
        actionsCell.appendChild(R.iconBtn('▦', 'Зоны', function () { openZonesEditor(office.id); }));
        actionsCell.appendChild(R.iconBtn('⊞', 'Копировать', function () { copyOffice(office); }));
        actionsCell.appendChild(R.iconBtn('🗑', 'Удалить', function () {
          App.modals.confirm('Удалить офис «' + office.name + '»? Связанные размещения будут удалены.',
            function () { O.removeOffice(office.id); }, { danger: true, confirmLabel: 'Удалить' });
        }));
      }

      var phaseLabel = C.OFFICE_PHASE_LABEL[office.phase] || office.phase;
      var phaseClass = office.phase === C.OFFICE_PHASE.ASIS ? 'phase-tag phase-asis' : 'phase-tag phase-tobe';
      var handleCell = U.el('td', { class: 'cell-drag-handle' });
      if (!ctx.viewOnly) { handleCell.appendChild(U.el('span', { class: 'office-drag-handle', text: '⢿' })); }
      var tr = U.el('tr', {}, [
        handleCell,
        U.el('td', { text: office.name }),
        U.el('td', {}, U.el('span', { class: phaseClass, text: phaseLabel })),
        U.el('td', { text: String(office.area || 0) }),
        U.el('td', { text: String(capacity) }),
        U.el('td', { text: String(occupied) }),
        U.el('td', { text: (balance >= 0 ? '+' : '') + balance, class: balance >= 0 ? 'cell-ok' : 'cell-error' }),
        U.el('td', { text: (office.zones || []).length + ' зон' }),
        U.el('td', { text: office.isDraft ? 'Да' : '—' }),
        actionsCell
      ]);
      if (!ctx.viewOnly) { bindOfficeDragSource(tr, office.id); bindOfficeDropRow(tr, office.id, phase); }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    return panel;
  }

  function th(text) {
    return U.el('th', { text: text });
  }

  function copyOffice(office) {
    var zones = (office.zones || []).map(function (z) {
      return { name: z.name, type: z.type, capacity: z.capacity || 0, isVipZone: !!z.isVipZone, comment: z.comment || '' };
    });
    O.addOffice(office.phase, {
      name: 'Копия — ' + office.name,
      area: office.area,
      rentPerSqm: office.rentPerSqm,
      opexPerSqm: office.opexPerSqm,
      indexationPct: office.indexationPct,
      isDraft: office.isDraft,
      comment: office.comment,
      phase: office.phase,
      zones: zones
    });
  }

  /**
   * Office add/edit form with inline zones + money fields and a live capacity
   * total. Built manually (not via modals.form) because of the dynamic zone
   * rows and the running total.
   */
  function openOfficeForm(phase, office) {
    // Working copy of zones so cancel doesn't mutate state.
    var zones = (office && office.zones ? office.zones : [{ name: 'Опенспейс', type: C.ZONE_TYPE.OPEN_SPACE, capacity: 0, isVipZone: false }])
      .map(function (z) { return { name: z.name, type: z.type, capacity: z.capacity || 0, isVipZone: !!z.isVipZone }; });

    var body = U.el('div', { class: 'office-form' });

    var nameInput = textField('Название', office ? office.name : '', 'name');
    var areaInput = numField('Площадь, м²', office ? office.area : '', 'area');
    var leaseStartInput = dateField('Дата начала договора аренды', office ? office.leaseStartDate : '', 'leaseStartDate');
    var leaseEndInput = dateField('Дата окончания договора аренды', office ? office.leaseEndDate : '', 'leaseEndDate');
    body.appendChild(nameInput.wrap);
    body.appendChild(areaInput.wrap);
    body.appendChild(leaseStartInput.wrap);
    body.appendChild(leaseEndInput.wrap);

    // Phase selector — freely switch AS IS ↔ TO BE.
    var currentPhase = office ? office.phase : phase;
    var phaseSelect = U.el('select', { name: 'phase' });
    [[C.OFFICE_PHASE.ASIS, C.OFFICE_PHASE_LABEL.asis], [C.OFFICE_PHASE.TOBE, C.OFFICE_PHASE_LABEL.tobe]].forEach(function (opt) {
      var o = U.el('option', { value: opt[0] }, opt[1]);
      if (currentPhase === opt[0]) { o.selected = true; }
      phaseSelect.appendChild(o);
    });
    body.appendChild(U.el('div', { class: 'form-field' }, [U.el('label', { text: 'Статус (AS IS / TO BE)' }), phaseSelect]));

    // Money fields.
    var rentInput = numField('Аренда, ₽/м² с НДС', office && office.rentPerSqm != null ? office.rentPerSqm : '', 'rentPerSqm');
    var opexInput = numField('Эксплуатация, ₽/м² с НДС', office && office.opexPerSqm != null ? office.opexPerSqm : '', 'opexPerSqm');
    var idxInput = numField('Индексация, %/год', office && office.indexationPct != null ? office.indexationPct : '', 'indexationPct');
    var idxStartInput = dateField('Дата начала индексации', office && office.indexationStartDate ? office.indexationStartDate : '', 'indexationStartDate');
    body.appendChild(rentInput.wrap);
    body.appendChild(opexInput.wrap);
    body.appendChild(idxInput.wrap);
    body.appendChild(idxStartInput.wrap);

    // ---- Tenants editor ----------------------------------------
    // Collect unique tenant names from all offices in the scenario for datalist
    var allTenantNames = [];
    var seenNames = {};
    var currentScenario = App.state.getActiveScenario();
    (currentScenario.offices || []).forEach(function (o) {
      (o.tenants || []).forEach(function (t) {
        if (t.name && !seenNames[t.name]) {
          seenNames[t.name] = true;
          allTenantNames.push(t.name);
        }
      });
    });

    var tenantDatalistId = 'tenant-names-list-' + (office ? office.id : 'new');
    var datalist = U.el('datalist', { id: tenantDatalistId });
    allTenantNames.forEach(function (n) {
      datalist.appendChild(U.el('option', { value: n }));
    });
    body.appendChild(datalist);

    // Working copy of tenants
    var tenants = (office && Array.isArray(office.tenants) ? office.tenants : [])
      .map(function (t) { return { id: t.id || U.genId('tenant'), name: t.name || '', area: t.area || 0 }; });

    body.appendChild(U.el('h4', { text: 'Арендаторы' }));
    var tenantsWrap = U.el('div', { class: 'form-tenants' });
    body.appendChild(tenantsWrap);

    function rebuildTenants() {
      U.clear(tenantsWrap);
      if (tenants.length === 0) {
        tenantsWrap.appendChild(U.el('div', { class: 'muted', text: 'Нет арендаторов — используется вся площадь офиса.' }));
      }
      tenants.forEach(function (t, i) {
        var row = U.el('div', { class: 'form-tenant-row' });

        var nameInp = U.el('input', {
          type: 'text', value: t.name,
          placeholder: 'Арендатор', list: tenantDatalistId
        });
        nameInp.addEventListener('input', function () { t.name = nameInp.value; });

        var areaInp = U.el('input', {
          type: 'number', min: '0', step: 'any', value: t.area || '',
          placeholder: 'Площадь, м²'
        });
        areaInp.addEventListener('input', function () { t.area = parseFloat(areaInp.value) || 0; });

        var del = R.iconBtn('🗑', 'Удалить арендатора', function () {
          tenants.splice(i, 1);
          rebuildTenants();
        });
        row.appendChild(nameInp);
        row.appendChild(U.el('span', { class: 'muted', text: 'м²' }));
        row.appendChild(areaInp);
        row.appendChild(del);
        tenantsWrap.appendChild(row);
      });

      var addBtn = U.el('button', { class: 'btn btn-sm btn-secondary', type: 'button', onclick: function () {
        tenants.push({ id: U.genId('tenant'), name: '', area: 0 });
        rebuildTenants();
      } }, '+ Арендатор');
      tenantsWrap.appendChild(addBtn);
    }
    rebuildTenants();
    // ---- end Tenants editor ------------------------------------

    // Zones editor with live total.
    body.appendChild(U.el('h4', { text: 'Зоны и места' }));
    var zonesWrap = U.el('div', { class: 'form-zones' });
    var totalLine = U.el('div', { class: 'form-zone-total' });
    body.appendChild(zonesWrap);
    body.appendChild(totalLine);

    function rebuildZones() {
      U.clear(zonesWrap);
      zones.forEach(function (z, i) {
        var row = U.el('div', { class: 'form-zone-row' });
        var zn = U.el('input', { type: 'text', value: z.name, placeholder: 'Зона' });
        zn.addEventListener('input', function () { z.name = zn.value; });
        var zt = U.el('select', {});
        [['open_space', 'Опенспейс'], ['cabinet', 'Кабинеты'], ['vip', 'VIP-кабинеты']].forEach(function (o) {
          var opt = U.el('option', { value: o[0] }, o[1]);
          if (z.type === o[0]) { opt.selected = true; }
          zt.appendChild(opt);
        });
        zt.addEventListener('change', function () { z.type = zt.value; z.isVipZone = zt.value === 'vip'; });
        var zc = U.el('input', { type: 'number', min: '0', value: z.capacity });
        zc.addEventListener('input', function () { z.capacity = U.toNonNegativeInt(zc.value); updateTotal(); });
        var del = R.iconBtn('🗑', 'Удалить зону', function () {
          zones.splice(i, 1);
          if (zones.length === 0) { zones.push({ name: 'Опенспейс', type: 'open_space', capacity: 0, isVipZone: false }); }
          rebuildZones(); updateTotal();
        });
        row.appendChild(zn); row.appendChild(zt);
        row.appendChild(U.el('span', { class: 'form-zone-cap' }, [zc, U.el('span', { class: 'muted', text: 'мест' })]));
        row.appendChild(del);
        zonesWrap.appendChild(row);
      });
      var addBtn = U.el('button', { class: 'btn btn-sm btn-secondary', type: 'button', onclick: function () {
        zones.push({ name: 'Новая зона', type: 'open_space', capacity: 0, isVipZone: false });
        rebuildZones(); updateTotal();
      } }, '+ Зона');
      zonesWrap.appendChild(addBtn);
    }

    function updateTotal() {
      var total = zones.reduce(function (s, z) { return s + (U.toNonNegativeInt(z.capacity)); }, 0);
      totalLine.textContent = 'Вместимость офиса (сумма зон): ' + total + ' шт. мест';
    }
    rebuildZones();
    updateTotal();

    var commentInput = textareaField('Комментарий', office ? office.comment : '', 'comment');
    var draftInput = checkboxField('Черновик', office ? office.isDraft : false, 'isDraft');
    body.appendChild(commentInput.wrap);
    body.appendChild(draftInput.wrap);

    App.modals.open({
      title: (office ? 'Редактирование' : 'Добавление') + ' офиса',
      body: body,
      wide: true,
      buttons: [
        { label: 'Отмена', kind: 'secondary' },
        { label: 'Сохранить', kind: 'primary', onClick: function () {
          if (!nameInput.input.value) { App.modals.alert('Укажите название офиса'); return false; }
          var data = {
            name: nameInput.input.value,
            area: areaInput.input.value,
            leaseStartDate: leaseStartInput.input.value || null,
            leaseEndDate: leaseEndInput.input.value || null,
            rentPerSqm: rentInput.input.value,
            opexPerSqm: opexInput.input.value,
            indexationPct: idxInput.input.value,
            indexationStartDate: idxStartInput.input.value || null,
            comment: commentInput.input.value,
            isDraft: draftInput.input.checked,
            zones: zones,
            tenants: tenants.filter(function (t) { return t.name; }),
            phase: phaseSelect.value
          };
          if (office) {
            O.updateOffice(office.id, data);
            syncZones(office.id, zones);
          } else {
            O.addOffice(phaseSelect.value, data);
          }
          return true;
        } }
      ]
    });
  }

  /**
   * Reconcile an existing office's zones with the edited working copy.
   * Simplest robust approach: replace all zones via remove+add, preserving
   * allocations only is not feasible by name, so we rebuild and drop orphan
   * allocations. To keep allocations stable we instead update in place when
   * counts match, else rebuild.
   */
  function syncZones(officeId, edited) {
    var office = O.find(officeId);
    if (!office) { return; }
    // Update existing zones positionally, add/remove the difference.
    var existing = office.zones.slice();
    edited.forEach(function (z, i) {
      if (existing[i]) {
        O.updateZone(officeId, existing[i].id, z);
      } else {
        O.addZone(officeId, z);
      }
    });
    // Remove extra existing zones beyond edited length.
    for (var j = existing.length - 1; j >= edited.length; j--) {
      O.removeZone(officeId, existing[j].id);
    }
  }

  // ---- Small field builders (dark-theme inputs) -------------------------
  function fieldWrap(label, control) {
    return { wrap: U.el('div', { class: 'form-field' }, [U.el('label', { text: label }), control]), input: control };
  }
  function textField(label, val, name) {
    var c = U.el('input', { type: 'text', name: name }); c.value = val || ''; return fieldWrap(label, c);
  }
  function numField(label, val, name) {
    var c = U.el('input', { type: 'number', min: '0', step: 'any', name: name }); c.value = (val === '' || val == null) ? '' : val; return fieldWrap(label, c);
  }
  function dateField(label, val, name) {
    var c = U.el('input', { type: 'date', name: name }); c.value = val || ''; return fieldWrap(label, c);
  }
  function textareaField(label, val, name) {
    var c = U.el('textarea', { rows: '2', name: name }); c.value = val || ''; return fieldWrap(label, c);
  }
  function checkboxField(label, checked, name) {
    var c = U.el('input', { type: 'checkbox', name: name }); c.checked = !!checked;
    var wrap = U.el('div', { class: 'form-field' }, [U.el('label', { class: 'checkbox-label' }, [c, U.el('span', { text: label })])]);
    return { wrap: wrap, input: c };
  }

  /** Standalone zones editor (used from the table ▦ action). */
  function openZonesEditor(officeId) {
    var office = O.find(officeId);
    if (!office) { return; }
    var body = U.el('div', { class: 'zones-editor' });

    function rebuild() {
      U.clear(body);
      (office.zones || []).forEach(function (zone) {
        var occ = calc.calculateZoneOccupancy(App.state.getActiveScenario(), zone.id);
        body.appendChild(U.el('div', { class: 'zone-edit-row' }, [
          U.el('span', { class: 'zone-edit-name', text: zone.name + (zone.isVipZone ? ' ★' : '') }),
          U.el('span', { class: 'muted', text: 'Занято: ' + occ }),
          U.el('span', { text: U.fmtPlaces(zone.capacity || 0) }),
          R.iconBtn('✎', 'Изменить зону', function () { openZoneForm(officeId, zone, rebuild); }),
          R.iconBtn('🗑', 'Удалить зону', function () { O.removeZone(officeId, zone.id); office = O.find(officeId); rebuild(); })
        ]));
      });
      body.appendChild(U.el('div', { class: 'zones-editor-actions' }, [
        U.el('button', { class: 'btn btn-sm btn-secondary', onclick: function () { openZoneForm(officeId, null, rebuild); } }, '+ Зона')
      ]));
    }
    rebuild();
    App.modals.open({ title: 'Зоны офиса «' + office.name + '»', body: body, buttons: [{ label: 'Готово', kind: 'primary' }] });
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
        { name: 'capacity', label: 'Вместимость, шт. мест', type: 'number', min: 0, value: zone ? zone.capacity : 0,
          help: 'Для VIP-кабинетов: 1 кабинет = 1 место.' },
        { name: 'comment', label: 'Комментарий', type: 'textarea', value: zone ? zone.comment : '' }
      ],
      onSubmit: function (values) {
        if (!values.name) { App.modals.alert('Укажите название зоны'); return false; }
        if (zone) { O.updateZone(officeId, zone.id, values); } else { O.addZone(officeId, values); }
        if (afterSave) { setTimeout(afterSave, 0); }
        return true;
      }
    });
  }

  App.render.registerTab('offices', { label: 'Офисы', render: render });
})();
