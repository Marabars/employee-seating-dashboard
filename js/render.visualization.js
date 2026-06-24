/**
 * render.visualization.js
 * "Визуализация" tab: SVG pie charts + legend tables per office,
 * with AS IS / TO BE phase toggle.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;

  var activeVizPhase = C.OFFICE_PHASE.TOBE;

  var PALETTE = [
    '#4f8ef7','#f7934f','#4fcc7a','#f74f7a','#c74ff7',
    '#f7d94f','#4ff7e8','#f74fc4','#7af74f','#f7574f',
    '#4f74f7','#f7b24f','#a04ff7','#4ff7a0'
  ];

  function teamColor(team, index) {
    return (team.color && team.color !== '#000000') ? team.color : PALETTE[index % PALETTE.length];
  }

  // Seats for a specific team in a specific office (max(teamSeats, namedCount) dedup)
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

  function getOfficeChartData(scenario, office) {
    var entries = [];
    (scenario.teams || []).forEach(function (team, idx) {
      var seats = seatsForTeamInOffice(scenario, team.id, office.id);
      if (seats > 0) {
        entries.push({ name: team.name, seats: seats, color: teamColor(team, idx) });
      }
    });
    var capacity = calc.calculateOfficeCapacity(office);
    var occupied = entries.reduce(function (s, e) { return s + e.seats; }, 0);
    var free = (capacity === Infinity) ? 0 : Math.max(0, capacity - occupied);
    if (free > 0) {
      entries.push({ name: 'Свободно', seats: free, color: '#3d3555', isFree: true });
    }
    return { entries: entries, total: (capacity === Infinity ? occupied : capacity), occupied: occupied };
  }

  // SVG pie chart — pure ES5 SVG
  function polarToCartesian(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function pieSlicePath(cx, cy, r, startDeg, endDeg) {
    // Clamp to avoid degenerate full-circle arc
    if (endDeg - startDeg >= 360) { endDeg = startDeg + 359.99; }
    var s = polarToCartesian(cx, cy, r, startDeg);
    var e = polarToCartesian(cx, cy, r, endDeg);
    var large = (endDeg - startDeg > 180) ? 1 : 0;
    return 'M ' + cx + ' ' + cy +
           ' L ' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) +
           ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2) +
           ' Z';
  }

  function renderPie(entries, total) {
    var SIZE = 120;
    var cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2 - 4;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(SIZE));
    svg.setAttribute('height', String(SIZE));
    svg.setAttribute('viewBox', '0 0 ' + SIZE + ' ' + SIZE);

    if (total === 0 || entries.length === 0) {
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', '#3d3555');
      svg.appendChild(circle);
      return svg;
    }

    var startDeg = 0;
    entries.forEach(function (entry) {
      var slice = (entry.seats / total) * 360;
      var endDeg = startDeg + slice;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pieSlicePath(cx, cy, r, startDeg, endDeg));
      path.setAttribute('fill', entry.color);
      path.setAttribute('stroke', '#0a0814');
      path.setAttribute('stroke-width', '1');
      var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = entry.name + ': ' + entry.seats + ' (' + Math.round(entry.seats / total * 100) + '%)';
      path.appendChild(title);
      svg.appendChild(path);
      startDeg = endDeg;
    });

    // Center hole for donut effect
    var hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hole.setAttribute('cx', String(cx));
    hole.setAttribute('cy', String(cy));
    hole.setAttribute('r', String(r * 0.45));
    hole.setAttribute('fill', '#15102a');
    svg.appendChild(hole);

    return svg;
  }

  function renderLegend(entries, total) {
    var wrap = U.el('div', { class: 'viz-legend' });
    entries.forEach(function (entry) {
      var pct = total > 0 ? Math.round(entry.seats / total * 1000) / 10 : 0;
      var dot = U.el('span', { class: 'viz-legend-dot' });
      dot.style.background = entry.color;
      var row = U.el('div', { class: 'viz-legend-row' }, [
        dot,
        U.el('span', { class: 'viz-legend-name', text: entry.name }),
        U.el('span', { class: 'viz-legend-seats', text: String(entry.seats) + ' м.' }),
        U.el('span', { class: 'viz-legend-pct', text: pct.toFixed(1) + '%' })
      ]);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderOfficeCard(scenario, office) {
    var data = getOfficeChartData(scenario, office);
    var capacity = calc.calculateOfficeCapacity(office);
    var capLabel = capacity === Infinity ? '∞' : String(capacity);

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

    var row = U.el('div', { class: 'viz-chart-row' });
    var pieWrap = U.el('div', { class: 'viz-pie-wrap' });
    pieWrap.appendChild(renderPie(data.entries, data.total));
    row.appendChild(pieWrap);
    row.appendChild(renderLegend(data.entries, data.total));
    card.appendChild(row);
    return card;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;

    // Phase toggle
    var toggleWrap = U.el('div', { class: 'phase-vis-toggles', style: 'margin-bottom:16px;' });
    [C.OFFICE_PHASE.ASIS, C.OFFICE_PHASE.TOBE].forEach(function (phase) {
      var label = phase === C.OFFICE_PHASE.ASIS ? 'AS IS' : 'TO BE';
      var btn = U.el('button', {
        class: 'phase-vis-btn' + (activeVizPhase === phase ? ' active' : ''),
        onclick: function () { activeVizPhase = phase; R.render(); }
      }, label);
      toggleWrap.appendChild(btn);
    });
    container.appendChild(toggleWrap);

    // Filter offices by phase
    var offices = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL && o.phase === activeVizPhase;
    });

    if (offices.length === 0) {
      container.appendChild(U.el('p', { class: 'muted', text: 'Нет офисов для выбранной фазы.' }));
      return;
    }

    offices.forEach(function (office) {
      container.appendChild(renderOfficeCard(scenario, office));
    });
  }

  App.render.registerTab('visualization', { label: 'Визуализация', render: render });
})();
