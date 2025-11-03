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

// Stats panel
const statsPanel = document.getElementById("statsPanel");
const statsContainer = document.getElementById("statsContainer");
const toggleStats = document.getElementById("toggleStats");

const LS_PROGRESS = "vocabProgress";
const LS_DAILY = "vocabProgressDaily";
const LS_HIGHEST = "vocabHighest";
const LS_OFFSET = "dailyOffset";
const RANK = { unknown: 0, explored: 1, known: 2, well_known: 3 };

/* =======================
   DOM Load
======================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadCSV();
  render();

  jlptFilter.addEventListener("change", render);
  familiarityFilter.addEventListener("change", render);
  prevBtn.addEventListener("click", () => changePage(-1));
  nextBtn.addEventListener("click", () => changePage(1));

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

  // Export/Import controls
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
});

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
   Export / Import
======================= */
function getAllData() {
  return {
    schema: "fluencyflow.v1",
    exportedAt: new Date().toISOString(),
    data: {
      vocabProgress: JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}"),
      vocabProgressDaily: JSON.parse(localStorage.getItem(LS_DAILY) || "{}"),
      vocabHighest: JSON.parse(localStorage.getItem(LS_HIGHEST) || "{}"),
      dailyOffset: parseInt(localStorage.getItem(LS_OFFSET) || "0", 10),
    },
  };
}

function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function exportData() {
  const d = new Date();
  const f = `fluencyflow_progress_${d.getFullYear()}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  downloadJSON(getAllData(), f);
}

function mergeMapsPreferHigherRank(base, incoming) {
  const res = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    const cur = base[k];
    res[k] = (RANK[v] || 0) > (RANK[cur] || 0) ? v : cur ?? v;
  }
  return res;
}
function mergeHighestMap(base, incoming) {
  const res = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    const cur = base[k];
    res[k] = (RANK[v] || 0) > (RANK[cur] || 0) ? v : cur ?? v;
  }
  return res;
}
function mergeDailyLog(base, incoming) {
  const res = { ...base };
  for (const [date, val] of Object.entries(incoming)) {
    res[date] = (res[date] || 0) + (parseInt(val, 10) || 0);
  }
  return res;
}

function importDataFromObject(obj) {
  if (!obj || obj.schema !== "fluencyflow.v1") {
    alert("Invalid import file.");
    return;
  }
  const { vocabProgress, vocabProgressDaily, vocabHighest, dailyOffset } =
    obj.data;
  const merge = confirm(
    "Import data: OK to MERGE (keep progress) or Cancel to REPLACE?"
  );

  if (merge) {
    const curProg = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");
    const curDaily = JSON.parse(localStorage.getItem(LS_DAILY) || "{}");
    const curHigh = JSON.parse(localStorage.getItem(LS_HIGHEST) || "{}");
    localStorage.setItem(
      LS_PROGRESS,
      JSON.stringify(mergeMapsPreferHigherRank(curProg, vocabProgress || {}))
    );
    localStorage.setItem(
      LS_DAILY,
      JSON.stringify(mergeDailyLog(curDaily, vocabProgressDaily || {}))
    );
    localStorage.setItem(
      LS_HIGHEST,
      JSON.stringify(mergeHighestMap(curHigh, vocabHighest || {}))
    );
  } else {
    localStorage.setItem(LS_PROGRESS, JSON.stringify(vocabProgress || {}));
    localStorage.setItem(LS_DAILY, JSON.stringify(vocabProgressDaily || {}));
    localStorage.setItem(LS_HIGHEST, JSON.stringify(vocabHighest || {}));
  }

  if (typeof dailyOffset === "number")
    localStorage.setItem(LS_OFFSET, String(dailyOffset));

  const progress = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");
  words.forEach((w) => {
    if (progress[w.key]) w.familiarity = progress[w.key];
  });

  ensureTodayBucket();
  updateTodayChip();
  render();
  updateStats();
  alert("✅ Import complete! All progress and stats restored.");
}

/* =======================
   CSV + Rendering
======================= */
async function loadCSV() {
  const res = await fetch("jlpt_vocab.csv");
  let text = await res.text();
  text = text.replace(/^\uFEFF/, "");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const saved = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");

  words = parsed.data.map((r) => {
    const original = r["Original"]?.trim() || "";
    const furigana = r["Furigana"]?.trim() || "";
    const english = r["English"]?.trim() || "";
    const jlpt = r["JLPT Level"]?.trim().toUpperCase() || "";
    const key = `${original}|${furigana}|${english}`;
    return {
      original,
      furigana,
      english,
      jlpt,
      key,
      familiarity: saved[key] || "unknown",
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
      (famVal === "all" || w.familiarity === famVal)
  );
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
  card.innerHTML = `
    <div class="word-header"><span>${word.original}</span><span class="jlpt">${word.jlpt}</span></div>
    <div class="furigana">${word.furigana}</div>
    <div class="meaning">${word.english}</div>
  `;

  const buttons = document.createElement("div");
  buttons.className = "familiarity-buttons";
  ["well_known", "known", "explored", "unknown"].forEach((level) => {
    const btn = document.createElement("button");
    btn.textContent = level.replace("_", " ");
    if (word.familiarity === level) btn.classList.add("selected");
    btn.addEventListener("click", () => setFamiliarity(word.key, level));
    buttons.appendChild(btn);
  });

  card.appendChild(buttons);
  return card;
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

function changePage(dir) {
  currentPage += dir;
  render();
}

/* =======================
   Stats + Reset
======================= */
function updateStats() {
  const clean = words.filter((w) => w.jlpt && /^N[1-5]$/.test(w.jlpt));
  const group = clean.reduce((acc, w) => {
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
  const totals = Object.values(group).reduce(
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

  const totalPoints = Object.values(getDailyLog()).reduce((s, v) => s + v, 0);

  statsContainer.innerHTML = `
    <div class="stats-card">
      <h2>Total Progress</h2>
      <p>${totals.well_known + totals.known + totals.explored} / ${
    totals.total
  } words</p>
      <p><strong>${totalPoints}</strong> total progress points</p>
    </div>
  `;
}

function resetProgress() {
  if (
    confirm("Reset ALL progress, stats, and points? This cannot be undone.")
  ) {
    localStorage.removeItem(LS_PROGRESS);
    localStorage.removeItem(LS_DAILY);
    localStorage.removeItem(LS_HIGHEST);
    localStorage.removeItem(LS_OFFSET);
    words.forEach((w) => (w.familiarity = "unknown"));
    ensureTodayBucket();
    updateTodayChip();
    render();
    updateStats();
    alert("Progress fully reset.");
  }
}
