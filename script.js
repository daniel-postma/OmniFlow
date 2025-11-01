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

// Stats panel refs
const statsPanel = document.getElementById("statsPanel");
const statsContainer = document.getElementById("statsContainer");
const toggleStats = document.getElementById("toggleStats");

const LS_PROGRESS = "vocabProgress"; // word familiarity map
const LS_DAILY = "vocabProgressDaily"; // { "YYYY-MM-DD": number }
const RANK = { unknown: 0, explored: 1, known: 2, well_known: 3 };

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

  // Ensure today bucket exists for the chip
  ensureTodayBucket();
  updateTodayChip();
});

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`; // local date
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
  const t = todayKey();
  todayChip.textContent = `Progress Points Today: ${log[t] || 0}`;
}

function resetProgress() {
  if (
    confirm(
      "Are you sure you want to reset all progress? This cannot be undone."
    )
  ) {
    localStorage.removeItem(LS_PROGRESS);
    localStorage.removeItem(LS_DAILY);
    words.forEach((w) => (w.familiarity = "unknown"));
    ensureTodayBucket();
    updateTodayChip();
    render();
  }
}

async function loadCSV() {
  const response = await fetch("jlpt_vocab.csv");
  let csvText = await response.text();

  // Remove potential BOM
  csvText = csvText.replace(/^\uFEFF/, "");

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  const savedProgress = JSON.parse(localStorage.getItem(LS_PROGRESS) || "{}");

  words = parsed.data.map((row) => {
    const original = row["Original"]?.trim() || "";
    const furigana = row["Furigana"]?.trim() || "";
    const english = row["English"]?.trim() || "";
    const jlpt = row["JLPT Level"]?.trim().toUpperCase() || "";

    const key = `${original}|${furigana}|${english}`;
    return {
      original,
      furigana,
      english,
      jlpt,
      key,
      familiarity: savedProgress[key] || "unknown",
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
  pageItems.forEach((word) => grid.appendChild(createCard(word)));

  pageInfo.textContent = `Page ${currentPage} / ${Math.max(totalPages, 1)}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function createCard(word) {
  const card = document.createElement("div");
  card.className = "word-card";

  const header = document.createElement("div");
  header.className = "word-header";
  header.innerHTML = `<span>${word.original}</span><span class="jlpt">${word.jlpt}</span>`;

  const furigana = document.createElement("div");
  furigana.className = "furigana";
  furigana.textContent = word.furigana;

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

  card.append(header, furigana, meaning, buttons);
  return card;
}

function setFamiliarity(key, newLevel) {
  const word = words.find((w) => w.key === key);
  if (!word) return;

  const oldLevel = word.familiarity || "unknown";
  const oldRank = RANK[oldLevel] || 0;
  const newRank = RANK[newLevel] || 0;

  // ---- Highest-ever tracking ----
  const highMap = JSON.parse(localStorage.getItem("vocabHighest") || "{}");
  const prevHigh = RANK[highMap[key]] || 0;

  // Only add to today's progress if you surpassed previous best
  if (newRank > prevHigh) {
    addDailyProgress(newRank - prevHigh);
    highMap[key] = newLevel;
    localStorage.setItem("vocabHighest", JSON.stringify(highMap));
  }

  // --------------------------------
  word.familiarity = newLevel;
  saveProgress();

  // Re-render respecting filters
  const jlptVal = jlptFilter.value;
  const famVal = familiarityFilter.value;
  const stillVisible =
    (jlptVal === "all" || word.jlpt === jlptVal) &&
    (famVal === "all" || word.familiarity === famVal);

  if (!stillVisible) setTimeout(render, 100);
  else render();
}

function saveProgress() {
  const progress = {};
  words.forEach((w) => (progress[w.key] = w.familiarity));
  localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
}

function changePage(direction) {
  currentPage += direction;
  render();
}

/* ---- Stats Panel ---- */
function updateStats() {
  const cleanWords = words.filter((w) => {
    if (!w.jlpt) return false;
    const jlpt = w.jlpt
      .toUpperCase()
      .replace(/[^N\d]/g, "")
      .trim();
    return /^N[1-5]$/.test(jlpt);
  });

  const total = cleanWords.length;

  // Categorize by JLPT and familiarity type
  const familiarityGroups = cleanWords.reduce((acc, w) => {
    const jlpt = w.jlpt
      .toUpperCase()
      .replace(/[^N\d]/g, "")
      .trim();
    acc[jlpt] = acc[jlpt] || {
      total: 0,
      well_known: 0,
      known: 0,
      explored: 0,
      unknown: 0,
    };
    acc[jlpt].total++;
    acc[jlpt][w.familiarity] = (acc[jlpt][w.familiarity] || 0) + 1;
    return acc;
  }, {});

  // Overall totals
  const totals = Object.values(familiarityGroups).reduce(
    (acc, g) => {
      acc.total += g.total;
      acc.well_known += g.well_known;
      acc.known += g.known;
      acc.explored += g.explored;
      acc.unknown += g.unknown;
      return acc;
    },
    { total: 0, well_known: 0, known: 0, explored: 0, unknown: 0 }
  );

  const percentLearned = (
    ((totals.well_known + totals.known + totals.explored) /
      Math.max(totals.total, 1)) *
    100
  ).toFixed(1);

  const validLevels = ["N1", "N2", "N3", "N4", "N5"];

  // Daily history (last 14 days)
  const log = getDailyLog();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: key, count: log[key] || 0 });
  }
  const totalWindow = days.reduce((s, x) => s + x.count, 0);

  // HTML build
  statsContainer.innerHTML = `
    <div class="stats-card">
      <h2>Total Progress</h2>
      <p>${totals.well_known + totals.known + totals.explored} / ${
    totals.total
  } words studied</p>

      <div class="progress-bar multi animate">
        <div class="segment well_known" style="width:${(
          (totals.well_known / Math.max(totals.total, 1)) *
          100
        ).toFixed(1)}%"></div>
        <div class="segment known" style="width:${(
          (totals.known / Math.max(totals.total, 1)) *
          100
        ).toFixed(1)}%"></div>
        <div class="segment explored" style="width:${(
          (totals.explored / Math.max(totals.total, 1)) *
          100
        ).toFixed(1)}%"></div>
        <div class="segment unknown" style="width:${(
          (totals.unknown / Math.max(totals.total, 1)) *
          100
        ).toFixed(1)}%"></div>
      </div>

      <p class="legend">
        🌈 ${totals.well_known} well known • 🟩 ${totals.known} known • 🟦 ${
    totals.explored
  } explored • ⚪ ${totals.unknown} unknown
      </p>
    </div>

    ${validLevels
      .filter((lvl) => familiarityGroups[lvl])
      .map((lvl) => {
        const g = familiarityGroups[lvl];
        const learnedPct = (
          ((g.well_known + g.known + g.explored) / Math.max(g.total, 1)) *
          100
        ).toFixed(1);

        return `
        <div class="stats-card">
          <h3>${lvl}</h3>
          <p>${g.well_known + g.known + g.explored} / ${
          g.total
        } studied (${learnedPct}%)</p>

          <div class="progress-bar multi animate">
            <div class="segment well_known" style="width:${(
              (g.well_known / Math.max(g.total, 1)) *
              100
            ).toFixed(1)}%"></div>
            <div class="segment known" style="width:${(
              (g.known / Math.max(g.total, 1)) *
              100
            ).toFixed(1)}%"></div>
            <div class="segment explored" style="width:${(
              (g.explored / Math.max(g.total, 1)) *
              100
            ).toFixed(1)}%"></div>
            <div class="segment unknown" style="width:${(
              (g.unknown / Math.max(g.total, 1)) *
              100
            ).toFixed(1)}%"></div>
          </div>

          <p class="legend">
            🌈 ${g.well_known} well known • 🟩 ${g.known} known • 🟦 ${
          g.explored
        } explored • ⚪ ${g.unknown} unknown
          </p>
        </div>`;
      })
      .join("")}

    <div class="stats-card">
      <h3>Daily Progress (last 14 days)</h3>
      <p>Total this window: ${totalWindow}</p>
      <div style="display:grid;grid-template-columns:repeat(14,1fr);gap:6px;margin-top:8px;">
        ${days
          .map(
            (d) => `<div title="${d.date}: ${d.count}"
                        style="height:40px;background:#e6eefc;border-radius:6px;position:relative;overflow:hidden;">
                      <div style="position:absolute;bottom:0;left:0;right:0;height:${Math.min(
                        100,
                        d.count * 5
                      )}%;background:#3b82f6;"></div>
                    </div>`
          )
          .join("")}
      </div>
      <p class="legend" style="margin-top:6px;">Each bar = that day’s “improvement” points (Unknown→Known = 2, etc.).</p>
    </div>

    <div class="motivation">${getMotivationMessage(percentLearned)}</div>
  `;
}

function getMotivationMessage(percent) {
  if (percent < 10)
    return "🌱 You’ve started your journey. Every word is a step forward!";
  if (percent < 30)
    return "🌿 Great progress! Keep watering your language garden.";
  if (percent < 60)
    return "🌸 You're blooming! You’re mastering this beautifully.";
  if (percent < 90) return "🔥 You’re unstoppable. JLPT glory is near!";
  return "🌕 You’ve reached fluency enlightenment. Incredible work!";
}
