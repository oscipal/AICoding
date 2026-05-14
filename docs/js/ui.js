// ── View selector ─────────────────────────────────────────────────
function updateViewUI() {
  const isActivity = viewMode === "activity";
  document.getElementById("btnActivity").classList.toggle("active",  isActivity);
  document.getElementById("btnPolitical").classList.toggle("active", !isActivity);
  document.getElementById("bodyActivity").style.display  = isActivity  ? "" : "none";
  document.getElementById("bodyPolitical").style.display = !isActivity ? "" : "none";
  document.getElementById("articleSearchSection").style.display = isActivity ? "" : "none";
  document.getElementById("categorySection").style.display      = isActivity ? "" : "none";
}

function setupViewSelector() {
  document.getElementById("btnActivity").addEventListener("click", async () => {
    if (viewMode === "activity") return;
    viewMode = "activity";
    updateViewUI();
    closeTimeSeries();
    await renderSelectionByIndex(Number(document.getElementById("daySlider").value));
  });

  document.getElementById("btnPolitical").addEventListener("click", async () => {
    if (viewMode === "political") return;
    viewMode = "political";
    updateViewUI();
    await renderSelectionByIndex(Number(document.getElementById("daySlider").value));
  });
}

let calendarMonthDate = null;
let calendarView = "month";
let calendarSelectionAction = "browse";

function parseDayKey(dayKey) {
  return new Date(Date.UTC(+dayKey.slice(0, 4), +dayKey.slice(4, 6) - 1, +dayKey.slice(6, 8)));
}

function dayKeyFromDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function monthKeyFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function weekKeyFromDate(date) {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yr = tmp.getUTCFullYear();
  const wk = Math.ceil(((tmp - new Date(Date.UTC(yr, 0, 1))) / 86400000 + 1) / 7);
  return `${yr}-W${String(wk).padStart(2, "0")}`;
}

function formatCalendarMonth(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatCalendarYear(date) {
  return String(date.getUTCFullYear());
}

function currentSelectionPeriodKey() {
  const slider = document.getElementById("daySlider");
  return availablePeriods[Number(slider.value)] || currentDayKey || "";
}

function currentSelectionDayKey() {
  const periodKey = currentSelectionPeriodKey();
  if (!periodKey) return "";
  if (currentMode === "daily") return periodKey;
  const matches = availableDays.filter(d =>
    currentMode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
  );
  return matches[0] || "";
}

function monthDaysForCalendar(date) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const start = new Date(first);
  const startDay = (start.getUTCDay() || 7) - 1;
  start.setUTCDate(start.getUTCDate() - startDay);
  const end = new Date(last);
  const endDay = 7 - (end.getUTCDay() || 7);
  end.setUTCDate(end.getUTCDate() + endDay);
  const weeks = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      row.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function monthPeriodsForYear(year) {
  const prefix = `${year}-`;
  const periods = computeAvailablePeriods("monthly").filter(key => key.startsWith(prefix));
  return periods;
}

function weekPeriodsForYear(year) {
  const prefix = `${year}-W`;
  const periods = computeAvailablePeriods("weekly").filter(key => key.startsWith(prefix));
  return periods;
}

function openDatePicker() {
  const selectedDayKey = currentSelectionDayKey() || currentSelectionPeriodKey() || availableDays[0] || "";
  const anchor = selectedDayKey ? parseDayKey(selectedDayKey) : new Date();
  calendarMonthDate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  calendarView = "month";
  calendarSelectionAction = currentMode === "monthly" ? "select" : "browse";
  renderDatePickerCalendar();
  const overlay = document.getElementById("datePickerOverlay");
  overlay.classList.add("visible");
  overlay.focus();
}

function closeDatePicker() {
  document.getElementById("datePickerOverlay").classList.remove("visible");
}

function setCalendarView(view) {
  calendarView = view;
  renderDatePickerCalendar();
}

function renderDatePickerCalendar() {
  if (!calendarMonthDate) return;
  const weekdaysRow = document.getElementById("datePickerWeekdays");
  const monthLabel = document.getElementById("datePickerMonthLabel");
  const weeksWrap = document.getElementById("datePickerWeeks");
  const dailyBtn = document.getElementById("datePickerDailyBtn");
  const weeklyBtn = document.getElementById("datePickerWeeklyBtn");
  const monthlyBtn = document.getElementById("datePickerMonthlyBtn");
  const year = calendarMonthDate.getUTCFullYear();
  const monthKey = monthKeyFromDate(calendarMonthDate);
  const monthPeriods = new Set(monthPeriodsForYear(year));
  const weekPeriods = weekPeriodsForYear(year);
  const selectedDayKey = currentSelectionDayKey();
  const selectedPeriodKey = currentSelectionPeriodKey();
  const selectedWeekKey = currentMode === "weekly" ? selectedPeriodKey : "";
  const selectedMonthKey = currentMode === "monthly" ? selectedPeriodKey : "";
  const todayKey = dayKeyFromDate(new Date());
  const availableSet = new Set(availableDays);

  if (calendarView === "month") {
    weekdaysRow.style.display = "grid";
    dailyBtn.classList.add("active");
    weeklyBtn.classList.remove("active");
    monthlyBtn.classList.remove("active");
    monthLabel.textContent = formatCalendarMonth(calendarMonthDate);
    monthLabel.classList.toggle("active-month", selectedMonthKey === monthKey);
    const weeks = monthDaysForCalendar(calendarMonthDate);
    weeksWrap.innerHTML = weeks.map(week => {
      const weekKey = weekKeyFromDate(week[0]);
      const weekNumber = weekKey.slice(-2);
      const weekActive = currentMode === "weekly" && selectedWeekKey === weekKey;
      const cells = week.map(day => {
        const dayKey = dayKeyFromDate(day);
        const inMonth = day.getUTCMonth() === calendarMonthDate.getUTCMonth();
        const isAvailable = availableSet.has(dayKey);
        const classes = ["date-picker-day-btn"];
        if (!inMonth) classes.push("outside");
        if (!isAvailable) classes.push("empty");
        if (selectedDayKey === dayKey) classes.push("active-day");
        if (currentMode === "weekly" && selectedWeekKey === weekKey) classes.push("active-period");
        if (currentMode === "monthly" && selectedMonthKey === monthKey && inMonth) classes.push("active-period");
        if (todayKey === dayKey) classes.push("today");
        return `<button type="button" class="${classes.join(" ")}" data-day-key="${dayKey}" ${isAvailable ? "" : "disabled"}>${day.getUTCDate()}</button>`;
      }).join("");
      return `
        <div class="date-picker-week">
          <button type="button" class="date-picker-week-btn${weekActive ? " active-week" : ""}" data-week-key="${weekKey}">W${weekNumber}</button>
          ${cells}
        </div>
      `;
    }).join("");
  } else if (calendarView === "year-months") {
    weekdaysRow.style.display = "none";
    dailyBtn.classList.remove("active");
    weeklyBtn.classList.remove("active");
    monthlyBtn.classList.add("active");
    monthLabel.textContent = formatCalendarYear(calendarMonthDate);
    monthLabel.classList.remove("active-month");
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i, 1)));
    weeksWrap.innerHTML = `<div class="date-picker-month-grid">${
      months.map(date => {
        const key = monthKeyFromDate(date);
        const active = monthKey === key;
        const hasData = monthPeriods.has(key);
        return `<button type="button" class="date-picker-month-btn${active ? " active-month" : ""}" data-month-key="${key}" ${hasData ? "" : "disabled"}>${date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</button>`;
      }).join("")
    }</div>`;
  } else if (calendarView === "year-weeks") {
    weekdaysRow.style.display = "none";
    dailyBtn.classList.remove("active");
    weeklyBtn.classList.add("active");
    monthlyBtn.classList.remove("active");
    monthLabel.textContent = formatCalendarYear(calendarMonthDate);
    monthLabel.classList.remove("active-month");
    weeksWrap.innerHTML = `<div class="date-picker-year-weeks-grid">${
      weekPeriods.map(weekKey => {
        const active = currentMode === "weekly" && selectedWeekKey === weekKey;
        return `
          <button type="button" class="date-picker-week-btn${active ? " active-week" : ""}" data-week-key="${weekKey}">W${weekKey.slice(-2)}</button>
        `;
      }).join("")
    }</div>`;
  }

  document.getElementById("datePickerPrevMonth").onclick = () => {
    calendarMonthDate = calendarView === "month"
      ? new Date(Date.UTC(calendarMonthDate.getUTCFullYear(), calendarMonthDate.getUTCMonth() - 1, 1))
      : new Date(Date.UTC(calendarMonthDate.getUTCFullYear() - 1, 0, 1));
    renderDatePickerCalendar();
  };
  document.getElementById("datePickerNextMonth").onclick = () => {
    calendarMonthDate = calendarView === "month"
      ? new Date(Date.UTC(calendarMonthDate.getUTCFullYear(), calendarMonthDate.getUTCMonth() + 1, 1))
      : new Date(Date.UTC(calendarMonthDate.getUTCFullYear() + 1, 0, 1));
    renderDatePickerCalendar();
  };
  dailyBtn.onclick = () => {
    calendarSelectionAction = "browse";
    setCalendarView("month");
  };
  weeklyBtn.onclick = () => {
    calendarSelectionAction = "browse";
    setCalendarView("year-weeks");
  };
  monthlyBtn.onclick = () => {
    calendarSelectionAction = currentMode === "monthly" ? "select" : "browse";
    setCalendarView("year-months");
  };
  document.getElementById("datePickerMonthLabel").onclick = calendarView === "month"
    ? () => {
        calendarSelectionAction = "browse";
        setCalendarView("year-months");
      }
    : null;

  document.querySelectorAll("#datePickerWeeks .date-picker-week-btn").forEach(btn => {
    btn.onclick = async () => {
      const weekKey = btn.dataset.weekKey;
      const idx = computeAvailablePeriods("weekly").indexOf(weekKey);
      if (idx < 0) return;
      closeDatePicker();
      await switchMode("weekly", idx);
    };
  });
  document.querySelectorAll("#datePickerWeeks .date-picker-day-btn").forEach(btn => {
    btn.onclick = async () => {
      const dayKey = btn.dataset.dayKey;
      if (!dayKey || !availableSet.has(dayKey)) return;
      const idx = computeAvailablePeriods("daily").indexOf(dayKey);
      if (idx < 0) return;
      closeDatePicker();
      await switchMode("daily", idx);
    };
  });
  document.querySelectorAll("#datePickerWeeks .date-picker-month-btn").forEach(btn => {
    btn.onclick = async () => {
      const monthKey = btn.dataset.monthKey;
      const month = parseInt(monthKey.slice(5, 7), 10) - 1;
      const year = parseInt(monthKey.slice(0, 4), 10);
      calendarMonthDate = new Date(Date.UTC(year, month, 1));
      if (calendarSelectionAction === "select") {
        const idx = computeAvailablePeriods("monthly").indexOf(monthKey);
        if (idx < 0) return;
        closeDatePicker();
        await switchMode("monthly", idx);
        return;
      }
      setCalendarView("month");
    };
  });
}

// ── Keyword search ────────────────────────────────────────────────
function buildWordList() {
  const words = new Set();
  const addText = str => {
    if (!str) return;
    str.toLowerCase()
      .split(/[^a-zÀ-ɏ']+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
      .forEach(w => words.add(w));
  };
  for (const f of allPointsForDay) addText(f.properties?.title);
  for (const idx of Object.values(summaryIndexCache)) {
    for (const entry of Object.values(idx)) {
      addText(entry.title);
      addText(entry.summary);
    }
  }
  return words;
}

function setupKeywordSearch() {
  const input    = document.getElementById("searchInput");
  const dropdown = document.getElementById("searchDropdown");
  let suggestions = [];
  let kbdIdx = -1;

  function renderSuggestions(q) {
    kbdIdx = -1;
    dropdown.innerHTML = "";
    if (!q || q.length < 2) { dropdown.classList.remove("open"); return; }
    const words = buildWordList();
    suggestions = [...words].filter(w => w.startsWith(q)).sort((a, b) => a.localeCompare(b)).slice(0, 8);
    if (!suggestions.length) { dropdown.classList.remove("open"); return; }
    suggestions.forEach(word => {
      const div = document.createElement("div");
      div.className = "search-opt";
      div.textContent = word;
      div.addEventListener("mousedown", e => { e.preventDefault(); input.value = word; dropdown.classList.remove("open"); });
      dropdown.appendChild(div);
    });
    dropdown.classList.add("open");
  }

  input.addEventListener("input", e => renderSuggestions(e.target.value.trim().toLowerCase()));
  input.addEventListener("keydown", e => {
    const opts = dropdown.querySelectorAll(".search-opt");
    if (e.key === "ArrowDown") {
      kbdIdx = Math.min(kbdIdx + 1, opts.length - 1);
      opts.forEach((o, i) => o.classList.toggle("kbd-selected", i === kbdIdx));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      kbdIdx = Math.max(kbdIdx - 1, 0);
      opts.forEach((o, i) => o.classList.toggle("kbd-selected", i === kbdIdx));
      e.preventDefault();
    } else if (e.key === "Enter" && kbdIdx >= 0 && suggestions[kbdIdx]) {
      input.value = suggestions[kbdIdx];
      dropdown.classList.remove("open");
    } else if (e.key === "Escape") {
      dropdown.classList.remove("open");
    }
  });
  input.addEventListener("blur", () => setTimeout(() => dropdown.classList.remove("open"), 150));
}

async function searchArticles() {
  const query    = document.getElementById("searchInput").value.trim().toLowerCase();
  const statusEl = document.getElementById("searchStatus");
  if (!query) { statusEl.textContent = ""; closeArticlePanel(); return; }
  statusEl.textContent = "Searching…";

  const slider    = document.getElementById("daySlider");
  const periodKey = availablePeriods[Number(slider.value)];
  if (!periodKey) { statusEl.textContent = "No data loaded."; return; }

  const dayKeys = currentMode === "daily"
    ? [periodKey]
    : availableDays.filter(d =>
        currentMode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
      );

  const indexes = await Promise.all(dayKeys.map(loadSummaryIndex));
  const merged  = Object.assign({}, ...indexes);

  if (currentMode !== "daily" && !allPointsForDay.length) {
    beginLoadingNow();
    try {
      allPointsForDay = await loadSelectionPoints(currentMode, periodKey);
    } finally {
      endLoading();
    }
  }

  const matches = allPointsForDay
    .map(f => {
      const props = f.properties || {};
      const extra = merged[props.url] || {};
      return { ...f, properties: { ...props, ...extra } };
    })
    .filter(f => {
      const p = f.properties;
      if (!p.title || p.title === "No title found") return false;
      const inTitle   = document.getElementById("searchInTitle").checked;
      const inSummary = document.getElementById("searchInSummary").checked;
      if (!inTitle && !inSummary) return false;
      const exactMode = document.getElementById("btnMatchExact").classList.contains("active");
      const test = exactMode
        ? str => new RegExp(`(?<![\\wÀ-ɏ])(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\wÀ-ɏ])`, "i").test(str)
        : str => str.toLowerCase().includes(query);
      return (inTitle   && test(p.title   || "")) ||
             (inSummary && test(p.summary || ""));
    });

  if (!matches.length) {
    statusEl.textContent = `No results for "${query}".`;
    closeArticlePanel();
    return;
  }
  statusEl.textContent = `${matches.length} result${matches.length !== 1 ? "s" : ""} for "${query}"`;
  document.getElementById("articlePanelTitle").textContent    = `${matches.length} result${matches.length !== 1 ? "s" : ""}: "${query}"`;
  document.getElementById("articlePanelSubtitle").textContent = "";
  document.getElementById("articleList").innerHTML            = matches.map(f => renderArticleItem(f.properties)).join("");
  document.getElementById("articlePanel").classList.add("visible");
  document.getElementById("infoBtn").style.display = "none";
}

// ── Country search ────────────────────────────────────────────────
function buildCountryList() {
  const features = map.querySourceFeatures("countries", { sourceLayer: "country_boundaries" });
  features.forEach(f => {
    const iso3 = f.properties.iso_3166_1_alpha_3;
    const name = f.properties.name_en;
    if (iso3 && name && !countryNameMap[iso3]) countryNameMap[iso3] = name;
    if (iso3 && f.geometry) {
      const geo = f.geometry;
      const b   = countryBoundsMap[iso3] || new mapboxgl.LngLatBounds();
      (geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates)
        .forEach(poly => poly[0].forEach(c => b.extend(c)));
      countryBoundsMap[iso3] = b;
    }
  });
}

function flyToCountry(iso3) {
  const cached = countryBoundsMap[iso3];
  if (cached && !cached.isEmpty()) {
    const camera = map.cameraForBounds(cached, { padding: 60 });
    if (camera) {
      map.flyTo({ center: camera.center, zoom: Math.max(Math.min(camera.zoom, 5), 3), duration: 800 });
      return;
    }
  }
  // Fallback: query currently-rendered tiles
  const features = map.querySourceFeatures("countries", {
    sourceLayer: "country_boundaries",
    filter: ["==", ["get", "iso_3166_1_alpha_3"], iso3]
  });
  if (!features.length) return;
  const bounds = new mapboxgl.LngLatBounds();
  features.forEach(f => {
    const geo = f.geometry;
    (geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates)
      .forEach(poly => poly[0].forEach(c => bounds.extend(c)));
  });
  if (bounds.isEmpty()) return;
  const camera = map.cameraForBounds(bounds, { padding: 60 });
  if (!camera) return;
  map.flyTo({ center: camera.center, zoom: Math.max(Math.min(camera.zoom, 5), 3), duration: 800 });
}

function setupCountrySearch() {
  const input    = document.getElementById("countrySearch");
  const dropdown = document.getElementById("countryDropdown");
  let matches = [];
  let kbdIdx  = -1;

  function renderDropdown(q) {
    kbdIdx = -1;
    dropdown.innerHTML = "";
    if (!q) { dropdown.classList.remove("open"); return; }
    matches = Object.entries(countryNameMap)
      .filter(([iso3, name]) => name.toLowerCase().includes(q) || iso3.toLowerCase().startsWith(q))
      .sort((a, b) => {
        const ai = a[1].toLowerCase().indexOf(q);
        const bi = b[1].toLowerCase().indexOf(q);
        return (ai === 0 ? -1 : bi === 0 ? 1 : ai - bi) || a[1].localeCompare(b[1]);
      })
      .slice(0, 8);
    if (!matches.length) { dropdown.classList.remove("open"); return; }
    matches.forEach(([iso3, name]) => {
      const div = document.createElement("div");
      div.className = "country-opt";
      div.textContent = name;
      div.addEventListener("click", () => selectCountry(iso3, name));
      dropdown.appendChild(div);
    });
    dropdown.classList.add("open");
  }

  input.addEventListener("input", e => renderDropdown(e.target.value.trim().toLowerCase()));
  input.addEventListener("keydown", e => {
    const opts = dropdown.querySelectorAll(".country-opt");
    if (e.key === "ArrowDown") {
      kbdIdx = Math.min(kbdIdx + 1, opts.length - 1);
      opts.forEach((o, i) => o.classList.toggle("kbd-selected", i === kbdIdx));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      kbdIdx = Math.max(kbdIdx - 1, 0);
      opts.forEach((o, i) => o.classList.toggle("kbd-selected", i === kbdIdx));
      e.preventDefault();
    } else if (e.key === "Enter" && kbdIdx >= 0 && matches[kbdIdx]) {
      const [iso3, name] = matches[kbdIdx];
      selectCountry(iso3, name);
      e.preventDefault();
    } else if (e.key === "Escape") {
      dropdown.classList.remove("open");
      input.blur();
    }
  });
  document.addEventListener("click", e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target))
      dropdown.classList.remove("open");
  });
}

async function showArticlesForCountry(iso3, name) {
  const periodKey = currentSelectionPeriodKey();
  if (!periodKey) return;
  if (currentMode !== "daily" && !allPointsForDay.length) {
    beginLoadingNow();
    try {
      allPointsForDay = await loadSelectionPoints(currentMode, periodKey);
    } finally {
      endLoading();
    }
  }
  if (!allPointsForDay.length) return;
  const names = countryArticleNames(iso3, name);
  const matches = allPointsForDay.filter(f => {
    const loc = (f.properties?.location || "").toLowerCase();
    return names.some(country => loc === country || loc.endsWith(", " + country));
  });
  if (!matches.length) return;
  await showArticlePanel(matches);
  document.getElementById("articlePanelTitle").textContent =
    `${matches.length} article${matches.length !== 1 ? "s" : ""} — ${name}`;
}

function countryArticleNames(iso3, name) {
  const names = new Set();
  const add = value => {
    if (value) names.add(String(value).trim().toLowerCase());
  };
  const normalizedIso = normalizeIso3(iso3);
  add(name);
  add(countryNameMap[normalizedIso]);
  const aliases = {
    BIH: ["Bosnia", "Bosnia and Herzegovina"],
    ESH: ["Western Sahara"],
    MNE: ["Montenegro"],
    ROU: ["Romania"],
    SVN: ["Slovenia"],
    XKX: ["Kosovo"],
  };
  (aliases[normalizedIso] || []).forEach(add);
  return [...names];
}

function selectCountry(iso3, name) {
  document.getElementById("countrySearch").value = name;
  document.getElementById("countryDropdown").classList.remove("open");
  buildCountryList();
  flyToCountry(iso3);
  if (viewMode === "political" && goldsteinByIso[iso3]) showTimeSeries(iso3, name);
  else if (viewMode === "activity") showArticlesForCountry(iso3, name);
}

// ── Most Active ───────────────────────────────────────────────────
function renderMostActive() {
  const el      = document.getElementById("mostActive");
  const titleEl = document.getElementById("mostActiveTitle");
  if (!el) return;

  if (viewMode === "activity") {
    titleEl.textContent = "Most Active";
    const entries = Object.entries(countByIso)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([iso3, n]) => ({ iso3, name: countryNameMap[iso3] || iso3, value: n.toLocaleString() + " events" }));

    if (!entries.length) {
      el.innerHTML = '<div style="font-size:11px;color:#999;padding:2px 0">No data</div>';
      return;
    }
    el.innerHTML = entries.map(e => renderRankingItem(e)).join("");
    attachRankingClicks(el);
    return;
  }

  titleEl.textContent = "Political Rankings";
  const hasCountryNames = Object.keys(countryNameMap).length > 20;
  const rows = Object.entries(goldsteinByIso)
    .filter(([iso3, d]) => d && (!hasCountryNames || countryNameMap[iso3]));
  const goldsteinRows = rows.filter(([, d]) => Number.isFinite(d.goldstein));
  const toneRows = rows.filter(([, d]) => d.avg_tone !== null && d.avg_tone !== undefined && Number.isFinite(d.avg_tone));
  const sections = [
    {
      title: "Best Media Tone",
      entries: topPoliticalEntries(toneRows, d => d.avg_tone, "desc", d => formatSigned(d.avg_tone, 1) + " tone")
    },
    {
      title: "Worst Media Tone",
      entries: topPoliticalEntries(toneRows, d => d.avg_tone, "asc", d => formatSigned(d.avg_tone, 1) + " tone")
    },
    {
      title: "Most Conflictual",
      entries: topPoliticalEntries(goldsteinRows, d => d.goldstein, "asc", d => formatSigned(d.goldstein, 1))
    },
    {
      title: "Most Diplomatic",
      entries: topPoliticalEntries(goldsteinRows, d => d.goldstein, "desc", d => formatSigned(d.goldstein, 1))
    },
  ];

  if (!sections.some(section => section.entries.length)) {
    el.innerHTML = '<div style="font-size:11px;color:#999;padding:2px 0">No data</div>';
    return;
  }

  el.innerHTML = sections.map(section => `
    <div class="ranking-group">
      <div class="ranking-title">${section.title}</div>
      ${section.entries.length
        ? section.entries.map(e => renderRankingItem(e)).join("")
        : '<div style="font-size:11px;color:#999;padding:2px 0">No data</div>'}
    </div>
  `).join("");
  attachRankingClicks(el);
}

function topPoliticalEntries(rows, valueOf, direction, valueLabel) {
  const sorted = [...rows]
    .sort((a, b) => direction === "asc" ? valueOf(a[1]) - valueOf(b[1]) : valueOf(b[1]) - valueOf(a[1]))
    .slice(0, 3);
  return sorted.map(([iso3, d]) => ({
    iso3,
    name: countryNameMap[iso3] || iso3,
    value: valueLabel(d)
  }));
}

function formatSigned(value, digits) {
  const n = Number(value);
  return (n > 0 ? "+" : "") + n.toFixed(digits);
}

function renderRankingItem(e) {
  return (
    `<div class="most-active-item" data-iso3="${e.iso3}">
      <span class="most-active-name">${e.name}</span>
      <span class="most-active-val">${e.value}</span>
    </div>`
  );
}

function attachRankingClicks(container) {
  container.querySelectorAll(".most-active-item").forEach(item => {
    item.addEventListener("click", () => {
      const iso3 = item.dataset.iso3;
      buildCountryList();
      flyToCountry(iso3);
      if (viewMode === "political" && goldsteinByIso[iso3])
        showTimeSeries(iso3, countryNameMap[iso3] || iso3);
    });
  });
}

// ── Media Origins ─────────────────────────────────────────────────
function renderMediaOrigins() {
  const el = document.getElementById("mediaOrigins");
  const titleEl = document.getElementById("mediaOriginsTitle");
  if (!el) return;
  if (viewMode !== "activity" || !allPointsForDay.length) {
    if (titleEl) titleEl.style.display = "none";
    el.style.display = "none";
    return;
  }
  if (titleEl) titleEl.style.display = "";
  el.style.display = "";
  const counts = {};
  allPointsForDay.forEach(f => {
    const country = domainToCountry(f.properties.source);
    counts[country] = (counts[country] || 0) + 1;
  });
  const total  = Object.values(counts).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top    = sorted.slice(0, 6);
  const otherCount = sorted.slice(6).reduce((a, [, n]) => a + n, 0);
  if (otherCount > 0) top.push(["Other", otherCount]);
  el.innerHTML = top.map(([label, n]) => {
    const pct = Math.round(n / total * 100);
    return `<div class="media-origin-item">
      <span style="min-width:100px;font-weight:600">${label}</span>
      <div class="media-origin-bar-wrap"><div class="media-origin-bar" style="width:${pct}%"></div></div>
      <span class="media-origin-val">${n.toLocaleString()}</span>
    </div>`;
  }).join("");
}

// ── Article panel ─────────────────────────────────────────────────
function renderArticleItem(props) {
  const esc = s => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");

  const cat     = CAT_BY_ID[featureCategory(props)] || CAT_BY_ID["diplomacy"];
  const toneNum = parseFloat(props.tone);
  const toneStr = isNaN(toneNum) ? "" :
    `<span style="color:${toneNum < -2 ? "#e74c3c" : toneNum > 2 ? "#27ae60" : "#888"}">
      ${toneNum > 0 ? "+" : ""}${toneNum.toFixed(1)} tone</span>`;
  const link  = props.url
    ? `<a class="article-link" href="${esc(props.url)}" target="_blank" rel="noopener">${esc(props.source || "source")}</a>`
    : esc(props.source || "—");
  const title   = esc(props.title || props.event_type || "Untitled article");
  const summary = esc(props.summary || "No summary available.");
  return `
    <div class="article-item">
      <div class="article-title">${title}</div>
      <div class="article-cat" style="color:${cat.color}">${cat.label}</div>
      <div class="article-event">${esc(props.event_type || "")}</div>
      <div class="article-loc">📍 ${esc(props.location || "Unknown")}</div>
      <div class="article-meta">${toneStr}${link}</div>
      <details class="article-summary-wrap">
        <summary class="article-summary-toggle">Show summary</summary>
        <div class="article-summary">${summary}</div>
      </details>
    </div>`;
}

function getSummaryDayKeys(features) {
  const fromFeatures = [...new Set(features.map(f => f?.properties?.data_day).filter(Boolean))];
  if (fromFeatures.length) return fromFeatures;
  if (currentMode === "daily" && currentDayKey) return [currentDayKey];
  const slider    = document.getElementById("daySlider");
  const periodKey = availablePeriods[Number(slider.value)];
  if (!periodKey) return [];
  return availableDays.filter(d =>
    currentMode === "weekly" ? getWeekKey(d) === periodKey : getMonthKey(d) === periodKey
  );
}

async function showArticlePanel(features) {
  const dayKeys = getSummaryDayKeys(features);
  const indexes = await Promise.all(dayKeys.map(loadSummaryIndex));
  const merged  = Object.assign({}, ...indexes);

  const enriched = features.map(f => {
    const props = f.properties || {};
    const extra = merged[props.url] || {};
    return { ...f, properties: { ...props, ...extra } };
  });

  const isBadTitle   = t => !t || t === "No title found" || t === "Failed to extract title";
  const isBadSummary = s => !s || s === "No summary found" || s.startsWith("Failed to summarize");
  const isSummarized = p => !isBadTitle(p.title) && !isBadSummary(p.summary);

  const n            = features.length;
  const withSummary  = enriched.filter(f => isSummarized(f.properties)).length;
  const pct          = n > 0 ? Math.round(withSummary / n * 100) : 0;
  document.getElementById("articlePanelTitle").textContent    = `${n} article${n !== 1 ? "s" : ""}`;
  document.getElementById("articlePanelSubtitle").textContent = `${withSummary} of ${n} summarized (${pct}%)`;

  const sorted = [...enriched].sort((a, b) => {
    return !isSummarized(a.properties) - !isSummarized(b.properties);
  });
  document.getElementById("articleList").innerHTML = sorted.map(f => renderArticleItem(f.properties)).join("");
  document.getElementById("articlePanel").classList.add("visible");
  document.getElementById("infoBtn").style.display = "none";
  popup.remove();
}

function closeArticlePanel() {
  document.getElementById("articlePanel").classList.remove("visible");
  document.getElementById("infoBtn").style.display = "";
}

// ── Time series ───────────────────────────────────────────────────
async function showTimeSeries(iso3, countryName) {
  beginLoadingNow();
  try {
    document.getElementById("tsCountryName").textContent = countryName;
    document.getElementById("tsPanel").classList.add("visible");

    const labels = [], scores = [], tones = [], counts = [], periodKeys = [];

    if (currentMode === "daily") {
      const allData = await Promise.all(availableDays.map(day => loadGoldstein(day)));
      for (let i = 0; i < availableDays.length; i++) {
        const day   = availableDays[i];
        const entry = allData[i].find(d => d.iso3 === iso3);
        labels.push(`${day.slice(4,6)}/${day.slice(6,8)}`);
        scores.push(entry ? entry.goldstein : null);
        tones.push(entry ? (entry.avg_tone ?? null) : null);
        counts.push(entry ? entry.n : 0);
        periodKeys.push(day);
      }
    } else {
      const periods = computeAvailablePeriods(currentMode);
      const allAgg  = await Promise.all(periods.map(p => buildGoldsteinAggregate(currentMode, p)));
      for (let i = 0; i < periods.length; i++) {
        const entry = allAgg[i].find(d => d.iso3 === iso3);
        labels.push(periods[i]);
        scores.push(entry ? entry.goldstein : null);
        tones.push(entry ? (entry.avg_tone ?? null) : null);
        counts.push(entry ? entry.n : 0);
        periodKeys.push(periods[i]);
      }
    }

    const hasTone = tones.some(t => t !== null);
    const ctx = document.getElementById("tsChart").getContext("2d");
    if (tsChart) tsChart.destroy();
    tsChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Goldstein Score",
            data: scores,
            borderColor: "#1f6feb",
            backgroundColor: "rgba(31,111,235,0.08)",
            tension: 0.35, fill: true, spanGaps: true,
            pointRadius: 0, pointHoverRadius: 4,
          },
          ...(hasTone ? [{
            label: "Avg Tone",
            data: tones,
            borderColor: "#e67e22",
            backgroundColor: "rgba(230,126,34,0.0)",
            tension: 0.35, fill: false, spanGaps: true,
            pointRadius: 0, pointHoverRadius: 4,
          }] : []),
          {
            label: "Event Count",
            data: counts,
            type: "bar",
            backgroundColor: "rgba(150,150,150,0.25)",
            borderColor: "rgba(150,150,150,0.5)",
            borderWidth: 1,
            yAxisID: "yCount",
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        onClick: async (evt, elements) => {
          if (!elements.length) return;
          const periodKey = periodKeys[elements[0].index];
          if (!periodKey) return;
          closeTimeSeries();
          viewMode = "activity";
          updateViewUI();
          await switchMode(currentMode);
          const slider = document.getElementById("daySlider");
          const pIdx   = availablePeriods.indexOf(periodKey);
          if (pIdx >= 0) { slider.value = pIdx; await renderSelectionByIndex(pIdx); }
          if (tsCountryBounds) map.fitBounds(tsCountryBounds, { padding: 40, maxZoom: 5, duration: 800 });
        },
        plugins: {
          legend: { display: true, position: "top", labels: { font: { size: 10 }, boxWidth: 12 } },
          tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 } }
        },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: {
            min: -10, max: 10,
            title: { display: true, text: "Score", font: { size: 10 } },
            ticks: { font: { size: 10 } },
            grid: { color: ctx => ctx.tick.value === 0 ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.06)" }
          },
          yCount: {
            position: "right",
            title: { display: true, text: "Events", font: { size: 10 } },
            ticks: { font: { size: 10 } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  } finally {
    endLoading();
  }
}

function closeTimeSeries() {
  document.getElementById("tsPanel").classList.remove("visible");
  if (tsChart) { tsChart.destroy(); tsChart = null; }
}

// ── Geolocation ───────────────────────────────────────────────────
function locateUser() {
  const statusEl = document.getElementById("locationStatus");
  if (!navigator.geolocation) { statusEl.textContent = "Geolocation not supported."; return; }
  statusEl.textContent = "Getting your location…";
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { longitude: lng, latitude: lat } = pos.coords;
      map.flyTo({ center: [lng, lat], zoom: 7, essential: true });
      if (userLocationMarker) userLocationMarker.remove();
      userLocationMarker = new mapboxgl.Marker()
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup().setHTML("<strong>You are here</strong>"))
        .addTo(map);
      statusEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },
    err => {
      const msgs = { 1: "Permission denied.", 2: "Position unavailable.", 3: "Timed out." };
      statusEl.textContent = msgs[err.code] || "Could not get location.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
