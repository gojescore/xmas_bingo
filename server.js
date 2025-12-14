// server.js
// Xmas Challenge – main + team + minigames + point toasts + winner overlay

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// -----------------------------------------------------
// STATIC FILES
// -----------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

// -----------------------------------------------------
// VOICE MESSAGES (UPLOAD + STATIC)
// -----------------------------------------------------
const AUDIO_DIR = path.join(__dirname, "uploads_audio");

// Ensure uploads_audio folder exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

app.use("/uploads_audio", express.static(AUDIO_DIR));

// Multer for audio uploads
const uploadAudio = multer({ dest: AUDIO_DIR });

app.post("/upload-audio", uploadAudio.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: "Ingen lydfil modtaget." });
  }
  res.json({ ok: true, filename: req.file.filename });
});


// Ensure uploads folder exists (for KreaNissen photos)
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// -----------------------------------------------------
// FILE UPLOAD (KreaNissen)
// -----------------------------------------------------
const upload = multer({ dest: UPLOAD_DIR });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: "Ingen fil modtaget." });
  }
  // Client only needs filename, image is served from /uploads/<filename>
  res.json({ ok: true, filename: req.file.filename });
});

// -----------------------------------------------------
// GAME STATE (kept in memory on the server)
// -----------------------------------------------------
let state = {
  teams: [],
  deck: [],
  currentChallenge: null,
  gameCode: null
};

// -----------------------------------------------------
// SOCKET.IO
// -----------------------------------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Send current state to new client (main or team)
  socket.emit("state", state);

  // ---------------------------------------------
// Winner/Voice screens (admin -> all clients)
// ---------------------------------------------
socket.on("send-voice", (payload) => {
  // payload: { filename, from, createdAt, mimeType }
  io.emit("voice-message", payload);
});


  // ---------------------------------------------
  // TEAMS: joinGame (code + team name)
  // ---------------------------------------------
  socket.on("joinGame", ({ code, teamName }, cb) => {
    try {
      const trimmedName = (teamName || "").trim();
      if (!trimmedName) {
        cb && cb({ ok: false, message: "Tomt teamnavn." });
        return;
      }

      if (!state.gameCode || String(code) !== String(state.gameCode)) {
        cb && cb({ ok: false, message: "Forkert kode." });
        return;
      }

      // Either reuse existing team or create new one
      let team = state.teams.find(
        (t) => (t.name || "").toLowerCase() === trimmedName.toLowerCase()
      );

      if (!team) {
        team = {
          id: "t" + Date.now() + Math.random(),
          name: trimmedName,
          points: 0
        };
        state.teams.push(team);
        io.emit("state", state);
      }

      // Remember which team this socket belongs to (for buzz etc.)
      socket.data.teamName = team.name;

      cb && cb({ ok: true, team });
    } catch (err) {
      console.error("joinGame error:", err);
      cb && cb({ ok: false, message: "Server-fejl ved join." });
    }
  });

  // ---------------------------------------------
  // MAIN: updateState (admin sends full game state)
  // ---------------------------------------------
  socket.on("updateState", (newState) => {
    if (!newState) return;

    const newTeams = Array.isArray(newState.teams)
      ? newState.teams
      : state.teams;

    state = {
      ...state,
      ...newState,
      teams: newTeams
    };

    io.emit("state", state);
  });

  // ---------------------------------------------
  // Winner screen (admin -> all clients)
  // ---------------------------------------------
  socket.on("show-winner", (payload) => {
    // payload: { winners: [names], topScore, message }
    io.emit("show-winner", payload);
  });

  // ---------------------------------------------
  // GRANDPRIX: buzz (team -> main)
  // ---------------------------------------------
  socket.on("buzz", () => {
    const teamName = socket.data.teamName;
    if (!teamName) return;

    io.emit("buzzed", teamName);
  });

  // ---------------------------------------------
  // GRANDPRIX: typed answer (team -> main)
  // ---------------------------------------------
  socket.on("gp-typed-answer", (payload) => {
    io.emit("gp-typed-answer", payload);
  });

  // ---------------------------------------------
  // NISSEGÅDEN / JULEKORTET: submit text card
  //  - Accepts BOTH:
  //      { teamName, text }
  //    and
  //      "bare selve teksten"
  // ---------------------------------------------
  socket.on("submitCard", (payload) => {
    let teamName = null;
    let text = "";

    if (typeof payload === "string") {
      text = payload;
      teamName = socket.data.teamName || null;
    } else if (payload && typeof payload === "object") {
      text = payload.text ?? "";
      teamName = payload.teamName || socket.data.teamName || null;
    }

    io.emit("newCard", { teamName, text });
  });

  // ---------------------------------------------
  // KREANISSEN: new uploaded photo
  //  - Clients emit: socket.emit("submitPhoto", { teamName, filename })
  //  - Admin/main listens on "newPhoto"
  // ---------------------------------------------
  socket.on("submitPhoto", ({ teamName, filename }) => {
    if (!filename) return;
    const realTeamName = teamName || socket.data.teamName || "Ukendt hold";
    io.emit("newPhoto", { teamName: realTeamName, filename });
  });

  // (Optional backwards compatibility if anyone still uses "newPhoto" directly)
  socket.on("newPhoto", (payload) => {
    io.emit("newPhoto", payload);
  });

  // ---------------------------------------------
  // Voting (JuleKortet + KreaNissen)
  //  - Clients emit: socket.emit("vote", index)
  //  - Admin/main expects "voteUpdate" with { voter, index }
  // ---------------------------------------------
  socket.on("vote", (index) => {
    const voter = socket.data.teamName || "Ukendt hold";
    io.emit("voteUpdate", { voter, index });
  });

  // (Backwards compatibility if someone sends voteUpdate directly)
  socket.on("voteUpdate", (payload) => {
    io.emit("voteUpdate", payload);
  });

  // ---------------------------------------------
  // Point toasts – relay from admin to everyone
  // ---------------------------------------------
  socket.on("points-toast", (payload) => {
    io.emit("points-toast", payload);
  });

  // ---------------------------------------------
  // Grandprix: stop audio everywhere
  // ---------------------------------------------
  socket.on("gp-stop-audio-now", () => {
    io.emit("gp-stop-audio-now");
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// -----------------------------------------------------
// START SERVER
// -----------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Xmas Challenge server listening on port", PORT);
});


