window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;

  var hideVizAsis = false;
  var hideVizTobe = false;

  var PALETTE = [
    '#4f8ef7','#f7934f','#4fcc7a','#f74f7a','#c74ff7',
    '#f7d94f','#4ff7e8','#f74fc4','#7af74f','#f7574f',
    '#4f74f7','#f7b24f','#a04ff7','#4ff7a0'
  ];

  var PHASE_COLORS = {
    asis: '#6453BA',
    tobe: '#467E5D'
  };

  function teamColor(team, index) {
    return (team.color && team.color !== '#000000') ? team.color : PALETTE[index % PALETTE.length];
  }

  function seatsForTeamInOffice(scenario, teamId, officeId) {
    var teamSeats = 0;
    var namedCount = 0;
    (scenario.allocations || []).forEach(function (a) {
      if (a.targetOfficeId !== officeId || a.teamId !== teamId) { return; }
      if (a.type === C.ALLOCATION_TYPE.TEAM) {
        teamSeats += (a.employeesCount || 0);
      } else if (a.type === C.ALLOCATION_TYPE.EMPLOYEE && a.employeeId) {
        namedCount += 1;
      }
    });
    return Math.max(teamSeats, namedCount);
  }

  function getOfficeBarData(scenario, office) {
    var allEntries = [];
    (scenario.teams || []).forEach(function (team, idx) {
      var seats = seatsForTeamInOffice(scenario, team.id, office.id);
      if (seats > 0) {
        allEntries.push({ name: team.name, seats: seats, color: teamColor(team, idx) });
      }
    });
    allEntries.sort(function (a, b) { return b.seats - a.seats; });
    var top10 = allEntries.slice(0, 10);
    var capacity = calc.calculateOfficeCapacity(office);
    var total = (capacity === Infinity || capacity === 0)
      ? allEntries.reduce(function (s, e) { return s + e.seats; }, 0)
      : capacity;
    var occupied = allEntries.reduce(function (s, e) { return s + e.seats; }, 0);
    return { entries: top10, total: total, occupied: occupied };
  }

  function renderTeamBar(entry, total, phaseColor) {
    var pct = total > 0 ? Math.max(1, Math.round((entry.seats / total) * 100)) : 1;
    var fill = U.el('div', { class: 'viz-bar-fill' });
    fill.style.width = pct + '%';
    fill.style.background = phaseColor || entry.color;
    var label = U.el('span', { class: 'viz-bar-label', text: entry.name });
    var track = U.el('div', { class: 'viz-bar-track' }, [fill, label]);
    var count = U.el('span', { class: 'viz-bar-count', text: String(entry.seats) });
    return U.el('div', { class: 'viz-bar-row' }, [track, count]);
  }

  function renderZoneBatteries(scenario, office) {
    var zones = (office.zones || []).filter(function (z) { return z.capacity && z.capacity > 0; });
    if (zones.length === 0) { return null; }

    var section = U.el('div', { class: 'viz-battery-section' });
    zones.forEach(function (zone) {
      var occ = calc.calculateZoneOccupancy(scenario, zone.id);
      var cap = zone.capacity;
      var pct = Math.round((occ / cap) * 100);
      var color;
      if (pct <= 85) { color = '#22c55e'; }
      else if (pct <= 100) { color = '#f59e0b'; }
      else { color = '#ef4444'; }
      var fillPct = Math.min(pct, 100);

      var fill = U.el('div', { class: 'viz-battery-fill' });
      fill.style.width = fillPct + '%';
      fill.style.background = color;

      var text = U.el('div', { class: 'viz-battery-text', text: occ + '/' + cap });

      var track = U.el('div', { class: 'viz-battery-track' }, [fill, text]);
      var label = U.el('span', { class: 'viz-battery-label', text: zone.name });
      section.appendChild(U.el('div', { class: 'viz-battery-row' }, [label, track]));
    });
    return section;
  }

  function renderOfficeCard(scenario, office, phaseColor) {
    var data = getOfficeBarData(scenario, office);
    var capacity = calc.calculateOfficeCapacity(office);
    var capLabel = (capacity === Infinity) ? '∞' : String(capacity);

    var card = U.el('div', { class: 'viz-office-card' });
    card.appendChild(U.el('div', { class: 'viz-office-title', text: office.name }));
    card.appendChild(U.el('div', {
      class: 'viz-office-meta',
      text: 'Занято: ' + data.occupied + ' / ' + capLabel + ' мест'
    }));

    if (data.entries.length === 0) {
      card.appendChild(U.el('div', { class: 'viz-empty', text: 'Нет размещений' }));
      return card;
    }

    data.entries.forEach(function (entry) {
      card.appendChild(renderTeamBar(entry, data.total, phaseColor));
    });

    var batteries = renderZoneBatteries(scenario, office);
    if (batteries) { card.appendChild(batteries); }

    return card;
  }

  function renderPhaseSection(scenario, phase, label, hide) {
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('div', { class: 'viz-section-head', text: label }));
    if (hide) { return wrap; }
    var phaseColor = PHASE_COLORS[phase] || PHASE_COLORS.tobe;
    var offices = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL && o.phase === phase;
    });
    if (offices.length === 0) {
      wrap.appendChild(U.el('p', { class: 'muted', text: 'Нет офисов для данной фазы.' }));
      return wrap;
    }
    var grid = U.el('div', { class: 'viz-grid' });
    offices.forEach(function (office) {
      grid.appendChild(renderOfficeCard(scenario, office, phaseColor));
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;

    var phaseToggles = U.el('div', { class: 'phase-vis-toggles', style: 'margin-bottom:16px;' });
    var tobeBtn = U.el('button', {
      class: 'btn btn-sm ' + (hideVizTobe ? 'btn-secondary' : 'btn-primary') + ' phase-vis-btn',
      title: hideVizTobe ? 'Показать TO BE' : 'Скрыть TO BE',
      onclick: function () { hideVizTobe = !hideVizTobe; R.render(); }
    }, (hideVizTobe ? '▸' : '▾') + ' TO BE');
    var asisBtn = U.el('button', {
      class: 'btn btn-sm ' + (hideVizAsis ? 'btn-secondary' : 'btn-primary') + ' phase-vis-btn',
      title: hideVizAsis ? 'Показать AS IS' : 'Скрыть AS IS',
      onclick: function () { hideVizAsis = !hideVizAsis; R.render(); }
    }, (hideVizAsis ? '▸' : '▾') + ' AS IS');
    phaseToggles.appendChild(tobeBtn);
    phaseToggles.appendChild(asisBtn);
    container.appendChild(phaseToggles);

    container.appendChild(renderPhaseSection(scenario, C.OFFICE_PHASE.TOBE, 'TO BE', hideVizTobe));
    container.appendChild(renderPhaseSection(scenario, C.OFFICE_PHASE.ASIS, 'AS IS', hideVizAsis));
  }

  App.render.registerTab('visualization', { label: 'Визуализация', render: render });
})();
