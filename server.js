// server.js v34 (stable gameCode + joinGame)
// Keeps your existing minigame events intact.

const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const multer = require("multer");
const fs = require("fs");

// --------------------
// Static + uploads
// --------------------
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

const upload = multer({ dest: "./uploads/" });
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ filename: req.file.filename });
});

// --------------------
// Global state
// --------------------
let state = {
  gameCode: null,
  teams: [],
  deck: [],
  currentChallenge: null,
};

// helper
const normalize = (s) => (s || "").trim().toLowerCase();
const makeCode = () => String(Math.floor(1000 + Math.random() * 9000));

// --------------------
// Socket.io
// --------------------
io.on("connection", (socket) => {
  console.log("New client:", socket.id);

  // Always send current state on connect
  socket.emit("state", state);

  // ADMIN syncs full state
  socket.on("updateState", (incoming) => {
    if (!incoming || typeof incoming !== "object") return;

    // ✅ Guard: never wipe gameCode unless admin sends a real one
    if (incoming.gameCode !== undefined && incoming.gameCode !== null && incoming.gameCode !== "") {
      state.gameCode = String(incoming.gameCode);
    }

    // Accept teams if provided
    if (Array.isArray(incoming.teams)) {
      state.teams = incoming.teams;
    }

    // Accept deck if provided and not empty
    if (Array.isArray(incoming.deck) && incoming.deck.length > 0) {
      state.deck = incoming.deck;
    }

    // Accept currentChallenge (can be null)
    if (incoming.currentChallenge !== undefined) {
      state.currentChallenge = incoming.currentChallenge;
    }

    io.emit("state", state);
  });

  // Optional explicit start (admin can use or ignore)
  socket.on("startGame", (ack) => {
    state.gameCode = makeCode();
    state.teams = [];
    state.currentChallenge = null;
    io.emit("state", state);
    if (typeof ack === "function") ack({ ok: true, gameCode: state.gameCode });
  });

  // TEAMS join by code + name
  socket.on("joinGame", ({ code, teamName }, ack) => {
    const c = String(code || "").trim();
    const n = String(teamName || "").trim();

    if (!state.gameCode || c !== state.gameCode) {
      if (typeof ack === "function") ack({ ok: false, message: "Forkert kode" });
      return;
    }

    if (!n) {
      if (typeof ack === "function") ack({ ok: false, message: "Skriv et teamnavn" });
      return;
    }

    if (state.teams.some(t => normalize(t.name) === normalize(n))) {
      if (typeof ack === "function") ack({ ok: false, message: "Navnet er allerede taget" });
      return;
    }

    const team = { id: "t" + Date.now() + Math.random(), name: n, points: 0 };
    state.teams.push(team);

    socket.teamName = n;

    io.emit("state", state);
    if (typeof ack === "function") ack({ ok: true, team });
  });

  // Grandprix buzz
  socket.on("buzz", () => {
    const who = socket.teamName || socket.team || "Ukendt hold";
    io.emit("buzzed", who);
  });

  // Typed GP answer (team -> admin)
  socket.on("gp-typed-answer", (payload) => {
    io.emit("gp-typed-answer", payload);
  });

  // Cards (NisseGåden + JuleKortet)
  socket.on("submitCard", (payload) => {
    let teamName, text;

    if (typeof payload === "string") {
      teamName = socket.teamName;
      text = payload;
    } else {
      teamName = payload?.teamName || socket.teamName;
      text = payload?.text;
    }
    if (!teamName || !text) return;

    io.emit("newCard", { teamName, text });
  });

  // Photos (KreaNissen)
  socket.on("submitPhoto", (payload) => {
    let teamName, filename;
    if (typeof payload === "string") {
      teamName = socket.teamName;
      filename = payload;
    } else {
      teamName = payload?.teamName || socket.teamName;
      filename = payload?.filename || payload?.file;
    }
    if (!teamName || !filename) return;

    io.emit("newPhoto", { teamName, filename });
  });

  // Votes (JK + KN)
  socket.on("vote", (index) => {
    const voter = socket.teamName || "Ukendt hold";
    io.emit("voteUpdate", { voter, index });
  });

  // Admin stop GP audio everywhere
  socket.on("gp-stop-audio-now", () => {
    io.emit("gp-stop-audio-now");
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Root
app.get("/", (req, res) => res.send("Xmas Challenge Server Running"));

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server listening on port", PORT));
