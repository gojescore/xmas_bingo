// public/main.js (Admin)

// -----------------------------
// SOCKET.IO setup
// -----------------------------
let socket = null;

if (typeof io !== "undefined") {
  socket = io();
} else {
  socket = { emit: () => {}, on: () => {}, disconnected: true };
}

// -----------------------------
// DOM elements
// -----------------------------
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

// -----------------------------
// Local state mirror
// -----------------------------
let teams = [];
let nextTeamId = 1;
let selectedTeamId = null;
let currentChallenge = null;

let challengeDeck = []; // NEW: admin deck mirror

const STORAGE_KEY = "xmasChallengeState_v3";
let isPointsCooldown = false;

// -----------------------------
// Define your deck here
// Add as many as you want.
// Duplicate types allowed, each card unique id.
// -----------------------------
function makeInitialDeck() {
  return [
    {
      id: 1,
      type: "Nisse Grandprix",
      title: "Grandprix 1",
      audioUrl: "https://ldaskskrbotxxhoqdzdc.supabase.co/storage/v1/object/public/grandprix-audio/SorenBanjo.mp3",
      used: false,
    },
    {
      id: 2,
      type: "Nisse Grandprix",
      title: "Grandprix 2",
      audioUrl: "https://ldaskskrbotxxhoqdzdc.supabase.co/storage/v1/object/public/grandprix-audio/hojtFraT.mp3",
      used: false,
    },
    {
      id: 3,
      type: "FiNisse",
      title: "FiNisse – Juletrøje",
      used: false,
    },
    {
      id: 4,
      type: "NisseGåden",
      title: "Gåde 1",
      text: "Hvad er det der er rødt og står i skoven?",
      used: false,
    },
    {
      id: 5,
      type: "JuleKortet",
      title: "Julekort 1",
      text: "Skriv den mest kreative julehilsen.",
      used: false,
    },
  ];
}

// -----------------------------
// localStorage
// -----------------------------
function saveStateToLocal() {
  const localState = {
    teams,
    nextTeamId,
    currentChallenge,
    challengeDeck,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
}

function loadStateFromLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const s = JSON.parse(raw);
    if (Array.isArray(s.teams)) teams = s.teams;
    if (typeof s.nextTeamId === "number") nextTeamId = s.nextTeamId;
    currentChallenge = s.currentChallenge ?? null;
    if (Array.isArray(s.challengeDeck)) challengeDeck = s.challengeDeck;
  } catch {}
}

// -----------------------------
// UI helpers
// -----------------------------
function updateCurrentChallengeTextOnly() {
  if (!currentChallenge) {
    currentChallengeText.textContent = "Ingen udfordring valgt endnu.";
    return;
  }

  if (typeof currentChallenge === "string") {
    currentChallengeText.textContent = `Aktuel udfordring: ${currentChallenge}`;
  } else {
    currentChallengeText.textContent =
      `Aktuel udfordring: ${currentChallenge.type} (${currentChallenge.phase || "klar"})`;
  }
}

// -----------------------------
// Sync
// -----------------------------
function syncToServer() {
  if (!socket || socket.disconnected) return;

  socket.emit("updateState", {
    teams,
    leaderboard: [],
    currentChallenge,
    challengeDeck,
  });
}

// -----------------------------
// Render leaderboard
// -----------------------------
function renderTeams() {
  const sorted = [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });

  teamListEl.innerHTML = "";

  sorted.forEach((team) => {
    const li = document.createElement("li");
    li.className =
      "team-item" + (team.id === selectedTeamId ? " selected" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "team-name";
    nameSpan.textContent = team.name;

    const pointsDiv = document.createElement("div");
    pointsDiv.className = "team-points";

    const pointsValue = document.createElement("span");
    pointsValue.textContent = team.points;

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

    pointsDiv.appendChild(minusBtn);
    pointsDiv.appendChild(pointsValue);
    pointsDiv.appendChild(plusBtn);

    li.appendChild(nameSpan);
    li.appendChild(pointsDiv);

    li.onclick = () => {
      selectedTeamId = team.id;
      renderTeams();
    };

    teamListEl.appendChild(li);
  });
}

// -----------------------------
// Render challenge deck
// -----------------------------
function renderDeck() {
  if (!challengeGridEl) return;

  challengeGridEl.innerHTML = "";

  challengeDeck.forEach((card) => {
    const btn = document.createElement("button");
    btn.className = "challenge-card";
    btn.dataset.id = card.id;

    btn.textContent = card.title || card.type;

    if (card.used) {
      btn.disabled = true;
      btn.style.opacity = "0.4";
      btn.style.textDecoration = "line-through";
      btn.style.cursor = "not-allowed";
    }

    btn.onclick = () => {
      if (card.used) return;
      socket.emit("startChallenge", card.id);
    };

    challengeGridEl.appendChild(btn);
  });
}

// -----------------------------
// Team management
// -----------------------------
function addTeam(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  teams.push({
    id: nextTeamId++,
    name: trimmed,
    points: 0,
  });

  selectedTeamId = null;
  teamNameInput.value = "";
  saveStateToLocal();
  renderTeams();
  syncToServer();
  teamNameInput.focus();
}

function changePoints(teamId, delta) {
  if (isPointsCooldown) return;
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;

  team.points += delta;

  saveStateToLocal();
  renderTeams();
  syncToServer();

  isPointsCooldown = true;
  setTimeout(() => (isPointsCooldown = false), 500);
}

// -----------------------------
// Decision buttons
// -----------------------------
function handleYes() {
  if (!currentChallenge) {
    alert("Vælg en udfordring først.");
    return;
  }

  // Grandprix YES
  if (
    typeof currentChallenge === "object" &&
    currentChallenge.type === "Nisse Grandprix" &&
    currentChallenge.phase === "locked" &&
    currentChallenge.firstBuzz
  ) {
    socket.emit("grandprixYes");
    return;
  }

  if (!selectedTeamId) {
    alert("Vælg vinder i leaderboard først.");
    return;
  }

  changePoints(selectedTeamId, 1);

  // mark used for normal challenges
  if (typeof currentChallenge === "object" && currentChallenge.id) {
    markLocalDeckUsed(currentChallenge.id);
  }
}

function handleNo() {
  if (
    typeof currentChallenge === "object" &&
    currentChallenge.type === "Nisse Grandprix" &&
    currentChallenge.phase === "locked"
  ) {
    socket.emit("grandprixNo", {});
    return;
  }

  alert("✖ Ikke godkendt.");
}

function handleIncomplete() {
  if (!currentChallenge) return;

  if (
    typeof currentChallenge === "object" &&
    currentChallenge.type === "Nisse Grandprix"
  ) {
    socket.emit("grandprixIncomplete");
    return;
  }

  // normal challenges -> mark used, no points
  if (typeof currentChallenge === "object" && currentChallenge.id) {
    markLocalDeckUsed(currentChallenge.id);
  }
}

// Local helper (UI only, server will also mark used)
function markLocalDeckUsed(id) {
  const item = challengeDeck.find(c => c.id === id);
  if (item) item.used = true;
  saveStateToLocal();
  renderDeck();
  syncToServer();
}

// -----------------------------
// Reset / Start / End game
// -----------------------------
function handleReset() {
  if (!confirm("Nulstil alle hold + point?")) return;

  teams = [];
  nextTeamId = 1;
  selectedTeamId = null;
  currentChallenge = null;
  endGameResultEl.textContent = "";

  challengeDeck = challengeDeck.map(c => ({ ...c, used: false }));

  localStorage.removeItem(STORAGE_KEY);

  renderTeams();
  renderDeck();
  updateCurrentChallengeTextOnly();
  syncToServer();
}

function handleStartGame() {
  socket.emit("startGame");
}

function handleEndGame() {
  if (teams.length === 0) return alert("Ingen hold endnu.");

  const sorted = [...teams].sort((a, b) => b.points - a.points);
  const topScore = sorted[0].points;
  const winners = sorted.filter((t) => t.points === topScore);

  if (winners.length === 1) {
    endGameResultEl.textContent =
      `Vinderen er: ${winners[0].name} med ${topScore} point! 🎉`;
  } else {
    endGameResultEl.textContent =
      `Uafgjort mellem: ${winners.map(w => w.name).join(", ")} (${topScore} point).`;
  }
}

// -----------------------------
// Event listeners
// -----------------------------
addTeamBtn.onclick = () => addTeam(teamNameInput.value);
teamNameInput.onkeydown = (e) => {
  if (e.key === "Enter") addTeam(teamNameInput.value);
};

yesBtn.onclick = handleYes;
noBtn.onclick = handleNo;
incompleteBtn.onclick = handleIncomplete;

endGameBtn.onclick = handleEndGame;
resetBtn.onclick = handleReset;
startGameBtn.onclick = handleStartGame;

// -----------------------------
// Receive state
// -----------------------------
socket.on("state", (serverState) => {
  if (!serverState) return;

  if (serverState.gameCode && gameCodeValueEl) {
    gameCodeValueEl.textContent = serverState.gameCode;
  }

  teams = Array.isArray(serverState.teams) ? serverState.teams : [];
  currentChallenge = serverState.currentChallenge ?? null;

  if (Array.isArray(serverState.challengeDeck)) {
    challengeDeck = serverState.challengeDeck;
  }

  // Show who buzzed first on admin
socket.on("buzzed", (teamName) => {
  // Simple visible feedback
  currentChallengeText.textContent =
    `⛔ ${teamName} buzzed først! Vent på svar…`;
});


  const maxId = teams.reduce((m, t) => Math.max(m, t.id || 0), 0);
  nextTeamId = maxId + 1;

  saveStateToLocal();
  renderTeams();
  renderDeck();
  updateCurrentChallengeTextOnly();
});

// -----------------------------
// Initial load
// -----------------------------
loadStateFromLocal();

// If no deck stored yet, make one and push to server once
if (!challengeDeck.length) {
  challengeDeck = makeInitialDeck();
  saveStateToLocal();
  socket.emit("setDeck", challengeDeck);
}

renderTeams();
renderDeck();
updateCurrentChallengeTextOnly();
teamNameInput.focus();


