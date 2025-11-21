const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// -----------------------------
// FILES / STATIC
// -----------------------------

// Create uploads folder if missing
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Multer for image uploads
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
  teams: [], // [{id,name,points}]
  leaderboard: [], // not used yet but kept for future
  currentChallenge: null, // string or object {type, phase, ...}
};

let nextTeamId = 1;

// Helper: broadcast full state
function emitState() {
  io.emit("state", state);
}

// Helper: find team by id or name
function findTeamById(id) {
  return state.teams.find(t => t.id === id);
}
function findTeamByName(name) {
  return state.teams.find(t => t.name.toLowerCase() === name.toLowerCase());
}

// -----------------------------
// SOCKET.IO
// -----------------------------
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Send current state to anyone who connects
  socket.emit("state", state);

  // -----------------------------
  // ADMIN: START NEW GAME
  // -----------------------------
  socket.on("startGame", () => {
    state.gameCode = makeGameCode();
    state.teams = [];
    nextTeamId = 1;
    state.currentChallenge = null;

    console.log("Game started. Code:", state.gameCode);
    emitState();
  });

  // -----------------------------
  // TEAM: JOIN GAME BY CODE + NAME
  // -----------------------------
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

  // -----------------------------
  // BASIC BUZZ (used by Grandprix)
  // -----------------------------
  socket.on("buzz", () => {
    const teamId = socket.teamId;
    const teamName = socket.teamName;

    if (!teamId || !teamName) return;

    const ch = state.currentChallenge;

    // Only handle buzz in Nisse Grandprix listening phase
    if (!ch || (typeof ch === "string")) return;
    if (ch.type !== "Nisse Grandprix") return;
    if (ch.phase !== "listening") return;

    // If team already locked out for this round, ignore
    if (Array.isArray(ch.lockedOut) && ch.lockedOut.includes(teamId)) {
      socket.emit("buzzRejected", { reason: "lockedOut" });
      return;
    }

    // If someone already buzzed first, ignore
    if (ch.firstBuzz) {
      socket.emit("buzzRejected", { reason: "tooLate" });
      return;
    }

    // FIRST BUZZ WINS
    ch.firstBuzz = { teamId, teamName, at: Date.now() };
    ch.phase = "locked";

    console.log("First buzz:", teamName);

    io.emit("buzzed", teamName);  // UI feedback
    emitState();
  });

  // -----------------------------
  // ADMIN: SET CHALLENGE (GENERIC)
  // If your admin already uses updateState,
  // this keeps working.
  // -----------------------------
  socket.on("updateState", (newState) => {
    // Keep gameCode safe if admin forgets to send it
    const safeCode = state.gameCode;

    state = newState || state;
    if (!state.gameCode) state.gameCode = safeCode;

    emitState();
  });

  // -----------------------------
  // ADMIN: START GRANDPRIX (distributed audio)
  // payload: { audioUrl, startDelayMs=2000 }
  // -----------------------------
  socket.on("startGrandprix", ({ audioUrl, startDelayMs } = {}) => {
    if (!audioUrl) return;

    const delay = typeof startDelayMs === "number" ? startDelayMs : 2000;
    const now = Date.now();

    state.currentChallenge = {
      type: "Nisse Grandprix",
      phase: "listening",
      audioUrl,
      startAt: now + delay,     // everyone starts together
      resumeAt: null,          // used after NO
      audioPosition: 0,        // optional, seconds
      firstBuzz: null,
      lockedOut: [],
    };

    console.log("Grandprix started:", audioUrl);
    emitState();
  });

  // -----------------------------
  // ADMIN: GRANDPRIX YES
  // awards point to firstBuzz team and ends challenge
  // -----------------------------
  socket.on("grandprixYes", () => {
    const ch = state.currentChallenge;
    if (!ch || typeof ch === "string") return;
    if (ch.type !== "Nisse Grandprix") return;

    if (ch.firstBuzz?.teamId) {
      const t = findTeamById(ch.firstBuzz.teamId);
      if (t) t.points += 1;
    }

    ch.phase = "ended";
    emitState();
  });

  // -----------------------------
  // ADMIN: GRANDPRIX NO
  // payload: { audioPosition } (seconds) optional
  // locks out that team, resumes listening
  // -----------------------------
  socket.on("grandprixNo", ({ audioPosition } = {}) => {
    const ch = state.currentChallenge;
    if (!ch || typeof ch === "string") return;
    if (ch.type !== "Nisse Grandprix") return;

    if (ch.firstBuzz?.teamId) {
      ch.lockedOut.push(ch.firstBuzz.teamId);
    }

    ch.firstBuzz = null;
    ch.phase = "listening";

    // resume from where audio paused (if admin sends it)
    if (typeof audioPosition === "number") {
      ch.audioPosition = audioPosition;
    }

    // give everyone a tiny buffer before resuming
    ch.resumeAt = Date.now() + 1000;

    emitState();
  });

  // -----------------------------
  // ADMIN: GRANDPRIX INCOMPLETE
  // ends round without points
  // -----------------------------
  socket.on("grandprixIncomplete", () => {
    const ch = state.currentChallenge;
    if (!ch || typeof ch === "string") return;
    if (ch.type !== "Nisse Grandprix") return;

    ch.phase = "ended";
    emitState();
  });

  // -----------------------------
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Root route (optional)
app.get("/", (req, res) => {
  res.send("Xmas Challenge Server Running");
});

// Render-safe PORT binding
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
