window.App = window.App || {};

(function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var R = App.render;
  var calc = App.calc;

  var hideVizAsis = false;
  var hideVizTobe = false;
  var selectedMoneyYear = 2026;

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

  function phaseBalance(scenario, phase) {
    var capacity = 0;
    var occupied = 0;
    (scenario.offices || []).forEach(function (o) {
      if (o.type !== C.OFFICE_TYPE.PHYSICAL || o.phase !== phase) { return; }
      var cap = calc.calculateOfficeCapacity(o);
      if (cap !== Infinity) { capacity += cap; occupied += calc.calculateOfficeOccupancy(scenario, o.id); }
    });
    return capacity - occupied;
  }

  // Generic two-bar summary card used by all top-row charts.
  // useAbsWidth=true: bar width = abs(value), label shows signed value (balance mode).
  // useAbsWidth=false: bar width = value directly (counts mode).
  function renderPhaseBarChart(title, tobeVal, asisVal, useAbsWidth) {
    var maxAbs = Math.max(
      useAbsWidth ? Math.abs(tobeVal) : tobeVal,
      useAbsWidth ? Math.abs(asisVal) : asisVal,
      1
    ) * 1.1;
    var diff = tobeVal - asisVal;
    var diffStr = (diff > 0 ? '+' : '') + String(diff);
    var diffColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'var(--text-muted)';

    var card = U.el('div', { class: 'viz-summary-card' });
    card.appendChild(U.el('div', { class: 'viz-summary-title', text: title }));

    function makeRow(val, isTobe, showDiff) {
      var absVal = useAbsWidth ? Math.abs(val) : val;
      var pct = Math.max(3, Math.round((absVal / maxAbs) * 100));
      var fillColor;
      if (useAbsWidth) {
        fillColor = isTobe ? (val >= 0 ? '#22c55e' : '#ef4444')
                           : (val >= 0 ? PHASE_COLORS.asis : '#ef4444');
      } else {
        fillColor = isTobe ? PHASE_COLORS.tobe : PHASE_COLORS.asis;
      }
      var countStr = (useAbsWidth && val > 0 ? '+' : '') + String(val);
      var fill = U.el('div', { class: 'viz-phase-fill' });
      fill.style.width = pct + '%';
      fill.style.background = fillColor;
      fill.appendChild(U.el('span', { class: 'viz-phase-count', text: countStr }));
      var track = U.el('div', { class: 'viz-phase-track' });
      track.appendChild(fill);
      var row = U.el('div', { class: 'viz-phase-row' });
      row.appendChild(U.el('span', { class: 'viz-phase-label', text: isTobe ? 'TO BE' : 'AS IS' }));
      row.appendChild(track);
      var dEl = U.el('span', { class: 'viz-phase-diff' });
      if (showDiff) {
        dEl.textContent = diffStr;
        dEl.style.color = diffColor;
      }
      row.appendChild(dEl);
      return row;
    }

    card.appendChild(makeRow(tobeVal, true, true));
    card.appendChild(makeRow(asisVal, false, false));
    return card;
  }

  function renderSeatsChart(scenario) {
    return renderPhaseBarChart(
      'Количество мест',
      totalSeats(scenario, C.OFFICE_PHASE.TOBE),
      totalSeats(scenario, C.OFFICE_PHASE.ASIS),
      false
    );
  }

  function renderRemoteChart(scenario) {
    return renderPhaseBarChart(
      'Удалёнка',
      calc.calculateRemoteCount(scenario),
      calc.calculateAsisRemoteCount(scenario),
      false
    );
  }

  function renderBalanceChart(scenario) {
    return renderPhaseBarChart(
      'Баланс мест',
      phaseBalance(scenario, C.OFFICE_PHASE.TOBE),
      phaseBalance(scenario, C.OFFICE_PHASE.ASIS),
      true
    );
  }

  function totalArea(scenario, phase) {
    var area = 0;
    (scenario.offices || []).forEach(function (o) {
      if (o.type !== C.OFFICE_TYPE.PHYSICAL || o.phase !== phase) { return; }
      area += (o.area || 0);
    });
    return Math.round(area);
  }

  function renderAreaChart(scenario) {
    return renderPhaseBarChart(
      'Количество кв.м.',
      totalArea(scenario, C.OFFICE_PHASE.TOBE),
      totalArea(scenario, C.OFFICE_PHASE.ASIS),
      false
    );
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

    // Pre-check: total zone-specific occupancy across all zones.
    // If it's 0 but office occupancy > 0, allocations don't specify zones
    // (only targetOfficeId set). Distribute office occupancy evenly across zones.
    var totalZoneOcc = 0;
    zones.forEach(function (z) { totalZoneOcc += calc.calculateZoneOccupancy(scenario, z.id); });
    var officeOcc = calc.calculateOfficeOccupancy(scenario, office.id);
    var fallbackToOffice = (totalZoneOcc === 0 && officeOcc > 0);

    var section = U.el('div', { class: 'viz-battery-section' });
    zones.forEach(function (zone) {
      var occ;
      if (fallbackToOffice) {
        var officeCap = calc.calculateOfficeCapacity(office);
        occ = (isFinite(officeCap) && officeCap > 0)
          ? Math.round(officeOcc * (zone.capacity / officeCap))
          : officeOcc;
      } else {
        occ = calc.calculateZoneOccupancy(scenario, zone.id);
      }
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

  // ── CF section ──────────────────────────────────────────────────────────

  var MR_GRUPП_COLOR = '#E3DBF0';
  var MR_GRUPП_NAME  = 'МР Групп';

  function fmtYAxis(v) {
    if (v >= 100) { return String(Math.round(v)); }
    if (v >= 10)  { return String(Math.round(v * 10) / 10); }
    return String(Math.round(v * 100) / 100);
  }

  var DARK_PURPLE = '#1E0A3C';

  function renderStackedBarSVG(yearsData, colorFn, opts) {
    var showTotals = opts && opts.showTotals;
    var svgW = 500; var svgH = 420;
    var padL = 60; var padR = 14; var padT = showTotals ? 36 : 20; var padB = 50;
    var chartW = svgW - padL - padR;
    var chartH = svgH - padT - padB;

    var maxTotal = 0;
    yearsData.forEach(function (yd) {
      var s = yd.segments.reduce(function (acc, seg) { return acc + seg.value; }, 0);
      if (s > maxTotal) { maxTotal = s; }
    });

    var niceSteps = Math.max(1, Math.ceil((opts && opts.maxScale ? opts.maxScale : maxTotal) / 250));
    var maxScale = niceSteps * 250;

    var nBars = yearsData.length || 1;
    var colW = chartW / nBars;
    var barW = colW * 0.6;

    var NS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) { e.textContent = text; }
      return e;
    }

    var svg = svgEl('svg', { viewBox: '0 0 ' + svgW + ' ' + svgH, width: '100%' });
    svg.style.display = 'block'; svg.style.overflow = 'visible';

    // Gridlines + Y-axis scale labels
    for (var gi = 0; gi <= niceSteps; gi++) {
      var yVal = gi * 250;
      var yPx = padT + chartH * (1 - yVal / maxScale);
      svg.appendChild(svgEl('line', {
        x1: padL, x2: svgW - padR, y1: yPx, y2: yPx,
        stroke: gi === 0 ? 'rgba(128,128,128,0.45)' : 'rgba(128,128,128,0.18)',
        'stroke-dasharray': gi > 0 ? '4,3' : 'none'
      }));
      if (gi > 0) {
        svg.appendChild(svgEl('text', {
          x: padL - 5, y: yPx + 4,
          'text-anchor': 'end', 'font-size': '11', fill: 'rgba(210,210,210,0.85)'
        }, String(yVal)));
      }
    }

    // Y-axis label "млн. руб." rotated
    svg.appendChild(svgEl('text', {
      transform: 'translate(11,' + (padT + chartH / 2) + ') rotate(-90)',
      'text-anchor': 'middle', 'font-size': '10', fill: 'rgba(180,180,180,0.8)'
    }, 'млн. руб.'));

    // Bars + value labels
    yearsData.forEach(function (yd, bi) {
      var barX = padL + bi * colW + (colW - barW) / 2;
      var yBase = padT + chartH;
      var yStack = 0;

      yd.segments.forEach(function (seg) {
        if (seg.value <= 0) { return; }
        var h = (seg.value / maxScale) * chartH;
        var rectY = yBase - yStack - h;
        var rect = svgEl('rect', {
          x: barX, y: rectY, width: barW, height: h,
          fill: colorFn(seg.key), rx: 2
        });
        var tooltipText = (seg.name || seg.key) + ': ' + seg.value.toFixed(1) + ' млн. руб.';
        rect.appendChild(svgEl('title', {}, tooltipText));
        svg.appendChild(rect);

        var MIN_H = 16;
        if (h >= MIN_H) {
          svg.appendChild(svgEl('text', {
            x: barX + barW / 2, y: rectY + h / 2 + 4,
            'text-anchor': 'middle', 'font-size': '11',
            fill: DARK_PURPLE, 'font-weight': 'bold'
          }, seg.value.toFixed(1)));
        }

        yStack += h;
      });

      // Total label above bar
      if (showTotals && yStack > 0) {
        var totalVal = yd.segments.reduce(function (acc, seg) { return acc + (seg.value > 0 ? seg.value : 0); }, 0);
        svg.appendChild(svgEl('text', {
          x: barX + barW / 2, y: yBase - yStack - 5,
          'text-anchor': 'middle', 'font-size': '11',
          fill: 'rgba(255,255,255,0.92)', 'font-weight': '600'
        }, totalVal.toFixed(2).replace('.', ',')));
      }

      // X-axis year label
      svg.appendChild(svgEl('text', {
        x: barX + barW / 2, y: yBase + 16,
        'text-anchor': 'middle', 'font-size': '11', fill: 'rgba(210,210,210,0.85)'
      }, String(yd.year)));
    });

    // X-axis label "Год"
    svg.appendChild(svgEl('text', {
      x: padL + chartW / 2, y: svgH - 4,
      'text-anchor': 'middle', 'font-size': '10', fill: 'rgba(180,180,180,0.75)'
    }, 'Год'));

    return svg;
  }

  function renderChartLegend(items) {
    var wrap = U.el('div', { class: 'viz-chart-legend' });
    items.forEach(function (item) {
      var dot = U.el('span', { class: 'viz-chart-legend-dot' });
      dot.style.background = item.color;
      var entry = U.el('div', { class: 'viz-chart-legend-entry' });
      entry.appendChild(dot);
      entry.appendChild(U.el('span', { class: 'viz-chart-legend-label', text: item.name }));
      wrap.appendChild(entry);
    });
    return wrap;
  }

  function renderCFSection(scenario) {
    var settings = App.state.getSettings();
    var cfSettings = (settings && settings.cfSettings) || {};
    var startY = cfSettings.startYear || 2026;
    var endY   = cfSettings.endYear   || 2030;

    var tobeOffices = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL && o.phase === C.OFFICE_PHASE.TOBE;
    });

    var officeColorMap = {};
    tobeOffices.forEach(function (o, idx) {
      officeColorMap[o.id] = officeColor(o.name) || PALETTE[idx % PALETTE.length];
    });

    var years = [];
    for (var y = startY; y <= endY; y++) { years.push(y); }

    function cfYearTotal(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, yr, indexationStartDate) {
      var total = 0;
      for (var m = 1; m <= 12; m++) {
        total += calc.cfForMonth(area, rentPerSqm, opexPerSqm, indexationPct, leaseStartDate, yr, m, yr, indexationStartDate);
      }
      return total;
    }

    var chart1Data = years.map(function (yr) {
      return {
        year: yr,
        segments: tobeOffices.map(function (o) {
          return {
            key: o.id,
            name: o.name,
            value: cfYearTotal(o.area, o.rentPerSqm, o.opexPerSqm, o.indexationPct, o.leaseStartDate, yr, o.indexationStartDate)
          };
        })
      };
    });

    var chart2Data = years.map(function (yr) {
      var total = 0;
      tobeOffices.forEach(function (o) {
        (o.tenants || []).forEach(function (t) {
          if ((t.name || '').trim().toLowerCase() === MR_GRUPП_NAME.toLowerCase()) {
            total += cfYearTotal(t.area || 0, o.rentPerSqm, o.opexPerSqm, o.indexationPct, o.leaseStartDate, yr, o.indexationStartDate);
          }
        });
      });
      return { year: yr, segments: [{ key: MR_GRUPП_NAME, name: MR_GRUPП_NAME, value: total }] };
    });

    // Compute shared Y-axis scale across both charts
    var sharedMax = 0;
    [chart1Data, chart2Data].forEach(function (data) {
      data.forEach(function (yd) {
        var s = yd.segments.reduce(function (acc, seg) { return acc + seg.value; }, 0);
        if (s > sharedMax) { sharedMax = s; }
      });
    });

    var section = U.el('div', { class: 'viz-cf-section' });
    section.appendChild(U.el('div', { class: 'viz-section-title', text: 'CF по аренде' }));

    var row = U.el('div', { class: 'viz-cf-row' });

    var card1 = U.el('div', { class: 'viz-cf-card' });
    card1.appendChild(U.el('div', { class: 'viz-cf-chart-title', text: 'CF по аренде по годам по офисам (TO BE)' }));
    card1.appendChild(renderStackedBarSVG(chart1Data, function (key) { return officeColorMap[key] || '#aaa'; }, { showTotals: true, maxScale: sharedMax }));
    var legend1 = tobeOffices.map(function (o) { return { name: o.name, color: officeColorMap[o.id] }; });
    card1.appendChild(renderChartLegend(legend1));

    var card2 = U.el('div', { class: 'viz-cf-card' });
    card2.appendChild(U.el('div', { class: 'viz-cf-chart-title', text: 'CF по аренде по годам — МР Групп (TO BE)' }));
    card2.appendChild(renderStackedBarSVG(chart2Data, function () { return MR_GRUPП_COLOR; }, { maxScale: sharedMax }));
    card2.appendChild(renderChartLegend([{ name: MR_GRUPП_NAME, color: MR_GRUPП_COLOR }]));

    row.appendChild(card1);
    row.appendChild(card2);
    section.appendChild(row);
    return section;
  }

  // ── Money section helpers ────────────────────────────────────────────────

  function indexationFactor(office, year, baseYear) {
    var idx = (office.indexationPct || 0) / 100;
    if (!idx) { return 1; }
    var relYears = Math.max(0, year - (baseYear || year));
    return Math.pow(1 + idx, relYears);
  }

  function rentCostPerSqm(office, year, baseYear) {
    return ((office.rentPerSqm || 0) + (office.opexPerSqm || 0)) * indexationFactor(office, year, baseYear);
  }

  function rentCostPerSeat(office, year, baseYear) {
    var cap = calc.calculateOfficeCapacity(office);
    if (!cap || cap === Infinity) { return 0; }
    return rentCostPerSqm(office, year, baseYear) * (office.area || 0) / cap;
  }

  function fmtMoneyVal(val) {
    var rounded = Math.round(Math.abs(val) * 10 + 1e-9) / 10;
    return rounded.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  var _measureCanvas = null;
  function measureLabelWidth(text) {
    if (!_measureCanvas) { _measureCanvas = document.createElement('canvas'); }
    var ctx = _measureCanvas.getContext('2d');
    ctx.font = '500 13px system-ui,-apple-system,sans-serif';
    return ctx.measureText(text).width;
  }

  function renderMoneyBars(scenario, phase, valFn, maxVal) {
    var wrap = U.el('div', { class: 'viz-money-bars-grid' });
    var offices = (scenario.offices || []).filter(function (o) {
      return o.type === C.OFFICE_TYPE.PHYSICAL && o.phase === phase;
    });
    if (!offices.length) {
      wrap.style.display = 'block';
      wrap.appendChild(U.el('div', { class: 'viz-empty', text: 'Нет офисов' }));
      return wrap;
    }

    var maxLabelW = 0;
    offices.forEach(function (o) {
      var w = measureLabelWidth(o.name);
      if (w > maxLabelW) { maxLabelW = w; }
    });
    var valLeft = Math.ceil(maxLabelW) + 70;

    offices.forEach(function (o) {
      var val = valFn(o);
      var pct = maxVal > 0 ? Math.max(3, Math.round((val / maxVal) * 100)) : 3;
      var color = phase === C.OFFICE_PHASE.TOBE ? PHASE_COLORS.tobe : PHASE_COLORS.asis;
      var fill = U.el('div', { class: 'viz-bar-fill' });
      fill.style.width = pct + '%';
      fill.style.background = color;
      var nameLabel = U.el('span', { class: 'viz-bar-label', text: o.name });
      nameLabel.title = o.name;
      var value = U.el('span', { class: 'viz-money-value', text: fmtMoneyVal(val) });
      value.style.left = valLeft + 'px';
      var track = U.el('div', { class: 'viz-bar-track' }, [fill, nameLabel, value]);
      wrap.appendChild(track);
    });
    return wrap;
  }

  function renderMoneyChart(scenario, title, valFn) {
    var maxVal = 1;
    (scenario.offices || []).forEach(function (o) {
      if (o.type !== C.OFFICE_TYPE.PHYSICAL) { return; }
      var v = valFn(o);
      if (v > maxVal) { maxVal = v; }
    });
    var card = U.el('div', { class: 'viz-money-chart' });
    card.appendChild(U.el('div', { class: 'viz-money-chart-title', text: title }));
    var body = U.el('div', { class: 'viz-money-body' });
    var asisCol = U.el('div', { class: 'viz-money-col' });
    asisCol.appendChild(U.el('div', { class: 'viz-money-col-head', text: 'AS IS' }));
    asisCol.appendChild(renderMoneyBars(scenario, C.OFFICE_PHASE.ASIS, valFn, maxVal));
    var tobeCol = U.el('div', { class: 'viz-money-col' });
    tobeCol.appendChild(U.el('div', { class: 'viz-money-col-head', text: 'TO BE' }));
    tobeCol.appendChild(renderMoneyBars(scenario, C.OFFICE_PHASE.TOBE, valFn, maxVal));
    body.appendChild(asisCol);
    body.appendChild(tobeCol);
    card.appendChild(body);
    return card;
  }

  function renderMoneySection(scenario) {
    var settings = App.state.getSettings();
    var cfSettings = (settings && settings.cfSettings) || {};
    var startY = cfSettings.startYear || 2024;
    var endY = cfSettings.endYear || 2030;
    if (selectedMoneyYear < startY || selectedMoneyYear > endY) { selectedMoneyYear = startY; }
    var yr = selectedMoneyYear;

    var section = U.el('div', { class: 'viz-money-section' });
    section.appendChild(U.el('div', { class: 'viz-section-title', text: 'Финансовые показатели' }));

    var controls = U.el('div', { class: 'viz-money-controls' });
    controls.appendChild(U.el('span', { class: 'viz-money-year-label', text: 'Год:' }));
    var sel = document.createElement('select');
    sel.className = 'viz-year-select';
    for (var y = startY; y <= endY; y++) {
      var opt = document.createElement('option');
      opt.value = String(y);
      opt.text = String(y);
      if (y === yr) { opt.selected = true; }
      sel.appendChild(opt);
    }
    sel.onchange = function () { selectedMoneyYear = parseInt(sel.value, 10); R.render(); };
    controls.appendChild(sel);
    section.appendChild(controls);

    section.appendChild(renderMoneyChart(
      scenario,
      'Стоимость аренды за кв.м. (ставка + эксплуатация с НДС), руб/м²/год',
      function (o) { return rentCostPerSqm(o, yr, startY); }
    ));
    section.appendChild(renderMoneyChart(
      scenario,
      'Стоимость аренды на рабочее место, руб/мес',
      function (o) { return rentCostPerSeat(o, yr, startY) / 12; }
    ));
    return section;
  }

  function render(container, ctx) {
    var scenario = ctx.scenario;

    container.appendChild(U.el('div', { class: 'viz-section-title', text: 'Сравнение сценариев' }));
    var topRow = U.el('div', { class: 'viz-top-row' });
    topRow.appendChild(renderSeatsChart(scenario));
    topRow.appendChild(renderAreaChart(scenario));
    topRow.appendChild(renderRemoteChart(scenario));
    topRow.appendChild(renderBalanceChart(scenario));
    container.appendChild(topRow);

    container.appendChild(U.el('div', { class: 'viz-section-title', text: 'Распределение команд' }));
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

    container.appendChild(renderMoneySection(scenario));
    container.appendChild(renderCFSection(scenario));
  }

  App.render.registerTab('visualization', { label: 'Визуализация', render: render });
})();
