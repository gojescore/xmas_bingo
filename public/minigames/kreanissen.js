// public/minigames/kreanissen.js v3
// Fixes:
// - Voting renders IMMEDIATELY from ch.votingPhotos on ALL clients (no dependency on votes/events)
// - Stable image URLs (no Date.now() cache-busting loop)
// - After upload: replaces UI with "Dit billede er sendt" confirmation
// - Keeps popup open and consistent across phase changes
// API: renderKreaNissen(ch, api, socket, myTeamName) + stopKreaNissen(api)

let popupEl = null;

// Per-round flags
let lastRoundId = null;
let hasSubmitted = false;
let hasVoted = false;

// Avoid re-upload spam
let uploading = false;

function ensurePopup() {
  if (popupEl) return popupEl;

  popupEl = document.createElement("div");
  popupEl.id = "kreaPopup";
  popupEl.style.cssText = `
    position:fixed; inset:0; display:flex; justify-content:center; align-items:center;
    background:rgba(0,0,0,0.65); z-index:9999; padding:16px;
  `;

  popupEl.innerHTML = `
    <div style="
      width:min(860px, 96vw);
      background:#fff7ef;
      border:8px solid #0b6;
      border-radius:18px;
      padding:18px;
      box-shadow:0 8px 30px rgba(0,0,0,0.35);
      font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    ">
      <h2 style="margin:0 0 6px; font-size:2rem;">🎨 KreaNissen</h2>
      <p id="knPrompt" style="margin:0 0 12px; font-weight:800;"></p>

      <div id="knBody"></div>

      <p id="knStatus" style="margin-top:12px; font-weight:900;"></p>
    </div>
  `;

  document.body.appendChild(popupEl);
  return popupEl;
}

function resetPerRoundIfNeeded(roundId) {
  if (!roundId) return;
  if (roundId !== lastRoundId) {
    lastRoundId = roundId;
    hasSubmitted = false;
    hasVoted = false;
    uploading = false;
  }
}

function setStatus(text) {
  const statusEl = popupEl?.querySelector("#knStatus");
  if (statusEl) statusEl.textContent = text || "";
}

function stableImgSrc(filename, seed) {
  // Stable seed per phase switch so caches behave, but doesn't thrash every render.
  // Using phaseStartAt is good: changes when phase changes, not on every UI refresh.
  const v = typeof seed === "number" ? seed : 1;
  return `/uploads/${filename}?v=${v}`;
}

async function uploadPhotoFile(file) {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo.jpg");

  const res = await fetch("/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload failed");

  const json = await res.json();
  if (!json?.filename) throw new Error("no filename");

  return json.filename;
}

function renderCreating(ch, api, socket, myTeamName) {
  const body = popupEl.querySelector("#knBody");
  if (!body) return;

  body.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex; flex-direction:column; gap:12px;";

  const info = document.createElement("div");
  info.style.cssText = "font-weight:900; font-size:1.1rem;";
  info.textContent = "Upload et billede af jeres krea-ting.";

  wrap.appendChild(info);

  // If already submitted: show confirmation message only (no more typing/upload UI)
  if (hasSubmitted) {
    const done = document.createElement("div");
    done.style.cssText = `
      padding:14px;
      border-radius:14px;
      background:#eafff1;
      border:2px solid #0b6;
      font-weight:900;
      font-size:1.35rem;
      text-align:center;
    `;
    done.textContent = "✅ Dit billede er sendt. Vent på læreren…";
    wrap.appendChild(done);

    body.appendChild(wrap);
    api?.showStatus?.("Vent på læreren…");
    setStatus("");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.cssText = "font-size:1.1rem;";

  const preview = document.createElement("img");
  preview.style.cssText = "max-width:100%; max-height:320px; border-radius:12px; display:none; border:2px solid #ddd;";

  let selectedFile = null;

  input.onchange = () => {
    const f = input.files?.[0] || null;
    selectedFile = f;

    if (!f) {
      preview.style.display = "none";
      preview.src = "";
      return;
    }

    const url = URL.createObjectURL(f);
    preview.src = url;
    preview.style.display = "block";
    setStatus("");
  };

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send billede";
  sendBtn.style.cssText = `
    font-size:1.35rem; font-weight:900; padding:12px 14px;
    border-radius:12px; border:none; background:#0b6; color:#fff; cursor:pointer;
    width:fit-content;
  `;

  sendBtn.onclick = async () => {
    if (uploading) return;
    if (!selectedFile) {
      setStatus("Vælg et billede først.");
      return;
    }

    uploading = true;
    sendBtn.disabled = true;
    input.disabled = true;
    setStatus("⏳ Uploader…");

    try {
      const filename = await uploadPhotoFile(selectedFile);

      socket.emit("submitPhoto", {
        teamName: myTeamName,
        filename
      });

      hasSubmitted = true;

      // Replace the UI with a clear confirmation
      body.innerHTML = "";
      const done = document.createElement("div");
      done.style.cssText = `
        padding:14px;
        border-radius:14px;
        background:#eafff1;
        border:2px solid #0b6;
        font-weight:900;
        font-size:1.35rem;
        text-align:center;
      `;
      done.textContent = "✅ Dit billede er sendt. Vent på læreren…";
      body.appendChild(done);

      api?.showStatus?.("Vent på læreren…");
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Upload fejlede. Prøv igen.");
      sendBtn.disabled = false;
      input.disabled = false;
    } finally {
      uploading = false;
    }
  };

  wrap.appendChild(input);
  wrap.appendChild(preview);
  wrap.appendChild(sendBtn);

  body.appendChild(wrap);
}

function renderVoting(ch, api, socket, myTeamName) {
  const body = popupEl.querySelector("#knBody");
  if (!body) return;

  body.innerHTML = "";

  // IMPORTANT: render directly from server state
  const photos = Array.isArray(ch.votingPhotos) ? ch.votingPhotos : [];

  if (!photos.length) {
    const p = document.createElement("div");
    p.style.cssText = "font-weight:900; font-size:1.2rem; text-align:center; padding:16px;";
    p.textContent = "⏳ Vent… der er ingen billeder endnu.";
    body.appendChild(p);
    api?.showStatus?.("Vent på læreren…");
    setStatus("");
    return;
  }

  const statusTop = document.createElement("div");
  statusTop.style.cssText = "font-weight:900; font-size:1.2rem; margin-bottom:10px;";
  statusTop.textContent = hasVoted
    ? "✅ Din stemme er afgivet!"
    : "Afstemning i gang! Vælg jeres favoritbillede.";
  body.appendChild(statusTop);

  const grid = document.createElement("div");
  grid.style.cssText = `
    display:grid; gap:10px;
    grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));
  `;

  const normalize = (x) => (x || "").trim().toLowerCase();
  const me = normalize(myTeamName);

  // Use phaseStartAt as stable cache-bust seed for the voting phase
  const seed = typeof ch.phaseStartAt === "number" ? ch.phaseStartAt : 1;

  photos.forEach((p, i) => {
    const owner = p.ownerTeamName || "";
    const isMine = normalize(owner) === me;

    const card = document.createElement("button");
    card.type = "button";
    card.style.cssText = `
      text-align:left; padding:10px; border-radius:12px;
      border:2px solid #0b6; background:#fff; cursor:pointer;
      font-size:1rem;
      opacity:${isMine ? 0.45 : 1};
    `;
    card.disabled = hasVoted || isMine;

    const img = document.createElement("img");
    img.alt = `Billede #${i + 1}`;
    img.style.cssText = "width:100%; height:auto; border-radius:10px; display:block; border:1px solid #ddd;";
    img.src = stableImgSrc(p.filename, seed);

    const label = document.createElement("div");
    label.style.cssText = "margin-top:8px; font-weight:900;";
    label.textContent = `Billede #${i + 1}${isMine ? " (Jeres)" : ""}`;

    card.appendChild(img);
    card.appendChild(label);

    card.onclick = () => {
      if (hasVoted || isMine) return;

      hasVoted = true;
      socket.emit("vote", i);

      api?.showStatus?.("✅ Din stemme er afgivet!");
      setStatus("✅ Tak for din stemme!");
      // Disable all choices immediately for this client
      [...grid.querySelectorAll("button")].forEach((b) => (b.disabled = true));
    };

    grid.appendChild(card);
  });

  body.appendChild(grid);

  // During voting we don't want "vent på læreren…" as status; it can confuse.
  api?.showStatus?.("");
  setStatus("");
}

function renderEnded(ch, api) {
  const body = popupEl.querySelector("#knBody");
  if (!body) return;

  body.innerHTML = "";

  const winners = Array.isArray(ch.winners) ? ch.winners : [];

  const done = document.createElement("div");
  done.style.cssText = `
    padding:14px;
    border-radius:14px;
    background:#fff;
    border:2px solid #0b6;
    font-weight:900;
    font-size:1.25rem;
    text-align:center;
  `;
  done.textContent = winners.length
    ? `🎉 Vindere: ${winners.join(", ")}`
    : "🎉 Runden er slut!";

  body.appendChild(done);

  // This matches your “after minigame ends: vent på læreren…”
  api?.showStatus?.("Vent på læreren…");
  setStatus("");

  // Keep visible briefly, then hide
  setTimeout(() => {
    if (popupEl) popupEl.style.display = "none";
  }, 4500);
}

export function stopKreaNissen(api) {
  uploading = false;
  lastRoundId = null;
  hasSubmitted = false;
  hasVoted = false;

  if (popupEl) popupEl.remove();
  popupEl = null;

  api?.showStatus?.("");
}

export function renderKreaNissen(ch, api, socket, myTeamName) {
  api?.setBuzzEnabled?.(false);

  const popup = ensurePopup();
  popup.style.display = "flex";

  const promptEl = popup.querySelector("#knPrompt");
  if (promptEl) {
    promptEl.textContent = ch.text || "Lav noget kreativt og upload et billede.";
  }

  // Reset flags when new challenge round starts
  resetPerRoundIfNeeded(ch.id);

  // Phase routing (purely state-driven)
  if (ch.phase === "creating") {
    renderCreating(ch, api, socket, myTeamName);
    return;
  }

  if (ch.phase === "voting") {
    // When voting begins, users should be able to vote even if they submitted earlier
    // (hasVoted is separate; hasSubmitted stays true but does not block voting)
    renderVoting(ch, api, socket, myTeamName);
    return;
  }

  if (ch.phase === "ended") {
    renderEnded(ch, api);
    return;
  }

  // Unknown phase: be safe
  api?.showStatus?.("Vent på læreren…");
  setStatus("");
}
