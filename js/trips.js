// ============================================================
// RIDE TRACKER - Module Trajets
// ============================================================

const Trips = {};

let currentHistorySort = { by: 'date', order: 'desc' };
let currentHistoryFilters = {};
let currentStatsPeriod = 'total';
let currentStatsCustomRange = null;
let currentChargePeriod = 'total';
let currentChargeCustomRange = null;

// ============================================================
// RIDE EN COURS (démarré sans complétion immédiate)
// ============================================================
// Depuis le multi-appareil : une entrée possible par appareil (clé = deviceId), pas une seule
// clé fixe globale. Permet à deux appareils différents d'avoir chacun un ride en attente.

Trips.getRideInProgress = async function (deviceId) {
  const id = deviceId !== undefined ? deviceId : await Devices.getCurrentId();
  if (id === null || id === undefined) return null;
  try {
    const rip = await EvolveDB.dbGet(EvolveDB.STORES.RIDE_IN_PROGRESS, id);
    return rip || null;
  } catch (e) {
    return null;
  }
};

Trips.saveRideInProgress = async function (data) {
  const deviceId = await Devices.getCurrentId();
  data.key = deviceId;
  data.deviceId = deviceId;
  await EvolveDB.dbPut(EvolveDB.STORES.RIDE_IN_PROGRESS, data);
};

Trips.clearRideInProgress = async function (deviceId) {
  const id = deviceId !== undefined ? deviceId : await Devices.getCurrentId();
  await EvolveDB.dbDelete(EvolveDB.STORES.RIDE_IN_PROGRESS, id);
};

// --- Formulaire "Démarrer un ride" : ne demande que la batterie de départ (+ options) ---
Trips.openStartRideForm = async function () {
  const deviceId = await Devices.getCurrentId();
  const wheels = (await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS)).filter(w => w.deviceId === deviceId);
  const rideTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  const defaultWheel = wheels.find(w => w.isDefault) || wheels[0];
  const lastFinished = await Trips.getLastTrip(deviceId);
  const prefilledStartBattery = lastFinished ? lastFinished.batteryEnd : '';

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>Démarrer un ride</h2>
      <button class="modal-close" id="start-ride-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>

    <div class="form-group">
      <label class="form-label">Batterie au départ</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="start-battery" min="0" max="100" step="0.1" value="${prefilledStartBattery}" placeholder="ex: 85" autofocus>
        <span class="unit-suffix">%</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Type de ride (optionnel, modifiable à la complétion)</label>
      <select class="form-select" id="start-ridetype">
        ${rideTypes.map(rt => `<option value="${rt.name}">${rt.name}</option>`).join('')}
      </select>
    </div>

    ${wheels.length > 0 ? `
    <div class="form-group">
      <label class="form-label">Roue (optionnel, modifiable à la complétion)</label>
      <select class="form-select" id="start-wheel">
        ${wheels.map(w => `<option value="${w.id}" ${defaultWheel && defaultWheel.id === w.id ? 'selected' : ''}>${w.diameter}mm · ${w.characteristic}${w.usage ? ' (' + w.usage + ')' : ''}</option>`).join('')}
      </select>
    </div>
    ` : ''}

    <div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:16px">L'heure de départ est enregistrée automatiquement. Tu complèteras l'arrivée et la distance au retour.</div>

    <div class="modal-actions">
      <button class="btn btn-primary flex-1" id="start-ride-save-btn">Démarrer</button>
    </div>
  `;

  document.getElementById('start-ride-close').onclick = closeModal;
  document.getElementById('start-ride-save-btn').onclick = async () => {
    const batteryStart = parseFloat(document.getElementById('start-battery').value);
    if (isNaN(batteryStart) || batteryStart < 0 || batteryStart > 100) {
      showToast('Indique une batterie de départ valide (0 à 100%).', 'error');
      return;
    }
    const rideType = document.getElementById('start-ridetype').value;
    const wheelEl = document.getElementById('start-wheel');
    const wheelId = wheelEl ? parseInt(wheelEl.value) : null;
    const startTimestamp = new Date().toISOString();

    await Trips.saveRideInProgress({ batteryStart, rideType, wheelId, startTimestamp });
    closeModal();
    showToast('Ride démarré. Termine-le au retour.', 'success');
    if (window.refreshFabLabel) await window.refreshFabLabel();
    if (window.App && App.refreshCurrentView) await App.refreshCurrentView();
  };

  openModal();
};

// Dernier trajet terminé pour un appareil, le plus récent par date. Utilisé pour
// pré-remplir la batterie de départ d'une nouvelle sortie.
Trips.getLastTrip = async function (deviceId) {
  const trips = (await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS)).filter(t => t.deviceId === deviceId);
  if (trips.length === 0) return null;
  return [...trips].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
};

// Dernier trajet terminé s'il date d'aujourd'hui (jour calendaire local), sinon null.
// Détermine si l'option "Prolonger le dernier ride" doit apparaître dans le FAB.
Trips.getLastTripToday = async function (deviceId) {
  const last = await Trips.getLastTrip(deviceId);
  if (!last) return null;
  const now = new Date();
  const t = new Date(last.timestamp);
  const sameDay = now.getFullYear() === t.getFullYear() && now.getMonth() === t.getMonth() && now.getDate() === t.getDate();
  return sameDay ? last : null;
};

// Démarre un "ride en cours" qui, à sa complétion, sera fusionné dans le dernier
// trajet du jour plutôt que de créer un nouveau trajet. La batterie de départ reprend
// l'arrivée du dernier segment, type de ride et roue sont hérités (modifiables à la complétion).
Trips.startExtendRide = async function () {
  const deviceId = await Devices.getCurrentId();
  const lastTrip = await Trips.getLastTripToday(deviceId);
  if (!lastTrip) return;

  const ok = await confirmDialog(
    `Prolonger le trajet parti à ${Calc.formatDateTime(lastTrip.timestamp)} ? Le départ reprend à ${lastTrip.batteryEnd}%, la distance viendra s'ajouter au même trajet.`,
    { title: 'Prolonger le ride', confirmLabel: 'Prolonger' }
  );
  if (!ok) return;

  await Trips.saveRideInProgress({
    batteryStart: lastTrip.batteryEnd,
    rideType: lastTrip.rideType,
    wheelId: lastTrip.wheelId,
    startTimestamp: new Date().toISOString(),
    extendTripId: lastTrip.id
  });
  showToast('Ride prolongé. Termine-le au retour.', 'success');
  if (window.refreshFabLabel) await window.refreshFabLabel();
  if (window.App && App.refreshCurrentView) await App.refreshCurrentView();
};

// --- Formulaire de saisie / édition d'un trajet ---
// options.completingRideInProgress : true si on complète un ride démarré précédemment
Trips.openTripForm = async function (tripId = null, options = {}) {
  const deviceId = await Devices.getCurrentId();
  const wheels = (await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS)).filter(w => w.deviceId === deviceId);
  const rideTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  let trip = null;
  if (tripId) trip = await EvolveDB.dbGet(EvolveDB.STORES.TRIPS, tripId);

  let rideInProgress = null;
  if (options.completingRideInProgress) {
    rideInProgress = await Trips.getRideInProgress();
  }

  const defaultWheel = wheels.find(w => w.isDefault) || wheels[0];
  // Pré-remplissage : si c'est un ride en cours ou une édition, on garde la valeur existante.
  // Sinon (nouvelle sortie complète), on reprend l'arrivée du dernier trajet terminé, modifiable.
  let prefilledBatteryStart = rideInProgress ? rideInProgress.batteryStart : (trip ? trip.batteryStart : '');
  if (!rideInProgress && !trip) {
    const lastFinished = await Trips.getLastTrip(deviceId);
    if (lastFinished) prefilledBatteryStart = lastFinished.batteryEnd;
  }
  const prefilledRideType = rideInProgress ? rideInProgress.rideType : (trip ? trip.rideType : null);
  const prefilledWheelId = rideInProgress ? rideInProgress.wheelId : (trip ? trip.wheelId : (defaultWheel ? defaultWheel.id : null));
  const batteryStartLocked = !!rideInProgress;

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${rideInProgress ? (rideInProgress.extendTripId ? 'Terminer le ride prolongé' : 'Terminer le ride') : (trip ? 'Modifier la sortie' : 'Nouvelle sortie')}</h2>
      <button class="modal-close" id="trip-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>

    <div class="form-group">
      <label class="form-label">Batterie au départ${batteryStartLocked ? ' (verrouillée, ride démarré)' : ''}</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="trip-battery-start" min="0" max="100" step="0.1" value="${prefilledBatteryStart}" placeholder="ex: 85" ${batteryStartLocked ? 'readonly style="opacity:0.65"' : ''}>
        <span class="unit-suffix">%</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Batterie à l'arrivée</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="trip-battery-end" min="0" max="100" step="0.1" value="${trip ? trip.batteryEnd : ''}" placeholder="ex: 62" autofocus>
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
        ${rideTypes.map(rt => `<option value="${rt.name}" ${prefilledRideType === rt.name ? 'selected' : ''}>${rt.name}</option>`).join('')}
      </select>
    </div>

    ${wheels.length > 0 ? `
    <div class="form-group">
      <label class="form-label">Roue utilisée</label>
      <select class="form-select" id="trip-wheel">
        ${wheels.map(w => `<option value="${w.id}" ${prefilledWheelId === w.id ? 'selected' : ''}>${w.diameter}mm · ${w.characteristic}${w.usage ? ' (' + w.usage + ')' : ''}</option>`).join('')}
      </select>
    </div>
    ` : ''}

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
  document.getElementById('trip-save-btn').onclick = () => saveTripForm(tripId, { completingRideInProgress: options.completingRideInProgress });
  if (trip) {
    document.getElementById('trip-delete-btn').onclick = async () => {
      if (await confirmDialog('Supprimer cette sortie ?', { confirmLabel: 'Supprimer', danger: true })) {
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

async function saveTripForm(tripId, options = {}) {
  const batteryStart = parseFloat(document.getElementById('trip-battery-start').value);
  const batteryEnd = parseFloat(document.getElementById('trip-battery-end').value);
  const distanceKm = parseFloat(document.getElementById('trip-distance').value);
  const rideType = document.getElementById('trip-ridetype').value;
  const wheelEl = document.getElementById('trip-wheel');
  const wheelId = wheelEl ? parseInt(wheelEl.value) : null;

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
  let rideInProgress = null;
  if (options.completingRideInProgress) {
    rideInProgress = await Trips.getRideInProgress();
  }

  // Fusion "prolonger un ride" : pas de nouveau trajet, on cumule dans le trajet d'origine.
  // On relit le trajet d'origine à cet instant plutôt que de faire confiance à des valeurs
  // mises de côté au démarrage, pour rester la source unique de vérité.
  if (rideInProgress && rideInProgress.extendTripId) {
    const originalTrip = await EvolveDB.dbGet(EvolveDB.STORES.TRIPS, rideInProgress.extendTripId);
    if (!originalTrip) {
      showToast('Le trajet à prolonger est introuvable, il a peut-être été supprimé.', 'error');
      return;
    }
    const mergedTrip = {
      id: originalTrip.id,
      uuid: originalTrip.uuid,
      deviceId: originalTrip.deviceId,
      batteryStart: originalTrip.batteryStart,
      batteryEnd: batteryEnd,
      distanceKm: Math.round((originalTrip.distanceKm + distanceKm) * 100) / 100,
      rideType: rideType,
      wheelId: wheelId,
      timestamp: originalTrip.timestamp
    };
    await EvolveDB.dbPut(EvolveDB.STORES.TRIPS, mergedTrip);
    await Trips.clearRideInProgress();
    if (window.refreshFabLabel) await window.refreshFabLabel();
    showToast('Ride prolongé et fusionné', 'success');
    closeModal();
    App.refreshCurrentView();
    return;
  }

  if (tsInput) {
    timestamp = new Date(tsInput.value).toISOString();
  } else if (rideInProgress && rideInProgress.startTimestamp) {
    // On garde l'heure de départ réelle du ride démarré, pas l'heure de complétion
    timestamp = rideInProgress.startTimestamp;
  } else {
    timestamp = new Date().toISOString();
  }

  const tripData = { batteryStart, batteryEnd, distanceKm, rideType, wheelId, timestamp };

  if (tripId) {
    tripData.id = tripId;
    const existing = await EvolveDB.dbGet(EvolveDB.STORES.TRIPS, tripId);
    tripData.uuid = existing && existing.uuid ? existing.uuid : EvolveDB.generateUUID();
    tripData.deviceId = existing && existing.deviceId !== undefined ? existing.deviceId : await Devices.getCurrentId();
    await EvolveDB.dbPut(EvolveDB.STORES.TRIPS, tripData);
    showToast('Sortie modifiée', 'success');
  } else {
    tripData.uuid = EvolveDB.generateUUID();
    tripData.deviceId = await Devices.getCurrentId();
    await EvolveDB.dbAdd(EvolveDB.STORES.TRIPS, tripData);
    showToast(rideInProgress ? 'Ride terminé et enregistré' : 'Sortie enregistrée', 'success');
  }

  if (rideInProgress) {
    await Trips.clearRideInProgress();
    if (window.refreshFabLabel) await window.refreshFabLabel();
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
  const deviceId = await Devices.getCurrentId();
  const trips = (await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS)).filter(t => t.deviceId === deviceId);
  const wheels = (await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS)).filter(w => w.deviceId === deviceId);
  const stats = Calc.computeStats(trips);
  const totalKmWithOffset = await Devices.getTotalKm(deviceId);

  // Indicateur ride en cours, visible uniquement s'il y en a un pour CET appareil
  const rideInProgress = await Trips.getRideInProgress(deviceId);
  const ripBanner = document.getElementById('dash-ride-in-progress-banner');
  if (rideInProgress) {
    const isExtend = !!rideInProgress.extendTripId;
    ripBanner.innerHTML = `
      <div class="panel" style="border-color:var(--accent-amber);background:var(--accent-amber-dim)">
        <div class="flex-row" style="justify-content:space-between">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--accent-amber)">${isExtend ? 'Ride prolongé' : 'Ride en cours'}</div>
            <div style="font-size:12.5px;color:var(--text-secondary);margin-top:2px">${isExtend ? 'Reprise à' : 'Départ à'} ${Calc.formatDateTime(rideInProgress.startTimestamp)} · ${rideInProgress.batteryStart}%</div>
          </div>
          <div class="flex-row" style="gap:6px">
            <button class="btn btn-secondary btn-sm" id="dash-cancel-ride-btn">Annuler</button>
            <button class="btn btn-primary btn-sm" id="dash-finish-ride-btn">Terminer</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('dash-finish-ride-btn').onclick = () => Trips.openTripForm(null, { completingRideInProgress: true });
    document.getElementById('dash-cancel-ride-btn').onclick = () => window.cancelRideInProgress();
  } else {
    ripBanner.innerHTML = '';
  }

  const weekStats = Calc.computeStats(Calc.filterByPeriod(trips, 'week'));
  document.getElementById('dash-week-km').innerHTML = `${weekStats.totalKm}<span class="unit">km</span>`;
  document.getElementById('dash-total-km').innerHTML = `${Math.round(totalKmWithOffset * 100) / 100}<span class="unit">km</span>`;
  document.getElementById('dash-week-consumption').innerHTML = weekStats.avgConsumptionPerKm !== null ? `${weekStats.avgConsumptionPerKm}<span class="unit">%/km</span>` : `--<span class="unit">%/km</span>`;
  document.getElementById('dash-total-consumption').innerHTML = stats.avgConsumptionPerKm !== null ? `${stats.avgConsumptionPerKm}<span class="unit">%/km</span>` : `--<span class="unit">%/km</span>`;

  // Batterie actuelle estimée = batterie d'arrivée de la dernière sortie
  const lastTrip = await Trips.getLastTrip(deviceId);
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
    currentWheelContainer.innerHTML = `<span class="detail-label">Roue par défaut</span><span class="detail-value">${defaultWheel.diameter}mm · ${defaultWheel.characteristic}${defaultWheel.gear ? ' · Gear ' + defaultWheel.gear : ''}</span>`;
  } else {
    currentWheelContainer.innerHTML = `<span class="detail-label">Roue par défaut</span><span class="detail-value">Aucune</span>`;
  }

  // Autonomie estimée = batterie restante (dernière sortie) × km par % pour chaque tuile.
  // "Tout" = tous les trajets ; un type = restreint aux trajets de ce type.
  const rideTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  const autoSelect = document.getElementById('dash-autonomy-type');
  autoSelect.innerHTML = `<option value="">${I18n.t('autonomy_all')}</option>` + rideTypes.map(rt => `<option value="${rt.name}">${rt.name}</option>`).join('');
  const updateAutonomy = () => {
    const type = autoSelect.value || null;
    const subset = type ? trips.filter(t => t.rideType === type) : trips;
    const tiles = lastTrip ? Calc.autonomyTiles(subset, lastTrip.batteryEnd) : { mini: null, moyenne: null, maxi: null };
    document.getElementById('dash-autonomy-mini').textContent = tiles.mini !== null ? tiles.mini + ' km' : '--';
    document.getElementById('dash-autonomy-moyenne').textContent = tiles.moyenne !== null ? tiles.moyenne + ' km' : '--';
    document.getElementById('dash-autonomy-maxi').textContent = tiles.maxi !== null ? tiles.maxi + ' km' : '--';
  };
  autoSelect.onchange = updateAutonomy;
  updateAutonomy();
};

// --- Rendu Stats & graphiques ---
Trips.renderStats = async function () {
  renderPeriodSelector('stats-period-selector', 'stats-custom-range', currentStatsPeriod, (period) => {
    currentStatsPeriod = period;
    Trips.renderStats();
  });

  const deviceId = await Devices.getCurrentId();
  const trips = (await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS)).filter(t => t.deviceId === deviceId);
  const filtered = Calc.filterByPeriod(trips, currentStatsPeriod, currentStatsCustomRange);
  const stats = Calc.computeStats(filtered);

  document.getElementById('stats-period-km').innerHTML = `${stats.totalKm}<span class="unit">km</span>`;
  document.getElementById('stats-period-trips').textContent = stats.totalTrips;
  document.getElementById('stats-period-consumption').innerHTML = stats.avgConsumptionPerKm !== null ? `${stats.avgConsumptionPerKm}<span class="unit">%/km</span>` : `--<span class="unit">%/km</span>`;
  document.getElementById('stats-period-range').innerHTML = stats.avgDistancePerPercent !== null ? `${stats.avgDistancePerPercent}<span class="unit">km/%</span>` : `--<span class="unit">km/%</span>`;

  const series = Calc.kmTimeSeries(filtered);
  Charts.barChart(document.getElementById('chart-km'), series);

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

  const deviceId = await Devices.getCurrentId();
  const trips = (await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS)).filter(t => t.deviceId === deviceId);
  const allCycles = Calc.detectChargeCycles(trips);
  const filteredCycles = Calc.filterByPeriod(allCycles, currentChargePeriod, currentChargeCustomRange);

  const totalInjected = filteredCycles.reduce((sum, c) => sum + c.injected, 0);
  document.getElementById('charge-count').textContent = filteredCycles.length;
  const avgInjection = filteredCycles.length ? totalInjected / filteredCycles.length : 0;
  document.getElementById('charge-avg-injection').innerHTML = `${Math.round(avgInjection * 10) / 10}<span class="unit">%</span>`;

  // Tuiles moyennes : globales, non influencées par le sélecteur de période.
  const avg = Calc.avgBetweenCharges(allCycles);
  document.getElementById('charge-avg-km').innerHTML = avg.km !== null ? `${avg.km}<span class="unit">km</span>` : `--<span class="unit">km</span>`;
  document.getElementById('charge-avg-days').innerHTML = avg.days !== null ? `${avg.days}<span class="unit">j</span>` : `--<span class="unit">j</span>`;

  const series = Calc.chargeTimeSeries(filteredCycles);
  Charts.chargeBandChart(document.getElementById('chart-charge'), series, { legendContainer: document.getElementById('chart-charge-legend') });

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

// --- Rendu Historique / Activités (rides + charges fusionnés) ---
Trips.renderHistory = async function () {
  const deviceId = await Devices.getCurrentId();
  const trips = (await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS)).filter(t => t.deviceId === deviceId);
  const rideTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  const cycles = Calc.detectChargeCycles(trips);

  const rideTypeSelect = document.getElementById('history-filter-ridetype');
  if (rideTypeSelect.options.length <= 1) {
    rideTypeSelect.innerHTML = `<option value="">${I18n.t('all')}</option>` + rideTypes.map(rt => `<option value="${rt.name}">${rt.name}</option>`).join('');
  }

  let items = Calc.buildActivities(trips, cycles);
  items = Calc.filterActivities(items, currentHistoryFilters);

  const query = document.getElementById('history-search').value;
  if (query && query.trim() !== '') {
    const q = query.toLowerCase();
    items = items.filter(it => {
      if (it.kind === 'ride') return (it.rideType || '').toLowerCase().includes(q) || String(it.raw.distanceKm).includes(q);
      return 'charge'.includes(q) || String(it.raw.fromPercent).includes(q) || String(it.raw.toPercent).includes(q);
    });
  }

  items = Calc.sortActivities(items, currentHistorySort.by, currentHistorySort.order);

  const listContainer = document.getElementById('history-list');
  if (items.length === 0) {
    listContainer.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
      <p>Aucune activité ne correspond.</p>
    </div>`;
    return;
  }

  const plugSvg = `<svg class="charge-plug" viewBox="0 0 24 24"><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 01-10 0V8zM12 16v4" stroke="var(--accent-green)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const arrowSvg = `<svg class="charge-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  listContainer.innerHTML = items.map(it => {
    if (it.kind === 'charge') {
      const c = it.raw;
      return `
      <div class="trip-item charge-item">
        <div class="trip-icon"><svg viewBox="0 0 24 24"><path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" stroke="var(--accent-green)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="trip-info">
          <div class="trip-date">${Calc.formatDateTime(c.timestamp)}</div>
          <div class="trip-meta">${c.fromPercent}% → ${c.toPercent}%</div>
          <div class="charge-km-line">${c.kmSinceLastCharge} km ${arrowSvg} ${plugSvg}</div>
        </div>
        <div class="trip-km charge-injected">+${c.injected}<span class="unit"> %</span></div>
      </div>`;
    }
    const t = it.raw;
    const consumption = (t.batteryStart - t.batteryEnd).toFixed(1);
    return `
      <div class="trip-item" data-trip-id="${t.id}">
        <div class="trip-icon"><svg viewBox="0 0 24 24"><path d="M5 17h14M7 17l2-7h6l2 7M9 10V7a3 3 0 016 0v3" stroke="var(--accent-amber)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="trip-info">
          <div class="trip-date">${Calc.formatDateTime(t.timestamp)}</div>
          <div class="trip-meta">${t.rideType} · ${t.batteryStart}% → ${t.batteryEnd}% (-${consumption}%)</div>
        </div>
        <div class="trip-km">${t.distanceKm}<span class="unit"> km</span></div>
      </div>`;
  }).join('');

  listContainer.querySelectorAll('.trip-item[data-trip-id]').forEach(el => {
    el.onclick = () => Trips.openTripDetail(parseInt(el.dataset.tripId));
  });
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
