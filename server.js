// server.js (FULL) — v31 hardened for Grandprix + NisseGåden + JuleKortet

const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Create uploads folder if missing
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// -----------------------------
// Games by code
// -----------------------------
const games = {}; // { [code]: { teams, deck, currentChallenge, gameCode } }

function getEmptyState(code) {
  return {
    teams: [],
    deck: [],
    currentChallenge: null,
    gameCode: code || null,
  };
}

// Multer for image uploads
const upload = multer({ dest: "./uploads/" });

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ filename: req.file.filename });
});

// -----------------------------
// SOCKET.IO
// -----------------------------
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // helper to get socket's game
  function getGame() {
    if (!socket.gameCode) return null;
    return games[socket.gameCode] || null;
  }

  // Send empty/default state on connect
  socket.emit("state", getEmptyState(null));

  // -----------------------------
  // JOIN GAME (teams)
  // -----------------------------
  socket.on("joinGame", ({ code, teamName }, cb) => {
    code = String(code || "").trim();
    teamName = String(teamName || "").trim();

    if (!code || !teamName) {
      cb?.({ ok: false, message: "Manglende kode eller navn." });
      return;
    }

    if (!games[code]) {
      cb?.({ ok: false, message: "Forkert kode" });
      return;
    }

    const state = games[code];

    // Unique name check
    const exists = state.teams.some(
      (t) => (t.name || "").toLowerCase() === teamName.toLowerCase()
    );
    if (exists) {
      cb?.({ ok: false, message: "Holdnavn findes allerede." });
      return;
    }

    // Add team to state
    const team = {
      id: "t" + Date.now() + Math.random(),
      name: teamName,
      points: 0,
    };
    state.teams.push(team);

    // Attach to socket
    socket.gameCode = code;
    socket.team = teamName;

    // Join room for this game
    socket.join(code);

    console.log("Team joined:", teamName, "in game", code);

    // Notify everyone in game
    io.to(code).emit("state", state);

    cb?.({ ok: true, team });
  });

  // -----------------------------
  // ADMIN updates whole state
  // -----------------------------
  socket.on("updateState", (newState) => {
    const code = String(newState?.gameCode || "").trim();
    if (!code) return;

    if (!games[code]) games[code] = getEmptyState(code);

    games[code] = {
      ...games[code],
      ...newState,
      gameCode: code,
    };

    socket.gameCode = code;
    socket.join(code);

    io.to(code).emit("state", games[code]);
  });

  // -----------------------------
  // BUZZ (Grandprix)
  // -----------------------------
  socket.on("buzz", () => {
    const state = getGame();
    if (!state) return;

    io.to(socket.gameCode).emit("buzzed", socket.team);
  });

  // -----------------------------
  // TYPED ANSWER (Grandprix)
  // -----------------------------
  socket.on("gp-typed-answer", (payload) => {
    const state = getGame();
    if (!state) return;

    const teamName = payload?.teamName || socket.team;
    const text = payload?.text;

    if (!teamName || typeof text !== "string") return;

    io.to(socket.gameCode).emit("gp-typed-answer", { teamName, text });
  });

  // -----------------------------
  // STOP GP AUDIO everywhere
  // -----------------------------
  socket.on("gp-stop-audio-now", () => {
    const state = getGame();
    if (!state) return;

    io.to(socket.gameCode).emit("gp-stop-audio-now");
  });

  // -----------------------------
  // SUBMIT CARD (NisseGåden / JuleKortet)
  // Accepts string OR {teamName,text}
  // -----------------------------
  socket.on("submitCard", (payload) => {
    const state = getGame();
    if (!state) return;

    let teamName = socket.team;
    let text = "";

    if (typeof payload === "string") {
      text = payload;
    } else if (payload && typeof payload === "object") {
      teamName = payload.teamName || payload.team || socket.team;
      text = payload.text || "";
    }

    text = String(text).trim();
    if (!text) return;

    io.to(socket.gameCode).emit("newCard", { teamName, text });
  });

  // -----------------------------
  // SUBMIT PHOTO (unused now)
  // -----------------------------
  socket.on("submitPhoto", (file) => {
    const state = getGame();
    if (!state) return;

    io.to(socket.gameCode).emit("newPhoto", {
      teamName: socket.team,
      file,
    });
  });

  // -----------------------------
  // VOTE (FiNisse / JuleKortet)
  // -----------------------------
  socket.on("vote", (index) => {
    const state = getGame();
    if (!state) return;

    io.to(socket.gameCode).emit("voteUpdate", {
      voter: socket.team,
      index,
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Basic root response
app.get("/", (req, res) => {
  res.send("Xmas Challenge Server Running");
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
