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

els.refreshButton?.addEventListener("click", loadSummary);
els.startRevealButton?.addEventListener("click", startReveal);
els.backButton?.addEventListener("click", () => {
  revealRunning = false;
  els.revealStage?.classList.add("hidden");
  els.standbyPanel?.classList.remove("hidden");
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
  setText(els.projectName, summary.project.name);
  setText(els.stageProjectName, summary.project.name);
  setText(els.submitCount, `${summary.submittedCount} / ${summary.totalJudges}`);
  setText(
    els.readyState,
    canReveal ? (summary.allSubmitted ? "全員提出済み" : "途中発表できます") : "提出待ち",
  );
  if (els.startRevealButton) els.startRevealButton.disabled = !canReveal || revealRunning;
  renderRanking();
}

function renderRanking() {
  if (!els.rankingList) return;
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
    setText(row.querySelector("strong"), `${index + 1}位`);
    setText(row.querySelector("em"), team.name);
    setText(row.querySelector("span"), `${team.judgeTotals.length}人分 / 平均 ${team.average}`);
    setText(row.querySelector("b"), `${team.total}点`);
    els.rankingList.append(row);
  });
}

async function startReveal() {
  if (!hasRevealData() || revealRunning) return;
  revealRunning = true;
  if (els.startRevealButton) els.startRevealButton.disabled = true;
  els.standbyPanel?.classList.add("hidden");
  els.revealStage?.classList.remove("hidden");
  prepareAudio();
  stingAudio?.play().catch(() => {});

  const revealOrder = [...summary.teamResults].sort((a, b) => a.order - b.order);
  for (const [index, team] of revealOrder.entries()) {
    await revealTeamBoard(team, index + 1);
  }
  await revealFinalRanking();
  revealRunning = false;
  if (els.startRevealButton) els.startRevealButton.disabled = !hasRevealData();
}

function hasRevealData() {
  return Boolean(summary?.submittedCount) && summary.teamResults?.some((team) => team.judgeTotals.length);
}

async function revealTeamBoard(team, order) {
  resetBoard();
  setText(els.revealOrder, `${order}組目`);
  setText(els.revealTeam, team.name);
  setText(els.revealScore, "---");

  buildJudgeScores(team);
  await wait(650);

  const scoreSlots = [...(els.judgeScoreGrid?.querySelectorAll(".judge-score-slot") || [])];
  for (const slot of scoreSlots) {
    slot.classList.add("revealed");
    playHit();
    await wait(260);
  }

  await wait(260);
  els.totalReveal?.classList.add("closed");
  await wait(740);
  await countTo(team.total);
  els.totalReveal?.classList.remove("closed");
  els.totalReveal?.classList.add("revealed");
  playHit();
  await wait(1200);
}

function buildJudgeScores(team) {
  if (!els.judgeScoreGrid) return;
  els.judgeScoreGrid.replaceChildren();
  const totals = team.judgeTotals || [];
  if (!totals.length) {
    const empty = document.createElement("div");
    empty.className = "judge-score-slot revealed";
    empty.innerHTML = `
      <div class="slot-door left-door"></div>
      <div class="slot-door right-door"></div>
      <div class="slot-core">
        <span>NO SCORE</span>
        <strong>--</strong>
      </div>
    `;
    els.judgeScoreGrid.append(empty);
    return;
  }

  totals.forEach((item) => {
    const slot = document.createElement("div");
    slot.className = "judge-score-slot";
    slot.innerHTML = `
      <div class="slot-door left-door"></div>
      <div class="slot-door right-door"></div>
      <div class="slot-core">
        <span></span>
        <strong></strong>
      </div>
    `;
    setText(slot.querySelector("span"), item.judgeName);
    setText(slot.querySelector("strong"), item.total);
    els.judgeScoreGrid.append(slot);
  });
}

async function countTo(target) {
  const steps = 32;
  const start = Math.max(0, target - 120);
  for (let i = 0; i <= steps; i += 1) {
    const value = Math.round(start + ((target - start) * i) / steps);
    setText(els.revealScore, value);
    await wait(34);
  }
}

async function revealFinalRanking() {
  resetBoard();
  setText(els.revealOrder, "FINAL");
  setText(els.revealTeam, "最終結果");
  setText(els.revealScore, "決定");
  els.finalRanking?.classList.remove("hidden");
  els.finalRanking?.replaceChildren();

  summary.teamResults.forEach((team, index) => {
    const row = document.createElement("div");
    row.className = "final-rank-row";
    row.style.animationDelay = `${index * 0.16}s`;
    row.innerHTML = `
      <strong></strong>
      <span></span>
      <b></b>
    `;
    setText(row.querySelector("strong"), `${index + 1}位`);
    setText(row.querySelector("span"), team.name);
    setText(row.querySelector("b"), `${team.total}点`);
    els.finalRanking?.append(row);
  });
  stingAudio?.play().catch(() => {});
  await wait(1600);
}

function resetBoard() {
  els.broadcastBoard?.classList.remove("impact");
  els.totalReveal?.classList.remove("closed", "revealed");
  els.finalRanking?.classList.add("hidden");
  els.finalRanking?.replaceChildren();
  els.judgeScoreGrid?.replaceChildren();
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

function playHit() {
  if (!hitAudio) return;
  hitAudio.currentTime = 0;
  hitAudio.play().catch(() => {});
}

function emptyRow(text) {
  const div = document.createElement("div");
  div.className = "ranking-row";
  div.textContent = text;
  return div;
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showMessage(text) {
  if (!els.messageBox) return;
  els.messageBox.textContent = text;
  els.messageBox.classList.remove("hidden");
}

function hideMessage() {
  els.messageBox?.classList.add("hidden");
}
