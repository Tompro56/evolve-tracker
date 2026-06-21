// ============================================================
// EVOLVE TRACKER - Module Base de données (IndexedDB)
// ============================================================

const DB_NAME = 'EvolveTrackerDB';
const DB_VERSION = 1;

const STORES = {
  TRIPS: 'trips',
  WHEELS: 'wheels',
  PARTS: 'parts',
  INTERVENTIONS: 'interventions',
  RIDE_TYPES: 'rideTypes',
  INTERVENTION_TYPES: 'interventionTypes',
  SETTINGS: 'settings'
};

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Trajets
      if (!db.objectStoreNames.contains(STORES.TRIPS)) {
        const tripsStore = db.createObjectStore(STORES.TRIPS, { keyPath: 'id', autoIncrement: true });
        tripsStore.createIndex('timestamp', 'timestamp', { unique: false });
        tripsStore.createIndex('rideType', 'rideType', { unique: false });
      }

      // Roues (CRUD)
      if (!db.objectStoreNames.contains(STORES.WHEELS)) {
        db.createObjectStore(STORES.WHEELS, { keyPath: 'id', autoIncrement: true });
      }

      // Parties du skate
      if (!db.objectStoreNames.contains(STORES.PARTS)) {
        db.createObjectStore(STORES.PARTS, { keyPath: 'id', autoIncrement: true });
      }

      // Interventions (entretien/remplacement)
      if (!db.objectStoreNames.contains(STORES.INTERVENTIONS)) {
        const interventionsStore = db.createObjectStore(STORES.INTERVENTIONS, { keyPath: 'id', autoIncrement: true });
        interventionsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Types de ride (paramétrable)
      if (!db.objectStoreNames.contains(STORES.RIDE_TYPES)) {
        db.createObjectStore(STORES.RIDE_TYPES, { keyPath: 'id', autoIncrement: true });
      }

      // Types d'intervention (paramétrable)
      if (!db.objectStoreNames.contains(STORES.INTERVENTION_TYPES)) {
        db.createObjectStore(STORES.INTERVENTION_TYPES, { keyPath: 'id', autoIncrement: true });
      }

      // Paramètres généraux (clé/valeur)
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// --- Opérations génériques ---

async function dbAdd(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Initialisation des données par défaut ---

async function initDefaultData() {
  // Roues par défaut
  const existingWheels = await dbGetAll(STORES.WHEELS);
  if (existingWheels.length === 0) {
    const defaultWheels = [
      { offroad: false, diameter: 175, characteristic: 'Route standard', isDefault: true },
      { offroad: true, diameter: 175, characteristic: 'Crampon tout terrain', isDefault: false },
      { offroad: false, diameter: 150, characteristic: 'Route', isDefault: false }
    ];
    for (const w of defaultWheels) {
      await dbAdd(STORES.WHEELS, w);
    }
  }

  // Types de ride par défaut
  const existingRideTypes = await dbGetAll(STORES.RIDE_TYPES);
  if (existingRideTypes.length === 0) {
    const defaultRideTypes = ['Cruise', 'Vitesse'];
    for (const rt of defaultRideTypes) {
      await dbAdd(STORES.RIDE_TYPES, { name: rt });
    }
  }

  // Types d'intervention par défaut
  const existingInterventionTypes = await dbGetAll(STORES.INTERVENTION_TYPES);
  if (existingInterventionTypes.length === 0) {
    const defaultTypes = ['Entretien', 'Remplacement', 'Révision Evolve'];
    for (const it of defaultTypes) {
      await dbAdd(STORES.INTERVENTION_TYPES, { name: it });
    }
  }

  // Parties du skate par défaut
  const existingParts = await dbGetAll(STORES.PARTS);
  if (existingParts.length === 0) {
    const defaultParts = [
      'Truck', 'Bushings', 'Roues', 'Courroie', 'Pignon moteur', 'Poulie roue',
      'Roulements', 'Chambre à air', 'Vis / écrous', 'Télécommande',
      'Batterie', 'ESC', 'Câblage', 'Coque / deck', 'Grip tape', 'Protections (pads)'
    ];
    for (const p of defaultParts) {
      await dbAdd(STORES.PARTS, { name: p });
    }
  }
}

window.EvolveDB = {
  STORES,
  openDB,
  dbAdd,
  dbPut,
  dbGet,
  dbGetAll,
  dbDelete,
  dbClear,
  initDefaultData
};
