// ============================================================
// EVOLVE TRACKER - Module Paramètres
// ============================================================

const Settings = {};

// --- ROUES ---
Settings.renderWheels = async function () {
  const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
  const container = document.getElementById('settings-wheels-list');

  if (wheels.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px"><p>Aucune roue configurée.</p></div>`;
    return;
  }

  container.innerHTML = wheels.map(w => `
    <div class="settings-list-item">
      <div>
        <div class="label">${w.diameter}mm · ${w.characteristic}${w.isDefault ? '<span class="default-tag">Défaut</span>' : ''}</div>
        <div class="sublabel">${w.offroad ? 'Tout terrain' : 'Street / route'}</div>
      </div>
      <div class="actions">
        ${!w.isDefault ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="default" data-id="${w.id}" title="Définir par défaut"><svg viewBox="0 0 24 24"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></button>` : ''}
        <button class="btn btn-secondary btn-sm btn-icon" data-action="edit" data-id="${w.id}"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="btn btn-danger btn-sm btn-icon" data-action="delete" data-id="${w.id}"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="default"]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      for (const w of wheels) {
        w.isDefault = w.id === id;
        await EvolveDB.dbPut(EvolveDB.STORES.WHEELS, w);
      }
      showToast('Roue par défaut mise à jour', 'success');
      Settings.renderWheels();
    };
  });
  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = () => Settings.openWheelForm(parseInt(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Supprimer cette roue ? Les trajets existants garderont leur référence.')) {
        await EvolveDB.dbDelete(EvolveDB.STORES.WHEELS, parseInt(btn.dataset.id));
        showToast('Roue supprimée', 'success');
        Settings.renderWheels();
      }
    };
  });
};

Settings.openWheelForm = async function (wheelId = null) {
  let wheel = null;
  if (wheelId) wheel = await EvolveDB.dbGet(EvolveDB.STORES.WHEELS, wheelId);

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${wheel ? 'Modifier la roue' : 'Nouvelle roue'}</h2>
      <button class="modal-close" id="wheel-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="checkbox-row" style="margin-bottom:16px">
      <input type="checkbox" id="wheel-offroad" ${wheel && wheel.offroad ? 'checked' : ''}>
      <label for="wheel-offroad">Tout terrain (sinon street / route)</label>
    </div>
    <div class="form-group">
      <label class="form-label">Diamètre</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="wheel-diameter" min="1" step="1" value="${wheel ? wheel.diameter : ''}" placeholder="ex: 175">
        <span class="unit-suffix">mm</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Caractéristique</label>
      <input type="text" class="form-input" id="wheel-characteristic" value="${wheel ? wheel.characteristic : ''}" placeholder="ex: crampon, slick, route...">
    </div>
    <div class="checkbox-row" style="margin-bottom:16px">
      <input type="checkbox" id="wheel-default" ${wheel && wheel.isDefault ? 'checked' : ''}>
      <label for="wheel-default">Définir comme roue par défaut</label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary flex-1" id="wheel-save-btn">Enregistrer</button>
    </div>
  `;

  document.getElementById('wheel-form-close').onclick = closeModal;
  document.getElementById('wheel-save-btn').onclick = async () => {
    const offroad = document.getElementById('wheel-offroad').checked;
    const diameter = parseFloat(document.getElementById('wheel-diameter').value);
    const characteristic = document.getElementById('wheel-characteristic').value.trim();
    const isDefault = document.getElementById('wheel-default').checked;

    if (isNaN(diameter) || diameter <= 0) {
      showToast('Le diamètre doit être un nombre valide.', 'error');
      return;
    }
    if (!characteristic) {
      showToast('Indique une caractéristique.', 'error');
      return;
    }

    if (isDefault) {
      const allWheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
      for (const w of allWheels) {
        if (!wheelId || w.id !== wheelId) {
          w.isDefault = false;
          await EvolveDB.dbPut(EvolveDB.STORES.WHEELS, w);
        }
      }
    }

    const data = { offroad, diameter, characteristic, isDefault };
    if (wheelId) {
      data.id = wheelId;
      await EvolveDB.dbPut(EvolveDB.STORES.WHEELS, data);
    } else {
      await EvolveDB.dbAdd(EvolveDB.STORES.WHEELS, data);
    }
    closeModal();
    showToast('Roue enregistrée', 'success');
    Settings.renderWheels();
  };

  openModal();
};

// --- TYPES DE RIDE ---
Settings.renderRideTypes = async function () {
  const items = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  renderSimpleList('settings-ridetypes-list', items, EvolveDB.STORES.RIDE_TYPES, Settings.renderRideTypes);
};

// --- TYPES D'INTERVENTION ---
Settings.renderInterventionTypes = async function () {
  const items = await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTION_TYPES);
  renderSimpleList('settings-interventiontypes-list', items, EvolveDB.STORES.INTERVENTION_TYPES, Settings.renderInterventionTypes);
};

// --- PARTIES DU SKATE ---
Settings.renderParts = async function () {
  const items = await EvolveDB.dbGetAll(EvolveDB.STORES.PARTS);
  renderSimpleList('settings-parts-list', items, EvolveDB.STORES.PARTS, Settings.renderParts);
};

// --- Helper générique pour listes simples (nom uniquement, éditable) ---
function renderSimpleList(containerId, items, storeName, refreshCallback) {
  const container = document.getElementById(containerId);

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px"><p>Aucun élément.</p></div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="settings-list-item">
      <div class="label">${item.name}</div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm btn-icon" data-action="edit" data-id="${item.id}"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="btn btn-danger btn-sm btn-icon" data-action="delete" data-id="${item.id}"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = () => openSimpleItemForm(storeName, parseInt(btn.dataset.id), refreshCallback);
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Supprimer cet élément ?')) {
        await EvolveDB.dbDelete(storeName, parseInt(btn.dataset.id));
        showToast('Élément supprimé', 'success');
        refreshCallback();
      }
    };
  });
}

async function openSimpleItemForm(storeName, itemId, refreshCallback) {
  let item = null;
  if (itemId) item = await EvolveDB.dbGet(storeName, itemId);

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${item ? 'Modifier' : 'Ajouter'}</h2>
      <button class="modal-close" id="simple-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="form-group">
      <label class="form-label">Nom</label>
      <input type="text" class="form-input" id="simple-name-input" value="${item ? item.name : ''}" placeholder="Nom">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary flex-1" id="simple-save-btn">Enregistrer</button>
    </div>
  `;

  document.getElementById('simple-form-close').onclick = closeModal;
  document.getElementById('simple-save-btn').onclick = async () => {
    const name = document.getElementById('simple-name-input').value.trim();
    if (!name) {
      showToast('Le nom ne peut pas être vide.', 'error');
      return;
    }
    const data = { name };
    if (itemId) {
      data.id = itemId;
      await EvolveDB.dbPut(storeName, data);
    } else {
      await EvolveDB.dbAdd(storeName, data);
    }
    closeModal();
    showToast('Enregistré', 'success');
    refreshCallback();
  };

  openModal();
}

Settings.openSimpleItemFormNew = function (storeName, refreshCallback) {
  openSimpleItemForm(storeName, null, refreshCallback);
};

// --- Export CSV ---
Settings.exportTripsCSV = async function () {
  const trips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);

  if (trips.length === 0) {
    showToast('Aucune sortie à exporter.', 'error');
    return;
  }

  const sorted = [...trips].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let csv = 'Date;Heure;Batterie depart (%);Batterie arrivee (%);Consommation (%);Distance (km);Conso par km (%/km);Type de ride;Roue\n';

  sorted.forEach(t => {
    const d = new Date(t.timestamp);
    const date = d.toLocaleDateString('fr-FR');
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const consumption = (t.batteryStart - t.batteryEnd).toFixed(1);
    const perKm = t.distanceKm > 0 ? (consumption / t.distanceKm).toFixed(3) : '';
    const wheel = wheels.find(w => w.id === t.wheelId);
    const wheelLabel = wheel ? `${wheel.diameter}mm ${wheel.characteristic}` : '';
    csv += `${date};${heure};${t.batteryStart};${t.batteryEnd};${consumption};${t.distanceKm};${perKm};${t.rideType};${wheelLabel}\n`;
  });

  downloadCSV(csv, `evolve_tracker_trajets_${dateStamp()}.csv`);
};

Settings.exportMaintenanceCSV = async function () {
  const interventions = await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTIONS);

  if (interventions.length === 0) {
    showToast('Aucune intervention à exporter.', 'error');
    return;
  }

  const sorted = [...interventions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let csv = 'Date;Heure;Types;Parties;Budget total (EUR);Commentaire general\n';

  sorted.forEach(i => {
    const d = new Date(i.timestamp);
    const date = d.toLocaleDateString('fr-FR');
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const types = i.interventionTypes.join(' / ');
    const parts = i.parts.map(p => p.partName).join(' / ');
    csv += `${date};${heure};${types};${parts};${i.totalBudget.toFixed(2)};${(i.generalComment || '').replace(/;/g, ',')}\n`;
  });

  downloadCSV(csv, `evolve_tracker_entretien_${dateStamp()}.csv`);
};

function dateStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

window.Settings = Settings;
