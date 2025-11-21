// Connect to the same server that serves this page
import { renderGrandprix } from "./minigames/grandprix.js";
import { renderFiNisse } from "./minigames/finisse.js";
import { renderNisseGaaden } from "./minigames/nissegaaden.js";
import { renderJuleKortet } from "./minigames/julekortet.js";
import { renderNisseUdfordringen } from "./minigames/nisse_udfordringen.js";


const socket = io();

let joined = false;
let joinedCode = null;
let myTeamName = null;

const codeInput = document.getElementById("codeInput");
const codeBtn = document.getElementById("codeBtn");
const nameRow = document.getElementById("nameRow");
const nameInput = document.getElementById("nameInput");
const nameBtn = document.getElementById("nameBtn");
const joinMsg = document.getElementById("joinMsg");

const codeDisplay = document.getElementById("codeDisplay");
const teamListEl = document.getElementById("teamList");

const challengeTitle = document.getElementById("challengeTitle");
const challengeText = document.getElementById("challengeText");

const buzzBtn = document.getElementById("buzzBtn");
const statusEl = document.getElementById("status");

// ---- Step 1: enter code ----
codeBtn.addEventListener("click", tryCode);
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryCode();
});

function tryCode() {
  const code = codeInput.value.trim();
  if (!code) {
    joinMsg.textContent = "Skriv en code først.";
    return;
  }

  joinedCode = code;
  codeDisplay.textContent = code;
  joinMsg.textContent = "Code accepteret. Skriv jeres teamnavn.";

  nameRow.style.display = "flex";
  nameInput.focus();
}

// ---- Step 2: enter team name + joinGame ----
nameBtn.addEventListener("click", tryJoinTeam);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryJoinTeam();
});

function tryJoinTeam() {
  if (!joinedCode) {
    joinMsg.textContent = "Indtast code først.";
    return;
  }

  const teamName = nameInput.value.trim();
  if (!teamName) {
    joinMsg.textContent = "Skriv et teamnavn.";
    return;
  }

  socket.emit("joinGame", { code: joinedCode, teamName }, (res) => {
    if (!res?.ok) {
      joinMsg.textContent = res?.message || "Kunne ikke joine.";
      return;
    }

    joined = true;
    myTeamName = res.team.name;

    joinMsg.textContent = `✅ I er nu med som: ${myTeamName}`;
    document.getElementById("joinSection").style.display = "none";

    buzzBtn.disabled = false;
  });
}

// ---- Receive global state ----
socket.on("state", (serverState) => {
  if (!serverState) return;

  // Show the real game code if server sends it
  if (serverState.gameCode) {
    codeDisplay.textContent = serverState.gameCode;
  }

  renderLeaderboard(serverState.teams || []);
  renderChallenge(serverState.currentChallenge);
});

// ---- Buzz feedback ----
buzzBtn.addEventListener("click", () => {
  if (!joined) return;
  socket.emit("buzz");
});

socket.on("buzzed", (teamName) => {
  statusEl.textContent = `${teamName} buzzed først!`;
});

// ---- Render helpers ----
function renderLeaderboard(teams) {
  // Sort by points desc then name
  const sorted = [...teams].sort((a, b) => {
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    return (a.name || "").localeCompare(b.name || "");
  });

  teamListEl.innerHTML = "";

  sorted.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "team-item";

    const left = document.createElement("span");
    left.textContent = `${i + 1}. ${t.name}`;

    const right = document.createElement("span");
    right.className = "pts";
    right.textContent = t.points ?? 0;

    li.appendChild(left);
    li.appendChild(right);

    teamListEl.appendChild(li);
  });
}

function renderChallenge(challenge) {
  // Default: buzz OFF
  buzzBtn.disabled = true;

  if (!challenge) {
    challengeTitle.textContent = "Ingen udfordring endnu";
    challengeText.textContent = "Vent på læreren…";
    return;
  }

  let type = null;

  if (typeof challenge === "string") {
    type = challenge;
    challengeTitle.textContent = challenge;
    challengeText.textContent = "Se instruktioner på skærmen.";
  } else {
    type = challenge.type || "Ny udfordring!";
    challengeTitle.textContent = type;
    challengeText.textContent = challenge.text || "Se instruktioner på skærmen.";
  }

  // ✅ Only allow buzz in specific challenges
  const buzzAllowedTypes = ["Nisse Grandprix"];
  if (buzzAllowedTypes.includes(type)) {
    buzzBtn.disabled = false;
  }
}



