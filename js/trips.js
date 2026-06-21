// ============================================================
// EVOLVE TRACKER - Module Trajets
// ============================================================

const Trips = {};

let currentHistorySort = { by: 'date', order: 'desc' };
let currentHistoryFilters = {};
let currentStatsPeriod = 'total';
let currentStatsCustomRange = null;
let currentChargePeriod = 'total';
let currentChargeCustomRange = null;

// --- Formulaire de saisie / édition d'un trajet ---
Trips.openTripForm = async function (tripId = null) {
  const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
  const rideTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  let trip = null;
  if (tripId) trip = await EvolveDB.dbGet(EvolveDB.STORES.TRIPS, tripId);

  const defaultWheel = wheels.find(w => w.isDefault) || wheels[0];
  const selectedWheelId = trip ? trip.wheelId : (defaultWheel ? defaultWheel.id : null);

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${trip ? 'Modifier la sortie' : 'Nouvelle sortie'}</h2>
      <button class="modal-close" id="trip-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>

    <div class="form-group">
      <label class="form-label">Batterie au départ</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="trip-battery-start" min="0" max="100" step="0.1" value="${trip ? trip.batteryStart : ''}" placeholder="ex: 85">
        <span class="unit-suffix">%</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Batterie à l'arrivée</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="trip-battery-end" min="0" max="100" step="0.1" value="${trip ? trip.batteryEnd : ''}" placeholder="ex: 62">
        <span class="unit-suffix">%</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Distance parcourue</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="trip-distance" min="0" step="0.01" value="${trip ? trip.distanceKm : ''}" placeholder="ex: 12.5">
        <span class="unit-suffix">km</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Type de ride</label>
      <select class="form-select" id="trip-ridetype">
        ${rideTypes.map(rt => `<option value="${rt.name}" ${trip && trip.rideType === rt.name ? 'selected' : ''}>${rt.name}</option>`).join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">Roue utilisée</label>
      <select class="form-select" id="trip-wheel">
        ${wheels.map(w => `<option value="${w.id}" ${selectedWheelId === w.id ? 'selected' : ''}>${w.diameter}mm · ${w.characteristic}${w.offroad ? ' (tout terrain)' : ''}</option>`).join('')}
      </select>
    </div>

    ${trip ? `
    <div class="form-group">
      <label class="form-label">Date et heure</label>
      <input type="datetime-local" class="form-input mono" id="trip-timestamp" value="${toDatetimeLocal(trip.timestamp)}">
    </div>
    ` : `<div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:16px">La date et l'heure sont enregistrées automatiquement au moment de la saisie.</div>`}

    <div class="modal-actions">
      ${trip ? `<button class="btn btn-danger" id="trip-delete-btn">Supprimer</button>` : ''}
      <button class="btn btn-primary flex-1" id="trip-save-btn">Enregistrer</button>
    </div>
  `;

  document.getElementById('trip-form-close').onclick = closeModal;
  document.getElementById('trip-save-btn').onclick = () => saveTripForm(tripId);
  if (trip) {
    document.getElementById('trip-delete-btn').onclick = async () => {
      if (confirm('Supprimer cette sortie ?')) {
        await EvolveDB.dbDelete(EvolveDB.STORES.TRIPS, tripId);
        closeModal();
        showToast('Sortie supprimée', 'success');
        App.refreshCurrentView();
      }
    };
  }

  openModal();
};

function toDatetimeLocal(isoString) {
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function saveTripForm(tripId) {
  const batteryStart = parseFloat(document.getElementById('trip-battery-start').value);
  const batteryEnd = parseFloat(document.getElementById('trip-battery-end').value);
  const distanceKm = parseFloat(document.getElementById('trip-distance').value);
  const rideType = document.getElementById('trip-ridetype').value;
  const wheelId = parseInt(document.getElementById('trip-wheel').value);

  if (isNaN(batteryStart) || isNaN(batteryEnd) || isNaN(distanceKm)) {
    showToast('Renseigne la batterie de départ, d\'arrivée et la distance.', 'error');
    return;
  }
  if (batteryStart < 0 || batteryStart > 100 || batteryEnd < 0 || batteryEnd > 100) {
    showToast('La batterie doit être comprise entre 0 et 100%.', 'error');
    return;
  }

  let timestamp;
  const tsInput = document.getElementById('trip-timestamp');
  if (tsInput) {
    timestamp = new Date(tsInput.value).toISOString();
  } else {
    timestamp = new Date().toISOString();
  }

  const tripData = { batteryStart, batteryEnd, distanceKm, rideType, wheelId, timestamp };

  if (tripId) {
    tripData.id = tripId;
    await EvolveDB.dbPut(EvolveDB.STORES.TRIPS, tripData);
    showToast('Sortie modifiée', 'success');
  } else {
    await EvolveDB.dbAdd(EvolveDB.STORES.TRIPS, tripData);
    showToast('Sortie enregistrée', 'success');
  }

  closeModal();
  App.refreshCurrentView();
}

// --- Détail trajet (lecture, accès modification) ---
Trips.openTripDetail = async function (tripId) {
  const trip = await EvolveDB.dbGet(EvolveDB.STORES.TRIPS, tripId);
  const wheel = trip.wheelId ? await EvolveDB.dbGet(EvolveDB.STORES.WHEELS, trip.wheelId) : null;
  const consumption = trip.batteryStart - trip.batteryEnd;

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>Détail de la sortie</h2>
      <button class="modal-close" id="detail-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${Calc.formatDateTime(trip.timestamp)}</span></div>
    <div class="detail-row"><span class="detail-label">Batterie départ</span><span class="detail-value">${trip.batteryStart}%</span></div>
    <div class="detail-row"><span class="detail-label">Batterie arrivée</span><span class="detail-value">${trip.batteryEnd}%</span></div>
    <div class="detail-row"><span class="detail-label">Consommation</span><span class="detail-value">${consumption.toFixed(1)}%</span></div>
    <div class="detail-row"><span class="detail-label">Distance</span><span class="detail-value">${trip.distanceKm} km</span></div>
    <div class="detail-row"><span class="detail-label">Conso / km</span><span class="detail-value">${trip.distanceKm > 0 ? (consumption / trip.distanceKm).toFixed(3) : '--'} %/km</span></div>
    <div class="detail-row"><span class="detail-label">Type de ride</span><span class="detail-value">${trip.rideType}</span></div>
    <div class="detail-row"><span class="detail-label">Roue</span><span class="detail-value">${wheel ? wheel.diameter + 'mm · ' + wheel.characteristic : 'N/A'}</span></div>
    <div class="modal-actions">
      <button class="btn btn-secondary flex-1" id="detail-edit-btn">Modifier</button>
    </div>
  `;
  document.getElementById('detail-close').onclick = closeModal;
  document.getElementById('detail-edit-btn').onclick = () => Trips.openTripForm(tripId);
  openModal();
};

// --- Rendu Dashboard ---
Trips.renderDashboard = async function () {
  const trips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
  const stats = Calc.computeStats(trips);

  document.getElementById('dash-total-km').innerHTML = `${stats.totalKm}<span class="unit">km</span>`;
  document.getElementById('dash-total-trips').textContent = stats.totalTrips;
  document.getElementById('dash-avg-consumption').innerHTML = stats.avgConsumptionPerKm !== null ? `${stats.avgConsumptionPerKm}<span class="unit">%/km</span>` : `--<span class="unit">%/km</span>`;
  document.getElementById('dash-avg-range').innerHTML = stats.avgDistancePerPercent !== null ? `${stats.avgDistancePerPercent}<span class="unit">km/%</span>` : `--<span class="unit">km/%</span>`;

  // Batterie actuelle estimée = batterie d'arrivée de la dernière sortie
  const sorted = [...trips].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const lastTrip = sorted[0];
  const gaugeFill = document.getElementById('dash-battery-fill');
  const gaugeValue = document.getElementById('dash-battery-value');
  const sublabel = document.getElementById('dash-battery-sublabel');
  const lastTripContainer = document.getElementById('dash-last-trip');
  const currentWheelContainer = document.getElementById('dash-current-wheel');

  if (lastTrip) {
    const pct = lastTrip.batteryEnd;
    gaugeFill.style.width = `${pct}%`;
    gaugeFill.style.background = pct < 25 ? 'var(--battery-low)' : pct < 55 ? 'var(--battery-mid)' : 'var(--battery-high)';
    gaugeValue.textContent = `${pct}%`;
    gaugeValue.style.color = pct < 25 ? 'var(--battery-low)' : pct < 55 ? 'var(--battery-mid)' : 'var(--battery-high)';
    sublabel.textContent = `Estimée d'après la dernière sortie du ${Calc.formatDateTime(lastTrip.timestamp)}`;

    const wheel = lastTrip.wheelId ? wheels.find(w => w.id === lastTrip.wheelId) : null;
    lastTripContainer.innerHTML = `
      <div class="detail-row"><span class="detail-label">Distance</span><span class="detail-value">${lastTrip.distanceKm} km</span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${lastTrip.rideType}</span></div>
      <div class="detail-row"><span class="detail-label">Consommation</span><span class="detail-value">${(lastTrip.batteryStart - lastTrip.batteryEnd).toFixed(1)}%</span></div>
    `;
  } else {
    gaugeFill.style.width = '0%';
    gaugeValue.textContent = '--%';
    sublabel.textContent = 'Aucune sortie enregistrée';
    lastTripContainer.innerHTML = `<div class="empty-state" style="padding:20px"><p>Pas encore de sortie. Lance-toi avec le bouton +.</p></div>`;
  }

  const defaultWheel = wheels.find(w => w.isDefault);
  if (defaultWheel) {
    currentWheelContainer.innerHTML = `<span class="detail-label">Roue par défaut</span><span class="detail-value">${defaultWheel.diameter}mm · ${defaultWheel.characteristic}</span>`;
  } else {
    currentWheelContainer.innerHTML = `<span class="detail-label">Roue par défaut</span><span class="detail-value">Aucune</span>`;
  }
};

// --- Rendu Stats & graphiques ---
Trips.renderStats = async function () {
  renderPeriodSelector('stats-period-selector', 'stats-custom-range', currentStatsPeriod, (period) => {
    currentStatsPeriod = period;
    Trips.renderStats();
  });

  const trips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const filtered = Calc.filterByPeriod(trips, currentStatsPeriod, currentStatsCustomRange);
  const stats = Calc.computeStats(filtered);

  document.getElementById('stats-period-km').innerHTML = `${stats.totalKm}<span class="unit">km</span>`;
  document.getElementById('stats-period-trips').textContent = stats.totalTrips;
  document.getElementById('stats-period-consumption').innerHTML = stats.avgConsumptionPerKm !== null ? `${stats.avgConsumptionPerKm}<span class="unit">%/km</span>` : `--<span class="unit">%/km</span>`;
  document.getElementById('stats-period-range').innerHTML = stats.avgDistancePerPercent !== null ? `${stats.avgDistancePerPercent}<span class="unit">km/%</span>` : `--<span class="unit">km/%</span>`;

  const series = Calc.kmTimeSeries(filtered);
  Charts.lineChart(document.getElementById('chart-km'), series);

  const dist = Calc.rideTypeDistribution(filtered);
  Charts.donutChart(document.getElementById('chart-donut'), dist, { legendContainer: document.getElementById('chart-donut-legend') });

  document.getElementById('stats-apply-range').onclick = () => {
    const start = document.getElementById('stats-range-start').value;
    const end = document.getElementById('stats-range-end').value;
    if (start && end) {
      currentStatsCustomRange = { start, end };
      currentStatsPeriod = 'custom';
      Trips.renderStats();
    }
  };
};

// --- Rendu Cycles de charge ---
Trips.renderCharge = async function () {
  renderPeriodSelector('charge-period-selector', 'charge-custom-range', currentChargePeriod, (period) => {
    currentChargePeriod = period;
    Trips.renderCharge();
  });

  const trips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const allCycles = Calc.detectChargeCycles(trips);
  const filteredCycles = Calc.filterByPeriod(allCycles, currentChargePeriod, currentChargeCustomRange);

  const totalInjected = filteredCycles.reduce((sum, c) => sum + c.injected, 0);
  document.getElementById('charge-count').textContent = filteredCycles.length;
  document.getElementById('charge-total-injected').innerHTML = `${Math.round(totalInjected * 10) / 10}<span class="unit">%</span>`;

  const series = Calc.chargeTimeSeries(filteredCycles);
  Charts.chargeBandChart(document.getElementById('chart-charge'), series, { legendContainer: document.getElementById('chart-charge-legend') });

  const listContainer = document.getElementById('charge-list');
  if (filteredCycles.length === 0) {
    listContainer.innerHTML = `<div class="empty-state"><p>Aucun cycle de charge sur cette période.</p></div>`;
  } else {
    const sorted = [...filteredCycles].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    listContainer.innerHTML = sorted.map(c => `
      <div class="trip-item" style="cursor:default">
        <div class="trip-icon"><svg viewBox="0 0 24 24"><path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" stroke="var(--accent-green)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="trip-info">
          <div class="trip-date">${Calc.formatDateTime(c.timestamp)}</div>
          <div class="trip-meta">${c.fromPercent}% → ${c.toPercent}%</div>
        </div>
        <div class="trip-km">+${c.injected}<span class="unit"> %</span></div>
      </div>
    `).join('');
  }

  document.getElementById('charge-apply-range').onclick = () => {
    const start = document.getElementById('charge-range-start').value;
    const end = document.getElementById('charge-range-end').value;
    if (start && end) {
      currentChargeCustomRange = { start, end };
      currentChargePeriod = 'custom';
      Trips.renderCharge();
    }
  };
};

// --- Rendu Historique ---
Trips.renderHistory = async function () {
  const trips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const rideTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);

  const rideTypeSelect = document.getElementById('history-filter-ridetype');
  if (rideTypeSelect.options.length <= 1) {
    rideTypeSelect.innerHTML = `<option value="">Tous</option>` + rideTypes.map(rt => `<option value="${rt.name}">${rt.name}</option>`).join('');
  }

  let result = Calc.filterTrips(trips, currentHistoryFilters);

  const query = document.getElementById('history-search').value;
  if (query && query.trim() !== '') {
    const q = query.toLowerCase();
    result = result.filter(t => (t.rideType || '').toLowerCase().includes(q) || String(t.distanceKm).includes(q));
  }

  result = Calc.sortTrips(result, currentHistorySort.by, currentHistorySort.order);

  const listContainer = document.getElementById('history-list');
  if (result.length === 0) {
    listContainer.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
      <p>Aucune sortie ne correspond.</p>
    </div>`;
  } else {
    listContainer.innerHTML = result.map(t => {
      const consumption = (t.batteryStart - t.batteryEnd).toFixed(1);
      return `
      <div class="trip-item" data-trip-id="${t.id}">
        <div class="trip-icon"><svg viewBox="0 0 24 24"><path d="M5 17h14M7 17l2-7h6l2 7M9 10V7a3 3 0 016 0v3" stroke="var(--accent-amber)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="trip-info">
          <div class="trip-date">${Calc.formatDateTime(t.timestamp)}</div>
          <div class="trip-meta">${t.rideType} · ${t.batteryStart}% → ${t.batteryEnd}% (-${consumption}%)</div>
        </div>
        <div class="trip-km">${t.distanceKm}<span class="unit"> km</span></div>
      </div>
    `;
    }).join('');

    listContainer.querySelectorAll('.trip-item').forEach(el => {
      el.onclick = () => Trips.openTripDetail(parseInt(el.dataset.tripId));
    });
  }
};

// --- Sélecteur de période réutilisable ---
function renderPeriodSelector(selectorId, customRangeId, currentPeriod, onChange) {
  const container = document.getElementById(selectorId);
  const periods = [
    { key: 'total', label: 'Total' },
    { key: 'day', label: 'Aujourd\'hui' },
    { key: 'week', label: 'Cette semaine' },
    { key: 'month', label: 'Ce mois' },
    { key: 'custom', label: 'Période choisie' }
  ];
  container.innerHTML = periods.map(p => `<button class="period-pill ${currentPeriod === p.key ? 'active' : ''}" data-period="${p.key}">${p.label}</button>`).join('');

  const customRangeEl = document.getElementById(customRangeId);
  customRangeEl.classList.toggle('active', currentPeriod === 'custom');

  container.querySelectorAll('.period-pill').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.period === 'custom') {
        customRangeEl.classList.add('active');
        container.querySelectorAll('.period-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        onChange(btn.dataset.period);
      }
    };
  });
}

window.Trips = Trips;
