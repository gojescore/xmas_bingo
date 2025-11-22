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
  currentChallenge: null,
  gameCode: null,
  deck: []
};

// Helper: always compare codes as trimmed strings
function normalizeCode(c) {
  return String(c ?? "").trim();
}

// ---------------------------
// Socket.io
// ---------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Send current state on connect
  socket.emit("state", state);

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

    if (state.teams.find(t => t.name.toLowerCase() === cleanName.toLowerCase())) {
      return callback({ ok: false, message: "Navn findes allerede" });
    }

    const team = { name: cleanName, points: 0 };
    state.teams.push(team);

    io.emit("state", state);
    callback({ ok: true, team });
  });

  socket.on("buzz", (info) => {
    io.emit("buzzed", info?.teamName || info);
  });

  socket.on("gp-stop-audio-now", () => {
    io.emit("gp-stop-audio-now");
  });

  socket.on("updateState", (newState) => {
    // Admin is truth
    state = newState;
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
