// ============================================================
// EVOLVE TRACKER - App principale (navigation, init, helpers UI)
// ============================================================

const App = {};

let currentView = 'dashboard';
let currentTabGroup = { stats: 'ride', history: 'ride' };

App.init = async function () {
  await EvolveDB.initDefaultData();
  await EvolveDB.migrateUUIDs();
  await I18n.loadSavedLang();
  I18n.applyToDOM();
  setupNavigation();
  setupTabs();
  setupFabMenu();
  setupHistoryControls();
  setupMaintenanceControls();
  setupSettingsControls();
  setupCsvImportExport();
  setupLanguageSelector();
  setupInstallPrompt();
  await App.refreshCurrentView();
  await refreshFabLabel();
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
  const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');
  window.scrollTo(0, 0);
  await App.refreshCurrentView();
}

App.refreshCurrentView = async function () {
  if (currentView === 'dashboard') await Trips.renderDashboard();
  else if (currentView === 'stats') {
    if (currentTabGroup.stats === 'ride') await Trips.renderStats();
    else await Trips.renderCharge();
  } else if (currentView === 'history') {
    if (currentTabGroup.history === 'ride') await Trips.renderHistory();
    else await Maintenance.renderList();
  } else if (currentView === 'settings') await renderAllSettings();
};

async function renderAllSettings() {
  await Settings.renderWheels();
  await Settings.renderRideTypes();
  await Settings.renderInterventionTypes();
  await Settings.renderParts();
}

// --- Onglets (Stats : Ride/Charge, Historique : Ride/Entretien) ---
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = async () => {
      const group = btn.dataset.tabgroup;
      const tab = btn.dataset.tab;
      currentTabGroup[group] = tab;

      document.querySelectorAll(`.tab-btn[data-tabgroup="${group}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll(`#${group === 'stats' ? 'view-stats' : 'view-history'} .tab-panel`).forEach(p => p.classList.remove('active'));
      const panelId = group === 'stats'
        ? (tab === 'ride' ? 'stats-tab-ride' : 'stats-tab-charge')
        : (tab === 'ride' ? 'history-tab-ride' : 'history-tab-maintenance');
      document.getElementById(panelId).classList.add('active');

      await App.refreshCurrentView();
    };
  });
}

// ============================================================
// BOUTON + CENTRAL : menu Démarrer un ride / Enregistrer un ride complet
// ============================================================
function setupFabMenu() {
  const fabBtn = document.getElementById('fab-main-btn');
  const fabMenu = document.getElementById('fab-menu');
  const optionStart = document.getElementById('fab-option-start');
  const optionFull = document.getElementById('fab-option-full');

  fabBtn.onclick = (e) => {
    e.stopPropagation();
    const isOpen = fabMenu.classList.contains('open');
    if (isOpen) closeFabMenu(); else openFabMenu();
  };

  document.addEventListener('click', (e) => {
    if (fabMenu.classList.contains('open') && !fabMenu.contains(e.target) && e.target !== fabBtn) {
      closeFabMenu();
    }
  });

  optionStart.onclick = async (e) => {
    e.stopPropagation();
    closeFabMenu();
    const inProgress = await Trips.getRideInProgress();
    if (inProgress) {
      Trips.openTripForm(null, { completingRideInProgress: true });
    } else {
      Trips.openStartRideForm();
    }
  };

  optionFull.onclick = async (e) => {
    e.stopPropagation();
    const inProgress = await Trips.getRideInProgress();
    if (inProgress) {
      closeFabMenu();
      confirmDiscardRideInProgress(() => {
        Trips.openTripForm(null, { completingRideInProgress: true, discardPrompted: true });
      });
    } else {
      closeFabMenu();
      Trips.openTripForm();
    }
  };
}

function openFabMenu() {
  document.getElementById('fab-menu').classList.add('open');
  document.getElementById('fab-main-btn').classList.add('menu-open');
}

function closeFabMenu() {
  document.getElementById('fab-menu').classList.remove('open');
  document.getElementById('fab-main-btn').classList.remove('menu-open');
}

// Met à jour le libellé du bouton "Démarrer un ride" -> "Terminer le ride en cours"
async function refreshFabLabel() {
  const inProgress = await Trips.getRideInProgress();
  const optionStart = document.getElementById('fab-option-start');
  if (inProgress) {
    optionStart.textContent = I18n.t('finish_ride');
    optionStart.classList.add('is-finish');
  } else {
    optionStart.textContent = I18n.t('start_ride');
    optionStart.classList.remove('is-finish');
  }
}
window.refreshFabLabel = refreshFabLabel;

// Alerte si un ride est en cours et que l'utilisateur clique malgré tout sur "Enregistrer un ride complet"
function confirmDiscardRideInProgress(onConfirm) {
  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>Ride en cours</h2>
      <button class="modal-close" id="discard-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div style="font-size:14.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:18px">
      Un ride est déjà en cours. Pour éviter de perdre la batterie de départ déjà enregistrée, tu vas être redirigé vers la complétion de ce ride plutôt que vers un formulaire vide.
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary flex-1" id="discard-cancel">Annuler</button>
      <button class="btn btn-primary flex-1" id="discard-confirm">Continuer</button>
    </div>
  `;
  document.getElementById('discard-close').onclick = closeModal;
  document.getElementById('discard-cancel').onclick = closeModal;
  document.getElementById('discard-confirm').onclick = () => {
    onConfirm();
  };
  openModal();
}
window.confirmDiscardRideInProgress = confirmDiscardRideInProgress;

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
  document.getElementById('settings-export-csv').onclick = () => CsvIO.exportTrips();
  document.getElementById('settings-export-csv-maintenance').onclick = () => CsvIO.exportMaintenance();
}

// --- Import CSV (déclenchement des inputs file cachés) ---
function setupCsvImportExport() {
  const tripInput = document.getElementById('settings-import-csv-input');
  const maintenanceInput = document.getElementById('settings-import-csv-maintenance-input');

  document.getElementById('settings-import-csv').onclick = () => tripInput.click();
  document.getElementById('settings-import-csv-maintenance').onclick = () => maintenanceInput.click();

  tripInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) await CsvIO.importTrips(file);
    e.target.value = '';
  };
  maintenanceInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) await CsvIO.importMaintenance(file);
    e.target.value = '';
  };
}

// --- Sélecteur de langue ---
function setupLanguageSelector() {
  document.querySelectorAll('#settings-language-selector button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === I18n.getLang());
    btn.onclick = async () => {
      await I18n.setLang(btn.dataset.lang);
      await refreshFabLabel();
      await App.refreshCurrentView();
    };
  });
}

// --- Bandeau d'installation PWA ---
let deferredInstallPrompt = null;

function setupInstallPrompt() {
  const banner = document.getElementById('install-banner');
  const dismissKey = 'evolve_tracker_install_dismissed';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const alreadyDismissed = sessionStorage.getItem(dismissKey);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!alreadyDismissed && !isStandalone) {
      banner.classList.add('show');
    }
  });

  document.getElementById('install-confirm-btn').onclick = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }
    banner.classList.remove('show');
  };

  document.getElementById('install-dismiss-btn').onclick = () => {
    banner.classList.remove('show');
    sessionStorage.setItem(dismissKey, '1');
  };

  window.addEventListener('appinstalled', () => {
    banner.classList.remove('show');
  });
}

// --- Modal générique ---
function openModal() {
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('modal-sheet').innerHTML = '';
}

function setupModalOverlayClose() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });
  }
}

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

// --- Service worker (PWA offline + détection de mise à jour) ---
let newServiceWorker = null;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then((registration) => {
    if (registration.waiting) {
      newServiceWorker = registration.waiting;
      showUpdateBanner();
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          newServiceWorker = installing;
          showUpdateBanner();
        }
      });
    });
  }).catch(() => {
    // Echec silencieux si non supporté dans l'environnement de preview
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.add('show');
}

function applyUpdate() {
  if (newServiceWorker) {
    newServiceWorker.postMessage('SKIP_WAITING');
  }
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.remove('show');
}
window.applyUpdate = applyUpdate;

window.App = App;

// --- Démarrage : sécurisé contre un DOMContentLoaded déjà déclenché (cold start) ---
function startApp() {
  setupModalOverlayClose();
  App.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
