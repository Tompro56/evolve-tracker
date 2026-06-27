// ============================================================
// RIDE TRACKER - Module Base de données (IndexedDB)
// ============================================================

const DB_NAME = 'EvolveTrackerDB'; // Nom technique conservé pour ne pas casser la migration des installations existantes
const DB_VERSION = 5; // v2 : uuid. v3 : ride en cours. v4 : multi-appareil. v5 : usages de roue administrables (remplace le booléen offroad)

const STORES = {
  TRIPS: 'trips',
  WHEELS: 'wheels',
  PARTS: 'parts',
  INTERVENTIONS: 'interventions',
  RIDE_TYPES: 'rideTypes',
  INTERVENTION_TYPES: 'interventionTypes',
  WHEEL_TYPES: 'wheelTypes',
  SETTINGS: 'settings',
  RIDE_IN_PROGRESS: 'rideInProgress',
  DEVICES: 'devices'
};

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;
      const oldVersion = event.oldVersion;

      // Trajets
      if (!db.objectStoreNames.contains(STORES.TRIPS)) {
        const tripsStore = db.createObjectStore(STORES.TRIPS, { keyPath: 'id', autoIncrement: true });
        tripsStore.createIndex('timestamp', 'timestamp', { unique: false });
        tripsStore.createIndex('rideType', 'rideType', { unique: false });
        tripsStore.createIndex('uuid', 'uuid', { unique: true });
      } else if (oldVersion < 2) {
        const tripsStore = tx.objectStore(STORES.TRIPS);
        if (!tripsStore.indexNames.contains('uuid')) {
          tripsStore.createIndex('uuid', 'uuid', { unique: true });
        }
      }

      // Roues (CRUD, propre à chaque appareil depuis v4)
      if (!db.objectStoreNames.contains(STORES.WHEELS)) {
        db.createObjectStore(STORES.WHEELS, { keyPath: 'id', autoIncrement: true });
      }

      // Pièces (CRUD, propre à chaque appareil depuis v4)
      if (!db.objectStoreNames.contains(STORES.PARTS)) {
        db.createObjectStore(STORES.PARTS, { keyPath: 'id', autoIncrement: true });
      }

      // Interventions (entretien/remplacement)
      if (!db.objectStoreNames.contains(STORES.INTERVENTIONS)) {
        const interventionsStore = db.createObjectStore(STORES.INTERVENTIONS, { keyPath: 'id', autoIncrement: true });
        interventionsStore.createIndex('timestamp', 'timestamp', { unique: false });
        interventionsStore.createIndex('uuid', 'uuid', { unique: true });
      } else if (oldVersion < 2) {
        const interventionsStore = tx.objectStore(STORES.INTERVENTIONS);
        if (!interventionsStore.indexNames.contains('uuid')) {
          interventionsStore.createIndex('uuid', 'uuid', { unique: true });
        }
      }

      // Types de ride (paramétrable, global, partagé entre tous les appareils)
      if (!db.objectStoreNames.contains(STORES.RIDE_TYPES)) {
        db.createObjectStore(STORES.RIDE_TYPES, { keyPath: 'id', autoIncrement: true });
      }

      // Types d'intervention (paramétrable, global, partagé entre tous les appareils)
      if (!db.objectStoreNames.contains(STORES.INTERVENTION_TYPES)) {
        db.createObjectStore(STORES.INTERVENTION_TYPES, { keyPath: 'id', autoIncrement: true });
      }

      // Paramètres généraux (clé/valeur) : utilisateur (global) + currentDeviceId
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Ride en cours : une entrée possible par appareil (clé = deviceId depuis v4, 'current' avant)
      if (!db.objectStoreNames.contains(STORES.RIDE_IN_PROGRESS)) {
        db.createObjectStore(STORES.RIDE_IN_PROGRESS, { keyPath: 'key' });
      }

      // Appareils (v4)
      if (!db.objectStoreNames.contains(STORES.DEVICES)) {
        const devicesStore = db.createObjectStore(STORES.DEVICES, { keyPath: 'id', autoIncrement: true });
        devicesStore.createIndex('uuid', 'uuid', { unique: true });
      }

      // Usages de roue : liste administrable globale (Tout terrain / Street / Route / ...), remplace
      // le booléen offroad qui ne permettait que 2 choix. Stocké en string libre sur la roue (pas de
      // clé étrangère) pour rester cohérent avec rideType/interventionTypes et résister à la suppression
      // d'un usage de la liste sans casser les roues qui l'utilisaient déjà.
      if (!db.objectStoreNames.contains(STORES.WHEEL_TYPES)) {
        db.createObjectStore(STORES.WHEEL_TYPES, { keyPath: 'id', autoIncrement: true });
      }

      // --- Migration v4 : multi-appareil ---
      // Ne s'applique qu'aux installations existantes (oldVersion > 0). Une install neuve (oldVersion === 0)
      // part sans appareil ; initDefaultData() lui en créera un générique vide au premier lancement.
      if (oldVersion > 0 && oldVersion < 4) {
        const devicesStore = tx.objectStore(STORES.DEVICES);
        const defaultDevice = {
          uuid: generateUUID(),
          name: 'Evolve Bamboo GTR',
          brand: 'Evolve',
          model: 'Bamboo GTR',
          acquisitionYear: null,
          initialKm: 0,
          createdAt: new Date().toISOString()
        };
        const addReq = devicesStore.add(defaultDevice);

        addReq.onsuccess = () => {
          const defaultDeviceId = addReq.result;

          // Rattache tout l'historique existant (trips, interventions, wheels, parts) à l'appareil par défaut
          [STORES.TRIPS, STORES.INTERVENTIONS, STORES.WHEELS, STORES.PARTS].forEach((storeName) => {
            const store = tx.objectStore(storeName);
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                const record = cursor.value;
                if (record.deviceId === undefined) {
                  record.deviceId = defaultDeviceId;
                  cursor.update(record);
                }
                cursor.continue();
              }
            };
          });

          // Ride en cours éventuel : migre la clé fixe 'current' vers deviceId
          const ripStore = tx.objectStore(STORES.RIDE_IN_PROGRESS);
          const ripReq = ripStore.get('current');
          ripReq.onsuccess = () => {
            const rip = ripReq.result;
            if (rip) {
              ripStore.delete('current');
              rip.key = defaultDeviceId;
              rip.deviceId = defaultDeviceId;
              ripStore.put(rip);
            }
          };

          // Appareil actif par défaut
          const settingsStore = tx.objectStore(STORES.SETTINGS);
          settingsStore.put({ key: 'currentDeviceId', value: defaultDeviceId });
        };
      }

      // --- Migration v5 : usage de roue en string libre (remplace le booléen offroad) ---
      if (oldVersion > 0 && oldVersion < 5) {
        const wheelsStore = tx.objectStore(STORES.WHEELS);
        const cursorReq = wheelsStore.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const record = cursor.value;
            if (record.usage === undefined) {
              record.usage = record.offroad ? 'Tout terrain' : 'Route';
              delete record.offroad;
              cursor.update(record);
            }
            cursor.continue();
          }
        };
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      // Si une autre page/onglet (ou un reload post-mise à jour) demande une version supérieure,
      // cette connexion se ferme proactivement plutôt que de bloquer indéfiniment l'upgrade.
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onblocked = () => {
      console.warn("IndexedDB upgrade bloque : une connexion existante ne s'est pas fermee a temps.");
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

// --- Génération UUID ---
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback pour navigateurs/webviews plus anciens
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Migration : attribue un UUID à toute donnée existante qui n'en a pas ---
async function migrateUUIDs() {
  for (const storeName of [STORES.TRIPS, STORES.INTERVENTIONS]) {
    const items = await dbGetAll(storeName);
    for (const item of items) {
      if (!item.uuid) {
        item.uuid = generateUUID();
        await dbPut(storeName, item);
      }
    }
  }
}

// --- Initialisation des données par défaut ---
// Roues et pièces ne sont plus seedées ici : elles sont propres à chaque appareil et l'utilisateur
// les construit lui-même (un skate n'a pas les mêmes pièces qu'une trottinette ou un gyroroue).
// Seul un appareil générique vide est créé si aucun n'existe encore (premier lancement, install neuve).
async function initDefaultData() {
  const existingDevices = await dbGetAll(STORES.DEVICES);
  if (existingDevices.length === 0) {
    const newDeviceId = await dbAdd(STORES.DEVICES, {
      uuid: generateUUID(),
      name: 'Mon appareil',
      brand: '',
      model: '',
      acquisitionYear: null,
      initialKm: 0,
      createdAt: new Date().toISOString()
    });
    await dbPut(STORES.SETTINGS, { key: 'currentDeviceId', value: newDeviceId });
  }

  // Types de ride par défaut (global)
  const existingRideTypes = await dbGetAll(STORES.RIDE_TYPES);
  if (existingRideTypes.length === 0) {
    const defaultRideTypes = ['Cruise', 'Vitesse'];
    for (const rt of defaultRideTypes) {
      await dbAdd(STORES.RIDE_TYPES, { name: rt });
    }
  }

  // Types d'intervention par défaut (global)
  const existingInterventionTypes = await dbGetAll(STORES.INTERVENTION_TYPES);
  if (existingInterventionTypes.length === 0) {
    const defaultTypes = ['Entretien', 'Remplacement', 'Révision constructeur'];
    for (const it of defaultTypes) {
      await dbAdd(STORES.INTERVENTION_TYPES, { name: it });
    }
  }

  // Usages de roue par défaut (global)
  const existingWheelTypes = await dbGetAll(STORES.WHEEL_TYPES);
  if (existingWheelTypes.length === 0) {
    const defaultWheelTypes = ['Tout terrain', 'Street', 'Route'];
    for (const wt of defaultWheelTypes) {
      await dbAdd(STORES.WHEEL_TYPES, { name: wt });
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
  initDefaultData,
  generateUUID,
  migrateUUIDs
};
