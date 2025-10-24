let words = [];
let currentPage = 1;
const itemsPerPage = 100;

const grid = document.getElementById("wordGrid");
const pageInfo = document.getElementById("pageInfo");
const jlptFilter = document.getElementById("jlptFilter");
const familiarityFilter = document.getElementById("familiarityFilter");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");

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
});

function resetProgress() {
  if (
    confirm(
      "Are you sure you want to reset all progress? This cannot be undone."
    )
  ) {
    localStorage.removeItem("vocabProgress");
    words.forEach((w) => (w.familiarity = "unknown"));
    render();
  }
}

async function loadCSV() {
  const response = await fetch("jlpt_vocab.csv");
  let csvText = await response.text();

  // Remove potential BOM
  csvText = csvText.replace(/^\uFEFF/, "");

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const savedProgress = JSON.parse(
    localStorage.getItem("vocabProgress") || "{}"
  );

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

  pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
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

function setFamiliarity(key, level) {
  const word = words.find((w) => w.key === key);
  if (!word) return;

  word.familiarity = level;
  saveProgress();

  const jlptVal = jlptFilter.value;
  const famVal = familiarityFilter.value;
  const stillVisible =
    (jlptVal === "all" || word.jlpt === jlptVal) &&
    (famVal === "all" || word.familiarity === famVal);

  if (!stillVisible) setTimeout(render, 150);
  else render();
}

function saveProgress() {
  const progress = {};
  words.forEach((w) => (progress[w.key] = w.familiarity));
  localStorage.setItem("vocabProgress", JSON.stringify(progress));
}

function changePage(direction) {
  currentPage += direction;
  render();
}

/* ---- Stats Panel ---- */
const statsPanel = document.getElementById("statsPanel");
const statsContainer = document.getElementById("statsContainer");
const toggleStats = document.getElementById("toggleStats");

toggleStats.addEventListener("click", () => {
  statsPanel.classList.toggle("hidden");
  toggleStats.textContent = statsPanel.classList.contains("hidden")
    ? "📊 Show Stats"
    : "📉 Hide Stats";
  if (!statsPanel.classList.contains("hidden")) updateStats();
});
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
    ((totals.well_known + totals.known + totals.explored) / totals.total) *
    100
  ).toFixed(1);

  const validLevels = ["N1", "N2", "N3", "N4", "N5"];

  // HTML build
  statsContainer.innerHTML = `
    <div class="stats-card">
      <h2>Total Progress</h2>
      <p>${totals.well_known + totals.known + totals.explored} / ${
    totals.total
  } words studied</p>

      <div class="progress-bar multi animate">
        <div class="segment well_known" style="width:${(
          (totals.well_known / totals.total) *
          100
        ).toFixed(1)}%"></div>
        <div class="segment known" style="width:${(
          (totals.known / totals.total) *
          100
        ).toFixed(1)}%"></div>
        <div class="segment explored" style="width:${(
          (totals.explored / totals.total) *
          100
        ).toFixed(1)}%"></div>
        <div class="segment unknown" style="width:${(
          (totals.unknown / totals.total) *
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
          ((g.well_known + g.known + g.explored) / g.total) *
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
              (g.well_known / g.total) *
              100
            ).toFixed(1)}%"></div>
            <div class="segment known" style="width:${(
              (g.known / g.total) *
              100
            ).toFixed(1)}%"></div>
            <div class="segment explored" style="width:${(
              (g.explored / g.total) *
              100
            ).toFixed(1)}%"></div>
            <div class="segment unknown" style="width:${(
              (g.unknown / g.total) *
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
