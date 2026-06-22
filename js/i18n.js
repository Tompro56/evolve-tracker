// ============================================================
// EVOLVE TRACKER - Module i18n (FR/EN)
// ============================================================

const I18n = {};

const DICT = {
  fr: {
    update_available: 'Une nouvelle version est prête.',
    restart: 'Redémarrer',
    install_prompt: "Installe l'application pour un accès direct hors ligne.",
    install: 'Installer',
    board_status: 'État de la board',
    no_trip_recorded: 'Aucune sortie enregistrée',
    total_km: 'Km totaux',
    trips: 'Sorties',
    avg_consumption: 'Conso. moy.',
    avg_range: 'Autonomie moy.',
    last_trip: 'Dernière sortie',
    active_config: 'Configuration active',
    stats_charts: 'Stats & graphiques',
    tab_ride: 'Ride',
    tab_charge: 'Charge',
    tab_maintenance: 'Entretien',
    from: 'Du',
    to: 'Au',
    apply: 'Appliquer',
    period_km: 'Km période',
    distance_per_pct: 'Distance / %',
    mileage: 'Kilométrage',
    ride_distribution: 'Répartition par type de ride',
    cycles: 'Cycles',
    total_injected: '% injecté total',
    fluctuation_per_cycle: 'Fluctuation par cycle',
    cycle_history: 'Historique des cycles',
    history: 'Historique',
    search_placeholder: 'Rechercher...',
    maintenance_search_placeholder: 'Rechercher (pièce, budget, mot-clé...)',
    sort: 'Trier',
    filter: 'Filtrer',
    sort_by: 'Trier par',
    date: 'Date',
    distance: 'Distance',
    battery_consumption: 'Consommation batterie',
    ride_type: 'Type de ride',
    descending: 'Décroissant',
    ascending: 'Croissant',
    start_date: 'Date début',
    end_date: 'Date fin',
    min_distance: 'Distance min (km)',
    max_distance: 'Distance max (km)',
    min_consumption: 'Conso min (%)',
    max_consumption: 'Conso max (%)',
    all: 'Tous',
    reset: 'Réinitialiser',
    new_intervention: '+ Nouvelle intervention',
    budget: 'Budget',
    parts_count: 'Nombre de parties',
    settings: 'Paramètres',
    language: 'Langue',
    french: 'Français',
    english: 'English',
    wheels: 'Roues',
    add_wheel: '+ Ajouter une roue',
    ride_types: 'Types de ride',
    add_ride_type: '+ Ajouter un type de ride',
    intervention_types: "Types d'intervention",
    add_intervention_type: "+ Ajouter un type d'intervention",
    skate_parts: 'Parties du skate',
    add_part: '+ Ajouter une partie',
    data: 'Données',
    export_hint: 'Export régulier recommandé : seule vraie sauvegarde en cas de désinstallation.',
    export_trips: 'Exporter trajets en CSV',
    export_maintenance: 'Exporter interventions en CSV',
    import_trips: 'Importer trajets depuis CSV',
    import_maintenance: 'Importer interventions depuis CSV',
    nav_dashboard: 'Dashboard',
    nav_stats: 'Stats',
    nav_history: 'Historique',
    nav_settings: 'Réglages',
    start_ride: 'Démarrer un ride',
    log_full_ride: 'Enregistrer un ride complet',
    finish_ride: 'Terminer le ride en cours',
    cancel_ride_in_progress: 'Annuler le ride en cours'
  },
  en: {
    update_available: 'A new version is ready.',
    restart: 'Restart',
    install_prompt: 'Install the app for direct offline access.',
    install: 'Install',
    board_status: 'Board status',
    no_trip_recorded: 'No trip recorded yet',
    total_km: 'Total km',
    trips: 'Trips',
    avg_consumption: 'Avg. consumption',
    avg_range: 'Avg. range',
    last_trip: 'Last trip',
    active_config: 'Active setup',
    stats_charts: 'Stats & charts',
    tab_ride: 'Ride',
    tab_charge: 'Charge',
    tab_maintenance: 'Maintenance',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    period_km: 'Period km',
    distance_per_pct: 'Distance / %',
    mileage: 'Mileage',
    ride_distribution: 'Ride type distribution',
    cycles: 'Cycles',
    total_injected: 'Total % injected',
    fluctuation_per_cycle: 'Fluctuation per cycle',
    cycle_history: 'Charge cycle history',
    history: 'History',
    search_placeholder: 'Search...',
    maintenance_search_placeholder: 'Search (part, budget, keyword...)',
    sort: 'Sort',
    filter: 'Filter',
    sort_by: 'Sort by',
    date: 'Date',
    distance: 'Distance',
    battery_consumption: 'Battery consumption',
    ride_type: 'Ride type',
    descending: 'Descending',
    ascending: 'Ascending',
    start_date: 'Start date',
    end_date: 'End date',
    min_distance: 'Min distance (km)',
    max_distance: 'Max distance (km)',
    min_consumption: 'Min consumption (%)',
    max_consumption: 'Max consumption (%)',
    all: 'All',
    reset: 'Reset',
    new_intervention: '+ New intervention',
    budget: 'Budget',
    parts_count: 'Number of parts',
    settings: 'Settings',
    language: 'Language',
    french: 'Français',
    english: 'English',
    wheels: 'Wheels',
    add_wheel: '+ Add a wheel',
    ride_types: 'Ride types',
    add_ride_type: '+ Add a ride type',
    intervention_types: 'Intervention types',
    add_intervention_type: '+ Add an intervention type',
    skate_parts: 'Skate parts',
    add_part: '+ Add a part',
    data: 'Data',
    export_hint: 'Regular export recommended: only real backup in case of uninstall.',
    export_trips: 'Export trips to CSV',
    export_maintenance: 'Export interventions to CSV',
    import_trips: 'Import trips from CSV',
    import_maintenance: 'Import interventions from CSV',
    nav_dashboard: 'Dashboard',
    nav_stats: 'Stats',
    nav_history: 'History',
    nav_settings: 'Settings',
    start_ride: 'Start a ride',
    log_full_ride: 'Log a full ride',
    finish_ride: 'Finish current ride',
    cancel_ride_in_progress: 'Cancel ride in progress'
  }
};

const LANG_STORAGE_KEY = 'evolve_tracker_lang';
let currentLang = 'fr';

I18n.getLang = function () {
  return currentLang;
};

I18n.t = function (key) {
  return (DICT[currentLang] && DICT[currentLang][key]) || DICT.fr[key] || key;
};

I18n.setLang = async function (lang) {
  if (!DICT[lang]) return;
  currentLang = lang;
  await EvolveDB.dbPut(EvolveDB.STORES.SETTINGS, { key: LANG_STORAGE_KEY, value: lang });
  document.documentElement.lang = lang;
  I18n.applyToDOM();
};

I18n.loadSavedLang = async function () {
  try {
    const saved = await EvolveDB.dbGet(EvolveDB.STORES.SETTINGS, LANG_STORAGE_KEY);
    if (saved && DICT[saved.value]) {
      currentLang = saved.value;
      document.documentElement.lang = currentLang;
    }
  } catch (e) {
    // pas de préférence enregistrée, on garde le français par défaut
  }
};

// Applique les traductions à tous les éléments marqués data-i18n / data-i18n-placeholder
// Exception : #fab-option-start a un libellé dynamique géré par refreshFabLabel() dans app.js
// (il peut afficher "Démarrer un ride" ou "Terminer le ride en cours" selon l'état),
// donc on ne le touche pas ici pour éviter un écrasement silencieux.
I18n.applyToDOM = function () {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.id === 'fab-option-start') return;
    const key = el.getAttribute('data-i18n');
    el.textContent = I18n.t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', I18n.t(key));
  });

  // Met à jour le segmented-control de langue dans les paramètres
  document.querySelectorAll('#settings-language-selector button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
};

window.I18n = I18n;
