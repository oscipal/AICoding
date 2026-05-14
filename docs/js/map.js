mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/standard",
  center: [10, 20],
  zoom: 1.2
});

const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "280px" });

// ── Event layer visibility ────────────────────────────────────────
function setEventRenderButtonState(mode) {
  document.getElementById("btnHybrid").classList.toggle("active", mode === "auto");
}

function updateEventLayerVisibility() {
  if (!map.getSource("events") || !map.getSource("events-raw")) return;

  if (viewMode !== "activity" || !eventsVisible) {
    for (const id of ["clusters","cluster-count","unclustered-point","events-heatmap","events-raw-point"])
      map.setLayoutProperty(id, "visibility", "none");
    return;
  }

  const zoom           = map.getZoom();
  const showStandard   = eventRenderMode === "standard" || (eventRenderMode === "auto" && zoom >= HEATMAP_TO_POINTS_ZOOM);
  const showAutoHeatmap = eventRenderMode === "auto" && zoom < HEATMAP_TO_POINTS_ZOOM;

  map.setLayoutProperty("clusters",          "visibility", showStandard    ? "visible" : "none");
  map.setLayoutProperty("cluster-count",     "visibility", showStandard    ? "visible" : "none");
  map.setLayoutProperty("unclustered-point", "visibility", showStandard    ? "visible" : "none");
  map.setLayoutProperty("events-heatmap",    "visibility", showAutoHeatmap ? "visible" : "none");
  map.setLayoutProperty("events-raw-point",  "visibility", "none");
}

function applyPointFilter() {
  if (!map.getSource("events") || !map.getSource("events-raw")) return;

  const filtered = activeCats.size === CATEGORIES.length
    ? allPointsForDay
    : allPointsForDay.filter(f => activeCats.has(featureCategory(f.properties)));

  map.getSource("events").setData({ type: "FeatureCollection", features: filtered });
  map.getSource("events-raw").setData({ type: "FeatureCollection", features: filtered });
  document.getElementById("eventsCount").textContent =
    `Showing ${filtered.length.toLocaleString()} of ${allPointsForDay.length.toLocaleString()} events`;

  const cachedMerged = Object.assign({}, ...Object.values(summaryIndexCache));
  if (Object.keys(cachedMerged).length > 0) {
    const total = filtered.length;
    const summarized = filtered.filter(f => {
      const e = cachedMerged[f.properties.url];
      if (!e) return false;
      const badTitle   = !e.title   || e.title   === "No title found"    || e.title   === "Failed to extract title";
      const badSummary = !e.summary || e.summary  === "No summary found"  || e.summary.startsWith("Failed to summarize");
      return !badTitle && !badSummary;
    }).length;
    const pct = total > 0 ? Math.round(summarized / total * 100) : 0;
    document.getElementById("summaryCount").textContent =
      `${summarized.toLocaleString()} of ${total.toLocaleString()} summarized (${pct}%)`;
  } else {
    document.getElementById("summaryCount").textContent = "";
  }

  updateEventLayerVisibility();
}

// ── Choropleth rendering ──────────────────────────────────────────
function renderChoropleth(rows, label) {
  countByIso = makeCountLookup(rows);
  document.getElementById("dateLabel").textContent = label;
  map.setPaintProperty("country-fills", "fill-color", buildFillExpression(rows));
  renderMostActive();
}

async function renderSelectionByIndex(index) {
  const periodKey = availablePeriods[index];
  if (!periodKey) return;

  if (viewMode === "political") {
    let gsData = currentMode === "daily"
      ? await loadGoldstein(periodKey)
      : await buildGoldsteinAggregate(currentMode, periodKey);
    goldsteinByIso = makeGoldsteinLookup(gsData);

    let fillExpression, label;
    if (politicalSubMode === "tone") {
      fillExpression = buildToneExpression(gsData);
    } else {
      fillExpression = buildGoldsteinExpression(gsData);
    }
    label = formatPeriodLabel(currentMode, periodKey);
    document.getElementById("dateLabel").textContent = label;
    map.setPaintProperty("country-fills", "fill-color", fillExpression);

    if (map.getSource("events")) {
      map.getSource("events").setData({ type: "FeatureCollection", features: [] });
      map.getSource("events-raw").setData({ type: "FeatureCollection", features: [] });
      document.getElementById("eventsCount").textContent = "Not shown in Political Landscape mode";
      updateEventLayerVisibility();
    }
    currentDayKey = periodKey;
    renderMostActive();
    renderMediaOrigins();
    return;
  }

  // Activity mode
  const rows  = await getRowsForSelection(currentMode, periodKey);
  const label = formatPeriodLabel(currentMode, periodKey);

  if (map.getSource("events")) {
    if (currentMode === "daily") {
      currentDayKey = periodKey;
      const geojson = await loadPoints(periodKey);
      allPointsForDay = geojson.features;
    } else {
      currentDayKey = "";
      const cacheBucket = currentMode === "weekly" ? periodPointsCache.weekly : periodPointsCache.monthly;
      if (cacheBucket[periodKey]) {
        allPointsForDay = cacheBucket[periodKey];
      } else {
        const matchingDays = availableDays.filter(d =>
          currentMode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
        );
        const dailyGeojson = await Promise.all(matchingDays.map(day => loadPoints(day)));
        const combined = [];
        for (const geojson of dailyGeojson) combined.push(...(geojson.features || []));
        cacheBucket[periodKey] = combined;
        allPointsForDay = combined;
      }
    }
    renderChoropleth(mergeActivityRowsWithPointLocations(rows, allPointsForDay), label);
    applyPointFilter();
    updateEventLayerVisibility();
    renderMediaOrigins();

    const dayKeys = currentMode === "daily"
      ? [periodKey]
      : availableDays.filter(d =>
          currentMode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
        );
    Promise.all(dayKeys.map(loadSummaryIndex)).then(() => applyPointFilter());
  }
}

function setActiveButton(mode) {
  document.getElementById("btnDaily").classList.toggle("active",   mode === "daily");
  document.getElementById("btnWeekly").classList.toggle("active",  mode === "weekly");
  document.getElementById("btnMonthly").classList.toggle("active", mode === "monthly");
}

async function switchMode(mode, targetIndex = null) {
  currentMode = mode;
  setActiveButton(mode);
  availablePeriods = computeAvailablePeriods(mode);
  const slider = document.getElementById("daySlider");
  slider.min   = 0;
  slider.max   = Math.max(availablePeriods.length - 1, 0);
  slider.value = targetIndex === null ? slider.max : Math.max(Math.min(targetIndex, slider.max), 0);
  await renderSelectionByIndex(Number(slider.value));
}

// ── Popup builder ─────────────────────────────────────────────────
function buildPopupHTML(props, dayKey) {
  const catId    = featureCategory(props);
  const cat      = CAT_BY_ID[catId];
  const color    = cat ? cat.color : "#888";
  const catLabel = cat ? cat.label : "Unknown";
  const dateStr  = dayKey ? `${dayKey.slice(0,4)}-${dayKey.slice(4,6)}-${dayKey.slice(6,8)}` : "";
  const toneNum  = parseFloat(props.tone);
  const toneStr  = isNaN(toneNum) ? "" :
    `<span style="color:${toneNum < -2 ? "#e74c3c" : toneNum > 2 ? "#27ae60" : "#888"}">
      ${toneNum > 0 ? "+" : ""}${toneNum.toFixed(1)} tone</span>`;
  const goldNum  = parseFloat(props.goldstein);
  const goldStr  = isNaN(goldNum) ? "" :
    `<span style="color:${goldNum < -3 ? "#e74c3c" : goldNum > 3 ? "#27ae60" : "#888"}">
      Goldstein ${goldNum > 0 ? "+" : ""}${goldNum.toFixed(1)}</span>`;
  const sourceLink = props.url
    ? `<a href="${props.url}" target="_blank" rel="noopener">${props.source || "source"}</a>`
    : (props.source || "—");

  return `<div class="event-popup">
    <div class="popup-type" style="color:${color}">${catLabel}</div>
    <div class="popup-row" style="font-weight:600">${props.event_type || ""}</div>
    <div class="popup-row">📍 ${props.location || "Unknown"}</div>
    <div class="popup-row">📅 ${dateStr} &nbsp; ${toneStr} &nbsp; ${goldStr}</div>
    <div class="popup-row">📰 ${sourceLink}</div>
  </div>`;
}

function clusterLeaves(source, clusterId, limit) {
  return new Promise((resolve, reject) =>
    source.getClusterLeaves(clusterId, limit, 0,
      (err, feats) => err ? reject(err) : resolve(feats))
  );
}

// ── Map load ──────────────────────────────────────────────────────
map.on("load", async () => {
  const datesRes = await fetch("./mb_data/dates.json");
  if (!datesRes.ok) throw new Error("Cannot load dates.json");
  availableDays = await datesRes.json();

  map.addSource("countries", {
    type: "vector",
    url: "mapbox://mapbox.country-boundaries-v1"
  });

  const countryFilter = [
    "all",
    ["==", ["get", "disputed"], "false"],
    ["any", ["==", "all", ["get", "worldview"]], ["in", "US", ["get", "worldview"]]]
  ];

  map.addLayer({
    id: "country-fills", type: "fill",
    source: "countries", "source-layer": "country_boundaries",
    filter: countryFilter,
    paint: {
      "fill-color": "rgba(0,0,0,0)",
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.35, 0.8]
    }
  });

  map.addLayer({
    id: "country-borders", type: "line",
    source: "countries", "source-layer": "country_boundaries",
    filter: countryFilter,
    paint: { "line-color": "#ffffff", "line-width": 0.5 }
  });

  map.addSource("events", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true, clusterMaxZoom: 10, clusterRadius: 40
  });

  map.addSource("events-raw", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  map.addLayer({
    id: "clusters", type: "circle", source: "events",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#fca44b", 25, "#f56030", 150, "#c0392b"],
      "circle-radius": ["step", ["get", "point_count"], 14, 25, 20, 150, 26],
      "circle-opacity": 0.88,
      "circle-stroke-width": 1.5, "circle-stroke-color": "rgba(255,255,255,0.6)"
    }
  });

  map.addLayer({
    id: "cluster-count", type: "symbol", source: "events",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 11
    },
    paint: { "text-color": "#ffffff" }
  });

  map.addLayer({
    id: "unclustered-point", type: "circle", source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#f56030", "circle-radius": 5,
      "circle-stroke-width": 1, "circle-stroke-color": "#fff"
    }
  });

  map.addLayer({
    id: "events-heatmap", type: "heatmap", source: "events-raw",
    maxzoom: HEATMAP_TO_POINTS_ZOOM,
    paint: {
      "heatmap-weight":     ["interpolate", ["linear"], ["zoom"], 0, 0.2, HEATMAP_TO_POINTS_ZOOM, 1],
      "heatmap-intensity":  ["interpolate", ["linear"], ["zoom"], 0, 0.6, HEATMAP_TO_POINTS_ZOOM, 1.2],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(33,102,172,0)", 0.2, "#66c2a5", 0.4, "#abdda4",
        0.6, "#fdae61", 0.8, "#f46d43", 1, "#d73027"
      ],
      "heatmap-radius":  ["interpolate", ["linear"], ["zoom"], 0, 6, HEATMAP_TO_POINTS_ZOOM, 20],
      "heatmap-opacity": 0.9
    },
    layout: { visibility: "none" }
  });

  map.addLayer({
    id: "events-raw-point", type: "circle", source: "events-raw",
    minzoom: HEATMAP_TO_POINTS_ZOOM,
    paint: {
      "circle-color": "#d73027",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], HEATMAP_TO_POINTS_ZOOM, 3, 10, 6],
      "circle-stroke-width": 1, "circle-stroke-color": "#fff", "circle-opacity": 0.9
    },
    layout: { visibility: "none" }
  });

  // ── Choropleth interactions ───────────────────────────────────
  map.on("click", "country-fills", e => {
    if (!e.features.length) return;
    const pointHits = map.queryRenderedFeatures(e.point, {
      layers: ["clusters","unclustered-point","events-raw-point"]
    });
    if (pointHits.length) return;
    const props = e.features[0].properties;
    const iso3  = props.iso_3166_1_alpha_3;
    const name  = props.name_en || iso3;

    // Cache bounds from the clicked feature geometry
    const geo = e.features[0].geometry;
    const b   = countryBoundsMap[iso3] || new mapboxgl.LngLatBounds();
    (geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates)
      .forEach(poly => poly[0].forEach(c => b.extend(c)));
    countryBoundsMap[iso3] = b;

    if (viewMode === "political") {
      tsCountryBounds = b;
      showTimeSeries(iso3, name);
      return;
    }
    showArticlesForCountry(iso3, name);
    map.fitBounds(b, { padding: 40, maxZoom: 5, duration: 1000 });
  });

  map.on("mousemove", "country-fills", e => {
    if (!e.features.length) return;
    if (hoveredCountryId !== null)
      map.setFeatureState({ source: "countries", sourceLayer: "country_boundaries", id: hoveredCountryId }, { hover: false });
    hoveredCountryId = e.features[0].id;
    map.setFeatureState({ source: "countries", sourceLayer: "country_boundaries", id: hoveredCountryId }, { hover: true });
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "country-fills", () => {
    if (hoveredCountryId !== null)
      map.setFeatureState({ source: "countries", sourceLayer: "country_boundaries", id: hoveredCountryId }, { hover: false });
    hoveredCountryId = null;
    map.getCanvas().style.cursor = "";
  });

  // ── Event point interactions ──────────────────────────────────
  let clusterClickTimer = null;

  map.on("click", "clusters", e => {
    e.originalEvent.stopPropagation();
    const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    if (!f.length) return;
    const clusterId = f[0].properties.cluster_id;
    clusterClickTimer = setTimeout(async () => {
      clusterClickTimer = null;
      try {
        const leaves = await clusterLeaves(map.getSource("events"), clusterId, Infinity);
        await showArticlePanel(leaves);
      } catch(err) { console.error("clusterLeaves error:", err); }
    }, 250);
  });

  map.on("dblclick", "clusters", e => {
    if (clusterClickTimer) { clearTimeout(clusterClickTimer); clusterClickTimer = null; }
    const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    if (!f.length) return;
    const clusterId = f[0].properties.cluster_id;
    map.getSource("events").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (!err) map.easeTo({ center: f[0].geometry.coordinates, zoom: zoom + 1 });
    });
    e.originalEvent.stopPropagation();
  });

  map.on("click", "unclustered-point", async e => { e.originalEvent.stopPropagation(); await showArticlePanel(e.features); });
  map.on("click", "events-raw-point",  async e => { e.originalEvent.stopPropagation(); await showArticlePanel(e.features); });

  for (const layer of ["clusters","unclustered-point","events-raw-point"]) {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }

  map.on("zoom", () => { if (eventRenderMode === "auto") updateEventLayerVisibility(); });

  // ── Initial render ────────────────────────────────────────────
  await switchMode("daily");
  setupCountrySearch();
  setupKeywordSearch();
  setupViewSelector();

  map.once("idle", () => { buildCountryList(); renderMostActive(); });
  map.on("moveend", buildCountryList);

  // ── Button listeners ──────────────────────────────────────────
  document.getElementById("daySlider").addEventListener("input", async e => {
    await renderSelectionByIndex(Number(e.target.value));
  });

  document.getElementById("btnDaily").addEventListener("click",   () => switchMode("daily"));
  document.getElementById("btnWeekly").addEventListener("click",  () => switchMode("weekly"));
  document.getElementById("btnMonthly").addEventListener("click", () => switchMode("monthly"));
  document.getElementById("datePickerBtn").addEventListener("click", openDatePicker);
  document.getElementById("datePickerClose").addEventListener("click", closeDatePicker);
  document.getElementById("datePickerCancel").addEventListener("click", closeDatePicker);
  document.getElementById("datePickerGo").addEventListener("click", applyDatePickerSelection);
  document.getElementById("datePickerOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("datePickerOverlay")) closeDatePicker();
  });
  document.querySelectorAll(".picker-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => setDatePickerMode(btn.dataset.mode));
  });
  document.getElementById("datePickerInput").addEventListener("keydown", e => {
    if (e.key === "Enter") applyDatePickerSelection();
    if (e.key === "Escape") closeDatePicker();
  });

  document.getElementById("locateBtn").addEventListener("click",  locateUser);
  document.getElementById("zoomOutBtn").addEventListener("click", () => {
    map.flyTo({ center: [10, 20], zoom: 1.2, essential: true });
  });

  document.getElementById("btnGoldstein").addEventListener("click", async () => {
    if (politicalSubMode === "goldstein") return;
    politicalSubMode = "goldstein";
    document.getElementById("btnGoldstein").classList.add("active");
    document.getElementById("btnTone").classList.remove("active");
    await renderSelectionByIndex(Number(document.getElementById("daySlider").value));
  });

  document.getElementById("btnTone").addEventListener("click", async () => {
    if (politicalSubMode === "tone") return;
    politicalSubMode = "tone";
    document.getElementById("btnTone").classList.add("active");
    document.getElementById("btnGoldstein").classList.remove("active");
    await renderSelectionByIndex(Number(document.getElementById("daySlider").value));
  });

  document.getElementById("btnHybrid").addEventListener("click", () => {
    eventRenderMode = eventRenderMode === "auto" ? "standard" : "auto";
    setEventRenderButtonState(eventRenderMode);
    updateEventLayerVisibility();
  });

  document.getElementById("showEvents").addEventListener("change", e => {
    eventsVisible = e.target.checked;
    applyPointFilter();
  });

  document.getElementById("searchBtn").addEventListener("click", searchArticles);
  document.getElementById("searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") searchArticles();
  });

  let searchDebounceTimer = null;
  document.getElementById("searchInput").addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(searchArticles, 300);
  });

  document.getElementById("btnMatchExact").addEventListener("click", () => {
    document.getElementById("btnMatchExact").classList.add("active");
    document.getElementById("btnMatchContains").classList.remove("active");
    searchArticles();
  });
  document.getElementById("btnMatchContains").addEventListener("click", () => {
    document.getElementById("btnMatchContains").classList.add("active");
    document.getElementById("btnMatchExact").classList.remove("active");
    searchArticles();
  });
  document.getElementById("searchInTitle").addEventListener("change", searchArticles);
  document.getElementById("searchInSummary").addEventListener("change", searchArticles);

  document.getElementById("tsClose").addEventListener("click", closeTimeSeries);

  document.getElementById("infoBtn").addEventListener("click", () => {
    document.getElementById("infoOverlay").classList.add("visible");
  });
  document.getElementById("infoModalClose").addEventListener("click", () => {
    document.getElementById("infoOverlay").classList.remove("visible");
  });
  document.getElementById("infoOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("infoOverlay"))
      document.getElementById("infoOverlay").classList.remove("visible");
  });
  document.getElementById("articlePanelClose").addEventListener("click", closeArticlePanel);

  const allCatIds = CATEGORIES.map(c => c.id);
  const catBtns   = document.querySelectorAll(".cat-btn");

  function setCatActive(ids) {
    activeCats = new Set(ids);
    catBtns.forEach(b => b.classList.toggle("active", activeCats.has(b.dataset.cat)));
    applyPointFilter();
  }

  catBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      if (activeCats.size === 1 && activeCats.has(cat)) setCatActive(allCatIds);
      else setCatActive([cat]);
    });
  });

  document.getElementById("controlsToggle").addEventListener("click", () => {
    document.getElementById("controls").classList.toggle("open");
  });

  map.on("click", () => {
    if (window.innerWidth <= 640)
      document.getElementById("controls").classList.remove("open");
  });
});
