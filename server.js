const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let state = {
  teams: [],
  currentChallenge: null,
  gameCode: null,
  deck: []
};

function normalizeCode(c) {
  return String(c ?? "").trim();
}

io.on("connection", (socket) => {
  socket.emit("state", state);

  socket.on("joinGame", ({ code, teamName }, callback) => {
    const serverCode = normalizeCode(state.gameCode);
    const clientCode = normalizeCode(code);

    if (!serverCode || serverCode !== clientCode) {
      return callback({ ok: false, message: "Forkert kode" });
    }

    const cleanName = String(teamName ?? "").trim();
    if (!cleanName) return callback({ ok: false, message: "Skriv et teamnavn" });

    if (state.teams.some(t => t.name.toLowerCase() === cleanName.toLowerCase())) {
      return callback({ ok: false, message: "Navn findes allerede" });
    }

    const team = { id: "t" + Date.now() + Math.random(), name: cleanName, points: 0 };
    state.teams.push(team);
    socket.teamName = cleanName;

    io.emit("state", state);
    callback({ ok: true, team });
  });

  // Authoritative GP lock on first buzz
  socket.on("buzz", ({ audioPosition } = {}) => {
    const teamName = socket.teamName || "Unknown";
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
    }

    io.emit("buzzed", teamName);
  });

  // Typed answers (GP & NisseGåden)
  socket.on("submitCard", (text) => {
    io.emit("newCard", { team: socket.teamName || "Unknown", text });
  });

  socket.on("gp-typed-answer", ({ text }) => {
    io.emit("gp-typed-answer", {
      teamName: socket.teamName || "Unknown",
      text: String(text ?? "").trim()
    });
  });

  socket.on("gp-stop-audio-now", () => {
    io.emit("gp-stop-audio-now");
  });

  socket.on("updateState", (newState) => {
    const prev = state.currentChallenge;
    state = newState;

    const nowCh = state.currentChallenge;
    const gpEnded =
      prev &&
      prev.type === "Nisse Grandprix" &&
      (!nowCh || nowCh.phase === "ended");

    if (gpEnded) io.emit("gp-stop-audio-now");

    io.emit("state", state);
  });
});

app.get("/", (req, res) => res.send("Xmas Challenge Server Running"));

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log("Server running on", PORT));
