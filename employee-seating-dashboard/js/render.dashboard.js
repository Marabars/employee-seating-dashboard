/**
 * render.dashboard.js
 * Main dashboard: KPI block, move progress, new-office cards (compact/expanded),
 * remote card, team list, warnings panel, "Проблемные офисы" block.
 * Office/zone cards are drop targets (drag-and-drop wires them via data attrs).
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;
  var state = App.state;

  // UI-only view state (survives re-render).
  var expanded = {};          // office card expanded
  var expandedZones = {};     // zone expanded within an office card
  var expandedRemote = false; // remote card expanded
  var moneyMode = false;      // money toggle for office cards
  var hideAsis = false;       // hide AS IS section on dashboard
  var hideTobe = false;       // hide TO BE section on dashboard
  var teamSearch = '';        // search in unallocated teams panel

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var kpis = ctx.kpis;

    container.appendChild(renderKpiBlock(kpis, scenario));

    // Move-progress is hidden by default (kept behind a setting flag).
    if (state.getSettings().showMoveProgress) {
      container.appendChild(renderProgress(scenario));
    }

    container.appendChild(renderOfficesBlock(scenario, ctx));
    container.appendChild(renderRemoteCard(scenario, ctx));
    container.appendChild(renderTeamList(scenario, ctx));
    container.appendChild(renderProblemOffices(scenario, ctx));
    container.appendChild(renderWarningsPanel(ctx));
  }

  /** 4 large KPIs + a compact secondary row + AS-IS row. */
  function renderKpiBlock(kpis, scenario) {
    var panel = R.section('Ключевые показатели');

    // Main KPIs show bare numbers (units are shown in details, not here).
    var main = U.el('div', { class: 'kpi-grid kpi-grid-main' });
    main.appendChild(R.kpiCard('Всего мест (TO BE)', kpis.totalPlaces));
    main.appendChild(R.kpiCard('Всего сотрудников', kpis.totalEmployees));
    main.appendChild(R.kpiCard('Потребность мест', kpis.requiredSeats));
    main.appendChild(R.kpiCard('Баланс мест (TO BE)',
      (kpis.placesBalance >= 0 ? '+' : '') + kpis.placesBalance,
      kpis.placesBalance >= 0 ? 'green' : 'red'));
    panel.appendChild(main);

    var sub = U.el('div', { class: 'kpi-grid kpi-grid-sub' });
    sub.appendChild(R.kpiCard('На удаленке', kpis.remoteCount, 'blue'));
    sub.appendChild(R.kpiCard('Не размещено', kpis.unplacedCount,
      kpis.unplacedCount > 0 ? 'yellow' : null));
    sub.appendChild(R.kpiCard('Распределено в офисы', kpis.placedInOffices));
    sub.appendChild(R.kpiCard('Переполнение зон', kpis.zoneOverflow,
      kpis.zoneOverflow > 0 ? 'red' : null));
    sub.appendChild(R.kpiCard('Предупреждения', kpis.warningsCount,
      kpis.warningsCount > 0 ? 'yellow' : null));
    sub.appendChild(R.kpiCard('Ошибки', kpis.errorsCount,
      kpis.errorsCount > 0 ? 'red' : null));
    panel.appendChild(sub);

    // AS-IS metrics row (shown only when AS-IS offices exist).
    var asisOffices = calc.getAsisOffices(scenario);
    if (asisOffices.length > 0) {
      var asisCapacity = asisOffices.reduce(function (sum, o) {
        return sum + calc.calculateOfficeCapacity(o);
      }, 0);
      var asisOccupied = asisOffices.reduce(function (sum, o) {
        return sum + calc.calculateOfficeOccupancy(scenario, o.id);
      }, 0);
      var asisBalance = asisCapacity - asisOccupied;
      var asisRow = U.el('div', { class: 'kpi-grid kpi-grid-asis' });
      asisRow.appendChild(R.kpiCard('Вместимость (AS IS)', asisCapacity, 'blue'));
      asisRow.appendChild(R.kpiCard('Занято (AS IS)', asisOccupied, 'blue'));
      asisRow.appendChild(R.kpiCard('Баланс мест (AS IS)',
        (asisBalance >= 0 ? '+' : '') + asisBalance,
        asisBalance >= 0 ? 'blue' : 'red'));
      panel.appendChild(asisRow);
    }

    return panel;
  }

  /** Offices block with AS IS / TO BE groups and a money toggle. */
  function renderOfficesBlock(scenario, ctx) {
    var panel = R.section('Офисы');
    // Money toggle in the top-right corner of the block.
    var toggle = U.el('label', { class: 'money-toggle' }, [
      U.el('input', { type: 'checkbox', onchange: function (e) {
        moneyMode = e.target.checked;
        R.render();
      } }),
      U.el('span', { text: '₽ Деньги (аренда)' })
    ]);
    if (moneyMode) {
      toggle.querySelector('input').checked = true;
    }
    var head = panel.querySelector('.section-head');
    head.appendChild(toggle);
    var phaseToggles = U.el('div', { class: 'phase-vis-toggles' });
    var tobeBtn = U.el('button', {
      class: 'btn btn-sm ' + (hideTobe ? 'btn-secondary' : 'btn-primary') + ' phase-vis-btn',
      title: hideTobe ? 'Показать TO BE' : 'Скрыть TO BE',
      onclick: function () { hideTobe = !hideTobe; R.render(); }
    }, (hideTobe ? '▸' : '▾') + ' TO BE');
    var asisBtn = U.el('button', {
      class: 'btn btn-sm ' + (hideAsis ? 'btn-secondary' : 'btn-primary') + ' phase-vis-btn',
      title: hideAsis ? 'Показать AS IS' : 'Скрыть AS IS',
      onclick: function () { hideAsis = !hideAsis; R.render(); }
    }, (hideAsis ? '▸' : '▾') + ' AS IS');
    phaseToggles.appendChild(tobeBtn);
    phaseToggles.appendChild(asisBtn);
    head.appendChild(phaseToggles);

    var tobe = calc.getTobeOffices(scenario);
    var asis = calc.getAsisOffices(scenario);

    if (tobe.length === 0 && asis.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.offices, 'Перейти к офисам',
        function () { R.setActiveTab('offices'); }));
      return panel;
    }

    if (tobe.length && !hideTobe) {
      panel.appendChild(U.el('h3', { class: 'phase-head phase-tobe', text: 'TO BE — план переезда' }));
      var gT = U.el('div', { class: 'office-grid' });
      tobe.forEach(function (o) { gT.appendChild(renderOfficeCard(scenario, o, ctx)); });
      panel.appendChild(gT);
    }
    if (asis.length && !hideAsis) {
      panel.appendChild(U.el('h3', { class: 'phase-head phase-asis', text: 'AS IS — как есть' }));
      var gA = U.el('div', { class: 'office-grid' });
      asis.forEach(function (o) { gA.appendChild(renderOfficeCard(scenario, o, ctx)); });
      panel.appendChild(gA);
    }
    return panel;
  }

  function renderProgress(scenario) {
    var panel = R.section('Общий прогресс переезда');
    var p = calc.calculateMoveProgress(scenario);

    var stacked = U.el('div', { class: 'progress progress-stacked' }, [
      U.el('div', { class: 'progress-fill progress-green', style: 'width:' + p.inOfficesPercent + '%', title: 'В офисах' }),
      U.el('div', { class: 'progress-fill progress-blue', style: 'width:' + p.remotePercent + '%', title: 'Удаленка' }),
      U.el('div', { class: 'progress-fill progress-grey', style: 'width:' + p.unplacedPercent + '%', title: 'Не размещено' })
    ]);

    panel.appendChild(stacked);
    panel.appendChild(U.el('div', { class: 'progress-legend' }, [
      U.el('span', { text: 'Размещено в офисах: ' + p.inOfficesPercent + '% (' + p.inOffices + ')' }),
      U.el('span', { text: 'Удаленка: ' + p.remotePercent + '% (' + p.remote + ')' }),
      U.el('span', { text: 'Не размещено: ' + p.unplacedPercent + '% (' + p.unplaced + ')' })
    ]));
    if (p.overAllocated) {
      panel.appendChild(U.el('div', { class: 'progress-warn', text:
        'Размещено больше, чем сотрудников в сценарии (' + (p.inOffices + p.remote) +
        ' из ' + p.total + '). Проверьте размещения команд.' }));
    }
    return panel;
  }

  function renderOfficeCard(scenario, office, ctx) {
    var capacity = calc.calculateOfficeCapacity(office);
    var occupied = calc.calculateOfficeOccupancy(scenario, office.id);
    var balance = calc.calculateBalance(capacity, occupied);
    var percent = calc.calculateOccupancyPercent(occupied, capacity);
    var isExpanded = !!expanded[office.id];
    var phaseClass = office.phase === C.OFFICE_PHASE.ASIS ? 'phase-asis' : 'phase-tobe';

    var card = U.el('div', {
      class: 'office-card ' + phaseClass + ' status-border-' + calc.statusColor(percent, ctx.thresholds),
      dataset: { dropOffice: office.id }
    });

    // Corner balance badge: green + (profit) / red − (deficit).
    var balPositive = balance >= 0;
    card.appendChild(U.el('div', {
      class: 'balance-badge ' + (balPositive ? 'ok' : 'bad'),
      title: balPositive ? 'Профицит мест' : 'Дефицит мест'
    }, balPositive ? '+' : '−'));

    card.appendChild(U.el('div', { class: 'office-card-head' }, [
      U.el('div', {}, [
        U.el('h3', { text: office.name }),
        U.el('span', { class: 'phase-tag ' + phaseClass, text: C.OFFICE_PHASE_LABEL[office.phase] || '' }),
        office.isDraft ? R.badge('Черновик', 'grey') : null
      ]),
      U.el('button', {
        class: 'icon-btn',
        title: isExpanded ? 'Свернуть' : 'Развернуть',
        onclick: function () { expanded[office.id] = !isExpanded; R.render(); }
      }, isExpanded ? '▾' : '▸')
    ]));

    card.appendChild(U.el('div', { class: 'office-card-area', text: 'Площадь: ' + U.fmtArea(office.area) }));

    if (moneyMode) {
      card.appendChild(renderMoneyMetrics(office));
    } else {
      // Three headline metrics before zones: Мест / Сотрудников / Баланс.
      card.appendChild(U.el('div', { class: 'office-metrics' }, [
        metric('Мест', isFinite(capacity) ? capacity : '∞'),
        metric('Сотрудников', occupied),
        metric('Баланс', (balance >= 0 ? '+' : '') + balance, balPositive ? 'green' : 'red')
      ]));
      card.appendChild(R.progressBar(occupied, capacity, ctx.thresholds));
      card.appendChild(U.el('div', { class: 'office-card-free', text:
        'Осталось мест: ' + (balance >= 0 ? balance : 0) + (balance < 0 ? ' (дефицит ' + (-balance) + ')' : '') }));
    }

    if (isExpanded) {
      card.appendChild(renderZones(scenario, office, ctx));
      if (!ctx.viewOnly) {
        card.appendChild(U.el('div', { class: 'office-card-actions' }, [
          U.el('button', { class: 'btn btn-sm btn-secondary', onclick: function () { R.setActiveTab('offices'); } }, 'Редактировать')
        ]));
      }
    }
    return card;
  }

  /** Small labeled metric tile used inside office cards. */
  function metric(label, value, color) {
    return U.el('div', { class: 'office-metric' + (color ? ' metric-' + color : '') }, [
      U.el('div', { class: 'office-metric-value', text: String(value) }),
      U.el('div', { class: 'office-metric-label', text: label })
    ]);
  }

  /** Money view: rent, opex, indexation, annual total, 5-year total. */
  function renderMoneyMetrics(office) {
    var wrap = U.el('div', { class: 'office-money' });
    var annual = calc.officeAnnualCost(office);
    if (annual == null) {
      wrap.appendChild(U.el('div', { class: 'muted', text: 'Ставки аренды не заданы. Укажите их в карточке офиса.' }));
      return wrap;
    }
    var fiveY = calc.officeCostNYears(office, C.MONEY_5Y);
    wrap.appendChild(rowMoney('Аренда, ₽/м² с НДС', office.rentPerSqm != null ? office.rentPerSqm.toLocaleString('ru-RU') : '—'));
    wrap.appendChild(rowMoney('Эксплуатация, ₽/м² с НДС', office.opexPerSqm != null ? office.opexPerSqm.toLocaleString('ru-RU') : '—'));
    wrap.appendChild(rowMoney('Индексация, %/год', office.indexationPct != null ? office.indexationPct : '—'));
    wrap.appendChild(rowMoney('Итого аренда, млн. руб./год', fmtMln(annual), true));
    wrap.appendChild(rowMoney('Аренда за 5 лет, млн. руб.', fmtMln(fiveY), true));
    return wrap;
  }

  function fmtMln(value) {
    if (value == null) { return '—'; }
    return (value / 1000000).toFixed(2).replace('.', ',') + ' млн.';
  }

  function rowMoney(label, value, strong) {
    return U.el('div', { class: 'money-row' + (strong ? ' money-strong' : '') }, [
      U.el('span', { class: 'money-label', text: label }),
      U.el('span', { class: 'money-value', text: String(value) })
    ]);
  }

  function renderZones(scenario, office, ctx) {
    var wrap = U.el('div', { class: 'zone-list' });
    (office.zones || []).forEach(function (zone) {
      var occ = calc.calculateZoneOccupancy(scenario, zone.id);
      var zoneBalance = calc.calculateBalance(zone.capacity || 0, occ);
      var zKey = office.id + ':' + zone.id;
      var zOpen = !!expandedZones[zKey];

      var zoneEl = U.el('div', {
        class: 'zone-row',
        dataset: { dropOffice: office.id, dropZone: zone.id }
      });
      zoneEl.appendChild(U.el('div', { class: 'zone-row-head', onclick: function () {
        expandedZones[zKey] = !zOpen; R.render();
      } }, [
        U.el('span', { class: 'zone-toggle', text: zOpen ? '▾' : '▸' }),
        U.el('span', { class: 'zone-name', text: zone.name + (zone.isVipZone ? ' ★' : '') }),
        U.el('span', { class: 'zone-stat', text: occ + ' / ' + (zone.capacity || 0) +
          ' · ост. ' + (zoneBalance >= 0 ? zoneBalance : 0) })
      ]));

      // Zones start collapsed; expand to show progress + team boxes.
      if (zOpen) {
        zoneEl.appendChild(R.progressBar(occ, zone.capacity || 0, ctx.thresholds));
        zoneEl.appendChild(U.el('div', { class: 'zone-free', text: R.freeOrOverflowText(zone.capacity || 0, occ) }));
        zoneEl.appendChild(renderZoneTeams(scenario, office, zone));
      }
      wrap.appendChild(zoneEl);
    });
    return wrap;
  }

  /** Teams placed into a specific zone, rendered as draggable small boxes. */
  function renderZoneTeams(scenario, office, zone) {
    var byTeam = {};
    var firstAllocByTeam = {};
    scenario.allocations.forEach(function (a) {
      if (a.targetOfficeId === office.id && (a.targetZoneId || null) === zone.id && a.teamId) {
        byTeam[a.teamId] = (byTeam[a.teamId] || 0) + (a.employeesCount || 0);
        if (!firstAllocByTeam[a.teamId]) { firstAllocByTeam[a.teamId] = a.id; }
      }
    });
    var keys = Object.keys(byTeam);
    if (keys.length === 0) {
      return U.el('div', { class: 'zone-teams muted', text: 'Нет команд' });
    }
    var box = U.el('div', { class: 'zone-teams' });
    keys.forEach(function (teamId) {
      var team = U.findById(scenario.teams, teamId);
      box.appendChild(U.el('div', {
        class: 'team-box',
        draggable: 'true',
        'data-drag-kind': 'allocation',
        'data-drag-id': firstAllocByTeam[teamId]
      }, [
        U.el('span', { class: 'team-box-name', text: team ? team.name : teamId }),
        U.el('span', { class: 'team-box-count', text: byTeam[teamId] + ' чел.' })
      ]));
    });
    return box;
  }

  function renderRemoteCard(scenario, ctx) {
    var remote = calc.getRemoteOffice(scenario);
    if (!remote) {
      return U.el('div');
    }
    var occ = calc.calculateOfficeOccupancy(scenario, remote.id);
    var panel = R.section('Удаленка');

    var toggleBtn = U.el('button', {
      class: 'zone-toggle',
      title: expandedRemote ? 'Свернуть' : 'Развернуть'
    }, expandedRemote ? '▾' : '▸');
    toggleBtn.addEventListener('click', function () {
      expandedRemote = !expandedRemote;
      R.render();
    });

    var card = U.el('div', {
      class: 'office-card remote-card status-border-blue',
      dataset: { dropOffice: remote.id }
    }, [
      U.el('div', { class: 'remote-header' }, [
        toggleBtn,
        U.el('h3', { text: 'Удаленка' })
      ]),
      U.el('div', { class: 'office-card-meta' }, [
        U.el('span', { text: 'Без лимита вместимости' }),
        U.el('span', { text: 'Размещено: ' + occ })
      ])
    ]);

    if (expandedRemote && occ > 0) {
      card.appendChild(renderRemoteTeams(scenario, remote));
    }

    panel.appendChild(card);
    return panel;
  }

  /** Teams and employees placed in the remote office, shown when card is expanded. */
  function renderRemoteTeams(scenario, remote) {
    var byTeam = {};
    var empsByTeam = {};

    scenario.allocations.forEach(function (a) {
      if (a.targetOfficeId !== remote.id || !a.teamId) { return; }
      byTeam[a.teamId] = (byTeam[a.teamId] || 0) + (a.employeesCount || 0);
      if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
        if (!empsByTeam[a.teamId]) { empsByTeam[a.teamId] = []; }
        empsByTeam[a.teamId].push(a.employeeId);
      }
    });

    var keys = Object.keys(byTeam);
    if (!keys.length) { return U.el('div'); }

    var box = U.el('div', { class: 'remote-teams-breakdown' });
    keys.forEach(function (teamId) {
      var team = U.findById(scenario.teams, teamId);
      var row = U.el('div', { class: 'remote-team-row' }, [
        U.el('span', { class: 'team-box-name', text: team ? team.name : teamId }),
        U.el('span', { class: 'team-box-count', text: byTeam[teamId] + ' чел.' })
      ]);
      var emps = empsByTeam[teamId];
      if (emps && emps.length) {
        var empList = U.el('div', { class: 'remote-emp-list' });
        emps.forEach(function (empId) {
          var emp = U.findById(scenario.employees, empId);
          empList.appendChild(U.el('div', { class: 'remote-emp-item', text: emp ? emp.fullName : empId }));
        });
        row.appendChild(empList);
      }
      box.appendChild(row);
    });
    return box;
  }

  function renderTeamList(scenario, ctx) {
    var panel = R.section('Нераспределенные команды');

    // Search input — persists across re-renders via module-level teamSearch.
    var searchWrap = U.el('div', { class: 'unalloc-search-wrap' });
    var searchInput = U.el('input', {
      type: 'search',
      placeholder: 'Поиск по команде или сотрудникам',
      value: teamSearch,
      'aria-label': 'Поиск нераспределённых команд'
    });
    searchInput.addEventListener('input', function () {
      teamSearch = searchInput.value;
      R.render();
      var fresh = U.qs('.unalloc-search-wrap input[type=search]');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
    });
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    // Filter teams: only those with remainder > 0 AND matching search query.
    var q = teamSearch.trim().toLowerCase();
    var unallocated = scenario.teams.filter(function (team) {
      if (calc.calculateTeamRemainder(scenario, team) <= 0) { return false; }
      if (!q) { return true; }
      if (team.name.toLowerCase().indexOf(q) > -1) { return true; }
      // Also search by employee names within the team.
      return scenario.employees.some(function (e) {
        return e.teamId === team.id && e.fullName.toLowerCase().indexOf(q) > -1;
      });
    });

    if (scenario.teams.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.teams, 'Перейти к командам',
        function () { R.setActiveTab('teams'); }));
      return panel;
    }

    if (unallocated.length === 0) {
      panel.appendChild(U.el('p', { class: 'muted', text: q ? 'Нет совпадений' : 'Все команды распределены' }));
      return panel;
    }

    // Container is a drop target: dropping an allocation chip here removes it.
    var listEl = U.el('div', {
      class: 'team-chips unalloc-drop-zone',
      dataset: { dropPanel: 'unallocated' }
    });
    listEl.setAttribute('aria-dropeffect', 'move');
    listEl.setAttribute('title', 'Перетащите сюда размещение из офиса, чтобы вернуть команду');

    unallocated.forEach(function (team) {
      var remainder = calc.calculateTeamRemainder(scenario, team);
      listEl.appendChild(U.el('div', {
        class: 'team-chip' + (team.isVip ? ' vip' : ''),
        dataset: { dragKind: 'team', dragId: team.id },
        draggable: ctx.viewOnly ? 'false' : 'true',
        title: 'Перетащите в офис или зону'
      }, [
        U.el('span', { class: 'team-chip-name', text: team.name }),
        U.el('span', { class: 'team-chip-count', text: 'Остаток: ' + remainder + ' / ' + (team.employeesCount || 0) })
      ]));
    });
    panel.appendChild(listEl);
    return panel;
  }

  function renderProblemOffices(scenario, ctx) {
    var panel = R.section('Проблемные офисы');
    var problems = ctx.messages.filter(function (m) {
      return m.code === C.CODE.OFFICE_OVERFLOW ||
        m.code === C.CODE.ZONE_OVERFLOW ||
        m.code === C.CODE.NON_VIP_IN_VIP ||
        m.code === C.CODE.VIP_NOT_IN_VIP ||
        m.code === C.CODE.DRAFT_ZERO_CAPACITY;
    });
    if (problems.length === 0) {
      panel.appendChild(U.el('p', { class: 'muted', text: 'Проблем не обнаружено' }));
      return panel;
    }
    var listEl = U.el('ul', { class: 'problem-list' });
    problems.forEach(function (m) {
      listEl.appendChild(U.el('li', { class: 'problem-item level-' + m.level, text: m.message }));
    });
    panel.appendChild(listEl);
    return panel;
  }

  function renderWarningsPanel(ctx) {
    var panel = R.section('Сообщения и предупреждения');
    if (ctx.messages.length === 0) {
      panel.appendChild(U.el('p', { class: 'muted', text: 'Нет сообщений' }));
      return panel;
    }
    var listEl = U.el('ul', { class: 'message-list' });
    ctx.messages.forEach(function (m) {
      listEl.appendChild(U.el('li', { class: 'message-item level-' + m.level }, [
        R.badge(levelLabel(m.level), levelColor(m.level)),
        U.el('span', { text: m.message })
      ]));
    });
    panel.appendChild(listEl);
    return panel;
  }

  function levelLabel(level) {
    if (level === C.LEVEL.ERROR) { return 'Ошибка'; }
    if (level === C.LEVEL.WARNING) { return 'Предупреждение'; }
    return 'Инфо';
  }

  function levelColor(level) {
    if (level === C.LEVEL.ERROR) { return 'red'; }
    if (level === C.LEVEL.WARNING) { return 'yellow'; }
    return 'blue';
  }

  App.render.registerTab('dashboard', { label: 'Дашборд', render: render });
})();
