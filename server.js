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

// Shared state used by bingo / Xmas Challenge / etc.
let state = {
  teams: [],
  leaderboard: [],
  currentChallenge: null,
};

// Multer for image uploads
const upload = multer({
  dest: "./uploads/",
});

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ filename: req.file.filename });
});

// SOCKET.IO
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Send current state to anyone who connects (admin or team screen)
  socket.emit("state", state);

  socket.on("joinTeam", (teamName) => {
    socket.team = teamName;
  });

  socket.on("buzz", () => {
    io.emit("buzzed", socket.team);
  });

  socket.on("submitCard", (text) => {
    io.emit("newCard", { team: socket.team, text });
  });

  socket.on("submitPhoto", (file) => {
    io.emit("newPhoto", { team: socket.team, file });
  });

  socket.on("vote", (index) => {
    io.emit("voteUpdate", { voter: socket.team, index });
  });

  // General state update – we'll reuse this for Xmas Challenge
  socket.on("updateState", (newState) => {
    state = newState;
    io.emit("state", state);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Xmas Bingo Server Running");
});

http.listen(3000, () => {
  console.log("Server listening on port 3000");
});
