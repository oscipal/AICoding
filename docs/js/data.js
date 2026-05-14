const DATA_BASE_URL = (typeof window !== "undefined" && window.DATA_BASE_URL)
  ? String(window.DATA_BASE_URL).replace(/\/$/, "")
  : "";

function dataUrl(path) {
  return DATA_BASE_URL ? `${DATA_BASE_URL}/${path}` : `./${path}`;
}

async function loadDaily(dayKey) {
  if (!dailyCache[dayKey]) {
    const r = await fetch(dataUrl(`mb_data/${dayKey}.json`));
    if (!r.ok) throw new Error(`Cannot load ${dataUrl(`mb_data/${dayKey}.json`)}`);
    dailyCache[dayKey] = await r.json();
  }
  return dailyCache[dayKey];
}

async function loadPoints(dayKey) {
  if (!pointsCache[dayKey]) {
    const r = await fetch(dataUrl(`points_data/${dayKey}.geojson`));
    if (!r.ok) throw new Error(`Cannot load ${dataUrl(`points_data/${dayKey}.geojson`)}`);
    pointsCache[dayKey] = await r.json();
  }
  return pointsCache[dayKey];
}

async function loadGoldstein(dayKey) {
  if (!goldsteinCache[dayKey]) {
    const r = await fetch(dataUrl(`goldstein_data/${dayKey}.json`));
    goldsteinCache[dayKey] = r.ok ? await r.json() : [];
  }
  return goldsteinCache[dayKey];
}

async function loadSummaryIndex(dayKey) {
  if (summaryIndexCache[dayKey]) return summaryIndexCache[dayKey];

  const compactRes = await fetch(dataUrl(`final_data/${dayKey}_summaries.json`));
  if (!compactRes.ok) throw new Error(`Cannot load ${dataUrl(`final_data/${dayKey}_summaries.json`)}`);
  summaryIndexCache[dayKey] = await compactRes.json();
  return summaryIndexCache[dayKey];
}

async function buildAggregate(mode, periodKey) {
  if (aggregateCache[mode][periodKey]) return aggregateCache[mode][periodKey];
  const matching = availableDays.filter(d =>
    mode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
  );
  const allRows = await Promise.all(matching.map(day => loadDaily(day)));
  const totals = {};
  for (const rows of allRows) {
    for (const r of rows) {
      if (!r.iso3) continue;
      totals[r.iso3] = (totals[r.iso3] || 0) + (Number(r.count) || 0);
    }
  }
  const agg = Object.entries(totals).map(([iso3, count]) => ({ iso3, count }));
  aggregateCache[mode][periodKey] = agg;
  return agg;
}

async function buildGoldsteinAggregate(mode, periodKey) {
  if (goldsteinAggCache[mode][periodKey]) return goldsteinAggCache[mode][periodKey];
  const matching = availableDays.filter(d =>
    mode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
  );
  const allData = await Promise.all(matching.map(day => loadGoldstein(day)));
  const totals = {};
  for (const data of allData) {
    for (const r of data) {
      if (!totals[r.iso3]) totals[r.iso3] = { gs: 0, n: 0, conflict: 0, tone: 0, tone_n: 0 };
      totals[r.iso3].gs       += r.goldstein * r.n;
      totals[r.iso3].n        += r.n;
      totals[r.iso3].conflict += r.conflict_pct * r.n;
      if (r.avg_tone !== null && r.avg_tone !== undefined) {
        totals[r.iso3].tone   += r.avg_tone * r.n;
        totals[r.iso3].tone_n += r.n;
      }
    }
  }
  const result = Object.entries(totals)
    .filter(([, s]) => s.n > 0)
    .map(([iso3, s]) => ({
      iso3,
      goldstein:    Math.round(s.gs / s.n * 100) / 100,
      n:            s.n,
      conflict_pct: Math.round(s.conflict / s.n * 10) / 10,
      avg_tone:     s.tone_n > 0 ? Math.round(s.tone / s.tone_n * 100) / 100 : null,
    }));
  goldsteinAggCache[mode][periodKey] = result;
  return result;
}

async function getRowsForSelection(mode, periodKey) {
  return mode === "daily" ? loadDaily(periodKey) : buildAggregate(mode, periodKey);
}

function computeAvailablePeriods(mode) {
  if (mode === "daily")   return [...availableDays];
  if (mode === "weekly")  return [...new Set(availableDays.map(getWeekKey))].sort();
  if (mode === "monthly") return [...new Set(availableDays.map(getMonthKey))].sort();
  return [];
}
