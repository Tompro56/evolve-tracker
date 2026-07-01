// ============================================================
// RIDE TRACKER - Module Calculs & Agrégations
// ============================================================

const Calc = {};

// --- Filtrage par période ---
// period: 'total' | 'day' | 'week' | 'month' | 'custom'
// customRange: {start: Date, end: Date} si period === 'custom'
Calc.filterByPeriod = function (trips, period, customRange) {
  if (period === 'total') return trips;

  const now = new Date();
  let start, end;

  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (period === 'week') {
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // lundi = 0
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'custom' && customRange) {
    start = new Date(customRange.start);
    start.setHours(0, 0, 0, 0);
    end = new Date(customRange.end);
    end.setHours(23, 59, 59, 999);
  } else {
    return trips;
  }

  return trips.filter(t => {
    const ts = new Date(t.timestamp);
    return ts >= start && ts <= end;
  });
};

// --- Stats globales sur un ensemble de trajets ---
Calc.computeStats = function (trips) {
  if (!trips || trips.length === 0) {
    return {
      totalKm: 0,
      totalTrips: 0,
      avgConsumptionPerKm: null, // % par km
      avgDistancePerPercent: null, // km par %
      totalBatteryUsed: 0
    };
  }

  let totalKm = 0;
  let totalBatteryUsed = 0;

  trips.forEach(t => {
    const km = t.distanceKm || 0;
    const used = Math.max(0, (t.batteryStart || 0) - (t.batteryEnd || 0));
    totalKm += km;
    totalBatteryUsed += used;
  });

  const avgConsumptionPerKm = totalKm > 0 ? totalBatteryUsed / totalKm : null;
  const avgDistancePerPercent = totalBatteryUsed > 0 ? totalKm / totalBatteryUsed : null;

  return {
    totalKm: Math.round(totalKm * 100) / 100,
    totalTrips: trips.length,
    avgConsumptionPerKm: avgConsumptionPerKm !== null ? Math.round(avgConsumptionPerKm * 1000) / 1000 : null,
    avgDistancePerPercent: avgDistancePerPercent !== null ? Math.round(avgDistancePerPercent * 100) / 100 : null,
    totalBatteryUsed: Math.round(totalBatteryUsed * 100) / 100
  };
};

// --- Répartition par type de ride (pour le disque) ---
Calc.rideTypeDistribution = function (trips) {
  const dist = {};
  trips.forEach(t => {
    const type = t.rideType || 'Non défini';
    if (!dist[type]) dist[type] = { count: 0, km: 0 };
    dist[type].count += 1;
    dist[type].km += (t.distanceKm || 0);
  });
  return dist;
};

// --- Détection des cycles de charge ---
// Une charge est détectée quand batteryStart d'un trajet > batteryEnd du trajet précédent (par ordre chronologique)
Calc.detectChargeCycles = function (trips) {
  const sorted = [...trips].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const cycles = [];
  let segmentStart = 0;      // index du 1er trajet du segment menant à la charge courante
  let prevChargeTs = null;   // timestamp de la charge précédente

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.batteryStart > prev.batteryEnd) {
      // Km parcourus depuis la charge précédente = somme des trajets sorted[segmentStart..i-1]
      let km = 0;
      for (let j = segmentStart; j <= i - 1; j++) km += sorted[j].distanceKm || 0;
      const daysSinceLastCharge = prevChargeTs ? (new Date(curr.timestamp) - new Date(prevChargeTs)) / 86400000 : null;
      cycles.push({
        timestamp: curr.timestamp,
        fromPercent: prev.batteryEnd,
        toPercent: curr.batteryStart,
        injected: Math.round((curr.batteryStart - prev.batteryEnd) * 100) / 100,
        afterTripId: prev.id,
        beforeTripId: curr.id,
        kmSinceLastCharge: Math.round(km * 100) / 100,
        daysSinceLastCharge: daysSinceLastCharge
      });
      segmentStart = i;
      prevChargeTs = curr.timestamp;
    }
  }

  return cycles;
};

// Moyennes globales entre deux charges consécutives (indépendantes de la période).
// On ne compte que les cycles ayant une charge précédente (daysSinceLastCharge non nul),
// donc N-1 intervalles pour N charges.
Calc.avgBetweenCharges = function (cycles) {
  const withPrev = cycles.filter(c => c.daysSinceLastCharge !== null && c.daysSinceLastCharge !== undefined);
  if (withPrev.length === 0) return { km: null, days: null };
  const km = withPrev.reduce((s, c) => s + (c.kmSinceLastCharge || 0), 0) / withPrev.length;
  const days = withPrev.reduce((s, c) => s + c.daysSinceLastCharge, 0) / withPrev.length;
  return { km: Math.round(km * 100) / 100, days: Math.round(days * 10) / 10 };
};

// --- Série temporelle pour graphique kilométrage ---
Calc.kmTimeSeries = function (trips) {
  const sorted = [...trips].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return sorted.map(t => ({
    timestamp: t.timestamp,
    km: t.distanceKm || 0,
    rideType: t.rideType
  }));
};

// --- Série temporelle pour graphique cycles de charge (fluctuation haute/basse) ---
// Pour chaque cycle: low = % avant charge, high = % après charge
Calc.chargeTimeSeries = function (cycles) {
  return cycles.map(c => ({
    timestamp: c.timestamp,
    low: c.fromPercent,
    high: c.toPercent,
    injected: c.injected
  }));
};

// --- Formatage date/heure FR ---
Calc.formatDateTime = function (isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

Calc.formatDate = function (isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// --- Tri générique ---
Calc.sortTrips = function (trips, sortBy, order) {
  const sorted = [...trips];
  sorted.sort((a, b) => {
    let valA, valB;
    if (sortBy === 'date') {
      valA = new Date(a.timestamp).getTime();
      valB = new Date(b.timestamp).getTime();
    } else if (sortBy === 'distance') {
      valA = a.distanceKm || 0;
      valB = b.distanceKm || 0;
    } else if (sortBy === 'consumption') {
      valA = (a.batteryStart || 0) - (a.batteryEnd || 0);
      valB = (b.batteryStart || 0) - (b.batteryEnd || 0);
    } else if (sortBy === 'rideType') {
      valA = (a.rideType || '').toLowerCase();
      valB = (b.rideType || '').toLowerCase();
    } else {
      return 0;
    }
    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
};

// --- Filtre générique trajets ---
Calc.filterTrips = function (trips, filters) {
  let result = [...trips];

  if (filters.dateStart) {
    result = result.filter(t => new Date(t.timestamp) >= new Date(filters.dateStart));
  }
  if (filters.dateEnd) {
    const end = new Date(filters.dateEnd);
    end.setHours(23, 59, 59, 999);
    result = result.filter(t => new Date(t.timestamp) <= end);
  }
  if (filters.distanceMin !== undefined && filters.distanceMin !== null && filters.distanceMin !== '') {
    result = result.filter(t => (t.distanceKm || 0) >= parseFloat(filters.distanceMin));
  }
  if (filters.distanceMax !== undefined && filters.distanceMax !== null && filters.distanceMax !== '') {
    result = result.filter(t => (t.distanceKm || 0) <= parseFloat(filters.distanceMax));
  }
  if (filters.rideType) {
    result = result.filter(t => t.rideType === filters.rideType);
  }
  if (filters.consumptionMin !== undefined && filters.consumptionMin !== null && filters.consumptionMin !== '') {
    result = result.filter(t => ((t.batteryStart || 0) - (t.batteryEnd || 0)) >= parseFloat(filters.consumptionMin));
  }
  if (filters.consumptionMax !== undefined && filters.consumptionMax !== null && filters.consumptionMax !== '') {
    result = result.filter(t => ((t.batteryStart || 0) - (t.batteryEnd || 0)) <= parseFloat(filters.consumptionMax));
  }

  return result;
};

// --- Tri/filtre interventions ---
Calc.filterInterventions = function (interventions, filters) {
  let result = [...interventions];
  if (!filters) return result;

  if (filters.dateStart) {
    result = result.filter(i => new Date(i.timestamp) >= new Date(filters.dateStart));
  }
  if (filters.dateEnd) {
    const end = new Date(filters.dateEnd);
    end.setHours(23, 59, 59, 999);
    result = result.filter(i => new Date(i.timestamp) <= end);
  }
  if (filters.budgetMin !== undefined && filters.budgetMin !== null && filters.budgetMin !== '') {
    result = result.filter(i => (i.totalBudget || 0) >= parseFloat(filters.budgetMin));
  }
  if (filters.budgetMax !== undefined && filters.budgetMax !== null && filters.budgetMax !== '') {
    result = result.filter(i => (i.totalBudget || 0) <= parseFloat(filters.budgetMax));
  }
  if (filters.interventionType) {
    result = result.filter(i => (i.interventionTypes || []).includes(filters.interventionType));
  }

  return result;
};

Calc.sortInterventions = function (interventions, sortBy, order) {
  const sorted = [...interventions];
  sorted.sort((a, b) => {
    let valA, valB;
    if (sortBy === 'date') {
      valA = new Date(a.timestamp).getTime();
      valB = new Date(b.timestamp).getTime();
    } else if (sortBy === 'budget') {
      valA = a.totalBudget || 0;
      valB = b.totalBudget || 0;
    } else if (sortBy === 'partsCount') {
      valA = (a.parts || []).length;
      valB = (b.parts || []).length;
    } else {
      return 0;
    }
    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
};

Calc.searchInterventions = function (interventions, query) {
  if (!query || query.trim() === '') return interventions;
  const q = query.toLowerCase().trim();
  return interventions.filter(i => {
    const typeMatch = (i.interventionTypes || []).some(t => t.toLowerCase().includes(q));
    const partsMatch = (i.parts || []).some(p => (p.partName || '').toLowerCase().includes(q) || (p.comment || '').toLowerCase().includes(q));
    const budgetMatch = String(i.totalBudget || '').includes(q);
    const commentMatch = (i.generalComment || '').toLowerCase().includes(q);
    return typeMatch || partsMatch || budgetMatch || commentMatch;
  });
};

// --- Fil d'activités unifié (rides + charges) ---
// Normalise rides et charges en items comparables. Chaque item porte une distance
// et une consommation pour que les filtres et tris s'appliquent aux deux.
// Charge : distance = km depuis la dernière charge, consommation = % injecté.
Calc.buildActivities = function (trips, cycles) {
  const rides = (trips || []).map(t => ({
    kind: 'ride',
    timestamp: t.timestamp,
    distance: t.distanceKm || 0,
    consumption: (t.batteryStart || 0) - (t.batteryEnd || 0),
    rideType: t.rideType || '',
    raw: t
  }));
  const charges = (cycles || []).map(c => ({
    kind: 'charge',
    timestamp: c.timestamp,
    distance: c.kmSinceLastCharge || 0,
    consumption: c.injected || 0,
    rideType: null,
    raw: c
  }));
  return rides.concat(charges);
};

Calc.filterActivities = function (items, filters) {
  let result = [...items];
  filters = filters || {};
  const showRides = filters.showRides !== false;
  const showCharges = filters.showCharges !== false;
  result = result.filter(it => (it.kind === 'ride' ? showRides : showCharges));

  if (filters.dateStart) {
    const s = new Date(filters.dateStart);
    result = result.filter(it => new Date(it.timestamp) >= s);
  }
  if (filters.dateEnd) {
    const e = new Date(filters.dateEnd);
    e.setHours(23, 59, 59, 999);
    result = result.filter(it => new Date(it.timestamp) <= e);
  }
  if (filters.distanceMin !== undefined && filters.distanceMin !== null && filters.distanceMin !== '') {
    result = result.filter(it => it.distance >= parseFloat(filters.distanceMin));
  }
  if (filters.distanceMax !== undefined && filters.distanceMax !== null && filters.distanceMax !== '') {
    result = result.filter(it => it.distance <= parseFloat(filters.distanceMax));
  }
  if (filters.consumptionMin !== undefined && filters.consumptionMin !== null && filters.consumptionMin !== '') {
    result = result.filter(it => it.consumption >= parseFloat(filters.consumptionMin));
  }
  if (filters.consumptionMax !== undefined && filters.consumptionMax !== null && filters.consumptionMax !== '') {
    result = result.filter(it => it.consumption <= parseFloat(filters.consumptionMax));
  }
  // Le type de ride ne concerne que les rides : il exclut donc les charges.
  if (filters.rideType) {
    result = result.filter(it => it.kind === 'ride' && it.rideType === filters.rideType);
  }
  return result;
};

Calc.sortActivities = function (items, sortBy, order) {
  const sorted = [...items];
  const dir = order === 'asc' ? 1 : -1;
  sorted.sort((a, b) => {
    if (sortBy === 'rideType') {
      // Les charges (sans type) se rangent toujours en fin, classées par date entre elles.
      const aNull = a.rideType === null, bNull = b.rideType === null;
      if (aNull && !bNull) return 1;
      if (!aNull && bNull) return -1;
      if (aNull && bNull) return new Date(b.timestamp) - new Date(a.timestamp);
      if (a.rideType < b.rideType) return -dir;
      if (a.rideType > b.rideType) return dir;
      return 0;
    }
    let va, vb;
    if (sortBy === 'distance') { va = a.distance; vb = b.distance; }
    else if (sortBy === 'consumption') { va = a.consumption; vb = b.consumption; }
    else { va = new Date(a.timestamp).getTime(); vb = new Date(b.timestamp).getTime(); }
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
  return sorted;
};

// Autonomie potentielle en km : mini/moyenne/maxi à partir de la batterie restante.
// Mini = moyenne des 25% de trajets les plus gourmands (pire cas). Maxi = moyenne
// des 25% les plus économes (meilleur cas). Moyenne = conso moyenne générale, inchangée.
Calc.autonomyTiles = function (trips, batteryEnd) {
  if (batteryEnd === null || batteryEnd === undefined) return { mini: null, moyenne: null, maxi: null };

  const stats = Calc.computeStats(trips);
  const moyenne = stats.avgDistancePerPercent !== null ? Math.round(batteryEnd * stats.avgDistancePerPercent * 10) / 10 : null;

  const withRate = trips
    .filter(t => (t.distanceKm || 0) > 0)
    .map(t => ({ rate: Math.max(0, (t.batteryStart || 0) - (t.batteryEnd || 0)) / t.distanceKm, t }))
    .filter(x => x.rate > 0);

  if (withRate.length === 0) return { mini: null, moyenne, maxi: null };

  const sorted = [...withRate].sort((a, b) => a.rate - b.rate); // du plus économe au plus gourmand
  const n = sorted.length;
  const bucketSize = Math.max(1, Math.round(n * 0.25));

  const economeGroup = sorted.slice(0, bucketSize);
  const gourmandGroup = sorted.slice(n - bucketSize);

  const avgRate = arr => arr.reduce((s, x) => s + x.rate, 0) / arr.length;
  const toKm = rate => Math.round(batteryEnd * (1 / rate) * 10) / 10;

  return {
    mini: toKm(avgRate(gourmandGroup)),
    moyenne,
    maxi: toKm(avgRate(economeGroup))
  };
};

window.Calc = Calc;
