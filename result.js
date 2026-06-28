const $ = (selector) => document.querySelector(selector);

const els = {
  projectName: $("#projectName"),
  refreshButton: $("#refreshButton"),
  projectSelect: $("#projectSelect"),
  startRevealButton: $("#startRevealButton"),
  backResultButton: $("#backResultButton"),
  resultStage: $(".result-stage"),
  revealFlow: $("#revealFlow"),
  revealJudgeStrip: $("#revealJudgeStrip"),
  revealTeam: $("#revealTeam"),
  judgeScoreLine: $("#judgeScoreLine"),
  revealScore: $("#revealScore"),
  revealSub: $("#revealSub"),
  resultTitle: $("#resultTitle"),
  resultLead: $("#resultLead"),
  rankingList: $("#rankingList"),
  scoreMatrix: $("#scoreMatrix"),
  emptyTemplate: $("#emptyTemplate"),
  messageBox: $("#messageBox"),
};

const params = new URLSearchParams(window.location.search);
let selectedProjectId = params.get("project") || "";
let projects = [];
let summary = null;
let isRevealing = false;
let revealHitAudio = null;
let revealStingAudio = null;

els.refreshButton?.addEventListener("click", loadSummary);
els.projectSelect?.addEventListener("change", () => {
  selectedProjectId = els.projectSelect.value;
  summary = null;
  renderStandby();
  loadSummary();
});
els.startRevealButton?.addEventListener("click", startReveal);
els.backResultButton?.addEventListener("click", showStandby);

loadProjects();
setInterval(() => {
  if (!isRevealing) loadSummary();
}, 8000);

async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u4e00\u89a7\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
    projects = data.projects || [];
    if (!selectedProjectId && projects.length) selectedProjectId = projects[0].id;
    renderProjectSelect();
    await loadSummary();
  } catch (error) {
    showMessage(error.message);
    renderStandby();
  }
}

function renderProjectSelect() {
  if (!els.projectSelect) return;
  els.projectSelect.replaceChildren();
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === selectedProjectId;
    els.projectSelect.append(option);
  });
}

async function loadSummary() {
  if (!selectedProjectId) {
    renderStandby();
    return;
  }
  try {
    const query = `?projectId=${encodeURIComponent(selectedProjectId)}`;
    const response = await fetch(`/api/result/summary${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "\u7d50\u679c\u30c7\u30fc\u30bf\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
    summary = data;
    renderStandby();
    hideMessage();
  } catch (error) {
    showMessage(error.message);
  }
}

function renderStandby() {
  const canReveal = hasRevealData();
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const projectName = summary?.project?.name || selectedProject?.name || "\u7d50\u679c\u767a\u8868";
  const submitted = summary?.submittedCount || 0;
  const totalJudges = summary?.totalJudges || 0;

  setText(els.projectName, projectName);
  setText(els.resultTitle, projectName);
  setText(
    els.resultLead,
    !selectedProjectId
      ? "\u63a1\u70b9\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
    : canReveal
      ? `${submitted} / ${totalJudges} \u540d\u63d0\u51fa\u6e08\u307f\u3002\u767a\u8868\u958b\u59cb\u30dc\u30bf\u30f3\u3067\u5f97\u70b9\u767a\u8868\u3092\u958b\u59cb\u3057\u307e\u3059\u3002`
      : `${submitted} / ${totalJudges} \u540d\u63d0\u51fa\u6e08\u307f\u3002\u63d0\u51fa\u3055\u308c\u305f\u63a1\u70b9\u3092\u5f85\u3063\u3066\u3044\u307e\u3059\u3002`,
  );
  setText(els.revealTeam, canReveal ? "\u767a\u8868\u6e96\u5099\u5b8c\u4e86" : "\u5f85\u6a5f\u4e2d");
  setText(els.revealScore, canReveal ? `${submitted}/${totalJudges}` : "---");
  setText(els.revealSub, summary?.allSubmitted ? "\u5168\u54e1\u63d0\u51fa\u6e08\u307f" : canReveal ? "\u9014\u4e2d\u767a\u8868\u3067\u304d\u307e\u3059" : "Ready");
  if (els.startRevealButton) els.startRevealButton.disabled = !selectedProjectId || !canReveal || isRevealing;
  renderRevealJudges();
}

function renderRevealJudges(activeJudgeId = "") {
  els.revealJudgeStrip?.replaceChildren();
  getRevealJudges().forEach((judge) => {
    const badge = document.createElement("span");
    badge.className = "reveal-judge-badge";
    badge.classList.toggle("active", judge.id === activeJudgeId);
    badge.textContent = judge.name;
    els.revealJudgeStrip.append(badge);
  });
}

function showStandby() {
  isRevealing = false;
  els.resultStage.classList.remove("hidden");
  els.revealFlow.classList.add("hidden");
  els.rankingList.classList.add("hidden");
  els.scoreMatrix.replaceChildren();
  renderStandby();
}

async function startReveal() {
  if (!hasRevealData() || isRevealing) return;
  isRevealing = true;
  prepareAudio();
  revealStingAudio?.play().catch(() => {});

  els.resultStage.classList.add("hidden");
  els.rankingList.classList.add("hidden");
  els.revealFlow.classList.remove("hidden");
  if (els.startRevealButton) els.startRevealButton.disabled = true;

  const judges = getRevealJudges();
  const revealOrder = [...summary.teamResults].sort((a, b) => a.order - b.order);
  const revealedTotals = [];

  for (const [index, team] of revealOrder.entries()) {
    buildTeamScoreBoard(team, judges, index + 1, revealedTotals);
    const result = await revealTeamBoardScores(team);
    revealedTotals.push(result);
    renderRevealTotalShelf(els.scoreMatrix.querySelector(".m1-broadcast-board"), revealedTotals);
    await wait(900);
  }

  buildFinalScoreMatrix(judges, [...summary.teamResults]);
  renderRanking();
  isRevealing = false;
  if (els.startRevealButton) els.startRevealButton.disabled = !hasRevealData();
}

function buildTeamScoreBoard(team, judges, order, revealedTotals = []) {
  els.scoreMatrix.replaceChildren();
  els.scoreMatrix.removeAttribute("style");
  els.scoreMatrix.className = "score-matrix judge-board-mode team-board-mode";

  const profile = revealProfileFor(judges.length);
  const board = document.createElement("section");
  board.className = `m1-broadcast-board ${judgeCountClass(judges.length)} ${profile.className}`;
  board.style.setProperty("--score-count", judges.length);
  board.style.setProperty("--score-rail-width", `${Math.min(72, Math.max(18, judges.length * 16))}%`);
  board.style.setProperty("--overflow-score-rail-width", `${judges.length * 68}px`);
  board.dataset.cueMs = profile.cue;
  board.dataset.suspenseMs = profile.suspense;
  board.dataset.impactMs = profile.impact;
  board.dataset.settleMs = profile.settle;
  board.innerHTML = `
    <div class="m1-topbar">
      <div class="m1-entry-badge"></div>
      <div class="m1-team-plate">
        <strong></strong>
        <span>JUDGE</span>
      </div>
      <div class="m1-score-title">SCORE</div>
    </div>
    <div class="m1-main-window">
      <div class="m1-score-backdrop">
        <div class="m1-backdrop-medal">M</div>
        <div class="m1-backdrop-bars"></div>
      </div>
      <div class="m1-focus-light"></div>
      <div class="m1-score-reveal hidden" id="centerScoreBurst">
        <div class="m1-reveal-number">
          <div class="score-door left-door"></div>
          <div class="score-door right-door"></div>
          <div class="burst-score"></div>
        </div>
        <div class="burst-team"></div>
      </div>
      <div class="m1-total-burst hidden">
        <span>\u5408\u8a08\u70b9</span>
        <strong></strong>
      </div>
      <div class="m1-total-shelf"></div>
      <div class="m1-score-rail"></div>
    </div>
    <div class="m1-judge-name-strip"></div>
  `;
  board.querySelector(".m1-entry-badge").textContent = order;
  board.querySelector(".m1-team-plate strong").textContent = team.name;

  const scoreWrap = board.querySelector(".m1-score-rail");
  scoreWrap.style.setProperty("--score-count", judges.length);
  judges.forEach((judge) => {
    const score = getScore(team, judge.id);
    const chip = document.createElement("div");
    chip.className = "m1-score-slot pending";
    applyScoreTone(chip, score);
    chip.dataset.score = score;
    chip.dataset.judge = judge.name;
    chip.dataset.judgeId = judge.id;
    chip.innerHTML = `
      <strong>--</strong>
      <span></span>
    `;
    chip.querySelector("span").textContent = judge.name;
    scoreWrap.append(chip);
  });

  els.scoreMatrix.append(board);
  renderRevealTotalShelf(board, revealedTotals);
}

async function revealTeamBoardScores(team) {
  const board = els.scoreMatrix.querySelector(".m1-broadcast-board");
  const burst = els.scoreMatrix.querySelector("#centerScoreBurst");
  const burstTeam = burst.querySelector(".burst-team");
  const burstScore = burst.querySelector(".burst-score");
  const chips = [...els.scoreMatrix.querySelectorAll(".m1-score-slot")];
  const timing = {
    cue: Number(board?.dataset.cueMs) || 420,
    suspense: Number(board?.dataset.suspenseMs) || 600,
    impact: Number(board?.dataset.impactMs) || 760,
    settle: Number(board?.dataset.settleMs) || 320,
  };

  await wait(320);
  for (const chip of chips) {
    chips.forEach((item) => item.classList.toggle("is-dimmed", item !== chip && !item.classList.contains("revealed")));
    chip.classList.add("is-cued");
    board?.classList.add("is-cueing");
    renderRevealJudges(chip.dataset.judgeId);
    await wait(timing.cue);

    board?.classList.add("is-suspense");
    await wait(timing.suspense);

    burstTeam.textContent = chip.dataset.judge;
    burstScore.textContent = chip.dataset.score;
    burst.className = "m1-score-reveal closed";
    applyScoreTone(burst, chip.dataset.score);
    await wait(220);
    burst.classList.remove("closed");
    burst.classList.add("revealed");
    board?.classList.add("is-flashing");
    playHit();

    chip.querySelector("strong").textContent = chip.dataset.score;
    chip.classList.remove("pending");
    chip.classList.add("revealed", "is-impact");
    await wait(timing.impact);

    burst.className = "m1-score-reveal hidden";
    chip.classList.remove("is-cued", "is-impact");
    board?.classList.remove("is-cueing", "is-suspense", "is-flashing");
    chips.forEach((item) => item.classList.remove("is-dimmed"));
    renderRevealJudges();
    await wait(timing.settle);
  }

  const result = resultFor(team);
  await revealTeamTotal(board, result);
  return result;
}

function buildFinalScoreMatrix(judges, rows) {
  els.scoreMatrix.replaceChildren();
  els.scoreMatrix.className = `score-matrix final-matrix-mode ${judgeCountClass(judges.length)}`;
  els.scoreMatrix.style.setProperty("--judge-count", judges.length);

  const corner = document.createElement("div");
  corner.className = "matrix-corner";
  corner.textContent = "TEAM";
  els.scoreMatrix.append(corner);

  judges.forEach((judge) => {
    const head = document.createElement("div");
    head.className = "matrix-judge revealed";
    head.textContent = judge.name;
    els.scoreMatrix.append(head);
  });

  const totalHead = document.createElement("div");
  totalHead.className = "matrix-judge total-head revealed";
  totalHead.textContent = "\u5408\u8a08";
  els.scoreMatrix.append(totalHead);

  rows.forEach((row) => {
    const team = document.createElement("div");
    team.className = "matrix-team revealed";
    team.textContent = row.name;
    els.scoreMatrix.append(team);

    judges.forEach((judge) => {
      const cell = document.createElement("div");
      const score = getScore(row, judge.id);
      cell.className = "matrix-score revealed";
      applyScoreTone(cell, score);
      cell.textContent = score;
      els.scoreMatrix.append(cell);
    });

    const total = document.createElement("div");
    total.className = "matrix-total revealed";
    total.textContent = row.total;
    els.scoreMatrix.append(total);
  });
}

async function revealTeamTotal(board, result) {
  const totalBurst = board?.querySelector(".m1-total-burst");
  if (!board || !totalBurst) return;
  totalBurst.querySelector("strong").textContent = result.total;
  board.classList.add("is-total-cue");
  await wait(360);
  playHit();
  totalBurst.classList.remove("hidden");
  totalBurst.classList.add("revealed");
  await wait(1450);
  totalBurst.classList.add("settling");
  await wait(420);
  board.classList.remove("is-total-cue");
}

function renderRevealTotalShelf(board, totals = []) {
  const shelf = board?.querySelector(".m1-total-shelf");
  if (!shelf) return;
  shelf.replaceChildren();
  shelf.classList.toggle("is-empty", !totals.length);
  if (!totals.length) return;

  const title = document.createElement("div");
  title.className = "m1-total-shelf-title";
  title.textContent = "TOP";
  shelf.append(title);

  const list = document.createElement("div");
  list.className = "m1-total-shelf-list";
  [...totals]
    .sort((a, b) => b.total - a.total || a.order - b.order)
    .slice(0, 5)
    .forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "m1-total-shelf-row";
      row.innerHTML = `
        <span class="m1-total-shelf-rank">${index + 1}</span>
        <span class="m1-total-shelf-name"></span>
        <strong></strong>
      `;
      row.querySelector(".m1-total-shelf-name").textContent = item.name;
      row.querySelector("strong").textContent = item.total;
      list.append(row);
    });
  shelf.append(list);
}

function renderRanking() {
  els.rankingList.replaceChildren();
  const head = document.createElement("div");
  head.className = "ranking-head";
  head.innerHTML = `
    <div>
      <p class="eyebrow">RANKING</p>
      <h2>\u9806\u4f4d\u767a\u8868</h2>
    </div>
  `;
  els.rankingList.append(head);

  if (!summary?.teamResults?.length) {
    els.rankingList.append(els.emptyTemplate.content.cloneNode(true));
    return;
  }

  summary.teamResults.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "ranking-row";
    row.innerHTML = `
      <div class="ranking-rank">${index + 1}\u4f4d</div>
      <div class="ranking-name"></div>
      <div class="ranking-total">${item.total}\u70b9</div>
    `;
    row.querySelector(".ranking-name").textContent = item.name;
    els.rankingList.append(row);
  });
}

function getRevealJudges() {
  const scoredJudgeIds = new Set();
  summary?.teamResults?.forEach((team) => {
    team.judgeTotals?.forEach((item) => scoredJudgeIds.add(item.judgeId));
  });
  return (summary?.project?.judges || []).filter((judge) => scoredJudgeIds.has(judge.id));
}

function getScore(team, judgeId) {
  const score = team.judgeTotals?.find((item) => item.judgeId === judgeId)?.total;
  return Number.isFinite(score) ? score : "--";
}

function resultFor(team) {
  return {
    id: team.id,
    name: team.name,
    order: team.order || 0,
    total: team.total || 0,
    average: team.average || 0,
  };
}

function revealProfileFor(count) {
  if (count <= 5) return { className: "reveal-profile-wide", cue: 540, suspense: 760, impact: 980, settle: 460 };
  if (count <= 9) return { className: "reveal-profile-nine", cue: 460, suspense: 640, impact: 820, settle: 360 };
  if (count <= 12) return { className: "reveal-profile-dense", cue: 380, suspense: 540, impact: 700, settle: 300 };
  return { className: "reveal-profile-scroll", cue: 300, suspense: 460, impact: 620, settle: 240 };
}

function judgeCountClass(count) {
  if (count <= 5) return "judge-count-few";
  if (count <= 9) return "judge-count-standard";
  return "judge-count-overflow";
}

function applyScoreTone(element, score) {
  const value = Number(score);
  element.classList.remove("gold-score", "silver-score", "bronze-score");
  if (!Number.isFinite(value)) return;
  if (value >= 95) element.classList.add("gold-score");
  else if (value >= 90) element.classList.add("silver-score");
  else if (value >= 85) element.classList.add("bronze-score");
}

function hasRevealData() {
  return Boolean(summary?.submittedCount) && summary.teamResults?.some((team) => team.judgeTotals?.length);
}

function prepareAudio() {
  if (!revealHitAudio) {
    revealHitAudio = new Audio("./assets/reveal-hit.m4a");
    revealHitAudio.preload = "auto";
    revealHitAudio.volume = 0.9;
  }
  if (!revealStingAudio) {
    revealStingAudio = new Audio("./assets/reveal-sting.m4a");
    revealStingAudio.preload = "auto";
    revealStingAudio.volume = 0.72;
  }
}

function playHit() {
  if (!revealHitAudio) return;
  revealHitAudio.currentTime = 0;
  revealHitAudio.play().catch(() => {});
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
