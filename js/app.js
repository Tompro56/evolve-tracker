// ============================================================
// EVOLVE TRACKER - App principale (navigation, init, helpers UI)
// ============================================================

const App = {};

let currentView = 'dashboard';

App.init = async function () {
  await EvolveDB.initDefaultData();
  setupNavigation();
  setupFAB();
  setupHistoryControls();
  setupMaintenanceControls();
  setupSettingsControls();
  await App.refreshCurrentView();
  registerServiceWorker();
};

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => switchView(item.dataset.view);
  });
}

async function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelector(`.nav-item[data-view="${viewName}"]`).classList.add('active');
  window.scrollTo(0, 0);
  await App.refreshCurrentView();
}

App.refreshCurrentView = async function () {
  if (currentView === 'dashboard') await Trips.renderDashboard();
  else if (currentView === 'stats') await Trips.renderStats();
  else if (currentView === 'charge') await Trips.renderCharge();
  else if (currentView === 'history') await Trips.renderHistory();
  else if (currentView === 'maintenance') await Maintenance.renderList();
  else if (currentView === 'settings') await renderAllSettings();
};

async function renderAllSettings() {
  await Settings.renderWheels();
  await Settings.renderRideTypes();
  await Settings.renderInterventionTypes();
  await Settings.renderParts();
}

function setupFAB() {
  document.getElementById('fab-new-trip').onclick = () => Trips.openTripForm();
}

// --- Historique : contrôles tri / filtre / recherche ---
function setupHistoryControls() {
  const sortBtn = document.getElementById('history-sort-btn');
  const filterBtn = document.getElementById('history-filter-btn');
  const sortPanel = document.getElementById('history-sort-panel');
  const filterPanel = document.getElementById('history-filter-panel');

  sortBtn.onclick = () => {
    filterPanel.classList.remove('active');
    sortPanel.classList.toggle('active');
  };
  filterBtn.onclick = () => {
    sortPanel.classList.remove('active');
    filterPanel.classList.toggle('active');
  };

  document.getElementById('history-sort-by').onchange = (e) => {
    currentHistorySort.by = e.target.value;
    Trips.renderHistory();
  };

  sortPanel.querySelectorAll('.segmented-control button').forEach(btn => {
    btn.onclick = () => {
      sortPanel.querySelectorAll('.segmented-control button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentHistorySort.order = btn.dataset.order;
      Trips.renderHistory();
    };
  });

  document.getElementById('history-search').oninput = debounce(() => Trips.renderHistory(), 250);

  document.getElementById('history-filter-apply').onclick = () => {
    currentHistoryFilters = {
      dateStart: document.getElementById('history-filter-date-start').value || null,
      dateEnd: document.getElementById('history-filter-date-end').value || null,
      distanceMin: document.getElementById('history-filter-dist-min').value || null,
      distanceMax: document.getElementById('history-filter-dist-max').value || null,
      consumptionMin: document.getElementById('history-filter-cons-min').value || null,
      consumptionMax: document.getElementById('history-filter-cons-max').value || null,
      rideType: document.getElementById('history-filter-ridetype').value || null
    };
    filterPanel.classList.remove('active');
    Trips.renderHistory();
  };

  document.getElementById('history-filter-reset').onclick = () => {
    currentHistoryFilters = {};
    document.getElementById('history-filter-date-start').value = '';
    document.getElementById('history-filter-date-end').value = '';
    document.getElementById('history-filter-dist-min').value = '';
    document.getElementById('history-filter-dist-max').value = '';
    document.getElementById('history-filter-cons-min').value = '';
    document.getElementById('history-filter-cons-max').value = '';
    document.getElementById('history-filter-ridetype').value = '';
    Trips.renderHistory();
  };
}

// --- Entretien : contrôles tri / recherche / ajout ---
function setupMaintenanceControls() {
  const sortBtn = document.getElementById('maintenance-sort-btn');
  const sortPanel = document.getElementById('maintenance-sort-panel');

  sortBtn.onclick = () => sortPanel.classList.toggle('active');

  document.getElementById('maintenance-sort-by').onchange = (e) => {
    currentMaintenanceSort.by = e.target.value;
    Maintenance.renderList();
  };

  sortPanel.querySelectorAll('.segmented-control button').forEach(btn => {
    btn.onclick = () => {
      sortPanel.querySelectorAll('.segmented-control button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMaintenanceSort.order = btn.dataset.order;
      Maintenance.renderList();
    };
  });

  document.getElementById('maintenance-search').oninput = debounce((e) => {
    currentMaintenanceSearch = e.target.value;
    Maintenance.renderList();
  }, 250);

  document.getElementById('maintenance-add-btn').onclick = () => Maintenance.openInterventionForm();
}

// --- Paramètres : contrôles ajout ---
function setupSettingsControls() {
  document.getElementById('settings-add-wheel').onclick = () => Settings.openWheelForm();
  document.getElementById('settings-add-ridetype').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.RIDE_TYPES, Settings.renderRideTypes);
  document.getElementById('settings-add-interventiontype').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.INTERVENTION_TYPES, Settings.renderInterventionTypes);
  document.getElementById('settings-add-part').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.PARTS, Settings.renderParts);
  document.getElementById('settings-export-csv').onclick = () => Settings.exportTripsCSV();
  document.getElementById('settings-export-csv-maintenance').onclick = () => Settings.exportMaintenanceCSV();
}

// --- Modal générique ---
function openModal() {
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('modal-sheet').innerHTML = '';
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

window.closeModal = closeModal;
window.openModal = openModal;

// --- Toast ---
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}
window.showToast = showToast;

// --- Debounce helper ---
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// --- Service worker (PWA offline) ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Echec silencieux si non supporté dans l'environnement de preview
    });
  }
}

window.App = App;

// --- Démarrage ---
document.addEventListener('DOMContentLoaded', App.init);
