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

  // Office brand colors (by lowercase office name fragment match)
  var OFFICE_COLORS = [
    { key: 'нева 14й этаж 1я', color: '#457F78' },
    { key: 'нева 14й этаж 2я', color: '#6AAEA6' },
    { key: 'icity 31',         color: '#89BD9E' },
    { key: 'icity 8',          color: '#467E5D' },
    { key: 'савеловск',        color: '#5BCD8C' },
    { key: 'стекляшк',         color: '#CCECD7' },
    { key: 'заселени',         color: '#9BC4D5' }
  ];

  function officeColor(officeName) {
    var lower = (officeName || '').toLowerCase();
    for (var i = 0; i < OFFICE_COLORS.length; i++) {
      if (lower.indexOf(OFFICE_COLORS[i].key) !== -1) { return OFFICE_COLORS[i].color; }
    }
    return null;
  }

  function totalSeats(scenario, phase) {
    var total = 0;
    (scenario.offices || []).forEach(function (o) {
      if (o.type !== C.OFFICE_TYPE.PHYSICAL || o.phase !== phase) { return; }
      var cap = calc.calculateOfficeCapacity(o);
      if (cap !== Infinity) { total += cap; }
    });
    return total;
  }

  function renderSeatsChart(scenario) {
    var tobeTotal = totalSeats(scenario, C.OFFICE_PHASE.TOBE);
    var asisTotal = totalSeats(scenario, C.OFFICE_PHASE.ASIS);
    var maxVal = Math.max(tobeTotal, asisTotal, 1);
    var diff = tobeTotal - asisTotal;
    var diffStr = (diff > 0 ? '+' : '') + String(diff);
    var diffColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--text-muted)';

    var card = U.el('div', { class: 'viz-summary-card' });
    card.appendChild(U.el('div', { class: 'viz-summary-title', text: 'Количество мест' }));

    var tobePct = Math.max(3, Math.round((tobeTotal / maxVal) * 100));
    var tobeFill = U.el('div', { class: 'viz-phase-fill' });
    tobeFill.style.width = tobePct + '%';
    tobeFill.style.background = PHASE_COLORS.tobe;
    tobeFill.appendChild(U.el('span', { class: 'viz-phase-count', text: String(tobeTotal) }));
    var tobeTrack = U.el('div', { class: 'viz-phase-track' });
    tobeTrack.appendChild(tobeFill);
    var tobeDiff = U.el('span', { class: 'viz-phase-diff', text: diffStr });
    tobeDiff.style.color = diffColor;
    var tobeRow = U.el('div', { class: 'viz-phase-row' });
    tobeRow.appendChild(U.el('span', { class: 'viz-phase-label', text: 'TO BE' }));
    tobeRow.appendChild(tobeTrack);
    tobeRow.appendChild(tobeDiff);
    card.appendChild(tobeRow);

    var asisPct = Math.max(3, Math.round((asisTotal / maxVal) * 100));
    var asisFill = U.el('div', { class: 'viz-phase-fill' });
    asisFill.style.width = asisPct + '%';
    asisFill.style.background = PHASE_COLORS.asis;
    asisFill.appendChild(U.el('span', { class: 'viz-phase-count', text: String(asisTotal) }));
    var asisTrack = U.el('div', { class: 'viz-phase-track' });
    asisTrack.appendChild(asisFill);
    var asisRow = U.el('div', { class: 'viz-phase-row' });
    asisRow.appendChild(U.el('span', { class: 'viz-phase-label', text: 'AS IS' }));
    asisRow.appendChild(asisTrack);
    card.appendChild(asisRow);

    return card;
  }

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

  function renderTeamBar(entry, maxSeats, phaseColor) {
    var pct = maxSeats > 0 ? Math.max(2, Math.round((entry.seats / maxSeats) * 100)) : 2;
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

  function equalizeCardRows(grid) {
    var cards = grid.querySelectorAll('.viz-office-card');
    if (!cards.length) { return; }
    var i, j, key, tops, maxH, h;

    for (i = 0; i < cards.length; i++) {
      var t = cards[i].querySelector('.viz-card-top');
      if (t) { t.style.minHeight = ''; }
    }

    var rows = {};
    for (i = 0; i < cards.length; i++) {
      var topEl = cards[i].querySelector('.viz-card-top');
      if (!topEl) { continue; }
      key = cards[i].offsetTop;
      if (!rows[key]) { rows[key] = []; }
      rows[key].push(topEl);
    }

    var keys = Object.keys(rows);
    for (i = 0; i < keys.length; i++) {
      tops = rows[keys[i]];
      maxH = 0;
      for (j = 0; j < tops.length; j++) {
        h = tops[j].offsetHeight;
        if (h > maxH) { maxH = h; }
      }
      for (j = 0; j < tops.length; j++) {
        tops[j].style.minHeight = maxH + 'px';
      }
    }
  }

  function renderOfficeCard(scenario, office, phaseColor, maxSeats) {
    var data = getOfficeBarData(scenario, office);
    var capacity = calc.calculateOfficeCapacity(office);
    var capLabel = (capacity === Infinity) ? '∞' : String(capacity);

    var card = U.el('div', { class: 'viz-office-card' });

    var topBlock = U.el('div', { class: 'viz-card-top' });
    topBlock.appendChild(U.el('div', { class: 'viz-office-title', text: office.name }));
    topBlock.appendChild(U.el('div', {
      class: 'viz-office-meta',
      text: 'Занято: ' + data.occupied + ' / ' + capLabel + ' мест'
    }));

    if (data.entries.length === 0) {
      topBlock.appendChild(U.el('div', { class: 'viz-empty', text: 'Нет размещений' }));
    } else {
      var barsWrap = U.el('div', { class: 'viz-bars-wrap' });
      data.entries.forEach(function (entry) {
        barsWrap.appendChild(renderTeamBar(entry, maxSeats, phaseColor));
      });
      topBlock.appendChild(barsWrap);
    }
    card.appendChild(topBlock);

    var bottomBlock = U.el('div', { class: 'viz-card-bottom' });
    var batteries = renderZoneBatteries(scenario, office);
    if (batteries) { bottomBlock.appendChild(batteries); }
    card.appendChild(bottomBlock);

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
    var maxSeats = 1;
    offices.forEach(function (office) {
      var data = getOfficeBarData(scenario, office);
      data.entries.forEach(function (entry) {
        if (entry.seats > maxSeats) { maxSeats = entry.seats; }
      });
    });
    var grid = U.el('div', { class: 'viz-grid' });
    offices.forEach(function (office) {
      grid.appendChild(renderOfficeCard(scenario, office, phaseColor, maxSeats));
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;

    var topRow = U.el('div', { class: 'viz-top-row' });
    topRow.appendChild(renderSeatsChart(scenario));
    container.appendChild(topRow);

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

    var tobeSection = renderPhaseSection(scenario, C.OFFICE_PHASE.TOBE, 'TO BE', hideVizTobe);
    container.appendChild(tobeSection);
    var asisSection = renderPhaseSection(scenario, C.OFFICE_PHASE.ASIS, 'AS IS', hideVizAsis);
    container.appendChild(asisSection);

    var grids = container.querySelectorAll('.viz-grid');
    for (var gi = 0; gi < grids.length; gi++) { equalizeCardRows(grids[gi]); }
  }

  App.render.registerTab('visualization', { label: 'Визуализация', render: render });
})();
