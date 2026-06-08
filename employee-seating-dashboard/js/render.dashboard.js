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

  // Track which office cards are expanded (UI-only, survives re-render).
  var expanded = {};

  function render(container, ctx) {
    var scenario = ctx.scenario;
    var kpis = ctx.kpis;

    container.appendChild(renderKpiBlock(kpis));
    container.appendChild(renderProgress(kpis));

    var newOffices = calc.getNewOffices(scenario);
    var officesPanel = R.section('Новые офисы');
    if (newOffices.length === 0) {
      officesPanel.appendChild(R.emptyState(
        C.EMPTY_STATES.offices,
        'Перейти к офисам',
        function () { R.setActiveTab('offices'); }
      ));
    } else {
      var grid = U.el('div', { class: 'office-grid' });
      newOffices.forEach(function (office) {
        grid.appendChild(renderOfficeCard(scenario, office, ctx));
      });
      officesPanel.appendChild(grid);
    }
    container.appendChild(officesPanel);

    container.appendChild(renderRemoteCard(scenario, ctx));
    container.appendChild(renderTeamList(scenario, ctx));
    container.appendChild(renderProblemOffices(scenario, ctx));
    container.appendChild(renderWarningsPanel(ctx));
  }

  function renderKpiBlock(kpis) {
    var panel = R.section('Ключевые показатели');
    var grid = U.el('div', { class: 'kpi-grid' });
    grid.appendChild(R.kpiCard('Всего сотрудников', kpis.totalEmployees));
    grid.appendChild(R.kpiCard('Требуется посадочных мест', kpis.requiredSeats));
    grid.appendChild(R.kpiCard('Вместимость новых офисов', kpis.newOfficesCapacity));
    grid.appendChild(R.kpiCard('Распределено в офисы', kpis.placedInOffices));
    grid.appendChild(R.kpiCard('На удаленке', kpis.remoteCount, 'blue'));
    grid.appendChild(R.kpiCard('Не размещено', kpis.unplacedCount,
      kpis.unplacedCount > 0 ? 'yellow' : null));
    grid.appendChild(R.kpiCard('Свободный резерв', kpis.freeReserve,
      kpis.freeReserve < 0 ? 'red' : 'green'));
    grid.appendChild(R.kpiCard('Переполнение офисов', kpis.officeOverflow,
      kpis.officeOverflow > 0 ? 'red' : null));
    grid.appendChild(R.kpiCard('Переполнение зон', kpis.zoneOverflow,
      kpis.zoneOverflow > 0 ? 'red' : null));
    grid.appendChild(R.kpiCard('Предупреждения', kpis.warningsCount,
      kpis.warningsCount > 0 ? 'yellow' : null));
    grid.appendChild(R.kpiCard('Ошибки', kpis.errorsCount,
      kpis.errorsCount > 0 ? 'red' : null));
    panel.appendChild(grid);
    return panel;
  }

  function renderProgress(kpis) {
    var panel = R.section('Общий прогресс переезда');
    var total = kpis.totalEmployees || 0;
    var inOffices = kpis.placedInOffices || 0;
    var remote = kpis.remoteCount || 0;
    var unplaced = kpis.unplacedCount || 0;

    function pct(n) {
      return total > 0 ? Math.round((n / total) * 100) : 0;
    }

    var stacked = U.el('div', { class: 'progress progress-stacked' }, [
      U.el('div', { class: 'progress-fill progress-green', style: 'width:' + pct(inOffices) + '%', title: 'В офисах' }),
      U.el('div', { class: 'progress-fill progress-blue', style: 'width:' + pct(remote) + '%', title: 'Удаленка' }),
      U.el('div', { class: 'progress-fill progress-grey', style: 'width:' + pct(unplaced) + '%', title: 'Не размещено' })
    ]);

    panel.appendChild(stacked);
    panel.appendChild(U.el('div', { class: 'progress-legend' }, [
      U.el('span', { text: 'Размещено в офисах: ' + pct(inOffices) + '%' }),
      U.el('span', { text: 'Удаленка: ' + pct(remote) + '%' }),
      U.el('span', { text: 'Не размещено: ' + pct(unplaced) + '%' })
    ]));
    return panel;
  }

  function renderOfficeCard(scenario, office, ctx) {
    var capacity = calc.calculateOfficeCapacity(office);
    var occupied = calc.calculateOfficeOccupancy(scenario, office.id);
    var percent = calc.calculateOccupancyPercent(occupied, capacity);
    var officeWarnings = ctx.messages.filter(function (m) {
      return m.entityId === office.id && m.level !== C.LEVEL.INFO;
    }).length;
    var isExpanded = !!expanded[office.id];

    var card = U.el('div', {
      class: 'office-card status-border-' + calc.statusColor(percent, ctx.thresholds),
      dataset: { dropOffice: office.id }
    });

    var head = U.el('div', { class: 'office-card-head' }, [
      U.el('div', {}, [
        U.el('h3', { text: office.name }),
        office.isDraft ? R.badge('Черновик', 'grey') : null
      ]),
      U.el('button', {
        class: 'icon-btn',
        title: isExpanded ? 'Свернуть' : 'Развернуть',
        onclick: function () {
          expanded[office.id] = !isExpanded;
          R.render();
        }
      }, isExpanded ? '▾' : '▸')
    ]);
    card.appendChild(head);

    var meta = U.el('div', { class: 'office-card-meta' }, [
      U.el('span', { text: 'Площадь: ' + (office.area || 0) }),
      U.el('span', { text: 'Вместимость: ' + (isFinite(capacity) ? capacity : '∞') }),
      U.el('span', { text: 'Занято: ' + occupied })
    ]);
    card.appendChild(meta);

    card.appendChild(U.el('div', { class: 'office-card-free', text: R.freeOrOverflowText(capacity, occupied) }));
    card.appendChild(U.el('div', { class: 'office-card-percent', text: 'Заполненность: ' + U.formatPercent(percent) }));
    card.appendChild(R.progressBar(occupied, capacity, ctx.thresholds));
    if (officeWarnings > 0) {
      card.appendChild(R.badge('Предупреждений: ' + officeWarnings, 'yellow'));
    }

    if (isExpanded) {
      card.appendChild(renderZones(scenario, office, ctx));
      card.appendChild(renderOfficeComposition(scenario, office));
      if (!ctx.viewOnly) {
        card.appendChild(U.el('div', { class: 'office-card-actions' }, [
          U.el('button', { class: 'btn btn-sm btn-secondary', onclick: function () { R.setActiveTab('offices'); } }, 'Редактировать'),
          App.importExport ? U.el('button', {
            class: 'btn btn-sm btn-secondary',
            onclick: function () { App.importExport.exportOfficeFragment(office.id); }
          }, 'Экспортировать фрагмент') : null
        ]));
      }
    }
    return card;
  }

  function renderZones(scenario, office, ctx) {
    var wrap = U.el('div', { class: 'zone-list' });
    (office.zones || []).forEach(function (zone) {
      var occ = calc.calculateZoneOccupancy(scenario, zone.id);
      var percent = calc.calculateOccupancyPercent(occ, zone.capacity || 0);
      var zoneEl = U.el('div', {
        class: 'zone-row',
        dataset: { dropOffice: office.id, dropZone: zone.id }
      }, [
        U.el('div', { class: 'zone-row-head' }, [
          U.el('span', { class: 'zone-name', text: zone.name + (zone.isVipZone ? ' ★' : '') }),
          U.el('span', { class: 'zone-stat', text: occ + ' / ' + (zone.capacity || 0) })
        ]),
        R.progressBar(occ, zone.capacity || 0, ctx.thresholds),
        U.el('div', { class: 'zone-free', text: R.freeOrOverflowText(zone.capacity || 0, occ) })
      ]);
      wrap.appendChild(zoneEl);
    });
    return wrap;
  }

  /** Composition of an office by team (how many seats each team holds here). */
  function renderOfficeComposition(scenario, office) {
    var byTeam = {};
    scenario.allocations.forEach(function (a) {
      if (a.targetOfficeId === office.id && a.teamId) {
        byTeam[a.teamId] = (byTeam[a.teamId] || 0) + (a.employeesCount || 0);
      }
    });
    var keys = Object.keys(byTeam);
    if (keys.length === 0) {
      return U.el('div', { class: 'office-composition muted', text: 'Нет размещений' });
    }
    var wrap = U.el('div', { class: 'office-composition' }, [U.el('h4', { text: 'Состав по командам' })]);
    keys.forEach(function (teamId) {
      var team = U.findById(scenario.teams, teamId);
      wrap.appendChild(U.el('div', { class: 'composition-row', text: (team ? team.name : teamId) + ': ' + byTeam[teamId] }));
    });
    return wrap;
  }

  function renderRemoteCard(scenario, ctx) {
    var remote = calc.getRemoteOffice(scenario);
    if (!remote) {
      return U.el('div');
    }
    var occ = calc.calculateOfficeOccupancy(scenario, remote.id);
    var panel = R.section('Удаленка');
    var card = U.el('div', {
      class: 'office-card remote-card status-border-blue',
      dataset: { dropOffice: remote.id }
    }, [
      U.el('h3', { text: 'Удаленка' }),
      U.el('div', { class: 'office-card-meta' }, [
        U.el('span', { text: 'Без лимита вместимости' }),
        U.el('span', { text: 'Размещено: ' + occ })
      ])
    ]);
    panel.appendChild(card);
    return panel;
  }

  function renderTeamList(scenario, ctx) {
    var panel = R.section('Команды');
    if (scenario.teams.length === 0) {
      panel.appendChild(R.emptyState(C.EMPTY_STATES.teams, 'Перейти к командам',
        function () { R.setActiveTab('teams'); }));
      return panel;
    }
    var listEl = U.el('div', { class: 'team-chips' });
    scenario.teams.forEach(function (team) {
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
