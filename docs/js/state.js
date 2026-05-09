// ── Categories ───────────────────────────────────────────────────
const CATEGORIES = [
  { id: "conflict",     label: "Violence & Conflict",     color: "#e74c3c" },
  { id: "protest",      label: "Protest",                 color: "#e67e22" },
  { id: "pressure",     label: "Threats & Coercion",      color: "#9b59b6" },
  { id: "disagreement", label: "Demands & Rejection",     color: "#f39c12" },
  { id: "diplomacy",    label: "Diplomacy & Cooperation", color: "#27ae60" },
];
const CAT_BY_ID  = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const CAT_COLORS = Object.fromEntries(CATEGORIES.map(c => [c.id, c.color]));
function featureCategory(props) { return props.category || "diplomacy"; }

const HEATMAP_TO_POINTS_ZOOM = 5.5;

// ── Mutable state ─────────────────────────────────────────────────
let viewMode         = "activity";
let politicalSubMode = "goldstein";
let currentMode      = "daily";
let countryNameMap   = {};
let currentDayKey    = "";
let availableDays    = [];
let availablePeriods = [];
let countByIso       = {};
let goldsteinByIso   = {};
let hoveredCountryId = null;
let userLocationMarker = null;

let allPointsForDay  = [];
let activeCats       = new Set(CATEGORIES.map(c => c.id));
let eventsVisible    = true;
let eventRenderMode  = "standard";

const dailyCache        = {};
const aggregateCache    = { weekly: {}, monthly: {} };
const goldsteinAggCache = { weekly: {}, monthly: {} };
const pointsCache       = {};
const goldsteinCache    = {};
const summaryIndexCache = {};

let tsChart         = null;
let tsCountryBounds = null;

// ── Color scales ─────────────────────────────────────────────────
function colorForCount(count) {
  const log = Math.log10(Math.max(Number(count) || 0, 1));
  if (log > 4) return "#084594";
  if (log > 3) return "#2171b5";
  if (log > 2) return "#4292c6";
  if (log > 1) return "#9ecae1";
  if ((Number(count) || 0) > 0) return "#6baed6";
  return "rgba(0,0,0,0)";
}

function colorForGoldstein(score) {
  if (score === null || score === undefined) return "rgba(0,0,0,0)";
  if (score >  4) return "#1a9641";
  if (score >  2) return "#a6d96a";
  if (score >  0) return "#d9ef8b";
  if (score > -1) return "#fee08b";
  if (score > -3) return "#fc8d59";
  if (score > -6) return "#d73027";
  return "#a50026";
}

function colorForTone(score) {
  if (score === null || score === undefined) return "rgba(0,0,0,0)";
  if (score >  2) return "#1a9641";
  if (score >  0) return "#91cf60";
  if (score > -2) return "#fee090";
  if (score > -5) return "#fc8d59";
  return "#d73027";
}

function buildFillExpression(rows) {
  const expr = ["match", ["get", "iso_3166_1_alpha_3"]];
  for (const row of rows) {
    if (!row.iso3) continue;
    expr.push(row.iso3, colorForCount(row.count));
  }
  expr.push("rgba(0,0,0,0)");
  return expr;
}

function buildGoldsteinExpression(rows) {
  const expr = ["match", ["get", "iso_3166_1_alpha_3"]];
  for (const r of rows) {
    if (!r.iso3) continue;
    expr.push(r.iso3, colorForGoldstein(r.goldstein));
  }
  expr.push("rgba(0,0,0,0)");
  return expr;
}

function buildToneExpression(rows) {
  const expr = ["match", ["get", "iso_3166_1_alpha_3"]];
  for (const r of rows) {
    if (!r.iso3 || r.avg_tone === null || r.avg_tone === undefined) continue;
    expr.push(r.iso3, colorForTone(r.avg_tone));
  }
  expr.push("rgba(0,0,0,0)");
  return expr;
}

function makeCountLookup(rows) {
  const lookup = {};
  for (const row of rows) {
    if (!row.iso3) continue;
    lookup[row.iso3] = Number(row.count) || 0;
  }
  return lookup;
}

function makeGoldsteinLookup(rows) {
  const lookup = {};
  for (const r of rows) lookup[r.iso3] = r;
  return lookup;
}

// ── Date helpers ─────────────────────────────────────────────────
function formatDayLabel(dayKey) {
  return `${dayKey.slice(0,4)}-${dayKey.slice(4,6)}-${dayKey.slice(6,8)}`;
}
function getMonthKey(d) { return `${d.slice(0,4)}-${d.slice(4,6)}`; }
function getWeekKey(d) {
  const date = new Date(Date.UTC(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8)));
  const tmp  = new Date(date);
  const day  = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yr = tmp.getUTCFullYear();
  const wk = Math.ceil(((tmp - new Date(Date.UTC(yr,0,1))) / 86400000 + 1) / 7);
  return `${yr}-W${String(wk).padStart(2,"0")}`;
}

// ── Search stop words ────────────────────────────────────────────
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for",
  "of","with","by","from","is","was","are","were","be","been",
  "has","have","had","it","its","as","that","this","into","not",
  "he","she","they","we","his","her","their","after","over","also"
]);

// ── Domain → country ─────────────────────────────────────────────
const DOMAIN_COUNTRY = {
  "apnews.com":"United States","upi.com":"United States","nytimes.com":"United States",
  "washingtonpost.com":"United States","wsj.com":"United States","usatoday.com":"United States",
  "cnn.com":"United States","foxnews.com":"United States","nbcnews.com":"United States",
  "cbsnews.com":"United States","abcnews.go.com":"United States","npr.org":"United States",
  "politico.com":"United States","thehill.com":"United States","bloomberg.com":"United States",
  "businessinsider.com":"United States","huffpost.com":"United States","vox.com":"United States",
  "axios.com":"United States","time.com":"United States","newsweek.com":"United States",
  "theatlantic.com":"United States","latimes.com":"United States","nypost.com":"United States",
  "chicagotribune.com":"United States","bostonglobe.com":"United States",
  "sfgate.com":"United States","seattletimes.com":"United States",
  "forbes.com":"United States","fortune.com":"United States","wired.com":"United States",
  "slate.com":"United States","salon.com":"United States","motherjones.com":"United States",
  "breitbart.com":"United States","thedailybeast.com":"United States",
  "militarytimes.com":"United States","defensenews.com":"United States",
  "reuters.com":"United Kingdom","reuters.net":"United Kingdom",
  "theguardian.com":"United Kingdom","bbc.com":"United Kingdom",
  "telegraph.co.uk":"United Kingdom","thetimes.co.uk":"United Kingdom",
  "independent.co.uk":"United Kingdom","dailymail.co.uk":"United Kingdom",
  "thesun.co.uk":"United Kingdom","mirror.co.uk":"United Kingdom",
  "ft.com":"United Kingdom","economist.com":"United Kingdom","sky.com":"United Kingdom",
  "standard.co.uk":"United Kingdom","express.co.uk":"United Kingdom",
  "afp.com":"France","france24.com":"France","lemonde.fr":"France",
  "lefigaro.fr":"France","liberation.fr":"France","rfi.fr":"France",
  "dw.com":"Germany","spiegel.de":"Germany","faz.net":"Germany",
  "zeit.de":"Germany","sueddeutsche.de":"Germany","handelsblatt.com":"Germany",
  "aljazeera.com":"Qatar","aljazeera.net":"Qatar",
  "arabnews.com":"Saudi Arabia","khaleejtimes.com":"UAE","gulfnews.com":"UAE",
  "rt.com":"Russia","tass.com":"Russia","tass.ru":"Russia","interfax.com":"Russia",
  "sputniknews.com":"Russia","sputnik.md":"Russia",
  "xinhuanet.com":"China","xinhua.net":"China","chinadaily.com.cn":"China",
  "globaltimes.cn":"China","cgtn.com":"China","peopledaily.com.cn":"China",
  "thehindu.com":"India","timesofindia.com":"India","ndtv.com":"India",
  "hindustantimes.com":"India","indianexpress.com":"India","livemint.com":"India",
  "dawn.com":"Pakistan","geo.tv":"Pakistan","thenews.com.pk":"Pakistan",
  "abc.net.au":"Australia","smh.com.au":"Australia","theaustralian.com.au":"Australia",
  "news.com.au":"Australia","heraldsun.com.au":"Australia",
  "globeandmail.com":"Canada","cbc.ca":"Canada","nationalpost.com":"Canada",
  "torontostar.com":"Canada","montrealgazette.com":"Canada",
  "japantimes.co.jp":"Japan","nhk.or.jp":"Japan","asahi.com":"Japan",
  "koreatimes.co.kr":"South Korea","koreaherald.com":"South Korea","yonhapnews.co.kr":"South Korea",
  "haaretz.com":"Israel","timesofisrael.com":"Israel","jpost.com":"Israel",
  "dailysabah.com":"Turkey","hurriyet.com.tr":"Turkey",
  "presstv.com":"Iran","presstv.ir":"Iran","irna.ir":"Iran",
  "straitstimes.com":"Singapore","channelnewsasia.com":"Singapore",
  "bangkokpost.com":"Thailand","scmp.com":"Hong Kong",
  "punchng.com":"Nigeria","vanguardngr.com":"Nigeria","businessday.ng":"Nigeria",
  "theeastafrican.co.ke":"Kenya","nation.co.ke":"Kenya",
  "egyptindependent.com":"Egypt","ahram.org.eg":"Egypt",
  "irishtimes.com":"Ireland","rte.ie":"Ireland",
  "nzherald.co.nz":"New Zealand","stuff.co.nz":"New Zealand",
  "efe.com":"Spain","ansa.it":"Italy","naharnet.com":"Lebanon",
};

const TLD_COUNTRY = {
  "co.uk":"United Kingdom","ac.uk":"United Kingdom","org.uk":"United Kingdom",
  "uk":"United Kingdom","de":"Germany","fr":"France","it":"Italy","es":"Spain",
  "nl":"Netherlands","be":"Belgium","ch":"Switzerland","at":"Austria",
  "se":"Sweden","no":"Norway","dk":"Denmark","fi":"Finland","pl":"Poland",
  "cz":"Czech Republic","hu":"Hungary","ro":"Romania","pt":"Portugal",
  "gr":"Greece","ru":"Russia","ua":"Ukraine","cn":"China","jp":"Japan",
  "kr":"South Korea","in":"India","pk":"Pakistan","bd":"Bangladesh",
  "au":"Australia","com.au":"Australia","nz":"New Zealand",
  "br":"Brazil","mx":"Mexico","ar":"Argentina","cl":"Chile",
  "za":"South Africa","ng":"Nigeria","ke":"Kenya","gh":"Ghana","eg":"Egypt",
  "ma":"Morocco","ca":"Canada","il":"Israel","tr":"Turkey","ir":"Iran",
  "sa":"Saudi Arabia","ae":"UAE","qa":"Qatar","sg":"Singapore",
  "my":"Malaysia","th":"Thailand","ph":"Philippines","id":"Indonesia","vn":"Vietnam",
};

function domainToCountry(domain) {
  if (!domain) return "Unknown";
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (DOMAIN_COUNTRY[d]) return DOMAIN_COUNTRY[d];
  const parts = d.split(".");
  if (parts.length >= 3) {
    const last2 = parts.slice(-2).join(".");
    if (TLD_COUNTRY[last2]) return TLD_COUNTRY[last2];
  }
  const tld = parts[parts.length - 1];
  if (TLD_COUNTRY[tld]) return TLD_COUNTRY[tld];
  if (["com","org","net","edu","info","biz","io","gov","mil"].includes(tld)) return "International";
  return "Other";
}
