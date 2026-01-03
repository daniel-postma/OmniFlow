/* =======================
   Core Setup
======================= */
let words = [];
let currentPage = 1;
const itemsPerPage = 100;

const grid = document.getElementById("wordGrid");
const pageInfo = document.getElementById("pageInfo");
const jlptFilter = document.getElementById("jlptFilter");
const familiarityFilter = document.getElementById("familiarityFilter");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
const todayChip = document.getElementById("todayChip");

const statsPanel = document.getElementById("statsPanel");
const statsContainer = document.getElementById("statsContainer");
const toggleStats = document.getElementById("toggleStats");

const showRomajiChk = document.getElementById("showRomaji");
const favoritesOnlyChk = document.getElementById("favoritesOnly");

const openGameBtn = document.getElementById("openGameBtn");
const openGameTop = document.getElementById("openGameTop");

const LS_PROGRESS = "vocabProgress";
const LS_DAILY = "vocabProgressDaily";
const LS_HIGHEST = "vocabHighest";
const LS_OFFSET = "dailyOffset";
const LS_FAVORITES = "vocabFavorites";
const LS_EXPOSED = "vocabExposed";
const LS_FLOWMAN = "flowmanHighest";
const LS_FLOWMAN_BADGES = "flowmanBadges_v1"; // ✅ NEW

const RANK = { unknown: 0, explored: 1, known: 2, well_known: 3 };
const FLOW_RANK = { none: 0, easy: 1, normal: 2, hard: 3 };

/* =======================
   DOM Load
======================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadCSV();
  render();
  updateGameLinks();

  jlptFilter.addEventListener("change", () => {
    currentPage = 1;
    render();
    updateGameLinks();
  });
  familiarityFilter.addEventListener("change", () => {
    currentPage = 1;
    render();
    updateGameLinks();
  });
  favoritesOnlyChk.addEventListener("change", () => {
    currentPage = 1;
    render();
  });

  prevBtn.addEventListener("click", () => changePage(-1));
  nextBtn.addEventListener("click", () => changePage(1));
  showRomajiChk.addEventListener("change", render);

  document
    .getElementById("resetProgress")
    .addEventListener("click", resetProgress);

  toggleStats.addEventListener("click", () => {
    statsPanel.classList.toggle("hidden");
    toggleStats.textContent = statsPanel.classList.contains("hidden")
      ? "📊 Show Stats"
      : "📉 Hide Stats";
    if (!statsPanel.classList.contains("hidden")) updateStats();
  });

  // Export / Import
  const exportBtn = document.getElementById("exportData");
  const importBtn = document.getElementById("importData");
  const importFile = document.getElementById("importFile");
  exportBtn.addEventListener("click", exportData);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      importDataFromObject(obj);
    } catch (err) {
      console.error(err);
      alert(
        "⚠️ Could not import file. Please use a valid Fluency Flow export."
      );
    } finally {
      importFile.value = "";
    }
  });

  ensureTodayBucket();
  updateTodayChip();

  /* =======================
     Kanji Size + Bold Controls
  ======================= */
  const sizeSlider = document.getElementById("kanjiSize");
  const sizeValue = document.getElementById("kanjiSizeValue");
  const boldToggle = document.getElementById("kanjiBoldToggle");

  if (sizeSlider && sizeValue && boldToggle) {
    const savedSize = parseFloat(localStorage.getItem("kanjiFontSize")) || 1.3;
    const savedBold = localStorage.getItem("kanjiBold") === "true";

    document.documentElement.style.setProperty(
      "--kanji-font-size",
      `${savedSize}rem`
    );
    document.documentElement.style.setProperty(
      "--kanji-font-weight",
      savedBold ? "700" : "400"
    );

    sizeSlider.value = savedSize;
    sizeValue.textContent = `${savedSize.toFixed(1)}rem`;
    boldToggle.checked = savedBold;

    sizeSlider.addEventListener("input", () => {
      const value = parseFloat(sizeSlider.value);
      document.documentElement.style.setProperty(
        "--kanji-font-size",
        `${value}rem`
      );
      sizeValue.textContent = `${value.toFixed(1)}rem`;
      localStorage.setItem("kanjiFontSize", value);
    });

    boldToggle.addEventListener("change", () => {
      const isBold = boldToggle.checked;
      document.documentElement.style.setProperty(
        "--kanji-font-weight",
        isBold ? "700" : "400"
      );
      localStorage.setItem("kanjiBold", isBold ? "true" : "false");
    });
  }
});

/* =======================
   Export / Import Core
======================= */
function getAllData() {
  return {
    schema: "fluencyflow.v4", // ✅ upgraded schema
    exportedAt: new Date().toISOString(),
    data: {
      vocabProgress: JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}"),
      vocabProgressDaily: JSON.parse(localStorage.getItem(LS_DAILY) || "{}"),
      vocabHighest: JSON.parse(localStorage.getItem(LS_HIGHEST) || "{}"),
      vocabFavorites: JSON.parse(localStorage.getItem(LS_FAVORITES) || "{}"),
      vocabExposed: JSON.parse(localStorage.getItem(LS_EXPOSED) || "{}"),
      flowmanHighest: JSON.parse(localStorage.getItem(LS_FLOWMAN) || "{}"),
      flowmanBadges: JSON.parse(
        localStorage.getItem(LS_FLOWMAN_BADGES) || "{}"
      ), // ✅ NEW
      dailyOffset: parseInt(localStorage.getItem(LS_OFFSET) || "0", 10),
    },
  };
}

function mergeMapsPreferHigherRank(base, incoming) {
  const res = { ...base };
  for (const [k, v] of Object.entries(incoming || {})) {
    const cur = base[k];
    res[k] = (RANK[v] || 0) > (RANK[cur] || 0) ? v : cur ?? v;
  }
  return res;
}

function mergeDailyLog(base, incoming) {
  const res = { ...base };
  for (const [date, val] of Object.entries(incoming || {})) {
    res[date] = (res[date] || 0) + (parseInt(val, 10) || 0);
  }
  return res;
}

function mergeExposed(base, incoming) {
  const res = { ...base };
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!res[k]) res[k] = v;
    else {
      const a = new Date(res[k]).getTime();
      const b = new Date(v).getTime();
      if (!Number.isNaN(b) && (Number.isNaN(a) || b < a)) res[k] = v;
    }
  }
  return res;
}

function mergeFlowman(base, incoming) {
  const res = { ...base };
  for (const [k, v] of Object.entries(incoming || {})) {
    const cur = base[k] || "none";
    const next = v || "none";
    res[k] = (FLOW_RANK[next] || 0) > (FLOW_RANK[cur] || 0) ? next : cur;
  }
  return res;
}

function mergeBadges(base, incoming) {
  return { ...base, ...incoming }; // ✅ simple union merge
}
function exportData() {
  const d = new Date();
  const f = `fluencyflow_progress_${d.getFullYear()}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  const blob = new Blob([JSON.stringify(getAllData(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function importDataFromObject(obj) {
  const schema = obj?.schema;
  const isV1 = schema === "fluencyflow.v1";
  const isV2 = schema === "fluencyflow.v2";
  const isV3 = schema === "fluencyflow.v3";
  const isV4 = schema === "fluencyflow.v4";
  if (!isV1 && !isV2 && !isV3 && !isV4) {
    alert("Invalid import file.");
    return;
  }

  const data = obj.data || {};
  const vocabProgress = data.vocabProgress || {};
  const vocabProgressDaily = data.vocabProgressDaily || {};
  const vocabHighest = data.vocabHighest || {};
  const vocabFavorites = data.vocabFavorites || {};
  const vocabExposed = data.vocabExposed || {};
  const flowmanHighest = data.flowmanHighest || {};
  const flowmanBadges = data.flowmanBadges || {}; // ✅ NEW
  const dailyOffset = data.dailyOffset;

  const merge = confirm(
    "Import data: OK to MERGE (keep progress) or Cancel to REPLACE?"
  );

  if (merge) {
    const curProg = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");
    const curDaily = JSON.parse(localStorage.getItem(LS_DAILY) || "{}");
    const curHigh = JSON.parse(localStorage.getItem(LS_HIGHEST) || "{}");
    const curFavs = JSON.parse(localStorage.getItem(LS_FAVORITES) || "{}");
    const curExposed = JSON.parse(localStorage.getItem(LS_EXPOSED) || "{}");
    const curFlow = JSON.parse(localStorage.getItem(LS_FLOWMAN) || "{}");
    const curBadges = JSON.parse(
      localStorage.getItem(LS_FLOWMAN_BADGES) || "{}"
    );

    localStorage.setItem(
      LS_PROGRESS,
      JSON.stringify(mergeMapsPreferHigherRank(curProg, vocabProgress))
    );
    localStorage.setItem(
      LS_DAILY,
      JSON.stringify(mergeDailyLog(curDaily, vocabProgressDaily))
    );
    localStorage.setItem(
      LS_HIGHEST,
      JSON.stringify(mergeMapsPreferHigherRank(curHigh, vocabHighest))
    );
    localStorage.setItem(
      LS_FAVORITES,
      JSON.stringify({ ...curFavs, ...vocabFavorites })
    );
    localStorage.setItem(
      LS_EXPOSED,
      JSON.stringify(mergeExposed(curExposed, vocabExposed))
    );
    localStorage.setItem(
      LS_FLOWMAN,
      JSON.stringify(mergeFlowman(curFlow, flowmanHighest))
    );
    localStorage.setItem(
      LS_FLOWMAN_BADGES,
      JSON.stringify(mergeBadges(curBadges, flowmanBadges))
    );
  } else {
    localStorage.setItem(LS_PROGRESS, JSON.stringify(vocabProgress));
    localStorage.setItem(LS_DAILY, JSON.stringify(vocabProgressDaily || "{}"));
    localStorage.setItem(LS_HIGHEST, JSON.stringify(vocabHighest));
    localStorage.setItem(LS_FAVORITES, JSON.stringify(vocabFavorites));
    localStorage.setItem(LS_EXPOSED, JSON.stringify(vocabExposed));
    localStorage.setItem(LS_FLOWMAN, JSON.stringify(flowmanHighest));
    localStorage.setItem(LS_FLOWMAN_BADGES, JSON.stringify(flowmanBadges));
  }

  if (typeof dailyOffset === "number") {
    localStorage.setItem(LS_OFFSET, String(dailyOffset));
  }

  const progress = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");
  const favs = JSON.parse(localStorage.getItem(LS_FAVORITES) || "{}");
  const exposed = JSON.parse(localStorage.getItem(LS_EXPOSED) || "{}");
  const flow = JSON.parse(localStorage.getItem(LS_FLOWMAN) || "{}");

  words.forEach((w) => {
    if (progress[w.key]) w.familiarity = progress[w.key];
    w.isFavorite = !!favs[w.key];
    w.exposedAt = exposed[w.key] || null;
    w.flowmanHighest = flow[w.key] || "none";
  });

  ensureTodayBucket();
  updateTodayChip();
  render();
  updateStats();
  alert("✅ Import complete! All progress and badges restored.");
}

/* =======================
   Date + Progress Helpers
======================= */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDailyLog() {
  try {
    return JSON.parse(localStorage.getItem(LS_DAILY) || "{}");
  } catch {
    return {};
  }
}

function setDailyLog(log) {
  localStorage.setItem(LS_DAILY, JSON.stringify(log));
}

function ensureTodayBucket() {
  const log = getDailyLog();
  const t = todayKey();
  if (log[t] == null) {
    log[t] = 0;
    setDailyLog(log);
  }
}

function addDailyProgress(delta) {
  if (delta <= 0) return;
  const log = getDailyLog();
  const t = todayKey();
  log[t] = (log[t] || 0) + delta;
  setDailyLog(log);
  updateTodayChip();
}

function updateTodayChip() {
  const log = getDailyLog();
  todayChip.textContent = `Progress Points Today: ${log[todayKey()] || 0}`;
}

/* =======================
   Exposed Map
======================= */
function getExposedMap() {
  try {
    return JSON.parse(localStorage.getItem(LS_EXPOSED) || "{}");
  } catch {
    return {};
  }
}

function saveExposedMap(map) {
  localStorage.setItem(LS_EXPOSED, JSON.stringify(map));
}
/* =======================
   CSV + Rendering
======================= */
// --- Kana -> Romaji (Hepburn-ish) ---
function kanaToRomaji(input) {
  if (!input) return "";

  const toHiragana = (str) =>
    str.replace(/[\u30a1-\u30f6]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x60)
    );

  let s = toHiragana(input);

  const digraphs = {
    きゃ: "kya",
    きゅ: "kyu",
    きょ: "kyo",
    ぎゃ: "gya",
    ぎゅ: "gyu",
    ぎょ: "gyo",
    しゃ: "sha",
    しゅ: "shu",
    しょ: "sho",
    じゃ: "ja",
    じゅ: "ju",
    じょ: "jo",
    ちゃ: "cha",
    ちゅ: "chu",
    ちょ: "cho",
    にゃ: "nya",
    にゅ: "nyu",
    にょ: "nyo",
    ひゃ: "hya",
    ひゅ: "hyu",
    ひょ: "hyo",
    びゃ: "bya",
    びゅ: "byu",
    びょ: "byo",
    ぴゃ: "pya",
    ぴゅ: "pyu",
    ぴょ: "pyo",
    みゃ: "mya",
    みゅ: "myu",
    みょ: "myo",
    りゃ: "rya",
    りゅ: "ryu",
    りょ: "ryo",
  };

  const base = {
    あ: "a",
    い: "i",
    う: "u",
    え: "e",
    お: "o",
    か: "ka",
    き: "ki",
    く: "ku",
    け: "ke",
    こ: "ko",
    さ: "sa",
    し: "shi",
    す: "su",
    せ: "se",
    そ: "so",
    た: "ta",
    ち: "chi",
    つ: "tsu",
    て: "te",
    と: "to",
    な: "na",
    に: "ni",
    ぬ: "nu",
    ね: "ne",
    の: "no",
    は: "ha",
    ひ: "hi",
    ふ: "fu",
    へ: "he",
    ほ: "ho",
    ま: "ma",
    み: "mi",
    む: "mu",
    め: "me",
    も: "mo",
    や: "ya",
    ゆ: "yu",
    よ: "yo",
    ら: "ra",
    り: "ri",
    る: "ru",
    れ: "re",
    ろ: "ro",
    わ: "wa",
    を: "o",
    ん: "n",
    が: "ga",
    ぎ: "gi",
    ぐ: "gu",
    げ: "ge",
    ご: "go",
    ざ: "za",
    じ: "ji",
    ず: "zu",
    ぜ: "ze",
    ぞ: "zo",
    だ: "da",
    ぢ: "ji",
    づ: "dzu",
    で: "de",
    ど: "do",
    ば: "ba",
    び: "bi",
    ぶ: "bu",
    べ: "be",
    ぼ: "bo",
    ぱ: "pa",
    ぴ: "pi",
    ぷ: "pu",
    ぺ: "pe",
    ぽ: "po",
    ゃ: "ya",
    ゅ: "yu",
    ょ: "yo",
    ぁ: "a",
    ぃ: "i",
    ぅ: "u",
    ぇ: "e",
    ぉ: "o",
    ー: "-",
  };

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const pair = s.slice(i, i + 2);

    if (c === "っ") {
      const nextPair = s.slice(i + 1, i + 3);
      const nextChar = s[i + 1];
      let rom = "";
      if (digraphs[nextPair]) rom = digraphs[nextPair];
      else if (base[nextChar]) rom = base[nextChar];
      const first = rom ? rom[0] : "";
      if (first && /[bcdfghjklmnpqrstvwxyz]/.test(first)) out += first;
      continue;
    }

    if (digraphs[pair]) {
      out += digraphs[pair];
      i++;
      continue;
    }

    if (c === "ー") {
      const m = out.match(/[aiueo]$/);
      if (m) out += m[0];
      continue;
    }

    if (base[c]) {
      out += base[c];
      continue;
    }

    out += c;
  }

  out = out.replace(/n(?=[bmp])/g, "m");
  return out;
}

async function loadCSV() {
  const res = await fetch("jlpt_vocab.csv");
  let text = await res.text();
  text = text.replace(/^\\uFEFF/, "");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  const saved = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");
  const favs = JSON.parse(localStorage.getItem(LS_FAVORITES) || "{}");
  const exposed = JSON.parse(localStorage.getItem(LS_EXPOSED) || "{}");
  const flow = JSON.parse(localStorage.getItem(LS_FLOWMAN) || "{}");

  words = parsed.data.map((r) => {
    const original = r["Original"]?.trim() || "";
    const furigana = r["Furigana"]?.trim() || "";
    const english = r["English"]?.trim() || "";
    const jlpt = r["JLPT Level"]?.trim().toUpperCase() || "";
    const key = `${original}|${furigana}|${english}`;

    const readingSource = furigana || original;
    const romaji = kanaToRomaji(readingSource);

    return {
      original,
      furigana,
      english,
      jlpt,
      key,
      romaji,
      familiarity: saved[key] || "unknown",
      isFavorite: !!favs[key],
      exposedAt: exposed[key] || null,
      flowmanHighest: flow[key] || "none",
    };
  });

  console.log(`✅ Loaded ${words.length} words`);
}

function render() {
  const jlptVal = jlptFilter.value;
  const famVal = familiarityFilter.value;

  let filtered = words.filter(
    (w) =>
      (jlptVal === "all" || w.jlpt === jlptVal) &&
      (famVal === "all" || w.familiarity === famVal) &&
      (!favoritesOnlyChk.checked || w.isFavorite)
  );

  // ✅ Sort from N5 → N1 when showing all
  if (jlptVal === "all") {
    const jlptOrder = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };
    filtered.sort((a, b) => jlptOrder[a.jlpt] - jlptOrder[b.jlpt]);
  }

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = filtered.slice(start, start + itemsPerPage);

  grid.innerHTML = "";
  pageItems.forEach((w) => grid.appendChild(createCard(w)));

  pageInfo.textContent = `Page ${currentPage} / ${Math.max(totalPages, 1)}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function createCard(word) {
  const card = document.createElement("div");
  card.className = "word-card";

  const header = document.createElement("div");
  header.className = "word-header";

  const titleWrap = document.createElement("div");
  titleWrap.style.display = "flex";
  titleWrap.style.alignItems = "center";
  titleWrap.style.gap = "10px";
  titleWrap.style.flexWrap = "wrap";

  const titleSpan = document.createElement("span");
  titleSpan.className = "kanji-main";
  titleSpan.textContent = word.original;

  const jlptSpan = document.createElement("span");
  jlptSpan.className = "jlpt";
  jlptSpan.textContent = word.jlpt;

  // ✅ Flowman completion badge (colored circle)
  const flow = document.createElement("span");
  flow.style.width = "12px";
  flow.style.height = "12px";
  flow.style.borderRadius = "999px";
  flow.style.display = "inline-block";
  flow.style.flex = "0 0 auto";
  flow.style.border = "1px solid rgba(255,255,255,0.35)";
  flow.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.18)";
  flow.style.transform = "translateY(1px)";

  const level = word.flowmanHighest || "none";
  if (level === "easy") {
    flow.style.background = "#3b82f6"; // blue
    flow.title = "Completed Flowman on level easy";
  } else if (level === "normal") {
    flow.style.background = "#22c55e"; // green
    flow.title = "Completed Flowman on level normal";
  } else if (level === "hard") {
    flow.style.background =
      "conic-gradient(#ff3b3b, #ffd93b, #3bff7a, #3ba7ff, #b33bff, #ff3b3b)";
    flow.title = "Completed Flowman on level hard";
  } else {
    flow.style.background = "rgba(255,255,255,0.28)"; // grey
    flow.title = "Not completed in Flowman yet";
  }

  const favBtn = document.createElement("button");
  favBtn.className = "fav-btn";
  favBtn.type = "button";
  favBtn.textContent = "★";
  if (word.isFavorite) favBtn.classList.add("active");
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(word.key);
  });

  titleWrap.append(titleSpan, jlptSpan, flow);
  header.append(titleWrap, favBtn);
  const furigana = document.createElement("div");
  furigana.className = "furigana";
  furigana.textContent = word.furigana;

  const romaji = document.createElement("div");
  romaji.className = "romaji";
  romaji.style.display = showRomajiChk.checked ? "block" : "none";
  romaji.textContent = word.romaji;

  const meaning = document.createElement("div");
  meaning.className = "meaning";
  meaning.textContent = word.english;

  const buttons = document.createElement("div");
  buttons.className = "familiarity-buttons";
  ["well_known", "known", "explored", "unknown"].forEach((level) => {
    const btn = document.createElement("button");
    btn.textContent = level.replace("_", " ");
    if (word.familiarity === level) btn.classList.add("selected");
    btn.addEventListener("click", () => setFamiliarity(word.key, level));
    buttons.appendChild(btn);
  });

  card.append(header, furigana, romaji, meaning, buttons);
  return card;
}

/* =======================
   Favorites Helpers
======================= */
function getFavoritesMap() {
  try {
    return JSON.parse(localStorage.getItem(LS_FAVORITES) || "{}");
  } catch {
    return {};
  }
}

function saveFavoritesMap(map) {
  localStorage.setItem(LS_FAVORITES, JSON.stringify(map));
}

function toggleFavorite(key) {
  const word = words.find((w) => w.key === key);
  if (!word) return;

  const favs = getFavoritesMap();
  word.isFavorite = !word.isFavorite;

  if (word.isFavorite) favs[key] = true;
  else delete favs[key];

  saveFavoritesMap(favs);
  render();
}

/* =======================
   Familiarity
======================= */
function setFamiliarity(key, newLevel) {
  const word = words.find((w) => w.key === key);
  if (!word) return;

  const newRank = RANK[newLevel];
  const highMap = JSON.parse(localStorage.getItem(LS_HIGHEST) || "{}");
  const prevHigh = RANK[highMap[key]] || 0;

  if (newRank > prevHigh) {
    addDailyProgress(newRank - prevHigh);
    highMap[key] = newLevel;
    localStorage.setItem(LS_HIGHEST, JSON.stringify(highMap));
  }

  word.familiarity = newLevel;
  saveProgress();
  render();
  updateStats();
}

function saveProgress() {
  const data = {};
  words.forEach((w) => (data[w.key] = w.familiarity));
  localStorage.setItem(LS_PROGRESS, JSON.stringify(data));
}

function scrollToBottom(behavior = "auto") {
  const el = document.scrollingElement || document.documentElement;
  el.scrollTo({ top: el.scrollHeight, left: 0, behavior });
}

function changePage(dir) {
  currentPage = Math.max(1, currentPage + dir);
  render();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
  });
}
/* =======================
   Stats + Graph + Reset
======================= */
function buildDailySeries(windowDays = 60) {
  const log = getDailyLog();
  const series = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
    series.push({ date: key, count: log[key] || 0 });
  }
  return series;
}

let dailyOffset = parseInt(localStorage.getItem(LS_OFFSET) || "0", 10);

function renderDailyGraph(series) {
  const wrap = document.getElementById("dailyGraph");
  if (!wrap) return;
  wrap.innerHTML = "";

  const DAYS_VISIBLE = 10;
  const totalDays = series.length;
  dailyOffset = Math.min(
    Math.max(dailyOffset, 0),
    Math.max(0, totalDays - DAYS_VISIBLE)
  );
  const visible = series.slice(dailyOffset, dailyOffset + DAYS_VISIBLE);

  const nav = document.createElement("div");
  nav.className = "daily-nav";
  const left = document.createElement("button");
  left.textContent = "←";
  left.disabled = dailyOffset === 0;
  left.addEventListener("click", () => {
    dailyOffset = Math.max(0, dailyOffset - 1);
    localStorage.setItem(LS_OFFSET, dailyOffset);
    renderDailyGraph(series);
  });
  const right = document.createElement("button");
  right.textContent = "→";
  right.disabled = dailyOffset + DAYS_VISIBLE >= totalDays;
  right.addEventListener("click", () => {
    dailyOffset = Math.min(totalDays - DAYS_VISIBLE, dailyOffset + 1);
    localStorage.setItem(LS_OFFSET, dailyOffset);
    renderDailyGraph(series);
  });
  const label = document.createElement("span");
  label.textContent = `${visible[0].date} → ${
    visible[visible.length - 1].date
  }`;
  nav.append(left, label, right);
  wrap.appendChild(nav);

  const svgNS = "http://www.w3.org/2000/svg";
  const H = 220;
  const PAD_T = 24,
    PAD_B = 40;
  const BAR_W = 22,
    GAP = 16;
  const MAX_POINTS = 1000;
  const W = visible.length * (BAR_W + GAP) + 20;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("daily-svg");

  const tooltip = document.createElement("div");
  tooltip.className = "dg-tooltip";
  wrap.appendChild(tooltip);

  const yScale = (v) =>
    PAD_T + (H - PAD_T - PAD_B) * (1 - Math.min(v, MAX_POINTS) / MAX_POINTS);

  visible.forEach((d, i) => {
    const x = i * (BAR_W + GAP) + 20;
    const y = yScale(d.count);
    const h = yScale(0) - y;
    const full = d.count >= MAX_POINTS;

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", BAR_W);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", 3);
    rect.classList.add("dg-bar");
    rect.style.fill = full ? "#22c55e" : "#3b82f6";

    rect.addEventListener("mouseenter", (e) => {
      tooltip.textContent = `${d.date}: ${d.count} pts`;
      tooltip.style.left = e.pageX + "px";
      tooltip.style.top = e.pageY - 30 + "px";
      tooltip.classList.add("show");
    });
    rect.addEventListener("mouseleave", () => tooltip.classList.remove("show"));

    svg.appendChild(rect);

    const dateTxt = document.createElementNS(svgNS, "text");
    dateTxt.setAttribute("x", x + BAR_W / 2);
    dateTxt.setAttribute("y", PAD_T);
    dateTxt.setAttribute("text-anchor", "middle");
    dateTxt.textContent = d.date.slice(5);
    svg.appendChild(dateTxt);

    const valTxt = document.createElementNS(svgNS, "text");
    valTxt.setAttribute("x", x + BAR_W / 2);
    valTxt.setAttribute("y", H - 10);
    valTxt.setAttribute("text-anchor", "middle");
    valTxt.textContent = d.count;
    svg.appendChild(valTxt);
  });
  wrap.appendChild(svg);
}

function getMotivationMessage(p) {
  const val = parseFloat(p);
  if (val >= 90) return "🌸 You're a language master in bloom!";
  if (val >= 70) return "🌱 Beautiful growth — keep exploring!";
  if (val >= 40) return "✨ Solid progress — stay curious!";
  return "🔥 Every click plants a new seed of fluency!";
}

function updateStats() {
  const cleanWords = words.filter((w) => w.jlpt && /^N[1-5]$/.test(w.jlpt));
  const groups = cleanWords.reduce((acc, w) => {
    const jlpt = w.jlpt;
    acc[jlpt] = acc[jlpt] || {
      total: 0,
      well_known: 0,
      known: 0,
      explored: 0,
      unknown: 0,
    };
    acc[jlpt].total++;
    acc[jlpt][w.familiarity]++;
    return acc;
  }, {});

  const totals = Object.values(groups).reduce(
    (a, g) => {
      a.total += g.total;
      a.well_known += g.well_known;
      a.known += g.known;
      a.explored += g.explored;
      a.unknown += g.unknown;
      return a;
    },
    { total: 0, well_known: 0, known: 0, explored: 0, unknown: 0 }
  );

  const percent = (
    ((totals.well_known + totals.known + totals.explored) /
      Math.max(totals.total, 1)) *
    100
  ).toFixed(1);

  const series = buildDailySeries(60);
  const grandTotal = Object.values(getDailyLog()).reduce((s, v) => s + v, 0);

  let html = `
    <div class="stats-card">
      <h2>Total Progress</h2>
      <p>${totals.well_known + totals.known + totals.explored} / ${
    totals.total
  } words studied</p>
      <div class="progress-bar multi">
        <div class="segment well_known" style="width:${
          (totals.well_known / Math.max(totals.total, 1)) * 100
        }%"></div>
        <div class="segment known" style="width:${
          (totals.known / Math.max(totals.total, 1)) * 100
        }%"></div>
        <div class="segment explored" style="width:${
          (totals.explored / Math.max(totals.total, 1)) * 100
        }%"></div>
        <div class="segment unknown" style="width:${
          (totals.unknown / Math.max(totals.total, 1)) * 100
        }%"></div>
      </div>
      <p class="legend">
        🌈 ${totals.well_known} well known • 🟩 ${totals.known} known • 🟦 ${
    totals.explored
  } explored • ⚪ ${totals.unknown} unknown
      </p>
      <p><strong>${grandTotal}</strong> total progress points</p>
    </div>
  `;

  ["N1", "N2", "N3", "N4", "N5"].forEach((lvl) => {
    const g = groups[lvl];
    if (!g) return;
    const pct = (
      ((g.well_known + g.known + g.explored) / Math.max(g.total, 1)) *
      100
    ).toFixed(1);

    html += `
      <div class="stats-card">
        <h3>${lvl}</h3>
        <p>${g.well_known + g.known + g.explored} / ${
      g.total
    } studied (${pct}%)</p>
        <div class="progress-bar multi">
          <div class="segment well_known" style="width:${
            (g.well_known / Math.max(g.total, 1)) * 100
          }%"></div>
          <div class="segment known" style="width:${
            (g.known / Math.max(g.total, 1)) * 100
          }%"></div>
          <div class="segment explored" style="width:${
            (g.explored / Math.max(g.total, 1)) * 100
          }%"></div>
          <div class="segment unknown" style="width:${
            (g.unknown / Math.max(g.total, 1)) * 100
          }%"></div>
        </div>
        <p class="legend">
          🌈 ${g.well_known} well known • 🟩 ${g.known} known • 🟦 ${
      g.explored
    } explored • ⚪ ${g.unknown} unknown
        </p>
      </div>
    `;
  });

  html += `
    <div class="stats-card">
      <h3>Daily Progress (last 60 days)</h3>
      <div id="dailyGraph" class="daily-graph"></div>
    </div>
    <div class="motivation">${getMotivationMessage(percent)}</div>
  `;

  statsContainer.innerHTML = html;
  renderDailyGraph(series);
}

function resetProgress() {
  if (
    confirm(
      "Reset ALL progress, stats, points, favorites, exposed, Flowman completion, and badges? This cannot be undone."
    )
  ) {
    localStorage.removeItem(LS_PROGRESS);
    localStorage.removeItem(LS_DAILY);
    localStorage.removeItem(LS_HIGHEST);
    localStorage.removeItem(LS_OFFSET);
    localStorage.removeItem(LS_FAVORITES);
    localStorage.removeItem(LS_EXPOSED);
    localStorage.removeItem(LS_FLOWMAN);
    localStorage.removeItem(LS_FLOWMAN_BADGES); // ✅ NEW

    words.forEach((w) => {
      w.familiarity = "unknown";
      w.isFavorite = false;
      w.exposedAt = null;
      w.flowmanHighest = "none";
    });

    ensureTodayBucket();
    updateTodayChip();
    render();
    updateStats();
    alert("Progress fully reset.");
  }
}
/* =======================
   Game Link Routing
======================= */
function updateGameLinks() {
  if (!openGameBtn && !openGameTop) return;

  const famVal = familiarityFilter?.value || "all";
  const jlptVal = jlptFilter?.value || "all";

  let url = "hang.html";

  if (famVal !== "all") {
    url += `?playBy=familiarity&fam=${encodeURIComponent(famVal)}`;
  } else if (jlptVal !== "all") {
    url += `?playBy=jlpt&jlpt=${encodeURIComponent(jlptVal)}`;
  } else {
    url += `?playBy=level&level=1`;
  }

  if (openGameBtn) openGameBtn.href = url;
  if (openGameTop) openGameTop.href = url;
}

/* =======================
   Utility - Safe Get/Set
======================= */
function safeGet(key, fallback = "{}") {
  try {
    return JSON.parse(localStorage.getItem(key) || fallback);
  } catch {
    return JSON.parse(fallback);
  }
}

function safeSet(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

/* =======================
   Initialization Complete
======================= */
console.log(
  "%c✅ FluencyFlow initialized with v4 schema (Flowman badges supported).",
  "color:#22c55e;font-weight:bold;"
);
