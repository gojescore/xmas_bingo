// public/main.js v30
// FULL admin controller with stable Grandprix + NisseGåden + JuleKortet.
// Requires: team.js v30, minigames/grandprix.js v2, julekortet.js v3

const socket = io();

// ---------------- DOM ----------------
const startGameBtn = document.getElementById("startGameBtn");
const resetBtn = document.getElementById("resetBtn");
const gameCodeValueEl = document.getElementById("gameCodeValue");

const teamNameInput = document.getElementById("teamNameInput");
const addTeamBtn = document.getElementById("addTeamBtn");
const teamListEl = document.getElementById("teamList");

const currentChallengeText = document.getElementById("currentChallengeText");
const yesBtn = document.getElementById("yesBtn");
const noBtn = document.getElementById("noBtn");
const incompleteBtn = document.getElementById("incompleteBtn");
const endGameBtn = document.getElementById("endGameBtn");
const endGameResultEl = document.getElementById("endGameResult");

const challengeGridEl = document.querySelector(".challenge-grid");
const miniGameArea = document.getElementById("miniGameArea");

// ---------------- STATE ----------------
let teams = [];
let selectedTeamId = null;

let deck = [];
let currentChallenge = null;
let gameCode = null;

const STORAGE_KEY = "xmasChallenge_admin_v30";

// ---------------- Persistence ----------------
function saveLocal() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ teams, deck, currentChallenge, gameCode })
    );
  } catch {}
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.teams)) teams = s.teams;
    if (Array.isArray(s.deck)) deck = s.deck;
    currentChallenge = s.currentChallenge || null;
    gameCode = s.gameCode || null;
  } catch {}
}

// ---------------- Sync ----------------
function syncToServer() {
  socket.emit("updateState", {
    teams,
    deck,
    currentChallenge,
    gameCode
  });
}

// ---------------- Utilities ----------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- Deck load ----------------
async function loadDeckSafely() {
  let gp = [];
  let ng = [];
  let jk = [];

  try {
    const m = await import("./data/deck/grandprix.js?v=" + Date.now());
    gp = m.grandprixDeck || m.deck || [];
  } catch {}

  try {
    const m = await import("./data/deck/nissegaaden.js?v=" + Date.now());
    ng = m.nisseGaaden || m.nisseGaadenDeck || m.deck || [];
  } catch {}

  try {
    const m = await import("./data/deck/julekortet.js?v=" + Date.now());
    jk = m.juleKortetDeck || m.deck || [];
  } catch {}

  deck = [...gp, ...ng, ...jk].map(c => ({ ...c, used: !!c.used }));

  renderDeck();
  renderCurrentChallenge();
  renderMiniGameArea();
  saveLocal();
  syncToServer();
}

// ---------------- Render deck ----------------
function renderDeck() {
  if (!challengeGridEl) return;
  challengeGridEl.innerHTML = "";

  if (!deck.length) {
    const p = document.createElement("p");
    p.textContent = "⚠️ Ingen udfordringer fundet (deck tom).";
    p.style.fontWeight = "900";
    p.style.color = "crimson";
    challengeGridEl.appendChild(p);
    return;
  }

  deck.forEach(card => {
    const btn = document.createElement("button");
    btn.className = "challenge-card";
    btn.textContent = card.title || card.type;

    if (card.used) {
      btn.style.opacity = "0.45";
      btn.style.textDecoration = "line-through";
    }

    btn.onclick = () => {
      if (card.used) return alert("Denne udfordring er allerede brugt.");
      card.used = true;

      if (card.type === "Nisse Grandprix") {
        currentChallenge = {
          ...card,
          phase: "listening",
          startAt: Date.now() + 3000,
          firstBuzz: null,                 // { teamName }
          countdownSeconds: 20,
          countdownStartAt: null,
          typedAnswer: null,               // { teamName, text }
          answeredTeams: {}                // lock who already answered (safety)
        };
      } 
      else if (card.type === "JuleKortet") {
        currentChallenge = {
          ...card,
          phase: "writing",
          writingSeconds: 120,
          writingStartAt: Date.now(),
          cards: [],                       // [{ teamName, text }]
          votingCards: [],                 // anonymized shuffled
          votes: {},                       // { voterTeamName: votingIndex }
          winners: []
        };
        startAdminWritingTimer();
      } 
      else if (card.type === "NisseGåden") {
        currentChallenge = { ...card, answers: [] };
      } 
      else {
        currentChallenge = { ...card };
      }

      selectedTeamId = null;
      endGameResultEl.textContent = "";

      renderDeck();
      renderCurrentChallenge();
      renderMiniGameArea();
      saveLocal();
      syncToServer();
    };

    challengeGridEl.appendChild(btn);
  });
}

// ---------------- Leaderboard ----------------
function renderTeams() {
  const sorted = [...teams].sort((a,b) => {
    if ((b.points ?? 0) !== (a.points ?? 0))
      return (b.points ?? 0) - (a.points ?? 0);
    return (a.name || "").localeCompare(b.name || "");
  });

  teamListEl.innerHTML = "";

  sorted.forEach(team => {
    const li = document.createElement("li");
    li.className =
      "team-item" + (team.id === selectedTeamId ? " selected" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "team-name";
    nameSpan.textContent = team.name;

    const pointsDiv = document.createElement("div");
    pointsDiv.className = "team-points";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.onclick = (e) => {
      e.stopPropagation();
      team.points = Math.max(0, (team.points ?? 0) - 1);
      saveLocal(); renderTeams(); syncToServer();
    };

    const val = document.createElement("span");
    val.textContent = team.points ?? 0;

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = (e) => {
      e.stopPropagation();
      team.points = (team.points ?? 0) + 1;
      saveLocal(); renderTeams(); syncToServer();
    };

    pointsDiv.append(minus, val, plus);
    li.append(nameSpan, pointsDiv);

    li.onclick = () => {
      selectedTeamId = team.id;
      renderTeams();
    };

    teamListEl.appendChild(li);
  });
}

// ---------------- Current challenge text ----------------
function renderCurrentChallenge() {
  currentChallengeText.textContent = currentChallenge
    ? `Aktuel udfordring: ${currentChallenge.title || currentChallenge.type}`
    : "Ingen udfordring valgt endnu.";
}

// ---------------- Admin minigame area ----------------
let jkAdminTimer = null;
let gpAdminTimer = null;

function renderMiniGameArea() {
  if (!miniGameArea) return;
  miniGameArea.innerHTML = "";
  if (!currentChallenge) return;

  // ---------- GRANDPRIX ADMIN ----------
  if (currentChallenge.type === "Nisse Grandprix") {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "margin-top:10px; padding:10px; border:1px dashed #ccc; border-radius:10px;";

    wrap.innerHTML = `
      <h3>Nisse Grandprix</h3>
      <p><strong>Fase:</strong> ${currentChallenge.phase}</p>
      <p><strong>Buzzed først:</strong> ${currentChallenge.firstBuzz?.teamName || "—"}</p>
      <p><strong>Svar fra:</strong> ${currentChallenge.typedAnswer?.teamName || "—"}</p>
      <p><strong>Tekst:</strong> ${currentChallenge.typedAnswer?.text || "—"}</p>
      <p><strong>Nedtælling:</strong> <span id="gpAdminCountdown">—</span></p>
    `;
    miniGameArea.appendChild(wrap);
    startAdminGpCountdownIfLocked();
    return;
  }

  // ---------- NISSEGÅDEN ADMIN ----------
  if (currentChallenge.type === "NisseGåden") {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "margin-top:10px; padding:10px; border:1px dashed #ccc; border-radius:10px;";

    wrap.innerHTML = `<h3>NisseGåden – svar</h3>`;
    const answers = currentChallenge.answers || [];

    if (!answers.length) {
      const p = document.createElement("p");
      p.textContent = "Ingen svar endnu…";
      wrap.appendChild(p);
    } else {
      answers.forEach(a => {
        const box = document.createElement("div");
        box.style.cssText =
          "padding:8px; border:1px solid #ddd; border-radius:8px; margin-bottom:6px; background:#fff;";
        box.innerHTML = `
          <div><strong>${a.teamName}</strong>:</div>
          <div>${a.text}</div>
        `;
        wrap.appendChild(box);
      });
    }

    miniGameArea.appendChild(wrap);
    return;
  }

  // ---------- JULEKORTET ADMIN ----------
  if (currentChallenge.type === "JuleKortet") {
    const ch = currentChallenge;

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "margin-top:10px; padding:10px; border:1px dashed #ccc; border-radius:10px;";

    wrap.innerHTML = `<h3>JuleKortet – fase: ${ch.phase}</h3>`;

    if (ch.phase === "writing") {
      const p = document.createElement("p");
      p.id = "jkAdminCountdown";
      p.style.fontWeight = "900";
      wrap.appendChild(p);

      const sent = ch.cards?.length || 0;
      const total = teams.length;
      const stat = document.createElement("p");
      stat.textContent = `Modtaget: ${sent}/${total} julekort`;
      stat.style.fontWeight = "800";
      wrap.appendChild(stat);

      const forceBtn = document.createElement("button");
      forceBtn.textContent = "Afslut og stem nu";
      forceBtn.className = "challenge-card";
      forceBtn.onclick = startVotingPhase;
      wrap.appendChild(forceBtn);
    }

    if (ch.phase === "voting") {
      const cards = ch.votingCards || [];
      const votes = tallyVotes(ch.votes || {}, cards.length);

      cards.forEach((c, i) => {
        const box = document.createElement("div");
        box.style.cssText =
          "padding:10px; background:#fff; border:1px solid #ddd; border-radius:8px; margin-bottom:6px;";
        box.innerHTML = `
          <div style="font-weight:800;">Kort #${i + 1}</div>
          <div style="white-space:pre-wrap; margin:6px 0;">${c.text}</div>
          <div style="font-weight:900;">Stemmer: ${votes[i] || 0}</div>
        `;
        wrap.appendChild(box);
      });

      const finishBtn = document.createElement("button");
      finishBtn.textContent = "Luk afstemning og giv point";
      finishBtn.className = "challenge-card";
      finishBtn.onclick = finishVotingAndAward;
      wrap.appendChild(finishBtn);
    }

    if (ch.phase === "ended") {
      const winners = ch.winners || [];
      const p = document.createElement("p");
      p.style.fontWeight = "900";
      p.textContent = winners.length
        ? `Vindere: ${winners.join(", ")}`
        : "Ingen vinder fundet.";
      wrap.appendChild(p);
    }

    miniGameArea.appendChild(wrap);
  }
}

// ---------------- JuleKortet helpers ----------------
function startAdminWritingTimer() {
  clearInterval(jkAdminTimer);
  jkAdminTimer = setInterval(() => {
    if (!currentChallenge || currentChallenge.type !== "JuleKortet") {
      clearInterval(jkAdminTimer);
      return;
    }

    const left = getWritingLeftSeconds(currentChallenge);
    const elc = document.getElementById("jkAdminCountdown");
    if (elc) elc.textContent = `Tid tilbage til skrivning: ${left}s`;

    // Auto-switch if time runs out
    if (left <= 0) {
      clearInterval(jkAdminTimer);
      startVotingPhase();
    }

    // Auto-switch if everybody sent
    if (currentChallenge.cards.length >= teams.length && teams.length > 0) {
      clearInterval(jkAdminTimer);
      startVotingPhase();
    }
  }, 300);
}

function getWritingLeftSeconds(ch) {
  const elapsed = Math.floor((Date.now() - ch.writingStartAt) / 1000);
  return Math.max(0, (ch.writingSeconds || 120) - elapsed);
}

function startVotingPhase() {
  if (!currentChallenge || currentChallenge.type !== "JuleKortet") return;
  if (currentChallenge.phase !== "writing") return;

  // anonymize + shuffle for voting
  const votingCards = shuffle(
    currentChallenge.cards.map(c => ({
      text: c.text,
      ownerTeamName: c.teamName  // hidden in UI, used for self-vote block + awarding
    }))
  );

  currentChallenge.phase = "voting";
  currentChallenge.votingCards = votingCards;
  currentChallenge.votes = {};
  currentChallenge.winners = [];

  renderMiniGameArea();
  saveLocal();
  syncToServer();
}

function tallyVotes(votesObj, cardsLen) {
  const counts = Array(cardsLen).fill(0);
  Object.values(votesObj).forEach(idx => {
    if (typeof idx === "number" && idx >= 0 && idx < cardsLen) counts[idx]++;
  });
  return counts;
}

function finishVotingAndAward() {
  const ch = currentChallenge;
  const cards = ch.votingCards || [];
  if (!cards.length) return alert("Ingen kort til afstemning.");

  const counts = tallyVotes(ch.votes || {}, cards.length);
  const max = Math.max(...counts);

  const winningIndexes = counts
    .map((c, i) => ({ i, c }))
    .filter(x => x.c === max)
    .map(x => x.i);

  const winners = winningIndexes.map(i => cards[i].ownerTeamName);

  // Award points directly, ties give all winners +1
  winners.forEach(name => {
    const t = teams.find(x => x.name === name);
    if (t) t.points = (t.points ?? 0) + 1;
  });

  ch.phase = "ended";
  ch.winners = winners;

  alert(
    winners.length === 1
      ? `Vinder: ${winners[0]} (+1 point)`
      : `Uafgjort mellem: ${winners.join(", ")} (alle får +1 point)`
  );

  renderTeams();
  renderMiniGameArea();
  saveLocal();
  syncToServer();
}

// ---------------- Grandprix countdown on admin ----------------
function startAdminGpCountdownIfLocked() {
  clearInterval(gpAdminTimer);
  if (!currentChallenge || currentChallenge.type !== "Nisse Grandprix") return;
  if (currentChallenge.phase !== "locked") return;
  if (!currentChallenge.countdownStartAt) return;

  gpAdminTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - currentChallenge.countdownStartAt) / 1000);
    const left = Math.max(0, (currentChallenge.countdownSeconds || 20) - elapsed);
    const elc = document.getElementById("gpAdminCountdown");
    if (elc) elc.textContent = left;
    if (left <= 0) clearInterval(gpAdminTimer);
  }, 200);
}

// ---------------- Stop GP audio everywhere ----------------
function stopGpAudioEverywhere() {
  socket.emit("gp-stop-audio-now");
  if (currentChallenge?.type === "Nisse Grandprix") {
    currentChallenge.phase = "ended";
  }
}

// ---------------- Decision buttons ----------------
yesBtn.onclick = () => {
  if (!currentChallenge) return alert("Vælg en udfordring først.");
  if (!selectedTeamId) return alert("Vælg vinderholdet.");

  stopGpAudioEverywhere();

  const t = teams.find(x => x.id === selectedTeamId);
  if (t) t.points = (t.points ?? 0) + 1;

  selectedTeamId = null;

  renderTeams();
  renderCurrentChallenge();
  renderMiniGameArea();
  saveLocal();
  syncToServer();
};

noBtn.onclick = () => {
  if (!currentChallenge) return alert("Vælg en udfordring først.");
  stopGpAudioEverywhere();
  renderMiniGameArea();
  saveLocal();
  syncToServer();
};

incompleteBtn.onclick = () => {
  if (!currentChallenge) return alert("Vælg en udfordring først.");
  stopGpAudioEverywhere();
  renderMiniGameArea();
  saveLocal();
  syncToServer();
};

// ---------------- Reset ----------------
resetBtn.onclick = () => {
  if (!confirm("Nulstil hele spillet?")) return;

  stopGpAudioEverywhere();

  teams = [];
  selectedTeamId = null;
  currentChallenge = null;
  deck.forEach(c => c.used = false);
  endGameResultEl.textContent = "";

  renderTeams();
  renderDeck();
  renderCurrentChallenge();
  renderMiniGameArea();

  saveLocal();
  syncToServer();
};

// ---------------- End game ----------------
endGameBtn.onclick = () => {
  if (!teams.length) return alert("Ingen hold endnu.");

  stopGpAudioEverywhere();

  const sorted = [...teams].sort((a,b)=>(b.points??0)-(a.points??0));
  const top = sorted[0];

  endGameResultEl.textContent =
    `Vinderen er: ${top.name} med ${top.points ?? 0} point! 🎉`;

  saveLocal();
  syncToServer();
};

// ---------------- Start game ----------------
startGameBtn.onclick = () => {
  gameCode = String(Math.floor(1000 + Math.random() * 9000));
  gameCodeValueEl.textContent = gameCode;
  saveLocal();
  syncToServer();
};

// ---------------- Add team manually ----------------
addTeamBtn.onclick = () => {
  const name = teamNameInput.value.trim();
  if (!name) return;

  if (teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    alert("Navnet findes allerede.");
    return;
  }

  teams.push({ id: "t" + Date.now() + Math.random(), name, points: 0 });
  teamNameInput.value = "";
  renderTeams();
  saveLocal();
  syncToServer();
};

// ---------------- SOCKET LISTENERS ----------------

// Server emits buzzed(teamName)
socket.on("buzzed", (teamName) => {
  if (!currentChallenge || currentChallenge.type !== "Nisse Grandprix") return;
  if (currentChallenge.phase !== "listening") return;
  if (currentChallenge.firstBuzz) return;

  currentChallenge.phase = "locked";
  currentChallenge.firstBuzz = { teamName };
  currentChallenge.countdownStartAt = Date.now();
  currentChallenge.typedAnswer = null;

  const t = teams.find(x => x.name === teamName);
  if (t) selectedTeamId = t.id;

  renderTeams();
  renderMiniGameArea();
  saveLocal();
  syncToServer();
});

// Cards from teams
socket.on("newCard", ({ team, text }) => {
  if (!currentChallenge) return;

  if (currentChallenge.type === "NisseGåden") {
    currentChallenge.answers.push({ teamName: team, text });
  }

  if (currentChallenge.type === "JuleKortet" && currentChallenge.phase === "writing") {
    // one card per team
    const already = currentChallenge.cards.some(c => c.teamName === team);
    if (!already) currentChallenge.cards.push({ teamName: team, text });
  }

  renderMiniGameArea();
  saveLocal();
  syncToServer();
});

// Votes from teams
socket.on("voteUpdate", ({ voter, index }) => {
  if (!currentChallenge || currentChallenge.type !== "JuleKortet") return;
  if (currentChallenge.phase !== "voting") return;

  currentChallenge.votes[voter] = index;

  renderMiniGameArea();
  saveLocal();
  syncToServer();
});

// Typed GP answer from buzzing team
socket.on("gp-typed-answer", ({ teamName, text }) => {
  if (!currentChallenge || currentChallenge.type !== "Nisse Grandprix") return;

  // lock ONE answer per team per round
  if (currentChallenge.answeredTeams[teamName]) return;
  currentChallenge.answeredTeams[teamName] = true;

  currentChallenge.typedAnswer = { teamName, text };

  renderMiniGameArea();
  saveLocal();
  syncToServer();
});

// Server state is truth
socket.on("state", (s) => {
  if (!s) return;

  if (Array.isArray(s.teams)) teams = s.teams;
  if (Array.isArray(s.deck)) deck = s.deck;
  currentChallenge = s.currentChallenge || currentChallenge;
  gameCode = s.gameCode || gameCode;

  if (gameCodeValueEl && gameCode) gameCodeValueEl.textContent = gameCode;

  renderTeams();
  renderDeck();
  renderCurrentChallenge();
  renderMiniGameArea();

  saveLocal();
});

// ---------------- INIT ----------------
loadLocal();
renderTeams();
renderDeck();
renderCurrentChallenge();
renderMiniGameArea();
loadDeckSafely();
if (gameCodeValueEl && gameCode) gameCodeValueEl.textContent = gameCode;
