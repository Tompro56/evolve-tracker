// ============================================================
// RIDE TRACKER - App principale (navigation, init, helpers UI)
// ============================================================

const App = {};

let currentView = 'dashboard';
let currentTabGroup = { stats: 'ride', history: 'ride', settings: 'device' };

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
  setupSettingsAccordions();
  setupCsvImportExport();
  setupLanguageSelector();
  setupInstallPrompt();
  setupDeviceSwitcher();
  await refreshDeviceSwitcher();
  setupExportReminderBanner();
  await App.refreshCurrentView();
  await refreshFabLabel();
  await refreshExportReminder();
  registerServiceWorker();
};

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => switchView(item.dataset.view);
  });
}

// ============================================================
// SÉLECTEUR D'APPAREIL DANS LE HEADER (multi-appareil)
// ============================================================
function setupDeviceSwitcher() {
  const select = document.getElementById('device-switcher');
  if (!select) return;
  select.onchange = async () => {
    await Devices.setCurrentId(parseInt(select.value));
    await refreshFabLabel();
    await App.refreshCurrentView();
  };
}

async function refreshDeviceSwitcher() {
  const select = document.getElementById('device-switcher');
  if (!select) return;
  const devices = await Devices.getAll();
  const currentId = await Devices.getCurrentId();
  select.innerHTML = devices.map(d => `<option value="${d.id}" ${d.id === currentId ? 'selected' : ''}>${d.name}</option>`).join('');
}
window.refreshDeviceSwitcher = refreshDeviceSwitcher;

// ============================================================
// RAPPEL D'EXPORT PÉRIODIQUE (configurable, jamais automatique : pas de backend)
// ============================================================
async function refreshExportReminder() {
  const banner = document.getElementById('export-reminder-banner');
  if (!banner) return;

  // Évite le chevauchement visuel avec les bandeaux update/install (tous en position fixed top:0).
  // Pas de système d'empilement dynamique : on reporte simplement le rappel au prochain contrôle.
  const updateBanner = document.getElementById('update-banner');
  const installBanner = document.getElementById('install-banner');
  if ((updateBanner && updateBanner.classList.contains('show')) || (installBanner && installBanner.classList.contains('show'))) {
    return;
  }

  const reminderSetting = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, 'exportReminderDays');
  const reminderDays = reminderSetting ? reminderSetting.value : 0;

  if (!reminderDays || reminderDays <= 0) {
    banner.classList.remove('show');
    return;
  }

  const lastExportSetting = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, 'lastExportAt');
  const lastExportAt = lastExportSetting ? new Date(lastExportSetting.value) : null;
  const daysSince = lastExportAt ? (Date.now() - lastExportAt.getTime()) / 86400000 : Infinity;

  if (daysSince >= reminderDays) {
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}
window.refreshExportReminder = refreshExportReminder;

function setupExportReminderBanner() {
  const dismissBtn = document.getElementById('export-reminder-dismiss-btn');
  const exportBtn = document.getElementById('export-reminder-export-btn');
  const banner = document.getElementById('export-reminder-banner');
  if (dismissBtn) {
    dismissBtn.onclick = () => banner.classList.remove('show');
  }
  if (exportBtn) {
    exportBtn.onclick = () => {
      banner.classList.remove('show');
      CsvIO.openExportDeviceSelector('trips');
    };
  }
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
  await Settings.renderParts();
  await Settings.renderRideTypes();
  await Settings.renderInterventionTypes();
  await Settings.renderWheelTypes();
  await Settings.renderDevices();
  await Settings.renderUserProfile();
  const footer = document.getElementById('app-version-footer');
  if (footer && window.APP_VERSION) {
    footer.textContent = `Ride Tracker v${window.APP_VERSION}`;
  }
}

// --- Onglets génériques (Stats : Ride/Charge, Historique : Ride/Entretien, Réglages : Appareil/Utilisateur) ---
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = async () => {
      const group = btn.dataset.tabgroup;
      const tab = btn.dataset.tab;
      const panelId = btn.dataset.panel;
      currentTabGroup[group] = tab;

      document.querySelectorAll(`.tab-btn[data-tabgroup="${group}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const panel = document.getElementById(panelId);
      const panelGroup = panel ? panel.closest('.view') : null;
      if (panelGroup) {
        panelGroup.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      }
      if (panel) panel.classList.add('active');

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
  const optionCancel = document.getElementById('fab-option-cancel');

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

  optionCancel.onclick = async (e) => {
    e.stopPropagation();
    closeFabMenu();
    await cancelRideInProgress();
  };

  const optionMaintenance = document.getElementById('fab-option-maintenance');
  optionMaintenance.onclick = (e) => {
    e.stopPropagation();
    closeFabMenu();
    Maintenance.openInterventionForm();
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
  const optionCancel = document.getElementById('fab-option-cancel');
  if (inProgress) {
    optionStart.textContent = I18n.t('finish_ride');
    optionStart.classList.add('is-finish');
    optionCancel.style.display = 'block';
  } else {
    optionStart.textContent = I18n.t('start_ride');
    optionStart.classList.remove('is-finish');
    optionCancel.style.display = 'none';
  }
}
window.refreshFabLabel = refreshFabLabel;

// Annule un ride en cours sans créer de sortie (faux départ, plan annulé).
// Centralisé ici car appelé à la fois depuis le menu FAB et la bannière dashboard.
async function cancelRideInProgress() {
  const confirmed = await confirmDialog(
    'Annuler ce ride en cours ? La batterie de départ enregistrée sera perdue, aucune sortie ne sera créée.',
    { confirmLabel: 'Annuler le ride', danger: true }
  );
  if (!confirmed) return;
  await Trips.clearRideInProgress();
  await refreshFabLabel();
  showToast('Ride en cours annulé', 'success');
  await App.refreshCurrentView();
}
window.cancelRideInProgress = cancelRideInProgress;

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

// --- Entretien : contrôles tri / filtre / recherche ---
function setupMaintenanceControls() {
  const sortBtn = document.getElementById('maintenance-sort-btn');
  const filterBtn = document.getElementById('maintenance-filter-btn');
  const sortPanel = document.getElementById('maintenance-sort-panel');
  const filterPanel = document.getElementById('maintenance-filter-panel');

  sortBtn.onclick = () => {
    filterPanel.classList.remove('active');
    sortPanel.classList.toggle('active');
  };
  filterBtn.onclick = () => {
    sortPanel.classList.remove('active');
    filterPanel.classList.toggle('active');
  };

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

  document.getElementById('maintenance-filter-apply').onclick = () => {
    currentMaintenanceFilters = {
      dateStart: document.getElementById('maintenance-filter-date-start').value || null,
      dateEnd: document.getElementById('maintenance-filter-date-end').value || null,
      budgetMin: document.getElementById('maintenance-filter-budget-min').value || null,
      budgetMax: document.getElementById('maintenance-filter-budget-max').value || null,
      interventionType: document.getElementById('maintenance-filter-type').value || null
    };
    filterPanel.classList.remove('active');
    Maintenance.renderList();
  };

  document.getElementById('maintenance-filter-reset').onclick = () => {
    currentMaintenanceFilters = {};
    document.getElementById('maintenance-filter-date-start').value = '';
    document.getElementById('maintenance-filter-date-end').value = '';
    document.getElementById('maintenance-filter-budget-min').value = '';
    document.getElementById('maintenance-filter-budget-max').value = '';
    document.getElementById('maintenance-filter-type').value = '';
    Maintenance.renderList();
  };
}

// --- Paramètres : volets repliables (lot C) ---
// Repliés par défaut, sans mémorisation entre visites. Les listes internes
// sont re-rendues sans toucher au .panel-title, donc le câblage survit.
function setupSettingsAccordions() {
  document.querySelectorAll('#view-settings .settings-section').forEach(section => {
    section.classList.add('collapsed');
    const title = section.querySelector('.panel-title');
    if (title) title.onclick = () => section.classList.toggle('collapsed');
  });
}

// --- Paramètres : contrôles ajout ---
function setupSettingsControls() {
  document.getElementById('settings-add-wheel').onclick = () => Settings.openWheelForm();
  document.getElementById('settings-add-ridetype').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.RIDE_TYPES, Settings.renderRideTypes);
  document.getElementById('settings-add-wheeltype').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.WHEEL_TYPES, Settings.renderWheelTypes);
  document.getElementById('settings-add-interventiontype').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.INTERVENTION_TYPES, Settings.renderInterventionTypes);
  document.getElementById('settings-add-part').onclick = () => Settings.openSimpleItemFormNew(EvolveDB.STORES.PARTS, Settings.renderParts);
  document.getElementById('settings-export-csv').onclick = () => CsvIO.openExportDeviceSelector('trips');
  document.getElementById('settings-export-csv-maintenance').onclick = () => CsvIO.openExportDeviceSelector('maintenance');
  document.getElementById('settings-add-device').onclick = () => Settings.openDeviceForm();
  document.getElementById('profile-save-btn').onclick = () => Settings.saveUserProfile();
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

// ============================================================
// CONFIRM DIALOG CUSTOM (remplace le confirm() natif du navigateur)
// ============================================================
// Usage : if (await confirmDialog('Supprimer cette sortie ?', { confirmLabel: 'Supprimer', danger: true })) { ... }
function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    const dialog = document.getElementById('confirm-dialog');

    dialog.innerHTML = `
      ${options.title ? `<div class="confirm-title">${options.title}</div>` : ''}
      <div class="confirm-message">${message}</div>
      <div class="confirm-actions">
        <button class="btn btn-secondary flex-1" id="confirm-cancel-btn">${options.cancelLabel || 'Annuler'}</button>
        <button class="btn ${options.danger ? 'btn-danger' : 'btn-primary'} flex-1" id="confirm-ok-btn">${options.confirmLabel || 'Confirmer'}</button>
      </div>
    `;

    const onOverlayClick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    const cleanup = (result) => {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', onOverlayClick);
      dialog.innerHTML = '';
      resolve(result);
    };

    document.getElementById('confirm-cancel-btn').onclick = () => cleanup(false);
    document.getElementById('confirm-ok-btn').onclick = () => cleanup(true);
    overlay.addEventListener('click', onOverlayClick);

    overlay.classList.add('active');
  });
}
window.confirmDialog = confirmDialog;

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
let updateCheckIntervalId = null;
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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

    // Revérifie périodiquement tant que l'app reste ouverte, sans recharger la page.
    // registration.update() compare sw.js avec la version servie par le réseau ;
    // si différent, ça relance le cycle normal (-> updatefound -> bandeau).
    if (!updateCheckIntervalId) {
      updateCheckIntervalId = setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    }

    // Vérification immédiate si l'app revient au premier plan après avoir été masquée,
    // pour ne pas attendre jusqu'à 10 minutes après un retour d'arrière-plan.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {});
      }
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
