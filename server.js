const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// -----------------------------
// STATIC / UPLOADS
// -----------------------------
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

const upload = multer({ dest: "./uploads/" });

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ filename: req.file.filename });
});

// -----------------------------
// GAME STATE
// -----------------------------
function makeGameCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

let state = {
  gameCode: null,
  teams: [],
  leaderboard: [],
  // NEW: deck of cards
  challengeDeck: [],
  // current challenge can be string or object
  currentChallenge: null,
  currentChallengeId: null, // NEW: tracks which deck card is active
};

let nextTeamId = 1;

function emitState() {
  io.emit("state", state);
}

function findTeamById(id) {
  return state.teams.find(t => t.id === id);
}

function findTeamByName(name) {
  return state.teams.find(t => t.name.toLowerCase() === name.toLowerCase());
}

function findDeckItemById(id) {
  return state.challengeDeck.find(c => c.id === id);
}

function markDeckUsed(id) {
  const item = findDeckItemById(id);
  if (item) item.used = true;
}

// Helper: start Grandprix from a deck item
function startGrandprixFromDeck(item) {
  const delay = 2000;
  const now = Date.now();

  state.currentChallenge = {
    id: item.id,
    type: "Nisse Grandprix",
    phase: "listening",
    audioUrl: item.audioUrl,
    startAt: now + delay,
    resumeAt: null,
    audioPosition: 0,
    firstBuzz: null,
    lockedOut: [],
  };
  state.currentChallengeId = item.id;
}

// -----------------------------
// SOCKET.IO
// -----------------------------
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.emit("state", state);

  // ADMIN: start new game -> create code, reset teams + deck used flags
  socket.on("startGame", () => {
    state.gameCode = makeGameCode();
    state.teams = [];
    nextTeamId = 1;
    state.currentChallenge = null;
    state.currentChallengeId = null;

    // reset deck used flags
    state.challengeDeck = state.challengeDeck.map(c => ({ ...c, used: false }));

    console.log("Game started. Code:", state.gameCode);
    emitState();
  });

  // TEAM: join by code + unique name
  socket.on("joinGame", ({ code, teamName }, ack) => {
    try {
      const cleanCode = (code || "").trim();
      const cleanName = (teamName || "").trim();

      if (!state.gameCode) {
        return ack?.({ ok: false, message: "Spillet er ikke startet endnu." });
      }
      if (cleanCode !== state.gameCode) {
        return ack?.({ ok: false, message: "Forkert game code." });
      }
      if (!cleanName) {
        return ack?.({ ok: false, message: "Teamnavn mangler." });
      }
      if (findTeamByName(cleanName)) {
        return ack?.({ ok: false, message: "Teamnavnet er allerede taget." });
      }

      const newTeam = {
        id: nextTeamId++,
        name: cleanName,
        points: 0,
      };

      state.teams.push(newTeam);

      socket.teamId = newTeam.id;
      socket.teamName = newTeam.name;

      console.log("Team joined:", newTeam.name);
      emitState();

      return ack?.({ ok: true, team: newTeam });
    } catch (err) {
      console.error("joinGame error", err);
      return ack?.({ ok: false, message: "Serverfejl ved join." });
    }
  });

  // ADMIN: send whole deck to server (initial or updates)
  socket.on("setDeck", (deck) => {
    if (!Array.isArray(deck)) return;
    state.challengeDeck = deck;
    emitState();
  });

  // ADMIN: start a deck challenge by id
  socket.on("startChallenge", (challengeId) => {
    const id = Number(challengeId);
    const item = findDeckItemById(id);
    if (!item || item.used) return;

    if (item.type === "Nisse Grandprix") {
      if (!item.audioUrl) return;
      startGrandprixFromDeck(item);
      emitState();
      return;
    }

    // Normal challenges: just broadcast the item as current challenge
    state.currentChallenge = {
      id: item.id,
      type: item.type,
      title: item.title || item.type,
      text: item.text || "",
      imageUrl: item.imageUrl || null,
    };
    state.currentChallengeId = item.id;

    emitState();
  });

  // BASIC buzz for Grandprix
  socket.on("buzz", () => {
    const teamId = socket.teamId;
    const teamName = socket.teamName;
    if (!teamId || !teamName) return;

    const ch = state.currentChallenge;
    if (!ch || typeof ch !== "object") return;
    if (ch.type !== "Nisse Grandprix") return;
    if (ch.phase !== "listening") return;

    if (Array.isArray(ch.lockedOut) && ch.lockedOut.includes(teamId)) {
      socket.emit("buzzRejected", { reason: "lockedOut" });
      return;
    }

    if (ch.firstBuzz) {
      socket.emit("buzzRejected", { reason: "tooLate" });
      return;
    }

    ch.firstBuzz = { teamId, teamName, at: Date.now() };
    ch.phase = "locked";

    io.emit("buzzed", teamName);
    emitState();
  });

  // ADMIN: generic state update (kept for future)
  socket.on("updateState", (newState) => {
    const safeCode = state.gameCode;
    const safeDeck = state.challengeDeck;

    state = newState || state;

    if (!state.gameCode) state.gameCode = safeCode;
    if (!Array.isArray(state.challengeDeck)) state.challengeDeck = safeDeck;

    emitState();
  });

  // GRANDPRIX YES -> award + end + mark deck used
  socket.on("grandprixYes", () => {
    const ch = state.currentChallenge;
    if (!ch || typeof ch !== "object") return;
    if (ch.type !== "Nisse Grandprix") return;

    if (ch.firstBuzz?.teamId) {
      const t = findTeamById(ch.firstBuzz.teamId);
      if (t) t.points += 1;
    }

    ch.phase = "ended";
    if (state.currentChallengeId != null) {
      markDeckUsed(state.currentChallengeId);
    }
    emitState();
  });

  // GRANDPRIX NO -> lock out buzzer team + resume
  socket.on("grandprixNo", ({ audioPosition } = {}) => {
    const ch = state.currentChallenge;
    if (!ch || typeof ch !== "object") return;
    if (ch.type !== "Nisse Grandprix") return;

    if (ch.firstBuzz?.teamId) {
      ch.lockedOut.push(ch.firstBuzz.teamId);
    }

    ch.firstBuzz = null;
    ch.phase = "listening";

    if (typeof audioPosition === "number") {
      ch.audioPosition = audioPosition;
    }

    ch.resumeAt = Date.now() + 1000;
    emitState();
  });

  // GRANDPRIX INCOMPLETE -> end without points + mark used
  socket.on("grandprixIncomplete", () => {
    const ch = state.currentChallenge;
    if (!ch || typeof ch !== "object") return;
    if (ch.type !== "Nisse Grandprix") return;

    ch.phase = "ended";
    if (state.currentChallengeId != null) {
      markDeckUsed(state.currentChallengeId);
    }
    emitState();
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Root route
app.get("/", (req, res) => {
  res.send("Xmas Challenge Server Running");
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
