// ============================================================
// RIDE TRACKER - Module Graphiques SVG (sans dépendance externe)
// ============================================================

const Charts = {};

const CHART_COLORS = ['#ff9d2e', '#4ade80', '#4d9fec', '#ef5350', '#c084fc', '#fbbf24'];

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// --- Zoom / défilement tactile pour les graphiques temporels (courbe, cycles de charge) ---
// Fenêtre glissante sur le jeu de données complet : swipe pour défiler, pincer pour zoomer
// (ajuster le nombre de points visibles). L'état persiste par conteneur tant que la taille du
// jeu de données ne change pas ; un changement de période (donc de taille) réinitialise la vue.
const chartWindowState = new WeakMap();
const MIN_VISIBLE_POINTS = 3;
const DEFAULT_VISIBLE_POINTS = 10;

function getChartWindow(container, totalLength) {
  let state = chartWindowState.get(container);
  if (!state || state.totalLength !== totalLength) {
    const windowSize = Math.min(totalLength, DEFAULT_VISIBLE_POINTS);
    state = { totalLength, windowSize, windowStart: Math.max(0, totalLength - windowSize) };
    chartWindowState.set(container, state);
  }
  return state;
}

function clampChartWindow(state) {
  state.windowSize = Math.max(MIN_VISIBLE_POINTS, Math.min(state.totalLength, Math.round(state.windowSize)));
  state.windowStart = Math.max(0, Math.min(state.totalLength - state.windowSize, Math.round(state.windowStart)));
}

// Attaché une seule fois par élément conteneur (le flag survit à container.innerHTML = '',
// qui ne vide que les enfants, pas les propriétés JS posées sur le conteneur lui-même).
function attachChartGestures(container, state, redraw) {
  if (container._chartGesturesAttached) return;
  container._chartGesturesAttached = true;

  let dragging = false;
  let startX = 0;
  let startWindowStart = 0;
  let pinchStartDist = null;
  let pinchStartSize = null;

  const dist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      dragging = true;
      startX = e.touches[0].clientX;
      startWindowStart = state.windowStart;
    } else if (e.touches.length === 2) {
      dragging = false;
      pinchStartDist = dist(e.touches);
      pinchStartSize = state.windowSize;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      const newDist = dist(e.touches);
      const ratio = pinchStartDist / Math.max(1, newDist); // écarter les doigts = zoomer = moins de points visibles
      state.windowSize = pinchStartSize * ratio;
      clampChartWindow(state);
      redraw();
    } else if (dragging && e.touches.length === 1) {
      const width = container.clientWidth || 320;
      const pointsPerPixel = state.windowSize / Math.max(1, width);
      const dx = e.touches[0].clientX - startX;
      state.windowStart = startWindowStart - dx * pointsPerPixel;
      clampChartWindow(state);
      redraw();
    }
  }, { passive: true });

  const endGesture = (e) => {
    if (e.touches.length === 0) { dragging = false; pinchStartDist = null; }
  };
  container.addEventListener('touchend', endGesture, { passive: true });
  container.addEventListener('touchcancel', endGesture, { passive: true });
}

function chartWindowIndicator(container, state, visibleCount) {
  if (state.totalLength <= state.windowSize) return;
  const indicator = document.createElement('div');
  indicator.className = 'chart-window-indicator';
  indicator.textContent = `${state.windowStart + 1}–${state.windowStart + visibleCount} / ${state.totalLength}`;
  container.appendChild(indicator);
}

// --- Courbe de kilométrage dans le temps ---
Charts.lineChart = function (container, data, opts = {}) {
  container.innerHTML = '';
  const W = container.clientWidth || 320;
  const H = container.clientHeight || 220;
  const padL = 38, padR = 14, padT = 16, padB = 28;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Pas assez de données sur cette période.</p></div>';
    return;
  }

  const winState = getChartWindow(container, data.length);
  const windowedData = data.slice(winState.windowStart, winState.windowStart + winState.windowSize);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%' });
  const values = windowedData.map(d => d.km);
  const maxVal = Math.max(...values, 1) * 1.15;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Grille horizontale
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH / gridLines) * i;
    svg.appendChild(svgEl('line', {
      x1: padL, x2: W - padR, y1: y, y2: y,
      stroke: '#2a2f2b', 'stroke-width': 1
    }));
    const val = Math.round(maxVal - (maxVal / gridLines) * i);
    const label = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', fill: '#5f675e', 'font-size': '10', 'font-family': 'JetBrains Mono, monospace' });
    label.textContent = val;
    svg.appendChild(label);
  }

  // Points et ligne
  const stepX = windowedData.length > 1 ? plotW / (windowedData.length - 1) : 0;
  const points = windowedData.map((d, i) => {
    const x = padL + (windowedData.length > 1 ? stepX * i : plotW / 2);
    const y = padT + plotH - (d.km / maxVal) * plotH;
    return { x, y, ...d };
  });

  // Aire sous la courbe
  if (points.length > 1) {
    let areaPath = `M ${points[0].x} ${padT + plotH} `;
    points.forEach(p => areaPath += `L ${p.x} ${p.y} `);
    areaPath += `L ${points[points.length - 1].x} ${padT + plotH} Z`;
    svg.appendChild(svgEl('path', { d: areaPath, fill: 'rgba(255, 157, 46, 0.12)', stroke: 'none' }));

    let linePath = `M ${points[0].x} ${points[0].y} `;
    for (let i = 1; i < points.length; i++) linePath += `L ${points[i].x} ${points[i].y} `;
    svg.appendChild(svgEl('path', { d: linePath, fill: 'none', stroke: '#ff9d2e', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  points.forEach(p => {
    svg.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 3.2, fill: '#0d0f0e', stroke: '#ff9d2e', 'stroke-width': 1.8 }));
  });

  // Axe X : labels début/milieu/fin
  if (points.length > 0) {
    const showIdx = points.length === 1 ? [0] : [0, Math.floor(points.length / 2), points.length - 1];
    showIdx.forEach(i => {
      const p = points[i];
      const d = new Date(p.timestamp);
      const label = svgEl('text', { x: p.x, y: H - 8, 'text-anchor': 'middle', fill: '#5f675e', 'font-size': '10' });
      label.textContent = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      svg.appendChild(label);
    });
  }

  container.appendChild(svg);
  chartWindowIndicator(container, winState, windowedData.length);
  attachChartGestures(container, winState, () => Charts.lineChart(container, data, opts));
};

// --- Disque de répartition (donut) ---
Charts.donutChart = function (container, distribution, opts = {}) {
  container.innerHTML = '';
  const entries = Object.entries(distribution);

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Pas de données sur cette période.</p></div>';
    return;
  }

  const W = container.clientWidth || 320;
  const H = container.clientHeight || 240;
  const size = Math.min(W, H) - 20;
  const cx = W / 2, cy = (H - 40) / 2 + 10;
  const r = size / 2.4;
  const innerR = r * 0.6;

  const total = entries.reduce((sum, [, v]) => sum + v.count, 0);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%' });

  let startAngle = -90;
  const legendData = [];

  entries.forEach(([key, val], idx) => {
    const fraction = val.count / total;
    const angle = fraction * 360;
    const endAngle = startAngle + angle;

    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
    const ix1 = cx + innerR * Math.cos((startAngle * Math.PI) / 180);
    const iy1 = cy + innerR * Math.sin((startAngle * Math.PI) / 180);
    const ix2 = cx + innerR * Math.cos((endAngle * Math.PI) / 180);
    const iy2 = cy + innerR * Math.sin((endAngle * Math.PI) / 180);

    const largeArc = angle > 180 ? 1 : 0;
    const color = CHART_COLORS[idx % CHART_COLORS.length];

    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    svg.appendChild(svgEl('path', { d: path, fill: color, stroke: '#0d0f0e', 'stroke-width': 2 }));

    legendData.push({ key, color, count: val.count, km: val.km, pct: Math.round(fraction * 100) });
    startAngle = endAngle;
  });

  // Texte central
  const centerText = svgEl('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', fill: '#eef0ec', 'font-size': '22', 'font-weight': '600', 'font-family': 'JetBrains Mono, monospace' });
  centerText.textContent = total;
  svg.appendChild(centerText);
  const centerLabel = svgEl('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', fill: '#5f675e', 'font-size': '10.5', 'letter-spacing': '0.05em' });
  centerLabel.textContent = 'SORTIES';
  svg.appendChild(centerLabel);

  container.appendChild(svg);

  if (opts.legendContainer) {
    opts.legendContainer.innerHTML = legendData.map(l =>
      `<div class="chart-legend-item"><span class="chart-legend-dot" style="background:${l.color}"></span>${l.key} · ${l.pct}% (${l.km.toFixed(1)} km)</div>`
    ).join('');
  }
};

// --- Graphique cycles de charge : fluctuation basse/haute ---
Charts.chargeBandChart = function (container, data, opts = {}) {
  container.innerHTML = '';
  const W = container.clientWidth || 320;
  const H = container.clientHeight || 220;
  const padL = 38, padR = 14, padT = 16, padB = 28;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Aucun cycle de charge détecté sur cette période.</p></div>';
    return;
  }

  const winState = getChartWindow(container, data.length);
  const windowedData = data.slice(winState.windowStart, winState.windowStart + winState.windowSize);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%' });
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVal = 100;

  // Grille
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH / gridLines) * i;
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: '#2a2f2b', 'stroke-width': 1 }));
    const val = Math.round(maxVal - (maxVal / gridLines) * i);
    const label = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', fill: '#5f675e', 'font-size': '10', 'font-family': 'JetBrains Mono, monospace' });
    label.textContent = val + '%';
    svg.appendChild(label);
  }

  const barWidth = Math.min(28, (plotW / windowedData.length) * 0.55);
  const step = plotW / windowedData.length;

  windowedData.forEach((d, i) => {
    const x = padL + step * i + step / 2 - barWidth / 2;
    const yHigh = padT + plotH - (d.high / maxVal) * plotH;
    const yLow = padT + plotH - (d.low / maxVal) * plotH;
    const barHeight = Math.max(2, yLow - yHigh);

    // Barre = amplitude basse->haute
    svg.appendChild(svgEl('rect', {
      x, y: yHigh, width: barWidth, height: barHeight,
      fill: '#4ade80', opacity: 0.85, rx: 3
    }));

    // Marqueur haut
    svg.appendChild(svgEl('circle', { cx: x + barWidth / 2, cy: yHigh, r: 3, fill: '#4ade80' }));
    // Marqueur bas
    svg.appendChild(svgEl('circle', { cx: x + barWidth / 2, cy: yLow, r: 3, fill: '#ef5350' }));
  });

  // Axe X labels
  const showIdx = windowedData.length === 1 ? [0] : [0, Math.floor(windowedData.length / 2), windowedData.length - 1];
  showIdx.forEach(i => {
    const d = windowedData[i];
    const x = padL + step * i + step / 2;
    const dateObj = new Date(d.timestamp);
    const label = svgEl('text', { x, y: H - 8, 'text-anchor': 'middle', fill: '#5f675e', 'font-size': '10' });
    label.textContent = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    svg.appendChild(label);
  });

  container.appendChild(svg);
  chartWindowIndicator(container, winState, windowedData.length);
  attachChartGestures(container, winState, () => Charts.chargeBandChart(container, data, opts));

  if (opts.legendContainer) {
    opts.legendContainer.innerHTML = `
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ef5350"></span>% avant charge</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#4ade80"></span>% après charge</div>
    `;
  }
};

window.Charts = Charts;
