// ============================================================
// RIDE TRACKER - Module CSV Import/Export (multi-appareil, avec UUID)
// ============================================================
// Format trajets : uuid;deviceUuid;timestamp(ISO);batteryStart;batteryEnd;distanceKm;rideType;wheelDiameter;wheelCharacteristic;wheelOffroad
// Format interventions : uuid;deviceUuid;timestamp(ISO);interventionTypes(|-separes);parts(JSON);totalBudget;generalComment

const CsvIO = {};

const CSV_SEP = ';';

function csvEscape(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (str.includes(CSV_SEP) || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Parseur CSV simple gérant les champs entre guillemets (pour le JSON des parts)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else {
        current += char;
      }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === CSV_SEP) { result.push(current); current = ''; }
      else current += char;
    }
  }
  result.push(current);
  return result;
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

function dateStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function markExported() {
  await EvolveDB.dbPut(EvolveDB.STORES.SETTINGS, { key: 'lastExportAt', value: new Date().toISOString() });
  if (window.refreshExportReminder) await window.refreshExportReminder();
}

// ============================================================
// SÉLECTEUR D'APPAREILS POUR L'EXPORT (cases à cocher, tout sélectionné par défaut)
// ============================================================
// kind : 'trips' | 'maintenance'
CsvIO.openExportDeviceSelector = async function (kind) {
  const devices = await Devices.getAll();
  const sheet = document.getElementById('modal-sheet');

  sheet.innerHTML = `
    <div class="modal-header">
      <h2 data-i18n="export_choose_devices">Choisir les appareils à exporter</h2>
      <button class="modal-close" id="export-select-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="checkbox-row" style="margin-bottom:14px;border-bottom:1px solid var(--border-subtle);padding-bottom:14px">
      <input type="checkbox" id="export-select-all" checked>
      <label for="export-select-all"><strong data-i18n="export_all_devices">Tous les appareils</strong></label>
    </div>
    <div id="export-device-checkboxes">
      ${devices.map(d => `
        <div class="checkbox-row" style="margin-bottom:10px">
          <input type="checkbox" class="export-device-checkbox" data-id="${d.id}" checked>
          <label data-id-label="${d.id}">${d.name}</label>
        </div>
      `).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary flex-1" id="export-confirm-btn" data-i18n="export_confirm">Exporter</button>
    </div>
  `;

  document.getElementById('export-select-close').onclick = closeModal;

  const allCheckbox = document.getElementById('export-select-all');
  const deviceCheckboxes = () => Array.from(sheet.querySelectorAll('.export-device-checkbox'));

  allCheckbox.onchange = () => {
    deviceCheckboxes().forEach(cb => { cb.checked = allCheckbox.checked; });
  };
  deviceCheckboxes().forEach(cb => {
    cb.onchange = () => {
      allCheckbox.checked = deviceCheckboxes().every(c => c.checked);
    };
  });

  document.getElementById('export-confirm-btn').onclick = async () => {
    const selectedIds = deviceCheckboxes().filter(cb => cb.checked).map(cb => parseInt(cb.dataset.id));
    if (selectedIds.length === 0) {
      showToast('Sélectionne au moins un appareil.', 'error');
      return;
    }
    closeModal();
    if (kind === 'trips') {
      await CsvIO.exportTrips(selectedIds);
    } else {
      await CsvIO.exportMaintenance(selectedIds);
    }
  };

  openModal();
};

// ============================================================
// EXPORT TRAJETS
// ============================================================
// deviceIds : tableau d'ids d'appareils à inclure. Si omis, exporte tous les appareils.
CsvIO.exportTrips = async function (deviceIds) {
  const allTrips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
  const devices = await Devices.getAll();
  const deviceById = new Map(devices.map(d => [d.id, d]));

  const trips = deviceIds ? allTrips.filter(t => deviceIds.includes(t.deviceId)) : allTrips;

  if (trips.length === 0) {
    showToast('Aucune sortie à exporter.', 'error');
    return;
  }

  const sorted = [...trips].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const header = ['uuid', 'deviceUuid', 'deviceName', 'timestamp', 'batteryStart', 'batteryEnd', 'distanceKm', 'rideType', 'wheelDiameter', 'wheelCharacteristic', 'wheelOffroad'];
  let csv = header.join(CSV_SEP) + '\n';

  sorted.forEach(t => {
    const wheel = wheels.find(w => w.id === t.wheelId);
    const device = deviceById.get(t.deviceId);
    const row = [
      t.uuid || '',
      device ? device.uuid : '',
      device ? device.name : '',
      t.timestamp,
      t.batteryStart,
      t.batteryEnd,
      t.distanceKm,
      t.rideType,
      wheel ? wheel.diameter : '',
      wheel ? wheel.characteristic : '',
      wheel ? (wheel.offroad ? '1' : '0') : ''
    ];
    csv += row.map(csvEscape).join(CSV_SEP) + '\n';
  });

  const suffix = deviceIds && deviceIds.length === 1 ? `_${(deviceById.get(deviceIds[0]) || {}).name || ''}`.replace(/[^a-z0-9_]/gi, '') : '';
  downloadCSV(csv, `ridetracker_trajets${suffix}_${dateStamp()}.csv`);
  await markExported();
};

// ============================================================
// EXPORT INTERVENTIONS
// ============================================================
CsvIO.exportMaintenance = async function (deviceIds) {
  const allInterventions = await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTIONS);
  const devices = await Devices.getAll();
  const deviceById = new Map(devices.map(d => [d.id, d]));

  const interventions = deviceIds ? allInterventions.filter(i => deviceIds.includes(i.deviceId)) : allInterventions;

  if (interventions.length === 0) {
    showToast('Aucune intervention à exporter.', 'error');
    return;
  }

  const sorted = [...interventions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const header = ['uuid', 'deviceUuid', 'deviceName', 'timestamp', 'interventionTypes', 'parts', 'totalBudget', 'generalComment'];
  let csv = header.join(CSV_SEP) + '\n';

  sorted.forEach(i => {
    const device = deviceById.get(i.deviceId);
    const row = [
      i.uuid || '',
      device ? device.uuid : '',
      device ? device.name : '',
      i.timestamp,
      i.interventionTypes.join('|'),
      JSON.stringify(i.parts),
      i.totalBudget,
      i.generalComment || ''
    ];
    csv += row.map(csvEscape).join(CSV_SEP) + '\n';
  });

  const suffix = deviceIds && deviceIds.length === 1 ? `_${(deviceById.get(deviceIds[0]) || {}).name || ''}`.replace(/[^a-z0-9_]/gi, '') : '';
  downloadCSV(csv, `ridetracker_entretien${suffix}_${dateStamp()}.csv`);
  await markExported();
};

// ============================================================
// LECTURE FICHIER CSV (commun)
// ============================================================
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

function parseCSV(text) {
  // Retire le BOM UTF-8 si présent
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { header, rows };
}

function rowToObject(header, row) {
  const obj = {};
  header.forEach((key, i) => { obj[key] = row[i] !== undefined ? row[i] : ''; });
  return obj;
}

// Résout l'appareil local correspondant à un deviceUuid importé.
// CSV pré-3.0 (sans colonne deviceUuid) ou uuid inconnu (install différente) -> appareil actif courant.
async function resolveImportDeviceId(deviceUuid, devices, currentDeviceId, warnedRef) {
  if (deviceUuid) {
    const match = devices.find(d => d.uuid === deviceUuid);
    if (match) return match.id;
    if (!warnedRef.shown) {
      warnedRef.shown = true;
      showToast('Appareil du CSV introuvable ici : rattaché à l\'appareil actif.', '');
    }
  }
  return currentDeviceId;
}

// --- Comparaison de deux trajets (hors uuid) pour détecter un vrai conflit ---
function tripsDiffer(a, b) {
  return (
    a.timestamp !== b.timestamp ||
    Number(a.batteryStart) !== Number(b.batteryStart) ||
    Number(a.batteryEnd) !== Number(b.batteryEnd) ||
    Number(a.distanceKm) !== Number(b.distanceKm) ||
    a.rideType !== b.rideType
  );
}

function interventionsDiffer(a, b) {
  return (
    a.timestamp !== b.timestamp ||
    Number(a.totalBudget) !== Number(b.totalBudget) ||
    JSON.stringify(a.interventionTypes) !== JSON.stringify(b.interventionTypes) ||
    JSON.stringify(a.parts) !== JSON.stringify(b.parts) ||
    (a.generalComment || '') !== (b.generalComment || '')
  );
}

// ============================================================
// IMPORT TRAJETS
// ============================================================
CsvIO.importTrips = async function (file) {
  let text;
  try {
    text = await readFileAsText(file);
  } catch (e) {
    showToast('Impossible de lire le fichier.', 'error');
    return;
  }

  const { header, rows } = parseCSV(text);
  if (rows.length === 0) {
    showToast('Fichier vide ou illisible.', 'error');
    return;
  }

  const requiredCols = ['uuid', 'timestamp', 'batteryStart', 'batteryEnd', 'distanceKm', 'rideType'];
  const missing = requiredCols.filter(c => !header.includes(c));
  if (missing.length > 0) {
    showToast(`Colonnes manquantes dans le CSV : ${missing.join(', ')}`, 'error');
    return;
  }

  const existingTrips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const existingByUuid = new Map(existingTrips.filter(t => t.uuid).map(t => [t.uuid, t]));
  const wheels = await EvolveDB.dbGetAll(EvolveDB.STORES.WHEELS);
  const devices = await Devices.getAll();
  const currentDeviceId = await Devices.getCurrentId();
  const warnedRef = { shown: false };

  let added = 0, unchanged = 0;
  const conflicts = [];
  const toInsert = [];

  for (const row of rows) {
    const obj = rowToObject(header, row);
    if (!obj.uuid) continue; // ligne invalide, ignorée

    const resolvedDeviceId = await resolveImportDeviceId(obj.deviceUuid, devices, currentDeviceId, warnedRef);

    // Résout ou crée la roue correspondante par diamètre + caractéristique, scopée à l'appareil résolu
    let wheelId = null;
    if (obj.wheelDiameter && obj.wheelCharacteristic) {
      const diameter = parseFloat(obj.wheelDiameter);
      const offroad = obj.wheelOffroad === '1';
      let wheel = wheels.find(w => w.deviceId === resolvedDeviceId && w.diameter === diameter && w.characteristic === obj.wheelCharacteristic && w.offroad === offroad);
      if (!wheel) {
        const newId = await EvolveDB.dbAdd(EvolveDB.STORES.WHEELS, { diameter, characteristic: obj.wheelCharacteristic, offroad, isDefault: false, deviceId: resolvedDeviceId });
        wheel = { id: newId };
        wheels.push({ id: newId, diameter, characteristic: obj.wheelCharacteristic, offroad, isDefault: false, deviceId: resolvedDeviceId });
      }
      wheelId = wheel.id;
    }

    const importedTrip = {
      uuid: obj.uuid,
      deviceId: resolvedDeviceId,
      timestamp: obj.timestamp,
      batteryStart: parseFloat(obj.batteryStart),
      batteryEnd: parseFloat(obj.batteryEnd),
      distanceKm: parseFloat(obj.distanceKm),
      rideType: obj.rideType,
      wheelId
    };

    const existing = existingByUuid.get(obj.uuid);
    if (!existing) {
      toInsert.push(importedTrip);
    } else if (!tripsDiffer(existing, importedTrip)) {
      unchanged++;
    } else {
      conflicts.push({ type: 'trip', existing, imported: importedTrip });
    }
  }

  for (const trip of toInsert) {
    await EvolveDB.dbAdd(EvolveDB.STORES.TRIPS, trip);
    added++;
  }

  if (conflicts.length > 0) {
    CsvIO.showConflictResolution(conflicts, { added, unchanged }, 'trip');
  } else {
    showToast(`Import terminé : ${added} ajoutée(s), ${unchanged} inchangée(s).`, 'success');
    App.refreshCurrentView();
  }
};

// ============================================================
// IMPORT INTERVENTIONS
// ============================================================
CsvIO.importMaintenance = async function (file) {
  let text;
  try {
    text = await readFileAsText(file);
  } catch (e) {
    showToast('Impossible de lire le fichier.', 'error');
    return;
  }

  const { header, rows } = parseCSV(text);
  if (rows.length === 0) {
    showToast('Fichier vide ou illisible.', 'error');
    return;
  }

  const requiredCols = ['uuid', 'timestamp', 'interventionTypes', 'parts', 'totalBudget'];
  const missing = requiredCols.filter(c => !header.includes(c));
  if (missing.length > 0) {
    showToast(`Colonnes manquantes dans le CSV : ${missing.join(', ')}`, 'error');
    return;
  }

  const existingInterventions = await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTIONS);
  const existingByUuid = new Map(existingInterventions.filter(i => i.uuid).map(i => [i.uuid, i]));
  const devices = await Devices.getAll();
  const currentDeviceId = await Devices.getCurrentId();
  const warnedRef = { shown: false };

  let added = 0, unchanged = 0;
  const conflicts = [];
  const toInsert = [];

  for (const row of rows) {
    const obj = rowToObject(header, row);
    if (!obj.uuid) continue;

    const resolvedDeviceId = await resolveImportDeviceId(obj.deviceUuid, devices, currentDeviceId, warnedRef);

    let parts = [];
    try { parts = JSON.parse(obj.parts); } catch (e) { parts = []; }

    const importedIntervention = {
      uuid: obj.uuid,
      deviceId: resolvedDeviceId,
      timestamp: obj.timestamp,
      interventionTypes: obj.interventionTypes ? obj.interventionTypes.split('|') : [],
      parts,
      totalBudget: parseFloat(obj.totalBudget) || 0,
      generalComment: obj.generalComment || ''
    };

    const existing = existingByUuid.get(obj.uuid);
    if (!existing) {
      toInsert.push(importedIntervention);
    } else if (!interventionsDiffer(existing, importedIntervention)) {
      unchanged++;
    } else {
      conflicts.push({ type: 'intervention', existing, imported: importedIntervention });
    }
  }

  for (const intervention of toInsert) {
    await EvolveDB.dbAdd(EvolveDB.STORES.INTERVENTIONS, intervention);
    added++;
  }

  if (conflicts.length > 0) {
    CsvIO.showConflictResolution(conflicts, { added, unchanged }, 'intervention');
  } else {
    showToast(`Import terminé : ${added} ajoutée(s), ${unchanged} inchangée(s).`, 'success');
    App.refreshCurrentView();
  }
};

// ============================================================
// POPUP DE RÉSOLUTION DE CONFLITS
// ============================================================
CsvIO.showConflictResolution = function (conflicts, summary, kind) {
  const sheet = document.getElementById('modal-sheet');

  const renderConflictRow = (conflict, idx) => {
    if (kind === 'trip') {
      const e = conflict.existing, i = conflict.imported;
      return `
        <div class="panel" style="padding:12px;margin-bottom:10px" data-conflict-idx="${idx}">
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;font-family:var(--font-mono)">UUID: ${e.uuid.slice(0, 8)}...</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:6px">Local (actuel)</div>
              <div style="font-size:13px;line-height:1.6">
                ${Calc.formatDateTime(e.timestamp)}<br>
                ${e.batteryStart}% → ${e.batteryEnd}%<br>
                ${e.distanceKm} km · ${e.rideType}
              </div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--accent-amber);text-transform:uppercase;margin-bottom:6px">Importé (CSV)</div>
              <div style="font-size:13px;line-height:1.6">
                ${Calc.formatDateTime(i.timestamp)}<br>
                ${i.batteryStart}% → ${i.batteryEnd}%<br>
                ${i.distanceKm} km · ${i.rideType}
              </div>
            </div>
          </div>
          <div class="segmented-control mt-8">
            <button class="conflict-choice active" data-choice="local" data-idx="${idx}">Garder local</button>
            <button class="conflict-choice" data-choice="import" data-idx="${idx}">Garder import</button>
          </div>
        </div>
      `;
    } else {
      const e = conflict.existing, i = conflict.imported;
      return `
        <div class="panel" style="padding:12px;margin-bottom:10px" data-conflict-idx="${idx}">
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;font-family:var(--font-mono)">UUID: ${e.uuid.slice(0, 8)}...</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:6px">Local (actuel)</div>
              <div style="font-size:13px;line-height:1.6">
                ${Calc.formatDateTime(e.timestamp)}<br>
                ${e.interventionTypes.join(', ')}<br>
                ${e.totalBudget.toFixed(2)} €
              </div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--accent-amber);text-transform:uppercase;margin-bottom:6px">Importé (CSV)</div>
              <div style="font-size:13px;line-height:1.6">
                ${Calc.formatDateTime(i.timestamp)}<br>
                ${i.interventionTypes.join(', ')}<br>
                ${i.totalBudget.toFixed(2)} €
              </div>
            </div>
          </div>
          <div class="segmented-control mt-8">
            <button class="conflict-choice active" data-choice="local" data-idx="${idx}">Garder local</button>
            <button class="conflict-choice" data-choice="import" data-idx="${idx}">Garder import</button>
          </div>
        </div>
      `;
    }
  };

  sheet.innerHTML = `
    <div class="modal-header">
      <h2>Conflits détectés (${conflicts.length})</h2>
      <button class="modal-close" id="conflict-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
      ${summary.added} ajoutée(s), ${summary.unchanged} inchangée(s). Pour chaque ligne ci-dessous, choisis quelle version garder.
    </div>
    <div id="conflict-list">
      ${conflicts.map((c, idx) => renderConflictRow(c, idx)).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary flex-1" id="conflict-confirm-btn">Valider mes choix</button>
    </div>
  `;

  const choices = new Array(conflicts.length).fill('local');

  sheet.querySelectorAll('.conflict-choice').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      const group = sheet.querySelector(`[data-conflict-idx="${idx}"]`).querySelectorAll('.conflict-choice');
      group.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      choices[idx] = btn.dataset.choice;
    };
  });

  document.getElementById('conflict-close').onclick = closeModal;
  document.getElementById('conflict-confirm-btn').onclick = async () => {
    let resolved = 0;
    for (let idx = 0; idx < conflicts.length; idx++) {
      if (choices[idx] === 'import') {
        const conflict = conflicts[idx];
        const dataToSave = { ...conflict.imported, id: conflict.existing.id };
        const storeName = kind === 'trip' ? EvolveDB.STORES.TRIPS : EvolveDB.STORES.INTERVENTIONS;
        await EvolveDB.dbPut(storeName, dataToSave);
        resolved++;
      }
    }
    closeModal();
    showToast(`Import terminé : ${summary.added} ajoutée(s), ${summary.unchanged} inchangée(s), ${resolved} mise(s) à jour.`, 'success');
    App.refreshCurrentView();
  };

  openModal();
};

window.CsvIO = CsvIO;
