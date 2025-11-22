// public/main.js  (MODULE version)
// Uses prefix IDs and imports challenge sets from /public/data/deck/

import { grandprixDeck } from "./data/deck/grandprix.js";
import { nisseGaaden } from "./data/deck/nissegaaden.js";

const socket = (typeof io !== "undefined") ? io() : {
  emit() {},
  on() {},
  disconnected: true
};

// ---------------- DOM ----------------
const teamNameInput = document.getElementById("teamNameInput");
const addTeamBtn = document.getElementById("addTeamBtn");
const teamListEl = document.getElementById("teamList");

const challengeGridEl = document.querySelector(".challenge-grid");
const currentChallengeText = document.getElementById("currentChallengeText");

const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");
const incompleteBtn = document.getElementById("incompleteBtn");

const endGameBtn = document.getElementById("endGameBtn");
const endGameResultEl = document.getElementById("endGameResult");

const resetBtn = document.getElementById("resetBtn");
const startGameBtn = document.getElementById("startGameBtn");
const gameCodeValueEl = document.getElementById("gameCodeValue");

// Countdown on main (we create it next to "ikke fuldført")
let mainCountdownEl = null;
function ensureMainCountdownEl() {
  if (mainCountdownEl) return mainCountdownEl;
  mainCountdownEl = document.createElement("span");
  mainCountdownEl.id = "mainCountdown";
  mainCountdownEl.style.cssText = `
    font-weight:900; font-size:1.6rem; margin-left:10px;
    padding:6px 10px; border-radius:8px; background:#111; color:#fff;
    display:none; min-width:40px; text-align:center;
  `;
  incompleteBtn?.insertAdjacentElement("afterend", mainCountdownEl);
  return mainCountdownEl;
}

// ---------------- STATE ----------------
let teams = [];
let selectedTeamId = null;
let currentChallenge = null;
let deck = makeInitialDeck();
let gameCode = null;

// cooldown for +/- points
let isPointsCooldown = false;

// local backup
const STORAGE_KEY = "xmasChallengeState_v3_prefix";

function makeInitialDeck() {
  return [
    ...grandprixDeck,
    ...nisseGaaden,
    // later:
    // ...fiNisseSet,
    // ...juleKortSet,
    // ...udfordringerSet,
  ].map(c => ({ ...c, used: !!c.used }));
}

// ---------------- Persistence ----------------
function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      teams,
      deck,
      currentChallenge,
      gameCode
    }));
  } catch {}
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.teams)) teams = s.teams;
    if (Array.isArray(s.deck)) deck = s.deck;
    if (s.currentChallenge) currentChallenge = s.currentChallenge;
    if (s.gameCode) gameCode = s.gameCode;
  } catch {}
}

// ---------------- Server sync ----------------
function syncToServer() {
  if (!socket || socket.disconnected) return;

  const serverState = {
    gameCode,
    teams,
    deck,
    currentChallenge
  };
  socket.emit("updateState", serverState);
}

// ---------------- Rendering ----------------
function renderTeams() {
  const sorted = [...teams].sort((a, b) => {
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    return (a.name || "").localeCompare(b.name || "");
  });

  teamListEl.innerHTML = "";

  sorted.forEach(team => {
    const li = document.createElement("li");
    li.className = "team-item" + (team.id === selectedTeamId ? " selected" : "");
    li.dataset.id = team.id;

    const nameSpan = document.createElement("span");
    nameSpan.className = "team-name";
    nameSpan.textContent = team.name;

    const pointsDiv = document.createElement("div");
    pointsDiv.className = "team-points";

    const pointsValue = document.createElement("span");
    pointsValue.textContent = team.points ?? 0;

    const plusBtn = document.createElement("button");
    plusBtn.textContent = "+";
    plusBtn.onclick = (e) => {
      e.stopPropagation();
      changePoints(team.id, 1);
    };

    const minusBtn = document.createElement("button");
    minusBtn.textContent = "−";
    minusBtn.onclick = (e) => {
      e.stopPropagation();
      changePoints(team.id, -1);
    };

    pointsDiv.append(minusBtn, pointsValue, plusBtn);
    li.append(nameSpan, pointsDiv);

    li.onclick = () => {
      selectedTeamId = team.id;
      renderTeams();
    };

    teamListEl.appendChild(li);
  });
}

function renderDeck() {
  if (!challengeGridEl) return;
  challengeGridEl.innerHTML = "";

  deck.forEach(card => {
    const btn = document.createElement("button");
    btn.className = "challenge-card";
    btn.dataset.id = card.id;
    btn.dataset.type = card.type;
    btn.textContent = card.title || card.type;

    if (card.used) {
      btn.style.opacity = "0.45";
      btn.style.textDecoration = "line-through";
    }

    btn.onclick = () => {
      if (card.used) {
        alert("Denne udfordring er allerede brugt.");
        return;
      }
      setCurrentChallenge(card);
    };

    challengeGridEl.appendChild(btn);
  });
}

function renderCurrentChallenge() {
  if (!currentChallenge) {
    currentChallengeText.textContent = "Ingen udfordring valgt endnu.";
    hideMainCountdown();
    return;
  }

  currentChallengeText.textContent =
    `Aktuel udfordring: ${currentChallenge.title || currentChallenge.type}`;

  // show countdown if grandprix is locked and timer exists
  if (
    currentChallenge.type === "Nisse Grandprix" &&
    currentChallenge.phase === "locked" &&
    currentChallenge.countdownStartAt
  ) {
    showMainCountdown(currentChallenge.countdownStartAt, currentChallenge.countdownSeconds || 5);
  } else {
    hideMainCountdown();
  }
}

// ---------------- Countdown on main ----------------
let mainCountdownTimer = null;

function showMainCountdown(startAtMs, seconds) {
  ensureMainCountdownEl();
  mainCountdownEl.style.display = "inline-block";

  if (mainCountdownTimer) clearInterval(mainCountdownTimer);

  const tick = () => {
    const now = Date.now();
    const elapsed = Math.floor((now - startAtMs) / 1000);
    const left = Math.max(0, seconds - elapsed);
    mainCountdownEl.textContent = left;
    if (left <= 0) {
      clearInterval(mainCountdownTimer);
      mainCountdownTimer = null;
      setTimeout(hideMainCountdown, 400);
    }
  };

  tick();
  mainCountdownTimer = setInterval(tick, 100);
}

function hideMainCountdown() {
  if (mainCountdownTimer) clearInterval(mainCountdownTimer);
  mainCountdownTimer = null;
  if (mainCountdownEl) mainCountdownEl.style.display = "none";
}

// ---------------- Team & points ----------------
function addTeam(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const exists = teams.some(t => t.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) {
    alert("Holdnavnet findes allerede. Vælg et nyt.");
    return;
  }

  teams.push({
    id: "t" + (crypto?.randomUUID?.() || Date.now()),
    name: trimmed,
    points: 0
  });

  selectedTeamId = null;
  teamNameInput.value = "";
  saveLocal();
  renderTeams();
  syncToServer();
  teamNameInput.focus();
}

function changePoints(teamId, delta) {
  if (isPointsCooldown) return;
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  team.points = (team.points ?? 0) + delta;

  saveLocal();
  renderTeams();
  syncToServer();

  isPointsCooldown = true;
  setTimeout(() => isPointsCooldown = false, 400);
}

// ---------------- Challenge selection ----------------
function setCurrentChallenge(card) {
  // create payload
  if (card.type === "Nisse Grandprix") {
    const startDelayMs = 3000;
    currentChallenge = {
      ...card,
      phase: "listening",
      startAt: Date.now() + startDelayMs,
      audioPosition: 0,
      firstBuzz: null,
      countdownSeconds: 5
    };
  } else {
    currentChallenge = { ...card };
  }

  renderCurrentChallenge();
  saveLocal();
  syncToServer();
}

// ---------------- Decisions ----------------
function markCurrentUsed() {
  if (!currentChallenge) return;
  const idx = deck.findIndex(c => c.id === currentChallenge.id);
  if (idx >= 0) deck[idx].used = true;
}

function endCurrentChallenge() {
  if (!currentChallenge) return;
  if (currentChallenge.type === "Nisse Grandprix") {
    currentChallenge.phase = "ended"; // teams stop audio automatically
  } else {
    currentChallenge = null;
  }
}

function handleYes() {
  if (!currentChallenge) {
    alert("Vælg en udfordring først.");
    return;
  }
  if (!selectedTeamId) {
    alert("Klik på et hold i leaderboardet for at vælge vinder.");
    return;
  }

  changePoints(selectedTeamId, 1);
  markCurrentUsed();
  endCurrentChallenge();

  renderDeck();
  renderCurrentChallenge();
  saveLocal();
  syncToServer();
}

function handleNo() {
  if (!currentChallenge) {
    alert("Vælg en udfordring først.");
    return;
  }

  markCurrentUsed(); // still counts as used
  endCurrentChallenge();

  renderDeck();
  renderCurrentChallenge();
  saveLocal();
  syncToServer();
}

function handleIncomplete() {
  if (!currentChallenge) {
    alert("Vælg en udfordring først.");
    return;
  }

  markCurrentUsed(); // still counts as used
  endCurrentChallenge();

  renderDeck();
  renderCurrentChallenge();
  saveLocal();
  syncToServer();
}

// ---------------- Reset / End game ----------------
function handleReset() {
  const sure = confirm("Nulstil hele spillet? (hold, point og udfordringer)");
  if (!sure) return;

  teams = [];
  selectedTeamId = null;
  currentChallenge = null;
  deck = makeInitialDeck();
  endGameResultEl.textContent = "";
  gameCode = null;

  localStorage.removeItem(STORAGE_KEY);

  renderTeams();
  renderDeck();
  renderCurrentChallenge();
  syncToServer();
  teamNameInput.focus();
}

function handleEndGame() {
  if (!teams.length) {
    alert("Ingen hold endnu.");
    return;
  }

  const sorted = [...teams].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const topScore = sorted[0].points ?? 0;
  const winners = sorted.filter(t => (t.points ?? 0) === topScore);

  if (winners.length === 1) {
    endGameResultEl.textContent =
      `Vinderen er: ${winners[0].name} med ${topScore} point! 🎉`;
  } else {
    endGameResultEl.textContent =
      `Uafgjort mellem: ${winners.map(t => t.name).join(", ")} (${topScore} point)`;
  }

  // also stop any Grandprix audio
  if (currentChallenge?.type === "Nisse Grandprix") {
    currentChallenge.phase = "ended";
    syncToServer();
  }
}

// ---------------- Start Game (code) ----------------
function handleStartGame() {
  // Ask server if it supports startGame ack
  let didAck = false;

  socket.emit("startGame", (res) => {
    didAck = true;
    if (res?.ok) {
      gameCode = res.gameCode;
      if (gameCodeValueEl) gameCodeValueEl.textContent = gameCode;
      if (res.state?.teams) teams = res.state.teams;
      if (res.state?.deck) deck = res.state.deck;
      currentChallenge = null;
      renderTeams();
      renderDeck();
      renderCurrentChallenge();
      saveLocal();
      syncToServer();
    }
  });

  // Fallback if server doesn't ack
  setTimeout(() => {
    if (didAck) return;
    gameCode = String(Math.floor(1000 + Math.random() * 9000));
    if (gameCodeValueEl) gameCodeValueEl.textContent = gameCode;
    saveLocal();
    syncToServer();
  }, 300);
}

// ---------------- Event listeners ----------------
addTeamBtn?.addEventListener("click", () => addTeam(teamNameInput.value));
teamNameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTeam(teamNameInput.value);
});

yesBtn?.addEventListener("click", handleYes);
noBtn?.addEventListener("click", handleNo);
incompleteBtn?.addEventListener("click", handleIncomplete);

resetBtn?.addEventListener("click", handleReset);
endGameBtn?.addEventListener("click", handleEndGame);
startGameBtn?.addEventListener("click", handleStartGame);

// ---------------- Socket events ----------------
socket.on("state", (serverState) => {
  if (!serverState) return;

  if (serverState.gameCode) {
    gameCode = serverState.gameCode;
    if (gameCodeValueEl) gameCodeValueEl.textContent = gameCode;
  }

  if (Array.isArray(serverState.teams)) teams = serverState.teams;
  if (Array.isArray(serverState.deck)) deck = serverState.deck;
  currentChallenge = serverState.currentChallenge || null;

  saveLocal();
  renderTeams();
  renderDeck();
  renderCurrentChallenge();
});

socket.on("buzzed", (teamName) => {
  // helpful: auto-select buzzing team on admin
  const t = teams.find(x => x.name === teamName);
  if (t) {
    selectedTeamId = t.id;
    renderTeams();
  }
});

// ---------------- Init ----------------
loadLocal();
renderTeams();
renderDeck();
renderCurrentChallenge();
teamNameInput?.focus();
if (gameCodeValueEl && gameCode) gameCodeValueEl.textContent = gameCode;
