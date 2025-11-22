const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

// ---------------------------
// Server state
// ---------------------------
let state = {
  teams: [],
  currentChallenge: null, // object or null
  gameCode: null,
  deck: []
};

function normalizeCode(c) {
  return String(c ?? "").trim();
}

// ---------------------------
// Socket.io
// ---------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.emit("state", state);

  // ---- TEAM JOIN ----
  socket.on("joinGame", ({ code, teamName }, callback) => {
    const serverCode = normalizeCode(state.gameCode);
    const clientCode = normalizeCode(code);

    if (!serverCode || serverCode !== clientCode) {
      return callback({ ok: false, message: "Forkert kode" });
    }

    const cleanName = String(teamName ?? "").trim();
    if (!cleanName) {
      return callback({ ok: false, message: "Skriv et teamnavn" });
    }

    if (state.teams.some(t => t.name.toLowerCase() === cleanName.toLowerCase())) {
      return callback({ ok: false, message: "Navn findes allerede" });
    }

    const team = { id: "t" + Date.now() + Math.random(), name: cleanName, points: 0 };
    state.teams.push(team);

    // remember team name on socket
    socket.teamName = cleanName;

    io.emit("state", state);
    callback({ ok: true, team });
  });

  // ---- BUZZ (authoritative GP lock happens here) ----
  socket.on("buzz", ({ audioPosition } = {}) => {
    const teamName = socket.teamName || "Unknown";

    // If current challenge is Grandprix and still listening -> lock it
    const ch = state.currentChallenge;
    if (
      ch &&
      ch.type === "Nisse Grandprix" &&
      ch.phase === "listening" &&
      !ch.firstBuzz
    ) {
      state.currentChallenge = {
        ...ch,
        phase: "locked",
        firstBuzz: { teamName, audioPosition: audioPosition ?? null },
        countdownStartAt: Date.now(),
        countdownSeconds: ch.countdownSeconds || 5
      };

      io.emit("state", state);
      io.emit("buzzed", teamName);
      return;
    }

    // Otherwise just tell admin who buzzed (non-GP future use)
    io.emit("buzzed", teamName);
  });

  // ---- TYPED ANSWER (buzzing team -> admin) ----
  socket.on("gp-typed-answer", ({ text }) => {
    const teamName = socket.teamName || "Unknown";
    io.emit("gp-typed-answer", { teamName, text: String(text ?? "").trim() });
  });

  // ---- STOP AUDIO NOW (admin force stop) ----
  socket.on("gp-stop-audio-now", () => {
    io.emit("gp-stop-audio-now");
  });

  // ---- STATE UPDATE FROM ADMIN ----
  socket.on("updateState", (newState) => {
    const prev = state.currentChallenge;
    state = newState;

    // If GP just ended/cleared -> force stop audio for everyone
    const nowCh = state.currentChallenge;
    const gpEnded =
      prev &&
      prev.type === "Nisse Grandprix" &&
      (!nowCh || nowCh.phase === "ended");

    if (gpEnded) {
      io.emit("gp-stop-audio-now");
    }

    io.emit("state", state);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Xmas Challenge Server Running");
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
  console.log("Server running on", PORT);
});
