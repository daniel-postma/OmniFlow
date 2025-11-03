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
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
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
      JSON.stringify(mergeMapsPreferHigherRank(curHigh, vocabHighest || {}))
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

  // Total card
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

  // Per-level cards with legend
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

  // Daily graph + motivation
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
