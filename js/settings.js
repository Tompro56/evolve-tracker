// ============================================================
// RIDE TRACKER - Module Paramètres
// ============================================================

const Settings = {};

// --- ROUES (propres à l'appareil actif) ---
Settings.renderWheels = async function () {
  const deviceId = await Devices.getCurrentId();
  const wheels = (await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS)).filter(w => w.deviceId === deviceId);
  const container = document.getElementById('settings-wheels-list');

  if (wheels.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px"><p>Aucune roue configurée pour cet appareil.</p></div>`;
    return;
  }

  container.innerHTML = wheels.map(w => `
    <div class="settings-list-item">
      <div>
        <div class="label">${w.diameter}mm · ${w.characteristic}${w.isDefault ? '<span class="default-tag">Défaut</span>' : ''}</div>
        <div class="sublabel">${w.usage || 'Route'}</div>
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
      if (await confirmDialog('Supprimer cette roue ? Les trajets existants garderont leur référence.', { confirmLabel: 'Supprimer', danger: true })) {
        await EvolveDB.dbDelete(EvolveDB.STORES.WHEELS, parseInt(btn.dataset.id));
        showToast('Roue supprimée', 'success');
        Settings.renderWheels();
      }
    };
  });
};

Settings.openWheelForm = async function (wheelId = null) {
  const deviceId = await Devices.getCurrentId();
  let wheel = null;
  if (wheelId) wheel = await EvolveDB.dbGet(EvolveDB.STORES.WHEELS, wheelId);
  const usageTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEEL_TYPES);
  const currentUsage = wheel ? wheel.usage : null;

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${wheel ? 'Modifier la roue' : 'Nouvelle roue'}</h2>
      <button class="modal-close" id="wheel-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="form-group">
      <label class="form-label">Usage</label>
      <select class="form-input" id="wheel-usage">
        ${usageTypes.map(t => `<option value="${escapeHtmlSettings(t.name)}" ${t.name === currentUsage ? 'selected' : ''}>${escapeHtmlSettings(t.name)}</option>`).join('')}
        <option value="__new__">+ Nouvel usage...</option>
      </select>
    </div>
    <div class="form-group hidden" id="wheel-usage-new-group">
      <label class="form-label">Nom du nouvel usage</label>
      <input type="text" class="form-input" id="wheel-usage-new-name" placeholder="ex: Slick, Compétition...">
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

  const usageSelect = document.getElementById('wheel-usage');
  const usageNewGroup = document.getElementById('wheel-usage-new-group');
  usageSelect.onchange = () => {
    usageNewGroup.classList.toggle('hidden', usageSelect.value !== '__new__');
  };

  document.getElementById('wheel-form-close').onclick = closeModal;
  document.getElementById('wheel-save-btn').onclick = async () => {
    let usage = usageSelect.value;
    if (usage === '__new__') {
      const newName = document.getElementById('wheel-usage-new-name').value.trim();
      if (!newName) {
        showToast("Indique un nom pour le nouvel usage.", 'error');
        return;
      }
      const existing = usageTypes.find(t => t.name.toLowerCase() === newName.toLowerCase());
      usage = existing ? existing.name : newName;
      if (!existing) {
        await EvolveDB.dbAdd(EvolveDB.STORES.WHEEL_TYPES, { name: newName });
      }
    }

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
      const allWheels = (await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS)).filter(w => w.deviceId === deviceId);
      for (const w of allWheels) {
        if (!wheelId || w.id !== wheelId) {
          w.isDefault = false;
          await EvolveDB.dbPut(EvolveDB.STORES.WHEELS, w);
        }
      }
    }

    const data = { usage, diameter, characteristic, isDefault };
    if (wheelId) {
      data.id = wheelId;
      data.deviceId = wheel && wheel.deviceId !== undefined ? wheel.deviceId : deviceId;
      await EvolveDB.dbPut(EvolveDB.STORES.WHEELS, data);
    } else {
      data.deviceId = deviceId;
      await EvolveDB.dbAdd(EvolveDB.STORES.WHEELS, data);
    }
    closeModal();
    showToast('Roue enregistrée', 'success');
    Settings.renderWheels();
  };

  openModal();
};

// --- TYPES DE RIDE (global, partagé entre tous les appareils) ---
Settings.renderRideTypes = async function () {
  const items = await EvolveDB.dbGetAll(EvolveDB.STORES.RIDE_TYPES);
  renderSimpleList('settings-ridetypes-list', items, EvolveDB.STORES.RIDE_TYPES, Settings.renderRideTypes, false);
};

// --- TYPES D'INTERVENTION (global, partagé entre tous les appareils) ---
Settings.renderInterventionTypes = async function () {
  const items = await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTION_TYPES);
  renderSimpleList('settings-interventiontypes-list', items, EvolveDB.STORES.INTERVENTION_TYPES, Settings.renderInterventionTypes, false);
};

// --- USAGES DE ROUE (global, partagé entre tous les appareils) ---
Settings.renderWheelTypes = async function () {
  const items = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEEL_TYPES);
  renderSimpleList('settings-wheeltypes-list', items, EvolveDB.STORES.WHEEL_TYPES, Settings.renderWheelTypes, false);
};

// --- PIÈCES (propres à l'appareil actif) ---
Settings.renderParts = async function () {
  const deviceId = await Devices.getCurrentId();
  const items = (await EvolveDB.dbGetAll(EvolveDB.STORES.PARTS)).filter(p => p.deviceId === deviceId);
  renderSimpleList('settings-parts-list', items, EvolveDB.STORES.PARTS, Settings.renderParts, true);
};

// --- Helper générique pour listes simples (nom uniquement, éditable) ---
// deviceScoped : si true, l'ajout stampe deviceId = appareil actif (utilisé pour les pièces)
function renderSimpleList(containerId, items, storeName, refreshCallback, deviceScoped) {
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
    btn.onclick = () => openSimpleItemForm(storeName, parseInt(btn.dataset.id), refreshCallback, deviceScoped);
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = async () => {
      if (await confirmDialog('Supprimer cet élément ?', { confirmLabel: 'Supprimer', danger: true })) {
        await EvolveDB.dbDelete(storeName, parseInt(btn.dataset.id));
        showToast('Élément supprimé', 'success');
        refreshCallback();
      }
    };
  });
}

async function openSimpleItemForm(storeName, itemId, refreshCallback, deviceScoped) {
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
      if (deviceScoped) data.deviceId = item && item.deviceId !== undefined ? item.deviceId : await Devices.getCurrentId();

      // Cascade : renommer un type de roue doit propager aux roues qui le référencent par chaîne.
      // WHEELS.usage stocke le libellé, pas un id. On met à jour toutes les roues concernées.
      // La suppression d'un type reste non destructive (la chaîne sur la roue survit au type supprimé).
      if (storeName === EvolveDB.STORES.WHEEL_TYPES && item && item.name !== name) {
        const oldName = item.name;
        const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
        const affected = wheels.filter(w => w.usage === oldName);
        if (affected.length > 0) {
          const ok = await confirmDialog(
            `Ce type est utilisé par ${affected.length} roue${affected.length > 1 ? 's' : ''}. Le renommer mettra à jour ${affected.length > 1 ? 'leur configuration' : 'sa configuration'} en base.`,
            { title: 'Renommer le type', confirmLabel: 'Renommer', cancelLabel: 'Annuler' }
          );
          if (!ok) return;
          for (const w of affected) {
            w.usage = name;
            await EvolveDB.dbPut(EvolveDB.STORES.WHEELS, w);
          }
        }
      }

      await EvolveDB.dbPut(storeName, data);
    } else {
      if (deviceScoped) data.deviceId = await Devices.getCurrentId();
      await EvolveDB.dbAdd(storeName, data);
    }
    closeModal();
    showToast('Enregistré', 'success');
    refreshCallback();
  };

  openModal();
}

Settings.openSimpleItemFormNew = function (storeName, refreshCallback) {
  const deviceScoped = storeName === EvolveDB.STORES.PARTS;
  openSimpleItemForm(storeName, null, refreshCallback, deviceScoped);
};

// ============================================================
// APPAREILS (onglet Utilisateur : administration, pas la config technique)
// ============================================================
Settings.renderDevices = async function () {
  const devices = await Devices.getAll();
  const currentId = await Devices.getCurrentId();
  const container = document.getElementById('settings-devices-list');

  container.innerHTML = devices.map(d => `
    <div class="settings-list-item">
      <div>
        <div class="label">${escapeHtmlSettings(d.name)}${d.id === currentId ? '<span class="default-tag">Actif</span>' : ''}</div>
        <div class="sublabel">${[d.brand, d.model].filter(Boolean).join(' · ') || 'Marque/modèle non renseignés'}${d.acquisitionYear ? ' · ' + d.acquisitionYear : ''}</div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm btn-icon" data-action="edit" data-id="${d.id}"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="btn btn-danger btn-sm btn-icon" data-action="delete" data-id="${d.id}"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = () => Settings.openDeviceForm(parseInt(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const device = devices.find(d => d.id === id);
      if (devices.length <= 1) {
        showToast('Impossible de supprimer le dernier appareil restant.', 'error');
        return;
      }
      const ok = await confirmDialog(
        `Supprimer "${escapeHtmlSettings(device ? device.name : '')}" ? Toutes ses sorties, interventions, roues et pièces seront supprimées définitivement. Action irréversible.`,
        { confirmLabel: 'Supprimer', danger: true }
      );
      if (!ok) return;
      try {
        await Devices.deleteCascade(id);
        showToast('Appareil supprimé', 'success');
        if (window.refreshDeviceSwitcher) await window.refreshDeviceSwitcher();
        await Settings.renderDevices();
        if (window.App && window.App.refreshCurrentView) await window.App.refreshCurrentView();
      } catch (e) {
        showToast('Impossible de supprimer le dernier appareil restant.', 'error');
      }
    };
  });
};

Settings.openDeviceForm = async function (deviceId = null) {
  let device = null;
  if (deviceId) device = await Devices.get(deviceId);

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${device ? 'Modifier l\'appareil' : 'Ajouter un appareil'}</h2>
      <button class="modal-close" id="device-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="form-group">
      <label class="form-label">Nom</label>
      <input type="text" class="form-input" id="device-name" value="${device ? escapeHtmlSettings(device.name) : ''}" placeholder="ex: Mon GTR, Trottinette de secours...">
    </div>
    <div class="form-group">
      <label class="form-label">Marque</label>
      <input type="text" class="form-input" id="device-brand" value="${device ? escapeHtmlSettings(device.brand || '') : ''}" placeholder="ex: Evolve, Xiaomi, Inmotion...">
    </div>
    <div class="form-group">
      <label class="form-label">Modèle</label>
      <input type="text" class="form-input" id="device-model" value="${device ? escapeHtmlSettings(device.model || '') : ''}" placeholder="ex: Bamboo GTR">
    </div>
    <div class="form-group">
      <label class="form-label">Année d'acquisition</label>
      <input type="number" class="form-input mono" id="device-year" min="1990" max="2100" step="1" value="${device && device.acquisitionYear ? device.acquisitionYear : ''}" placeholder="ex: 2024">
    </div>
    <div class="form-group">
      <label class="form-label">Kilométrage initial (si occasion)</label>
      <div class="input-with-unit">
        <input type="number" class="form-input mono" id="device-initialkm" min="0" step="0.1" value="${device && device.initialKm ? device.initialKm : ''}" placeholder="0">
        <span class="unit-suffix">km</span>
      </div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">Ajouté au kilométrage suivi par l'app pour avoir un total réel si l'appareil n'est pas neuf.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary flex-1" id="device-save-btn">Enregistrer</button>
    </div>
  `;

  document.getElementById('device-form-close').onclick = closeModal;
  document.getElementById('device-save-btn').onclick = async () => {
    const name = document.getElementById('device-name').value.trim();
    if (!name) {
      showToast('Le nom de l\'appareil ne peut pas être vide.', 'error');
      return;
    }
    const brand = document.getElementById('device-brand').value.trim();
    const model = document.getElementById('device-model').value.trim();
    const yearVal = parseInt(document.getElementById('device-year').value);
    const acquisitionYear = isNaN(yearVal) ? null : yearVal;
    const kmVal = parseFloat(document.getElementById('device-initialkm').value);
    const initialKm = isNaN(kmVal) ? 0 : kmVal;

    if (deviceId) {
      await Devices.update({ id: deviceId, uuid: device.uuid, name, brand, model, acquisitionYear, initialKm, createdAt: device.createdAt });
      showToast('Appareil modifié', 'success');
    } else {
      await Devices.create({ name, brand, model, acquisitionYear, initialKm });
      showToast('Appareil ajouté', 'success');
    }
    closeModal();
    if (window.refreshDeviceSwitcher) await window.refreshDeviceSwitcher();
    await Settings.renderDevices();
  };

  openModal();
};

// ============================================================
// PROFIL UTILISATEUR (global)
// ============================================================
Settings.renderUserProfile = async function () {
  const riderName = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, 'riderName');
  const exportReminderDays = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, 'exportReminderDays');
  const lastExportAt = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, 'lastExportAt');

  document.getElementById('profile-rider-name').value = riderName ? riderName.value : '';
  document.getElementById('profile-export-reminder-days').value = exportReminderDays ? exportReminderDays.value : 0;
  document.getElementById('profile-last-export').textContent = lastExportAt && lastExportAt.value
    ? `Dernier export : ${Calc.formatDateTime(lastExportAt.value)}`
    : 'Dernier export : jamais';
};

Settings.saveUserProfile = async function () {
  const riderName = document.getElementById('profile-rider-name').value.trim();
  let exportReminderDays = parseInt(document.getElementById('profile-export-reminder-days').value);
  if (isNaN(exportReminderDays) || exportReminderDays < 0) exportReminderDays = 0;

  await EvolveDB.dbPut(EvolveDB.STORES.SETTINGS, { key: 'riderName', value: riderName });
  await EvolveDB.dbPut(EvolveDB.STORES.SETTINGS, { key: 'exportReminderDays', value: exportReminderDays });
  showToast('Profil enregistré', 'success');
  if (window.refreshExportReminder) await window.refreshExportReminder();
};

function escapeHtmlSettings(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
