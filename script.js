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
const LS_HIGHEST = "vocabHighest"; // { key: "well_known" | "known" | ... }
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

/* =======================
   Utilities: Dates / Logs
======================= */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`; // local date YYYY-MM-DD
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

/* =======================
   CSV / Render
======================= */
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

/* =======================
   Familiarity + Highest-Ever
======================= */
function setFamiliarity(key, newLevel) {
  const word = words.find((w) => w.key === key);
  if (!word) return;

  const oldLevel = word.familiarity || "unknown";
  const newRank = RANK[newLevel] || 0;

  // Highest-ever tracking
  const highMap = JSON.parse(localStorage.getItem(LS_HIGHEST) || "{}");
  const prevHigh = RANK[highMap[key]] || 0;

  // Only add to today's progress if you surpassed previous best
  if (newRank > prevHigh) {
    addDailyProgress(newRank - prevHigh);
    highMap[key] = newLevel;
    localStorage.setItem(LS_HIGHEST, JSON.stringify(highMap));
  }

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

/* =======================
   Stats + Daily Chart
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

// YouTube-style daily bars: 1000 = full height, green if >= 1000.
// Always show MM/DD above and count below each bar.
let dailyOffset = parseInt(localStorage.getItem("dailyOffset") || "0", 10);

function renderDailyGraph(series) {
  const wrap = document.getElementById("dailyGraph");
  if (!wrap) return;
  wrap.innerHTML = "";

  const DAYS_VISIBLE = 10;
  const totalDays = series.length;

  // Clamp offset
  if (dailyOffset < 0) dailyOffset = 0;

  // If this is the first time opening (no saved offset),
  // jump to the newest 10-day window by default
  if (!localStorage.getItem("dailyOffset")) {
    dailyOffset = Math.max(0, totalDays - DAYS_VISIBLE);
    localStorage.setItem("dailyOffset", dailyOffset);
  } else {
    // Otherwise clamp safely if data changed
    if (dailyOffset > Math.max(0, totalDays - DAYS_VISIBLE))
      dailyOffset = Math.max(0, totalDays - DAYS_VISIBLE);
  }

  const visible = series.slice(dailyOffset, dailyOffset + DAYS_VISIBLE);

  // Navigation controls
  const nav = document.createElement("div");
  nav.style.display = "flex";
  nav.style.justifyContent = "space-between";
  nav.style.alignItems = "center";
  nav.style.marginBottom = "6px";

  const left = document.createElement("button");
  left.textContent = "←";
  left.disabled = dailyOffset === 0;
  left.style.cursor = left.disabled ? "default" : "pointer";
  left.addEventListener("click", () => {
    if (dailyOffset > 0) {
      dailyOffset -= 1;
      localStorage.setItem("dailyOffset", dailyOffset);
      renderDailyGraph(series);
    }
  });

  const right = document.createElement("button");
  right.textContent = "→";
  right.disabled = dailyOffset + DAYS_VISIBLE >= totalDays;
  right.style.cursor = right.disabled ? "default" : "pointer";
  right.addEventListener("click", () => {
    if (dailyOffset + DAYS_VISIBLE < totalDays) {
      dailyOffset += 1;
      localStorage.setItem("dailyOffset", dailyOffset);
      renderDailyGraph(series);
    }
  });

  const label = document.createElement("span");
  label.textContent = `Showing ${visible[0].date} → ${
    visible[visible.length - 1].date
  }`;
  label.style.fontSize = "0.9em";
  label.style.color = "#444";

  nav.append(left, label, right);
  wrap.appendChild(nav);

  // SVG Chart
  const MAX_POINTS = 1000;
  const H = 220;
  const PAD_L = 40,
    PAD_R = 12,
    PAD_T = 20,
    PAD_B = 40;
  const BAR_W = 20,
    GAP = 14;
  const W = PAD_L + PAD_R + visible.length * (BAR_W + GAP) - GAP;
  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const yScale = (v) =>
    PAD_T + (H - PAD_T - PAD_B) * (1 - Math.min(v, MAX_POINTS) / MAX_POINTS);
  const xAt = (i) => PAD_L + i * (BAR_W + GAP);

  // Gridlines
  const grid = document.createElementNS(svgNS, "g");
  for (let i = 0; i <= 5; i++) {
    const val = (MAX_POINTS / 5) * i;
    const y = yScale(val);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", PAD_L);
    line.setAttribute("y1", y);
    line.setAttribute("x2", W - PAD_R);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#ddd");
    line.setAttribute("stroke-width", "1");
    grid.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", PAD_L - 6);
    label.setAttribute("y", y + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "dg-tick");
    label.textContent = Math.round(val);
    grid.appendChild(label);
  }
  svg.appendChild(grid);

  // Bars
  const bars = document.createElementNS(svgNS, "g");
  visible.forEach((s, i) => {
    const x = xAt(i);
    const y = yScale(s.count);
    const h = yScale(0) - y;
    const full = s.count >= MAX_POINTS;

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", BAR_W);
    rect.setAttribute("height", Math.max(2, h));
    rect.setAttribute("rx", 3);
    rect.setAttribute("ry", 3);
    rect.style.fill = full ? "#22c55e" : "#3b82f6";
    bars.appendChild(rect);

    // date above
    const dateTxt = document.createElementNS(svgNS, "text");
    dateTxt.setAttribute("x", x + BAR_W / 2);
    dateTxt.setAttribute("y", PAD_T + 10);
    dateTxt.setAttribute("text-anchor", "middle");
    dateTxt.setAttribute("class", "dg-label");
    const [Y, M, D] = s.date.split("-");
    dateTxt.textContent = `${M}/${D}`;
    bars.appendChild(dateTxt);

    // value below
    const valTxt = document.createElementNS(svgNS, "text");
    valTxt.setAttribute("x", x + BAR_W / 2);
    valTxt.setAttribute("y", yScale(0) + 14);
    valTxt.setAttribute("text-anchor", "middle");
    valTxt.setAttribute("class", "dg-tick");
    valTxt.textContent = s.count;
    bars.appendChild(valTxt);
  });

  svg.appendChild(bars);
  wrap.appendChild(svg);
}

function updateStats() {
  const cleanWords = words.filter((w) => {
    if (!w.jlpt) return false;
    const jlpt = w.jlpt
      .toUpperCase()
      .replace(/[^N\d]/g, "")
      .trim();
    return /^N[1-5]$/.test(jlpt);
  });

  // Categorize by JLPT + familiarity
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

  // Build daily series (adjust window as you like)
  const series = buildDailySeries(60);
  const windowTotal = Object.values(getDailyLog()).reduce(
    (sum, v) => sum + v,
    0
  );

  statsContainer.innerHTML = `
    <div class="stats-card">
      <h2>Total Progress</h2>
      <p>${totals.well_known + totals.known + totals.explored} / ${
    totals.total
  } words studied</p>
      <div class="progress-bar multi">
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
          <div class="progress-bar multi">
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
      <h3>Daily Progress (last ${series.length} days)</h3>
      <p>Total progress points: ${windowTotal}</p>
      <div id="dailyGraph" class="daily-graph"></div>
      <p class="legend" style="margin-top:6px;">
        Your recent progress points per day 
      </p>
    </div>

    <div class="motivation">${getMotivationMessage(percentLearned)}</div>
  `;

  renderDailyGraph(series);
}

function getMotivationMessage(percent) {
  const p = Number(percent);
  if (p < 10)
    return "🌱 You’ve started your journey. Every word is a step forward!";
  if (p < 30) return "🌿 Great progress! Keep watering your language garden.";
  if (p < 60) return "🌸 You're blooming! You’re mastering this beautifully.";
  if (p < 90) return "🔥 You’re unstoppable. JLPT glory is near!";
  return "🌕 You’ve reached fluency enlightenment. Incredible work!";
}

/* =======================
   Reset
======================= */
function resetProgress() {
  if (
    confirm(
      "Are you sure you want to reset all progress? This cannot be undone."
    )
  ) {
    localStorage.removeItem(LS_PROGRESS);
    localStorage.removeItem(LS_DAILY);
    localStorage.removeItem(LS_HIGHEST);
    words.forEach((w) => (w.familiarity = "unknown"));
    ensureTodayBucket();
    updateTodayChip();
    render();
  }
}
