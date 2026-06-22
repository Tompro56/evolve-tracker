// ============================================================
// RIDE TRACKER - Module Appareils (multi-appareil)
// ============================================================
// Chaque appareil possède son propre historique (trips, interventions), ses propres
// roues et pièces. Seuls les types de ride/intervention et le profil utilisateur sont globaux.

const Devices = {};

Devices.getAll = async function () {
  const devices = await EvolveDB.dbGetAll(EvolveDB.STORES.DEVICES);
  return devices.sort((a, b) => (a.id || 0) - (b.id || 0));
};

Devices.get = async function (id) {
  return await EvolveDB.dbGet(EvolveDB.STORES.DEVICES, id);
};

Devices.create = async function (data) {
  data.uuid = EvolveDB.generateUUID();
  data.createdAt = new Date().toISOString();
  if (data.initialKm === undefined || data.initialKm === null || isNaN(data.initialKm)) data.initialKm = 0;
  return await EvolveDB.dbAdd(EvolveDB.STORES.DEVICES, data);
};

Devices.update = async function (data) {
  return await EvolveDB.dbPut(EvolveDB.STORES.DEVICES, data);
};

// Supprime un appareil et TOUTES ses données associées (trips, interventions, roues, pièces,
// ride en cours). Irréversible. Refuse de supprimer le dernier appareil restant.
Devices.deleteCascade = async function (deviceId) {
  const all = await Devices.getAll();
  if (all.length <= 1) {
    throw new Error('CANNOT_DELETE_LAST_DEVICE');
  }

  for (const storeName of [EvolveDB.STORES.TRIPS, EvolveDB.STORES.INTERVENTIONS, EvolveDB.STORES.WHEELS, EvolveDB.STORES.PARTS]) {
    const records = await EvolveDB.dbGetAll(storeName);
    for (const r of records) {
      if (r.deviceId === deviceId) {
        await EvolveDB.dbDelete(storeName, r.id);
      }
    }
  }

  // Ride en cours de cet appareil, le cas échéant (delete sur clé absente ne lève pas d'erreur)
  await EvolveDB.dbDelete(EvolveDB.STORES.RIDE_IN_PROGRESS, deviceId);

  await EvolveDB.dbDelete(EvolveDB.STORES.DEVICES, deviceId);

  const currentId = await Devices.getCurrentId();
  if (currentId === deviceId) {
    const remaining = await Devices.getAll();
    await Devices.setCurrentId(remaining[0].id);
  }
};

Devices.getCurrentId = async function () {
  const setting = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, 'currentDeviceId');
  return setting ? setting.value : null;
};

Devices.getCurrent = async function () {
  const id = await Devices.getCurrentId();
  if (id === null || id === undefined) return null;
  return await Devices.get(id);
};

Devices.setCurrentId = async function (id) {
  await EvolveDB.dbPut(EvolveDB.STORES.SETTINGS, { key: 'currentDeviceId', value: id });
};

// --- Total kilométrage d'un appareil : trajets enregistrés + kilométrage initial (occasion) ---
Devices.getTotalKm = async function (deviceId) {
  const device = await Devices.get(deviceId);
  const trips = await EvolveDB.dbGetAll(EvolveDB.STORES.TRIPS);
  const tripsKm = trips
    .filter(t => t.deviceId === deviceId)
    .reduce((sum, t) => sum + (t.distanceKm || 0), 0);
  return (device && device.initialKm ? device.initialKm : 0) + tripsKm;
};

window.Devices = Devices;
