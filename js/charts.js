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

// --- Zoom / défilement pour les graphiques temporels (courbe, cycles de charge) ---
// Fenêtre glissante sur le jeu de données complet. Défilement au doigt (un seul doigt)
// ou aux flèches ; zoom aux boutons loupe sous le graphique. Le pincement à deux doigts
// a été abandonné : illisible sur un graphique de cette taille. L'état persiste par
// conteneur tant que la taille du jeu de données ne change pas ; un changement de
// période (donc de taille) réinitialise la vue.
const chartWindowState = new WeakMap();
const MIN_VISIBLE_POINTS = 3;
const DEFAULT_VISIBLE_POINTS = 10;
const ZOOM_STEP = 1.5;   // facteur par appui sur loupe
const PAN_STEP = 0.5;    // fraction de fenêtre par appui sur flèche

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
// Les handlers passent par container._gestureState/_gestureRedraw, rafraîchis à chaque
// rendu, pour ne jamais piloter un état périmé après un changement de période.
// Pointer Events plutôt que Touch Events : la direction du geste est tranchée sur les
// premiers pixels, et le scroll vertical de page n'est bloqué (preventDefault) qu'une fois
// le geste confirmé horizontal. Avec de simples écouteurs tactiles passifs, un léger angle
// vertical dans le geste (quasi systématique) faisait gagner le scroll natif de la page
// avant que le JS ne reprenne la main, d'où un défilement qui semblait ne rien faire.
function attachChartGestures(container, state, redraw) {
  container._gestureState = state;
  container._gestureRedraw = redraw;
  if (container._chartGesturesAttached) return;
  container._chartGesturesAttached = true;

  let dragging = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startWindowStart = 0;
  let direction = null; // 'horizontal' | 'vertical' | null tant que pas tranché

  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    direction = null;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startWindowStart = container._gestureState.windowStart;
    try { container.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  container.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (direction === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // trop tôt pour trancher
      direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (direction !== 'horizontal') return; // geste vertical : on laisse le scroll natif faire son travail

    e.preventDefault(); // geste horizontal confirmé, on empêche tout scroll résiduel de page

    const st = container._gestureState;
    const width = container.clientWidth || 320;
    const pointsPerPixel = st.windowSize / Math.max(1, width);
    st.windowStart = startWindowStart - dx * pointsPerPixel;
    clampChartWindow(st);
    container._gestureRedraw();
  }, { passive: false });

  const endGesture = (e) => {
    if (e.pointerId === activePointerId) {
      dragging = false;
      activePointerId = null;
      direction = null;
    }
  };
  container.addEventListener('pointerup', endGesture);
  container.addEventListener('pointercancel', endGesture);
}

// Barre de contrôle sous le graphique : défiler gauche/droite, zoom -, zoom +.
// Créée une fois par conteneur, insérée juste après lui, mise à jour à chaque redraw.
function ensureChartControls(container, state, redraw) {
  let bar = container._chartControlsBar;
  if (!bar || !bar.isConnected) {
    bar = document.createElement('div');
    bar.className = 'chart-controls';
    bar.innerHTML = `
      <button type="button" class="chart-ctrl-btn" data-act="left" aria-label="Défiler vers la gauche">
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="chart-ctrl-btn" data-act="zoomout" aria-label="Dézoomer">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16.5 16.5L21 21M8 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="chart-ctrl-btn" data-act="zoomin" aria-label="Zoomer">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16.5 16.5L21 21M8 11h6M11 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="chart-ctrl-btn" data-act="right" aria-label="Défiler vers la droite">
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
    container.insertAdjacentElement('afterend', bar);
    container._chartControlsBar = bar;

    bar.querySelectorAll('.chart-ctrl-btn').forEach(btn => {
      btn.onclick = () => {
        // Références rafraîchies à chaque redraw : après un changement de période,
        // le state et le redraw d'origine sont périmés, on pilote toujours les courants.
        const st = bar._state;
        const rd = bar._redraw;
        const act = btn.dataset.act;
        if (act === 'left') st.windowStart -= Math.max(1, st.windowSize * PAN_STEP);
        else if (act === 'right') st.windowStart += Math.max(1, st.windowSize * PAN_STEP);
        else if (act === 'zoomin') {
          // Zoomer = moins de points visibles, centré sur la fenêtre courante
          const center = st.windowStart + st.windowSize / 2;
          st.windowSize = st.windowSize / ZOOM_STEP;
          st.windowStart = center - st.windowSize / 2;
        } else if (act === 'zoomout') {
          const center = st.windowStart + st.windowSize / 2;
          st.windowSize = st.windowSize * ZOOM_STEP;
          st.windowStart = center - st.windowSize / 2;
        }
        clampChartWindow(st);
        rd();
      };
    });
  }
  // L'état partagé référencé par les handlers est remplacé quand le dataset change :
  // on rafraîchit les références pour que les boutons pilotent toujours l'état courant.
  bar._state = state;
  bar._redraw = redraw;

  // États désactivés selon les bornes
  const atStart = state.windowStart <= 0;
  const atEnd = state.windowStart + state.windowSize >= state.totalLength;
  const minZoom = state.windowSize >= state.totalLength;
  const maxZoom = state.windowSize <= MIN_VISIBLE_POINTS;
  bar.querySelector('[data-act="left"]').disabled = atStart;
  bar.querySelector('[data-act="right"]').disabled = atEnd;
  bar.querySelector('[data-act="zoomout"]').disabled = minZoom;
  bar.querySelector('[data-act="zoomin"]').disabled = maxZoom;
  // Barre invisible si tout tient à l'écran sans zoom possible (peu de points)
  bar.style.display = (state.totalLength <= MIN_VISIBLE_POINTS) ? 'none' : 'flex';
}

function chartWindowIndicator(container, state, visibleCount) {
  if (state.totalLength <= state.windowSize) return;
  const indicator = document.createElement('div');
  indicator.className = 'chart-window-indicator';
  indicator.textContent = `${state.windowStart + 1} à ${state.windowStart + visibleCount} sur ${state.totalLength}`;
  container.appendChild(indicator);
}

// --- Courbe de kilométrage dans le temps ---
// --- Histogramme de kilométrage dans le temps (une barre par trajet) ---
Charts.barChart = function (container, data, opts = {}) {
  container.innerHTML = '';
  const W = container.clientWidth || 320;
  const H = container.clientHeight || 220;
  const padL = 38, padR = 14, padT = 16, padB = 28;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Pas assez de données sur cette période.</p></div>';
    if (container._chartControlsBar) container._chartControlsBar.style.display = 'none';
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

  // Barres, une par trajet
  const step = plotW / windowedData.length;
  const barWidth = Math.min(30, step * 0.6);

  windowedData.forEach((d, i) => {
    const x = padL + step * i + step / 2 - barWidth / 2;
    const barHeight = (d.km / maxVal) * plotH;
    const y = padT + plotH - barHeight;
    svg.appendChild(svgEl('rect', {
      x, y, width: barWidth, height: Math.max(2, barHeight),
      fill: '#ff9d2e', opacity: 0.85, rx: 3
    }));
  });

  // Axe X : labels début/milieu/fin
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
  attachChartGestures(container, winState, () => Charts.barChart(container, data, opts));
  ensureChartControls(container, winState, () => Charts.barChart(container, data, opts));
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
    if (container._chartControlsBar) container._chartControlsBar.style.display = 'none';
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
  ensureChartControls(container, winState, () => Charts.chargeBandChart(container, data, opts));

  if (opts.legendContainer) {
    opts.legendContainer.innerHTML = `
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ef5350"></span>% avant charge</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#4ade80"></span>% après charge</div>
    `;
  }
};

window.Charts = Charts;
