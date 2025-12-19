// public/minigames/kreanissen.js v6
// Restores camera capture (take picture) + keeps state-driven voting (fix for disappearing images).
// Fixes:
// - Creating phase: camera preview + "Tag billede" + "Send billede" (uploads captured photo)
// - Fallback: file upload if camera not available
// - After send: UI replaced by "Dit billede er sendt. Vent på læreren…"
// - Voting renders immediately from ch.votingPhotos on ALL clients (no dependency on votes)
// API: renderKreaNissen(ch, api, socket, myTeamName) + stopKreaNissen(api)

let popupEl = null;

// per-round flags
let lastRoundId = null;
let hasSubmitted = false;
let hasVoted = false;

// camera state
let stream = null;
let videoEl = null;
let canvasEl = null;
let capturedBlob = null;
let capturedUrl = null;
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
      width:min(920px, 96vw);
      background:#fff7ef;
      border:8px solid #0b6;
      border-radius:18px;
      padding:18px;
      box-shadow:0 8px 30px rgba(0,0,0,0.35);
      font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    ">
      <h2 style="margin:0 0 6px; font-size:2rem;">🎨 KreaNissen</h2>
      <p id="knPrompt" style="margin:0 0 12px; font-weight:900;"></p>
      <div id="knBody"></div>
      <p id="knStatus" style="margin-top:12px; font-weight:900;"></p>
    </div>
  `;

  document.body.appendChild(popupEl);
  return popupEl;
}

function setStatus(text) {
  const statusEl = popupEl?.querySelector("#knStatus");
  if (statusEl) statusEl.textContent = text || "";
}

function normalize(s) {
  return (s || "").trim().toLowerCase();
}

function resetPerRoundIfNeeded(roundId) {
  if (!roundId) return;
  if (roundId !== lastRoundId) {
    lastRoundId = roundId;
    hasSubmitted = false;
    hasVoted = false;
    uploading = false;
    capturedBlob = null;
    if (capturedUrl) {
      try { URL.revokeObjectURL(capturedUrl); } catch {}
      capturedUrl = null;
    }
  }
}

async function stopCamera() {
  if (stream) {
    try {
      stream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
    } catch {}
  }
  stream = null;
  videoEl = null;
  canvasEl = null;
}

async function ensureCamera(preferBackCamera = true) {
  // If already running, keep it
  if (stream && videoEl) return true;

  if (!navigator.mediaDevices?.getUserMedia) return false;

  // Some devices need explicit constraints to get back camera
  const constraints = {
    video: preferBackCamera
      ? { facingMode: { ideal: "environment" } }
      : { facingMode: { ideal: "user" } },
    audio: false
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    return true;
  } catch (err) {
    // fallback: try any camera
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      return true;
    } catch {
      stream = null;
      return false;
    }
  }
}

function dataUrlFromCanvas(canvas) {
  try {
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  }
}

function blobFromCanvas(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob || null),
        "image/jpeg",
        0.9
      );
    } catch {
      resolve(null);
    }
  });
}

async function uploadPhotoBlob(blob) {
  const fd = new FormData();
  fd.append("file", blob, "krea.jpg");

  const res = await fetch("/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload failed");

  const json = await res.json();
  if (!json?.filename) throw new Error("no filename");
  return json.filename;
}

function stableImgSrc(filename, seed) {
  // Stable per-phase seed (does not change every re-render)
  const v = typeof seed === "number" ? seed : 1;
  return `/uploads/${filename}?v=${v}`;
}

function renderSubmittedConfirmation(api) {
  const body = popupEl.querySelector("#knBody");
  if (!body) return;

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
}

async function renderCreating(ch, api, socket, myTeamName) {
  const body = popupEl.querySelector("#knBody");
  if (!body) return;

  body.innerHTML = "";

  if (hasSubmitted) {
    renderSubmittedConfirmation(api);
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex; flex-direction:column; gap:12px;";

  const info = document.createElement("div");
  info.style.cssText = "font-weight:900; font-size:1.1rem;";
  info.textContent = "Tag et billede af jeres krea-ting og send det.";
  wrap.appendChild(info);

  const controlsRow = document.createElement("div");
  controlsRow.style.cssText = "display:flex; gap:10px; flex-wrap:wrap; align-items:center;";

  const startCamBtn = document.createElement("button");
  startCamBtn.type = "button";
  startCamBtn.textContent = "Start kamera";
  startCamBtn.style.cssText = `
    font-size:1.15rem; font-weight:900; padding:10px 12px;
    border-radius:12px; border:none; background:#0b6; color:#fff; cursor:pointer;
  `;

  const flipBtn = document.createElement("button");
  flipBtn.type = "button";
  flipBtn.textContent = "Skift kamera";
  flipBtn.style.cssText = `
    font-size:1.15rem; font-weight:900; padding:10px 12px;
    border-radius:12px; border:2px solid #0b6; background:#fff; color:#0b6; cursor:pointer;
  `;
  flipBtn.disabled = true;

  const captureBtn = document.createElement("button");
  captureBtn.type = "button";
  captureBtn.textContent = "Tag billede";
  captureBtn.style.cssText = `
    font-size:1.15rem; font-weight:900; padding:10px 12px;
    border-radius:12px; border:none; background:#1a7f37; color:#fff; cursor:pointer;
  `;
  captureBtn.disabled = true;

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.textContent = "Send billede";
  sendBtn.style.cssText = `
    font-size:1.15rem; font-weight:900; padding:10px 12px;
    border-radius:12px; border:none; background:#d11; color:#fff; cursor:pointer;
  `;
  sendBtn.disabled = true;

  controlsRow.append(startCamBtn, flipBtn, captureBtn, sendBtn);
  wrap.appendChild(controlsRow);

  const previewArea = document.createElement("div");
  previewArea.style.cssText = `
    display:grid;
    grid-template-columns: 1fr;
    gap:10px;
  `;

  // Video preview container
  const videoWrap = document.createElement("div");
  videoWrap.style.cssText = `
    background:#000;
    border-radius:14px;
    overflow:hidden;
    border:2px solid #ddd;
  `;

  videoEl = document.createElement("video");
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.style.cssText = "width:100%; height:auto; display:block; max-height:420px;";
  videoWrap.appendChild(videoEl);

  // Captured image preview
  const imgPreview = document.createElement("img");
  imgPreview.alt = "Forhåndsvisning";
  imgPreview.style.cssText = `
    width:100%;
    height:auto;
    max-height:420px;
    object-fit:contain;
    border-radius:14px;
    border:2px solid #ddd;
    display:none;
    background:#fff;
  `;

  previewArea.appendChild(videoWrap);
  previewArea.appendChild(imgPreview);
  wrap.appendChild(previewArea);

  // Fallback upload (important for devices without camera / permission denied)
  const fallbackWrap = document.createElement("div");
  fallbackWrap.style.cssText = `
    margin-top:6px;
    padding-top:10px;
    border-top:1px dashed #bbb;
  `;
  fallbackWrap.innerHTML = `<div style="font-weight:900; margin-bottom:6px;">Hvis kamera ikke virker: upload et billede</div>`;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.cssText = "font-size:1.05rem;";

  fallbackWrap.appendChild(fileInput);
  wrap.appendChild(fallbackWrap);

  body.appendChild(wrap);

  // ---- handlers ----
  let usingBackCamera = true;

  async function startCamera(preferBack) {
    setStatus("");
    const ok = await ensureCamera(preferBack);
    if (!ok) {
      setStatus("⚠️ Kamera kunne ikke startes (tilladelse?). Brug upload i stedet.");
      startCamBtn.disabled = true; // avoid spamming
      return;
    }

    try {
      videoEl.srcObject = stream;
      await videoEl.play().catch(() => {});
      captureBtn.disabled = false;
      flipBtn.disabled = false;
      startCamBtn.disabled = true;
      setStatus("");
    } catch {
      setStatus("⚠️ Kamera-preview kunne ikke starte. Brug upload i stedet.");
    }
  }

  startCamBtn.onclick = () => startCamera(true);

  flipBtn.onclick = async () => {
    usingBackCamera = !usingBackCamera;
    captureBtn.disabled = true;
    flipBtn.disabled = true;
    startCamBtn.disabled = true;
    setStatus("⏳ Skifter kamera…");

    await stopCamera();

    const ok = await ensureCamera(usingBackCamera);
    if (!ok) {
      setStatus("⚠️ Kunne ikke skifte kamera. Brug upload i stedet.");
      startCamBtn.disabled = false;
      return;
    }

    try {
      videoEl.srcObject = stream;
      await videoEl.play().catch(() => {});
      captureBtn.disabled = false;
      flipBtn.disabled = false;
      setStatus("");
    } catch {
      setStatus("⚠️ Kamera-preview kunne ikke starte. Brug upload i stedet.");
      startCamBtn.disabled = false;
    }
  };

  captureBtn.onclick = async () => {
    if (!videoEl) return;

    // create canvas if missing
    if (!canvasEl) canvasEl = document.createElement("canvas");

    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;

    canvasEl.width = w;
    canvasEl.height = h;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) {
      setStatus("⚠️ Kunne ikke tage billede. Brug upload i stedet.");
      return;
    }

    try {
      ctx.drawImage(videoEl, 0, 0, w, h);
    } catch {
      setStatus("⚠️ Kunne ikke tage billede. Brug upload i stedet.");
      return;
    }

    const blob = await blobFromCanvas(canvasEl);
    if (!blob) {
      // last resort, dataURL
      const dataUrl = dataUrlFromCanvas(canvasEl);
      if (!dataUrl) {
        setStatus("⚠️ Kunne ikke tage billede. Brug upload i stedet.");
        return;
      }
      // convert dataURL to blob
      try {
        const r = await fetch(dataUrl);
        capturedBlob = await r.blob();
      } catch {
        setStatus("⚠️ Kunne ikke tage billede. Brug upload i stedet.");
        return;
      }
    } else {
      capturedBlob = blob;
    }

    if (capturedUrl) {
      try { URL.revokeObjectURL(capturedUrl); } catch {}
      capturedUrl = null;
    }
    capturedUrl = URL.createObjectURL(capturedBlob);

    imgPreview.src = capturedUrl;
    imgPreview.style.display = "block";

    sendBtn.disabled = false;
    setStatus("✅ Billede taget. Tryk “Send billede”.");
  };

  sendBtn.onclick = async () => {
    if (uploading) return;
    if (!capturedBlob) {
      setStatus("Tag et billede først (eller upload en fil).");
      return;
    }

    uploading = true;
    sendBtn.disabled = true;
    captureBtn.disabled = true;
    flipBtn.disabled = true;
    fileInput.disabled = true;
    setStatus("⏳ Uploader…");

    try {
      const filename = await uploadPhotoBlob(capturedBlob);

      socket.emit("submitPhoto", { teamName: myTeamName, filename });

      hasSubmitted = true;
      await stopCamera();
      renderSubmittedConfirmation(api);
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Upload fejlede. Prøv igen.");
      sendBtn.disabled = false;
      captureBtn.disabled = false;
      flipBtn.disabled = false;
      fileInput.disabled = false;
    } finally {
      uploading = false;
    }
  };

  fileInput.onchange = async () => {
    if (uploading) return;
    const f = fileInput.files?.[0] || null;
    if (!f) return;

    uploading = true;
    fileInput.disabled = true;
    setStatus("⏳ Uploader…");

    try {
      // stop camera if running (avoid confusion)
      await stopCamera();

      const filename = await (async () => {
        const fd = new FormData();
        fd.append("file", f, f.name || "photo.jpg");
        const res = await fetch("/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("upload failed");
        const json = await res.json();
        if (!json?.filename) throw new Error("no filename");
        return json.filename;
      })();

      socket.emit("submitPhoto", { teamName: myTeamName, filename });

      hasSubmitted = true;
      renderSubmittedConfirmation(api);
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Upload fejlede. Prøv igen.");
      fileInput.disabled = false;
    } finally {
      uploading = false;
    }
  };
}

function renderVoting(ch, api, socket, myTeamName) {
  const body = popupEl.querySelector("#knBody");
  if (!body) return;

  body.innerHTML = "";

  // Render ONLY from server state (this is what fixes the “images appear after someone votes” bug)
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

  const top = document.createElement("div");
  top.style.cssText = "font-weight:900; font-size:1.2rem; margin-bottom:10px;";
  top.textContent = hasVoted
    ? "✅ Din stemme er afgivet!"
    : "Afstemning i gang! Vælg jeres favoritbillede.";
  body.appendChild(top);

  const grid = document.createElement("div");
  grid.style.cssText = `
    display:grid; gap:10px;
    grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));
  `;

  const me = normalize(myTeamName);
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
      [...grid.querySelectorAll("button")].forEach((b) => (b.disabled = true));
    };

    grid.appendChild(card);
  });

  body.appendChild(grid);

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

  // After minigame ends, show the global "vent på læreren…" like your other games
  api?.showStatus?.("Vent på læreren…");
  setStatus("");

  setTimeout(() => {
    if (popupEl) popupEl.style.display = "none";
  }, 4500);
}

export function stopKreaNissen(api) {
  uploading = false;
  lastRoundId = null;
  hasSubmitted = false;
  hasVoted = false;

  if (capturedUrl) {
    try { URL.revokeObjectURL(capturedUrl); } catch {}
    capturedUrl = null;
  }
  capturedBlob = null;

  // stop camera stream safely
  stopCamera();

  if (popupEl) popupEl.remove();
  popupEl = null;

  api?.showStatus?.("");
  setStatus("");
}

export function renderKreaNissen(ch, api, socket, myTeamName) {
  api?.setBuzzEnabled?.(false);

  const popup = ensurePopup();
  popup.style.display = "flex";

  const promptEl = popup.querySelector("#knPrompt");
  if (promptEl) {
    promptEl.textContent = ch.text || "Lav noget kreativt og tag et billede.";
  }

  resetPerRoundIfNeeded(ch.id);

  // phase routing
  if (ch.phase === "creating") {
    // ensure any ended/voting state does not keep camera stopped incorrectly
    renderCreating(ch, api, socket, myTeamName);
    return;
  }

  // once voting begins, allow voting even if submitted
  if (ch.phase === "voting") {
    // we never want the camera running during voting
    stopCamera();
    renderVoting(ch, api, socket, myTeamName);
    return;
  }

  if (ch.phase === "ended") {
    stopCamera();
    renderEnded(ch, api);
    return;
  }

  // fallback
  stopCamera();
  api?.showStatus?.("Vent på læreren…");
  setStatus("");
}
