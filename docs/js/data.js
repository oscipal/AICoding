const DATA_BASE_URL = (typeof window !== "undefined" && window.DATA_BASE_URL)
  ? String(window.DATA_BASE_URL).replace(/\/$/, "")
  : "";

function dataUrl(path) {
  return DATA_BASE_URL ? `${DATA_BASE_URL}/${path}` : `./${path}`;
}

async function loadDaily(dayKey) {
  if (!dailyCache[dayKey]) {
    const r = await fetch(dataUrl(`mb_data/${dayKey}.json`));
    dailyCache[dayKey] = r.ok ? await r.json() : [];
  }
  return dailyCache[dayKey];
}

async function loadPoints(dayKey) {
  if (!pointsCache[dayKey]) {
    const r = await fetch(dataUrl(`points_data/${dayKey}.geojson`));
    pointsCache[dayKey] = r.ok ? await r.json() : { type: "FeatureCollection", features: [] };
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

  const candidates = [
    dataUrl(`final_data/${dayKey}_summaries.json`),
    dataUrl(`final_data/${dayKey}_with_summary.geojson`),
  ];

  for (const url of candidates) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const payload = await res.json();
    if (payload && payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
      summaryIndexCache[dayKey] = Object.fromEntries(
        payload.features
          .map(feature => {
            const props = feature && feature.properties ? feature.properties : {};
            const key = props.url;
            if (!key) return null;
            return [key, { title: props.title, summary: props.summary }];
          })
          .filter(Boolean)
      );
    } else {
      summaryIndexCache[dayKey] = payload || {};
    }
    return summaryIndexCache[dayKey];
  }

  summaryIndexCache[dayKey] = {};
  return summaryIndexCache[dayKey];
}

async function loadSelectionPoints(mode, periodKey) {
  if (mode === "daily") {
    const daily = await loadPoints(periodKey);
    return daily.features || [];
  }

  if (mode !== "weekly" && mode !== "monthly") return [];

  const cacheBucket = periodPointsCache[mode];
  if (cacheBucket[periodKey]) return cacheBucket[periodKey];

  const promiseBucket = periodPointsPromiseCache[mode];
  if (promiseBucket[periodKey]) return promiseBucket[periodKey];

  const matching = availableDays.filter(d =>
    mode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
  );

  promiseBucket[periodKey] = Promise.all(matching.map(day => loadPoints(day)))
    .then(dailyGeojson => {
      const combined = [];
      for (const geojson of dailyGeojson) combined.push(...(geojson.features || []));
      cacheBucket[periodKey] = combined;
      return combined;
    })
    .finally(() => {
      delete promiseBucket[periodKey];
    });

  return promiseBucket[periodKey];
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
