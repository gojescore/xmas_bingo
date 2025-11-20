// Connect to the same origin server (no hardcoded URL)
const socket = io();

let currentTeamName = null;

// DOM references
const teamNameInput = document.getElementById("teamNameInput");
const joinBtn = document.getElementById("joinBtn");
const teamNameDisplay = document.getElementById("teamNameDisplay");

const challengeText = document.getElementById("challengeText");
const challengeImage = document.getElementById("challengeImage");

const buzzBtn = document.getElementById("buzzBtn");
const statusEl = document.getElementById("status");

const cardForm = document.getElementById("cardForm");
const cardInput = document.getElementById("cardInput");
const cardsList = document.getElementById("cardsList");

const photoForm = document.getElementById("photoForm");
const photoInput = document.getElementById("photoInput");
const photosList = document.getElementById("photosList");

const leaderboardBody = document.getElementById("leaderboardBody");

// Join team
joinBtn.addEventListener("click", () => {
  const name = teamNameInput.value.trim();
  if (!name) {
    alert("Write a team name first.");
    teamNameInput.focus();
    return;
  }

  currentTeamName = name;
  teamNameDisplay.textContent = currentTeamName;

  socket.emit("joinTeam", currentTeamName);

  // Enable actions once joined
  buzzBtn.disabled = false;
  statusEl.textContent = "Joined as " + currentTeamName;
});

// Buzz
buzzBtn.addEventListener("click", () => {
  if (!currentTeamName) {
    alert("Join a team first.");
    return;
  }
  socket.emit("buzz");
});

// Submit text card
cardForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentTeamName) {
    alert("Join a team first.");
    return;
  }
  const text = cardInput.value.trim();
  if (!text) return;

  socket.emit("submitCard", text);
  cardInput.value = "";
});

// Submit photo
photoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentTeamName) {
    alert("Join a team first.");
    return;
  }
  const file = photoInput.files[0];
  if (!file) {
    alert("Choose a file first.");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    // filename returned by server.js
    socket.emit("submitPhoto", data.filename);

    photoInput.value = "";
  } catch (err) {
    console.error("Upload error:", err);
    alert("Upload failed.");
  }
});

// Receive full state on connect / update
socket.on("state", (state) => {
  renderChallenge(state.currentChallenge);
  renderLeaderboard(state.leaderboard);
});

// Someone buzzed
socket.on("buzzed", (team) => {
  statusEl.textContent = `${team} buzzed first!`;
});

// New text card from any team
socket.on("newCard", ({ team, text }) => {
  const li = document.createElement("li");
  li.textContent = `${team}: ${text}`;
  cardsList.appendChild(li);
});

// New photo from any team
socket.on("newPhoto", ({ team, file }) => {
  const li = document.createElement("li");
  li.textContent = `${team}:`;
  const img = document.createElement("img");
  img.src = `/uploads/${file}`;
  img.alt = `Photo from ${team}`;
  li.appendChild(img);
  photosList.appendChild(li);
});

// Voting event (if you later use it)
socket.on("voteUpdate", ({ voter, index }) => {
  console.log("Vote from", voter, "on index", index);
  // You can add some UI feedback here later
});

function renderChallenge(challenge) {
  if (!challenge) {
    challengeText.textContent = "No challenge yet.";
    challengeImage.style.display = "none";
    challengeImage.src = "";
    return;
  }

  // Support both a simple string and an object { text, image }
  if (typeof challenge === "string") {
    challengeText.textContent = challenge;
    challengeImage.style.display = "none";
    challengeImage.src = "";
  } else {
    challengeText.textContent = challenge.text || "New challenge!";
    if (challenge.image) {
      challengeImage.src = `/uploads/${challenge.image}`;
      challengeImage.style.display = "block";
    } else {
      challengeImage.style.display = "none";
      challengeImage.src = "";
    }
  }
}

function renderLeaderboard(leaderboard = []) {
  leaderboardBody.innerHTML = "";

  leaderboard.forEach((entry, index) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = index + 1;

    const nameTd = document.createElement("td");
    // Adjust these property names if your structure is different
    nameTd.textContent = entry.team || entry.name || "Unknown";

    const pointsTd = document.createElement("td");
    pointsTd.textContent = entry.points ?? entry.score ?? 0;

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(pointsTd);

    leaderboardBody.appendChild(tr);
  });
}
