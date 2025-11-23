// public/main.js v35  (ADMIN)
// Stable startGame + safe gameCode + deck loader + logs

const socket = io();
console.log("[ADMIN] main.js loaded v35");

socket.on("connect", () => {
  console.log("[ADMIN] connected:", socket.id);
});

// ---------------- DOM ----------------
const teamNameInput = document.getElementById("teamNameInput");
const addTeamBtn = document.getElementById("addTeamBtn");
const teamListEl = document.getElementById("teamList");

const challengeGrid = document.getElementById("challengeGrid");
const deckStatusEl = document.getElementById("deckStatus");

const currentChallengeText = document.getElementById("currentChallengeText");

const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");
const incompleteBtn = document.getElementById("incompleteBtn");

const startGameBtn = document.getElementById("startGameBtn");
const gameCodeValueEl = document.getElementById("gameCodeValue");

const resetBtn = document.getElementById("resetBtn");
const endGameBtn = document.getElementById("endGameBtn");
const endGameResultEl = document.getElementById("endGameResult");

const gpCountdownMain = document.getElementById("gpCountdownMain");

// ---------------- STATE ----------------
let gameCode = null;
let teams = [];
let deck = [];
let currentChallenge = null;
let selectedTeamId = null;
let nextTeamId = 1;

const STORAGE_KEY = "xmasChallenge_admin_v35";

// ---------------- DECK LOADER ----------------
// All deck files MUST export: export const DECK = [...]
const deckModules = [
  "./data/deck/grandprix.js",
  "./data/deck/nissegaaden.js",
  "./data/deck/julekortet.js",
  "./data/deck/kreanissen.js",
];

async function loadDeckFromFiles() {
  const all = [];

  for (const path of deckModules) {
    try {
      const mod = await import(path + "?v=" + Date.now());
      const arr = mod.DECK || mod.default || [];
      if (!Array.isArray(arr)) continue;

      arr.forEach(c => {
        all.push({
          used: false,
          ...c,
        });
      });
    } catch (e) {
      console.warn("[ADMIN] Could not load deck:", path, e);
    }
  }

  // unique by id
  const seen = new Set();
  deck = all.filter(c => {
    if (!c.id) return false;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  console.log("[ADMIN] Deck loaded:", deck.length, "cards");
  renderDeck();
  syncToServer();
}

// ---------------- SAVE/LOAD LOCAL ----------------
function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      gameCode, teams, deck, currentChallenge, nextTeamId
    }));
  } catch {}
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.gameCode) gameCode = s.gameCode;
    if (Array.isArray(s.teams)) teams = s.teams;
    if (Array.isArray(s.deck)) deck = s.deck;
    if (s.currentChallenge !== undefined) currentChallenge = s.currentChallenge;
    if (typeof s.nextTeamId === "number") nextTeamId = s.nextTeamId;
  } catch {}
}

// ---------------- SYNC TO SERVER ----------------
function syncToServer() {
  const serverState = {
    gameCode,         // ✅ always send real code if we have it
    teams,
    deck,
    currentChallenge,
  };
  socket.emit("updateState", serverState);
}

// ---------------- RENDER ----------------
function renderLeaderboard() {
  const sorted = [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });

  teamListEl.innerHTML = "";

  sorted.forEach(team => {
    const li = document.createElement("li");
    li.className = "team-item" + (team.id === selectedTeamId ? " selected" : "");

    const left = document.createElement("span");
    left.className = "team-name";
    left.textContent = team.name;

    const right = document.createElement("div");
    right.className = "team-points";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.onclick = (e) => { e.stopPropagation(); changePoints(team.id, -1); };

    const pts = document.createElement("span");
    pts.textContent = team.points;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = (e) => { e.stopPropagation(); changePoints(team.id, 1); };

    right.append(minus, pts, plus);

    li.append(left, right);
    li.onclick = () => { selectedTeamId = team.id; renderLeaderboard(); };

    teamListEl.appendChild(li);
  });
}

function renderDeck() {
  challengeGrid.innerHTML = "";

  if (!deck.length) {
    deckStatusEl.textContent = "⚠️ Ingen udfordringer fundet (deck tom).";
    return;
  }

  deckStatusEl.textContent = "";

  deck.forEach(card => {
    const btn = document.createElement("button");
    btn.className = "challenge-card";
    btn.dataset.id = card.id;
    btn.textContent = card.title || card.id;

    if (card.used) btn.style.opacity = "0.35";

    btn.onclick = () => selectChallenge(card.id);

    challengeGrid.appendChild(btn);
  });
}

function renderCurrentChallengeText() {
  currentChallengeText.textContent = currentChallenge
    ? `Aktuel udfordring: ${currentChallenge.title || currentChallenge.type}`
    : "Ingen udfordring valgt endnu.";
}

// ---------------- TEAMS ----------------
function addTeam(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  if (teams.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    alert("Navnet er allerede taget.");
    return;
  }

  teams.push({
    id: nextTeamId++,
    name: trimmed,
    points: 0,
  });

  selectedTeamId = null;
  teamNameInput.value = "";
  saveLocal();
  renderLeaderboard();
  syncToServer();
}

function changePoints(teamId, delta) {
  const t = teams.find(x => x.id === teamId);
  if (!t) return;
  t.points += delta;
  saveLocal();
  renderLeaderboard();
  syncToServer();
}

// ---------------- CHALLENGE SELECT ----------------
function selectChallenge(id) {
  const card = deck.find(c => c.id === id);
  if (!card || card.used) return;

  // mark used
  card.used = true;

  // create live challenge state
  currentChallenge = {
    ...card,
    phase: card.type === "Nisse Grandprix" ? "listening" : "showing",
    startAt: Date.now() + 1200, // small sync delay
    countdownSeconds: 20,
  };

  saveLocal();
  renderDeck();
  renderCurrentChallengeText();
  syncToServer();
}

// ---------------- GRANDPRIX COUNTDOWN ON MAIN ----------------
let countdownTimer = null;
function updateGpCountdown(ch) {
  if (!ch || ch.type !== "Nisse Grandprix" || ch.phase !== "locked" || !ch.countdownStartAt) {
    gpCountdownMain.style.display = "none";
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    return;
  }

  gpCountdownMain.style.display = "inline-block";

  const startAt = ch.countdownStartAt;
  const total = ch.countdownSeconds || 20;

  const tick = () => {
    const elapsed = Math.floor((Date.now() - startAt) / 1000);
    const left = Math.max(0, total - elapsed);
    gpCountdownMain.textContent = left;
    if (left <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  tick();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 250);
}

// ---------------- YES / NO / INCOMPLETE ----------------
function stopGpAudioEverywhere() {
  socket.emit("gp-stop-audio-now");
}

yesBtn.onclick = () => {
  if (!currentChallenge) return alert("Vælg en udfordring først.");
  if (!selectedTeamId) return alert("Vælg vinderholdet først.");

  changePoints(selectedTeamId, 1);
  stopGpAudioEverywhere();

  currentChallenge = null;
  saveLocal();
  renderCurrentChallengeText();
  syncToServer();
};

noBtn.onclick = () => {
  if (!currentChallenge) return alert("Vælg en udfordring først.");

  // If GP locked, resume listening
  if (currentChallenge.type === "Nisse Grandprix") {
    currentChallenge.phase = "listening";
    currentChallenge.startAt = Date.now() + 1000;
    delete currentChallenge.firstBuzz;
    delete currentChallenge.countdownStartAt;
    stopGpAudioEverywhere(); // stops now; teams will restart on new phase
    saveLocal();
    syncToServer();
    return;
  }

  stopGpAudioEverywhere();
  currentChallenge = null;
  saveLocal();
  renderCurrentChallengeText();
  syncToServer();
};

incompleteBtn.onclick = () => {
  if (!currentChallenge) return alert("Vælg en udfordring først.");
  stopGpAudioEverywhere();
  currentChallenge = null;
  saveLocal();
  renderCurrentChallengeText();
  syncToServer();
};

// ---------------- START / RESET / END ----------------
startGameBtn.onclick = () => {
  console.log("[ADMIN] startGame clicked -> emitting startGame");

  socket.emit("startGame", (res) => {
    console.log("[ADMIN] startGame ack:", res);

    if (!res?.ok) {
      alert("Kunne ikke starte spil.");
      return;
    }

    gameCode = res.gameCode;
    gameCodeValueEl.textContent = gameCode;

    teams = [];
    currentChallenge = null;
    selectedTeamId = null;
    nextTeamId = 1;

    loadDeckFromFiles();
    saveLocal();
    renderLeaderboard();
    renderCurrentChallengeText();
    syncToServer();
  });
};

resetBtn.onclick = () => {
  if (!confirm("Nulstil alle hold og point?")) return;
  stopGpAudioEverywhere();
  teams = [];
  currentChallenge = null;
  selectedTeamId = null;
  nextTeamId = 1;
  deck.forEach(c => c.used = false);
  saveLocal();
  renderDeck();
  renderLeaderboard();
  renderCurrentChallengeText();
  syncToServer();
};

endGameBtn.onclick = () => {
  stopGpAudioEverywhere();

  if (!teams.length) return;
  const sorted = [...teams].sort((a, b) => b.points - a.points);
  const top = sorted[0].points;
  const winners = sorted.filter(t => t.points === top);

  if (winners.length === 1) {
    endGameResultEl.textContent = `Vinderen er: ${winners[0].name} med ${top} point! 🎉`;
  } else {
    endGameResultEl.textContent = `Uafgjort mellem: ${winners.map(w => w.name).join(", ")} (${top} point)`;
  }

  // reset deck for new game
  deck.forEach(c => c.used = false);
  currentChallenge = null;
  saveLocal();
  renderDeck();
  renderCurrentChallengeText();
  syncToServer();
};

// ---------------- SOCKET STATE ----------------
socket.on("state", (serverState) => {
  console.log("[ADMIN] state received:", serverState);

  if (!serverState) return;

  // Take server gameCode if present
  if (serverState.gameCode) {
    gameCode = serverState.gameCode;
    gameCodeValueEl.textContent = gameCode;
  }

  if (Array.isArray(serverState.teams)) teams = serverState.teams;
  if (Array.isArray(serverState.deck) && serverState.deck.length) deck = serverState.deck;
  currentChallenge = serverState.currentChallenge ?? null;

  // rebuild nextTeamId
  const maxId = teams.reduce((m, t) => Math.max(m, t.id || 0), 0);
  nextTeamId = maxId + 1;

  saveLocal();
  renderDeck();
  renderLeaderboard();
  renderCurrentChallengeText();
  updateGpCountdown(currentChallenge);
});

// ---------------- INIT ----------------
loadLocal();
renderDeck();
renderLeaderboard();
renderCurrentChallengeText();

addTeamBtn.onclick = () => addTeam(teamNameInput.value);
teamNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTeam(teamNameInput.value);
});

// If no deck locally, load from files on first boot
if (!deck.length) loadDeckFromFiles();
