const els = {
  standbyPanel: document.querySelector("#standbyPanel"),
  revealStage: document.querySelector("#revealStage"),
  projectName: document.querySelector("#projectName"),
  stageProjectName: document.querySelector("#stageProjectName"),
  refreshButton: document.querySelector("#refreshButton"),
  startRevealButton: document.querySelector("#startRevealButton"),
  backButton: document.querySelector("#backButton"),
  submitCount: document.querySelector("#submitCount"),
  readyState: document.querySelector("#readyState"),
  rankingList: document.querySelector("#rankingList"),
  broadcastBoard: document.querySelector("#broadcastBoard"),
  revealOrder: document.querySelector("#revealOrder"),
  revealTeam: document.querySelector("#revealTeam"),
  judgeScoreGrid: document.querySelector("#judgeScoreGrid"),
  totalReveal: document.querySelector("#totalReveal"),
  revealScore: document.querySelector("#revealScore"),
  finalRanking: document.querySelector("#finalRanking"),
  messageBox: document.querySelector("#messageBox"),
};

const params = new URLSearchParams(window.location.search);
const projectId = params.get("project") || "";
let summary = null;
let revealRunning = false;
let hitAudio = null;
let stingAudio = null;

els.refreshButton.addEventListener("click", loadSummary);
els.startRevealButton.addEventListener("click", startReveal);
els.backButton.addEventListener("click", () => {
  revealRunning = false;
  els.revealStage.classList.add("hidden");
  els.standbyPanel.classList.remove("hidden");
});

loadSummary();
setInterval(() => {
  if (!revealRunning) loadSummary();
}, 8000);

async function loadSummary() {
  try {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const response = await fetch(`/api/result/summary${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "結果データを読み込めませんでした。");
    summary = data;
    renderSummary();
    hideMessage();
  } catch (error) {
    showMessage(error.message);
  }
}

function renderSummary() {
  const canReveal = hasRevealData();
  els.projectName.textContent = summary.project.name;
  els.stageProjectName.textContent = summary.project.name;
  els.submitCount.textContent = `${summary.submittedCount} / ${summary.totalJudges}`;
  els.readyState.textContent = canReveal
    ? summary.allSubmitted
      ? "全員提出済み"
      : "途中発表できます"
    : "提出待ち";
  els.startRevealButton.disabled = !canReveal || revealRunning;
  renderRanking();
}

function renderRanking() {
  els.rankingList.replaceChildren();
  if (!summary.teamResults.length) {
    els.rankingList.append(emptyRow("集計できる提出データがまだありません。"));
    return;
  }

  summary.teamResults.forEach((team, index) => {
    const row = document.createElement("article");
    row.className = "ranking-row";
    row.innerHTML = `
      <strong></strong>
      <div class="team-name">
        <em></em>
        <span></span>
      </div>
      <b></b>
    `;
    row.querySelector("strong").textContent = `${index + 1}位`;
    row.querySelector("em").textContent = team.name;
    row.querySelector("span").textContent = `${team.judgeTotals.length}人分 / 平均 ${team.average}`;
    row.querySelector("b").textContent = `${team.total}点`;
    els.rankingList.append(row);
  });
}

async function startReveal() {
  if (!hasRevealData() || revealRunning) return;
  revealRunning = true;
  els.startRevealButton.disabled = true;
  els.standbyPanel.classList.add("hidden");
  els.revealStage.classList.remove("hidden");
  prepareAudio();
  stingAudio?.play().catch(() => {});

  const revealOrder = [...summary.teamResults].sort((a, b) => a.order - b.order);
  for (const [index, team] of revealOrder.entries()) {
    await revealTeamBoard(team, index + 1);
  }
  await revealFinalRanking();
  revealRunning = false;
  els.startRevealButton.disabled = !hasRevealData();
}

function hasRevealData() {
  return Boolean(summary?.submittedCount) && summary.teamResults?.some((team) => team.judgeTotals.length);
}

async function revealTeamBoard(team, order) {
  resetBoard();
  els.revealOrder.textContent = `${order}組目`;
  els.revealTeam.textContent = team.name;
  els.revealScore.textContent = "---";

  buildJudgeScores(team);
  await wait(650);

  const scoreSlots = [...els.judgeScoreGrid.querySelectorAll(".judge-score-slot")];
  for (const slot of scoreSlots) {
    slot.classList.add("revealed");
    hitAudio?.play().catch(() => {});
    await wait(260);
  }

  await wait(260);
  els.totalReveal.classList.add("armed");
  await countTo(team.total);
  els.totalReveal.classList.add("revealed");
  hitAudio?.play().catch(() => {});
  await wait(1200);
}

function buildJudgeScores(team) {
  els.judgeScoreGrid.replaceChildren();
  const totals = team.judgeTotals || [];
  if (!totals.length) {
    const empty = document.createElement("div");
    empty.className = "judge-score-slot revealed";
    empty.innerHTML = `<span>NO SCORE</span><strong>--</strong>`;
    els.judgeScoreGrid.append(empty);
    return;
  }

  totals.forEach((item) => {
    const slot = document.createElement("div");
    slot.className = "judge-score-slot";
    slot.innerHTML = `
      <span></span>
      <strong></strong>
    `;
    slot.querySelector("span").textContent = item.judgeName;
    slot.querySelector("strong").textContent = item.total;
    els.judgeScoreGrid.append(slot);
  });
}

async function countTo(target) {
  const steps = 32;
  const start = Math.max(0, target - 120);
  for (let i = 0; i <= steps; i += 1) {
    const value = Math.round(start + ((target - start) * i) / steps);
    els.revealScore.textContent = value;
    await wait(34);
  }
}

async function revealFinalRanking() {
  resetBoard();
  els.revealOrder.textContent = "FINAL";
  els.revealTeam.textContent = "最終結果";
  els.revealScore.textContent = "決定";
  els.finalRanking.classList.remove("hidden");
  els.finalRanking.replaceChildren();

  summary.teamResults.forEach((team, index) => {
    const row = document.createElement("div");
    row.className = "final-rank-row";
    row.style.animationDelay = `${index * 0.16}s`;
    row.innerHTML = `
      <strong></strong>
      <span></span>
      <b></b>
    `;
    row.querySelector("strong").textContent = `${index + 1}位`;
    row.querySelector("span").textContent = team.name;
    row.querySelector("b").textContent = `${team.total}点`;
    els.finalRanking.append(row);
  });
  stingAudio?.play().catch(() => {});
  await wait(1600);
}

function resetBoard() {
  els.broadcastBoard.classList.remove("impact");
  els.totalReveal.classList.remove("armed", "revealed");
  els.finalRanking.classList.add("hidden");
  els.finalRanking.replaceChildren();
  els.judgeScoreGrid.replaceChildren();
}

function prepareAudio() {
  if (!hitAudio) {
    hitAudio = new Audio("./assets/reveal-hit.m4a");
    hitAudio.volume = 0.8;
  }
  if (!stingAudio) {
    stingAudio = new Audio("./assets/reveal-sting.m4a");
    stingAudio.volume = 0.75;
  }
}

function emptyRow(text) {
  const div = document.createElement("div");
  div.className = "ranking-row";
  div.textContent = text;
  return div;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showMessage(text) {
  els.messageBox.textContent = text;
  els.messageBox.classList.remove("hidden");
}

function hideMessage() {
  els.messageBox.classList.add("hidden");
}
