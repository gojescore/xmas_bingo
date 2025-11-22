// public/team.js (RESTORED event-safe team)

import { renderGrandprix, stopGrandprix } from "./minigames/grandprix.js";

const socket = io();

function el(id) {
  return document.getElementById(id);
}

// DOM
const codeInput = el("codeInput");
const codeBtn = el("codeBtn");
const nameRow = el("nameRow");
const nameInput = el("nameInput");
const nameBtn = el("nameBtn");
const joinMsg = el("joinMsg");
const joinSection = el("joinSection");

const codeDisplay = el("codeDisplay");
const teamListEl = el("teamList");

const challengeTitle = el("challengeTitle");
const challengeText = el("challengeText");

const buzzBtn = el("buzzBtn");
const statusEl = el("status");
const teamNameLabel = el("teamNameLabel");

// Grandprix popup
const gpPopup = el("grandprixPopup");
const gpPopupCountdown = el("grandprixPopupCountdown");

// Typed answer UI
let gpAnswerInput = null;
let gpAnswerBtn = null;

function ensureAnswerUI() {
  if (gpAnswerInput) return;

  const wrap = document.createElement("div");
  wrap.style.cssText =
    "margin-top:12px; display:flex; gap:8px; justify-content:center;";

  gpAnswerInput = document.createElement("input");
  gpAnswerInput.placeholder = "Skriv jeres svar her…";
  gpAnswerInput.style.cssText =
    "font-size:1.1rem; padding:8px; width:260px;";

  gpAnswerBtn = document.createElement("button");
  gpAnswerBtn.textContent = "Send svar";
  gpAnswerBtn.style.cssText =
    "font-size:1.1rem; padding:8px 12px; font-weight:700; cursor:pointer;";

  gpAnswerBtn.onclick = () => {
    const text = (gpAnswerInput.value || "").trim();
    if (!text) return;
    socket.emit("gp-typed-answer", { text });
    gpAnswerInput.value = "";
    statusEl.textContent = "✅ Svar sendt til læreren.";
  };

  wrap.append(gpAnswerInput, gpAnswerBtn);
  buzzBtn.parentElement.appendChild(wrap);
}

// STATE
let joined = false;
let joinedCode = null;
let myTeamName = null;

// Mini-game API
const api = {
  setBuzzEnabled(enabled) {
    buzzBtn.disabled = !enabled;
  },
  showStatus(text) {
    statusEl.textContent = text;
  },
  clearMiniGame() {
    statusEl.textContent = "";
    buzzBtn.disabled = true;
    if (gpAnswerInput) gpAnswerInput.disabled = true;
    if (gpAnswerBtn) gpAnswerBtn.disabled = true;
  }
};

// ---- Join step 1 ----
codeBtn.addEventListener("click", tryCode);
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryCode();
});

function tryCode() {
  const code = codeInput.value.trim();
  if (!code) {
    joinMsg.textContent = "Skriv en kode først.";
    return;
  }

  joinedCode = code;
  codeDisplay.textContent = code;
  joinMsg.textContent = "Kode accepteret. Skriv jeres teamnavn.";

  nameRow.style.display = "flex";
  nameInput.focus();
}

// ---- Join step 2 ----
nameBtn.addEventListener("click", tryJoin);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryJoin();
});

function tryJoin() {
  const name = nameInput.value.trim();
  if (!name) {
    joinMsg.textContent = "Skriv et teamnavn.";
    return;
  }

  socket.emit("joinGame", { code: joinedCode, teamName: name }, (res) => {
    if (!res?.ok) {
      joinMsg.textContent = res?.message || "Kunne ikke joine.";
      return;
    }

    joined = true;
    myTeamName = res.team.name;
    teamNameLabel.textContent = myTeamName;

    joinSection.style.display = "none";
    ensureAnswerUI();
    api.clearMiniGame();
  });
}

// ---- Buzz ----
buzzBtn.addEventListener("click", () => {
  if (!joined) return;

  let audioPosition = null;
  if (window.__grandprixAudio) {
    audioPosition = window.__grandprixAudio.currentTime;
  }

  socket.emit("buzz", { audioPosition });
});

// stop audio forced
socket.on("gp-stop-audio-now", () => {
  stopGrandprix();
  api.clearMiniGame();
  if (gpPopup) gpPopup.style.display = "none";
});

// leaderboard
function renderLeaderboard(teams) {
  const sorted = [...teams].sort((a, b) => {
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    return (a.name || "").localeCompare(b.name || "");
  });

  teamListEl.innerHTML = "";
  sorted.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "team-item";
    li.innerHTML = `
      <span>${i + 1}. ${t.name}</span>
      <span class="pts">${t.points ?? 0}</span>
    `;
    teamListEl.appendChild(li);
  });
}

// --- GP popup countdown ---
let gpPopupTimer = null;

function showGrandprixPopup(startAtMs, seconds) {
  if (!gpPopup || !gpPopupCountdown) return;
  if (gpPopupTimer) clearInterval(gpPopupTimer);

  gpPopup.style.display = "flex";

  const tick = () => {
    const elapsed = Math.floor((Date.now() - startAtMs) / 1000);
    const left = Math.max(0, seconds - elapsed);
    gpPopupCountdown.textContent = left;

    if (left <= 0) {
      clearInterval(gpPopupTimer);
      setTimeout(() => (gpPopup.style.display = "none"), 400);
    }
  };

  tick();
  gpPopupTimer = setInterval(tick, 100);
}

// challenge render
function renderChallenge(ch) {
  buzzBtn.disabled = true;

  if (!ch) {
    stopGrandprix();
    challengeTitle.textContent = "Ingen udfordring endnu";
    challengeText.textContent = "Vent på læreren…";
    api.clearMiniGame();
    return;
  }

  challengeTitle.textContent = ch.type || "Udfordring";
  challengeText.textContent = ch.text || "";

  if (ch.type === "Nisse Grandprix") {
    renderGrandprix(ch, api);
    return;
  }

  stopGrandprix();
  api.clearMiniGame();
}

// state
socket.on("state", (s) => {
  if (!s) return;

  if (s.gameCode) codeDisplay.textContent = s.gameCode;
  renderLeaderboard(s.teams || []);
  renderChallenge(s.currentChallenge);

  const ch = s.currentChallenge;
  const isLockedGP =
    ch &&
    ch.type === "Nisse Grandprix" &&
    ch.phase === "locked";

  const iAmBuzzedFirst =
    joined &&
    isLockedGP &&
    ch.firstBuzz &&
    ch.firstBuzz.teamName === myTeamName;

  if (gpAnswerInput && gpAnswerBtn) {
    gpAnswerInput.disabled = !iAmBuzzedFirst;
    gpAnswerBtn.disabled = !iAmBuzzedFirst;
  }

  if (iAmBuzzedFirst && ch.countdownStartAt) {
    showGrandprixPopup(ch.countdownStartAt, ch.countdownSeconds || 5);
  } else {
    if (gpPopup) gpPopup.style.display = "none";
  }
});
