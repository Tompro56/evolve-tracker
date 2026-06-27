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

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.batteryStart > prev.batteryEnd) {
      cycles.push({
        timestamp: curr.timestamp,
        fromPercent: prev.batteryEnd,
        toPercent: curr.batteryStart,
        injected: Math.round((curr.batteryStart - prev.batteryEnd) * 100) / 100,
        afterTripId: prev.id,
        beforeTripId: curr.id
      });
    }
  }

  return cycles;
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

window.Calc = Calc;
