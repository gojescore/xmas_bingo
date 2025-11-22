const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const fs = require("fs");

// ---------------------------
// Serve static
// ---------------------------
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

// ---------------------------
// Socket.io
// ---------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.emit("state", state);

  socket.on("joinGame", ({ code, teamName }, callback) => {
    if (!state.gameCode || state.gameCode !== code) {
      return callback({ ok: false, message: "Forkert kode" });
    }

    if (state.teams.find(t => t.name === teamName)) {
      return callback({ ok: false, message: "Navn findes allerede" });
    }

    const team = { name: teamName, points: 0 };
    state.teams.push(team);

    io.emit("state", state);
    callback({ ok: true, team });
  });

  socket.on("buzz", (info) => {
    io.emit("buzzed", info);
  });

  socket.on("gp-stop-audio-now", () => {
    io.emit("gp-stop-audio-now");
  });

  socket.on("updateState", (newState) => {
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
