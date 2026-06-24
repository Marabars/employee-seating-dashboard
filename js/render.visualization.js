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

  function renderBar(entries, total) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'viz-bar-svg');
    svg.setAttribute('viewBox', '0 0 1000 36');
    svg.setAttribute('preserveAspectRatio', 'none');

    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', '1000'); bg.setAttribute('height', '36');
    bg.setAttribute('fill', 'rgba(255,255,255,0.07)');
    svg.appendChild(bg);

    if (total <= 0) { return svg; }

    var offset = 0;
    entries.forEach(function (entry) {
      var w = Math.max(1, (entry.seats / total) * 1000);
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(offset));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', '36');
      rect.setAttribute('fill', entry.color);
      var title = document.createElementNS(NS, 'title');
      title.textContent = entry.name + ': ' + entry.seats + ' мест';
      rect.appendChild(title);
      svg.appendChild(rect);
      offset += w;
    });
    return svg;
  }

  function renderLegend(entries) {
    var wrap = U.el('div', { class: 'viz-legend' });
    entries.forEach(function (entry) {
      var dot = U.el('span', { class: 'viz-legend-dot' });
      dot.style.background = entry.color;
      wrap.appendChild(U.el('div', { class: 'viz-legend-item' }, [
        dot,
        U.el('span', { class: 'viz-legend-name', text: entry.name }),
        U.el('span', { class: 'viz-legend-seats', text: entry.seats + ' м.' })
      ]));
    });
    return wrap;
  }

  function renderOfficeCard(scenario, office) {
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

    card.appendChild(U.el('div', { class: 'viz-bar-wrap' }, [renderBar(data.entries, data.total)]));
    card.appendChild(renderLegend(data.entries));
    return card;
  }

  function renderPhaseSection(scenario, phase, label, hide) {
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('div', { class: 'viz-section-head', text: label }));
    if (hide) { return wrap; }
    var offices = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL && o.phase === phase;
    });
    if (offices.length === 0) {
      wrap.appendChild(U.el('p', { class: 'muted', text: 'Нет офисов для данной фазы.' }));
      return wrap;
    }
    offices.forEach(function (office) {
      wrap.appendChild(renderOfficeCard(scenario, office));
    });
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
