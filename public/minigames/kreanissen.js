// public/minigames/kreanissen.js v2
// KreaNissen: 3 min create + webcam photo (take/retake/accept) + anonymous voting
// Requires HTTPS (you have it) and a user gesture is NOT needed because popup opens from admin action.

let timer = null;
let popup = null;
let hasSubmitted = false;
let hasVoted = false;

// webcam
let stream = null;
let videoEl = null;
let canvasEl = null;
let photoImgEl = null;
let photoBlob = null;
let previewUrl = null;

function ensurePopup() {
  if (popup) return popup;

  popup = document.createElement("div");
  popup.id = "kreanissenPopup";
  popup.style.cssText = `
    position:fixed; inset:0; display:flex; justify-content:center; align-items:center;
    background:rgba(0,0,0,0.65); z-index:9999; padding:16px;
  `;

  popup.innerHTML = `
    <div style="
      width:min(820px, 96vw);
      background:#fff7ef;
      border:8px solid #0b6;
      border-radius:18px;
      padding:18px;
      box-shadow:0 8px 30px rgba(0,0,0,0.3);
      text-align:center;
    ">
      <h2 style="margin:0 0 8px; font-size:2.1rem;">🎨 KreaNissen</h2>
      <p id="knPrompt" style="font-size:1.3rem; font-weight:800; margin:0 0 10px;"></p>

      <div id="knTimerRow" style="font-weight:900; font-size:1.3rem; margin-bottom:10px;">
        Tid tilbage: <span id="knTimeLeft">180</span>s
      </div>

      <!-- CAMERA AREA -->
      <div id="knCameraWrap" style="display:flex; flex-direction:column; gap:10px; align-items:center;">
        <video id="knVideo" autoplay playsinline style="
          width:100%; max-width:640px; border-radius:12px; border:2px solid #ccc; background:#000;
        "></video>

        <img id="knPhotoPreview" style="
          display:none; width:100%; max-width:640px;
          border-radius:12px; border:2px solid #ccc;
        " />

        <canvas id="knCanvas" style="display:none;"></canvas>

        <div id="knButtons" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
          <button id="knTakeBtn" style="
            font-size:1.3rem; font-weight:900; padding:10px 14px;
            border-radius:12px; border:none; background:#0b6; color:#fff; cursor:pointer;
          ">📸 Tag foto</button>

          <button id="knRetryBtn" disabled style="
            font-size:1.3rem; font-weight:900; padding:10px 14px;
            border-radius:12px; border:none; background:#555; color:#fff; cursor:pointer;
            opacity:0.6;
          ">🔁 Prøv igen</button>

          <button id="knAcceptBtn" disabled style="
            font-size:1.3rem; font-weight:900; padding:10px 14px;
            border-radius:12px; border:none; background:#1a7f37; color:#fff; cursor:pointer;
            opacity:0.6;
          ">✅ Accepter</button>
        </div>

        <p id="knStatus" style="margin:0; font-weight:800;"></p>
      </div>

      <div id="knVoteWrap" style="margin-top:14px;"></div>
    </div>
  `;

  document.body.appendChild(popup);
  return popup;
}

async function startCamera() {
  stopCamera();

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    if (videoEl) {
      videoEl.srcObject = stream;
      await videoEl.play();
    }
  } catch (err) {
    console.error(err);
    throw new Error("camera_denied");
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
    stream = null;
  }
}

function clearPhoto() {
  photoBlob = null;

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  if (photoImgEl) {
    photoImgEl.src = "";
    photoImgEl.style.display = "none";
  }
  if (videoEl) videoEl.style.display = "block";
}

function takePhoto() {
  if (!videoEl || !canvasEl) return;

  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;

  canvasEl.width = w;
  canvasEl.height = h;

  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, w, h);

  return new Promise((resolve) => {
    canvasEl.toBlob((blob) => {
      photoBlob = blob;

      if (photoImgEl) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        photoImgEl.src = previewUrl;
        photoImgEl.style.display = "block";
      }

      videoEl.style.display = "none";
      resolve(blob);
    }, "image/jpeg", 0.9);
  });
}

async function uploadBlob(blob) {
  const fd = new FormData();
  fd.append("file", blob, "kreanissen.jpg");

  const res = await fetch("/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload failed");
  const json = await res.json();
  return json.filename;
}

export function stopKreaNissen(api) {
  if (timer) clearInterval(timer);
  timer = null;

  stopCamera();

  if (popup) popup.remove();
  popup = null;

  hasSubmitted = false;
  hasVoted = false;
  clearPhoto();

  api?.showStatus?.("");
}

export async function renderKreaNissen(ch, api, socket, myTeamName) {
  api.setBuzzEnabled(false);

  const pop = ensurePopup();
  pop.style.display = "flex";

  // DOM inside popup
  const promptEl = pop.querySelector("#knPrompt");
  const timeLeftEl = pop.querySelector("#knTimeLeft");
  const statusEl = pop.querySelector("#knStatus");
  const voteWrap = pop.querySelector("#knVoteWrap");
  const timerRow = pop.querySelector("#knTimerRow");

  videoEl = pop.querySelector("#knVideo");
  canvasEl = pop.querySelector("#knCanvas");
  photoImgEl = pop.querySelector("#knPhotoPreview");

  const takeBtn = pop.querySelector("#knTakeBtn");
  const retryBtn = pop.querySelector("#knRetryBtn");
  const acceptBtn = pop.querySelector("#knAcceptBtn");

  promptEl.textContent = ch.text || "Lav noget kreativt og tag et billede!";
  voteWrap.innerHTML = "";

  // ---------------- CREATING PHASE ----------------
  if (ch.phase === "creating") {
    hasVoted = false;

    timerRow.style.display = "block";
    statusEl.textContent = hasSubmitted
      ? "✅ Billede sendt. Vent på afstemning…"
      : "";

    // reset UI for new round
    clearPhoto();
    retryBtn.disabled = true;
    retryBtn.style.opacity = "0.6";
    acceptBtn.disabled = true;
    acceptBtn.style.opacity = "0.6";

    // start camera if not submitted
    if (!hasSubmitted) {
      try {
        await startCamera();
      } catch {
        statusEl.textContent = "⚠️ Kamera kræver tilladelse.";
      }
    }

    takeBtn.onclick = async () => {
      if (hasSubmitted) return;
      await takePhoto();
      retryBtn.disabled = false;
      retryBtn.style.opacity = "1";
      acceptBtn.disabled = false;
      acceptBtn.style.opacity = "1";
    };

    retryBtn.onclick = () => {
      if (hasSubmitted) return;
      clearPhoto();
      retryBtn.disabled = true;
      retryBtn.style.opacity = "0.6";
      acceptBtn.disabled = true;
      acceptBtn.style.opacity = "0.6";
    };

    acceptBtn.onclick = async () => {
      if (hasSubmitted) return;

      if (!photoBlob) {
        statusEl.textContent = "Tag et foto først 🙂";
        return;
      }

      hasSubmitted = true;
      takeBtn.disabled = true;
      retryBtn.disabled = true;
      acceptBtn.disabled = true;
      statusEl.textContent = "⏳ Sender billede…";

      try {
        const filename = await uploadBlob(photoBlob);
        socket.emit("submitPhoto", { teamName: myTeamName, filename });

        statusEl.textContent = "✅ Billede sendt!";
        stopCamera();
        setTimeout(() => (pop.style.display = "none"), 700);
      } catch (e) {
        console.error(e);
        hasSubmitted = false;
        takeBtn.disabled = false;
        retryBtn.disabled = false;
        acceptBtn.disabled = false;
        statusEl.textContent = "⚠️ Upload fejlede. Prøv igen.";
      }
    };

    // timer
    const startAt = ch.creatingStartAt;
    const total = ch.creatingSeconds || 180;

    function tick() {
      const elapsed = Math.floor((Date.now() - startAt) / 1000);
      const left = Math.max(0, total - elapsed);
      timeLeftEl.textContent = left;

      if (left <= 0) {
        clearInterval(timer);
        timer = null;

        // Auto accept if photo already taken
        if (!hasSubmitted && photoBlob) {
          acceptBtn.click();
        } else {
          stopCamera();
          statusEl.textContent = "⏰ Tiden er gået.";
          setTimeout(() => (pop.style.display = "none"), 900);
        }
      }
    }

    if (timer) clearInterval(timer);
    if (!hasSubmitted) timer = setInterval(tick, 250);
    tick();

    return;
  }

  // ---------------- VOTING PHASE ----------------
  if (ch.phase === "voting") {
    stopCamera();
    timerRow.style.display = "none";
    videoEl.style.display = "none";
    photoImgEl.style.display = "none";
    takeBtn.style.display = "none";
    retryBtn.style.display = "none";
    acceptBtn.style.display = "none";

    statusEl.textContent = hasVoted
      ? "✅ Din stemme er afgivet!"
      : "Afstemning i gang! Stem på det bedste billede.";

    const photos = ch.votingPhotos || [];

    const grid = document.createElement("div");
    grid.style.cssText = `
      display:grid; gap:10px;
      grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
    `;

    photos.forEach((p, i) => {
      const owner = p.ownerTeamName;
      const isMine = owner === myTeamName;

      const btn = document.createElement("button");
      btn.style.cssText = `
        text-align:left; padding:8px; border-radius:12px;
        border:2px solid #0b6; background:#fff; cursor:pointer;
        font-size:1.1rem;
        opacity:${isMine ? 0.45 : 1};
      `;
      btn.disabled = isMine || hasVoted;

      btn.innerHTML = `
        <div style="font-weight:900;">Billede #${i + 1}</div>
        <img src="/uploads/${p.filename}" style="
          width:100%; border-radius:10px; margin-top:6px;
          border:1px solid #ccc;
        "/>
        ${isMine ? '<div style="margin-top:6px; font-weight:800;">(Dit billede)</div>' : ""}
      `;

      btn.onclick = () => {
        if (hasVoted || isMine) return;
        hasVoted = true;
        socket.emit("vote", i);

        api.showStatus("✅ Din stemme er afgivet!");
        statusEl.textContent = "✅ Tak for din stemme!";
        [...grid.querySelectorAll("button")].forEach(b => (b.disabled = true));
      };

      grid.appendChild(btn);
    });

    voteWrap.appendChild(grid);
    return;
  }

  // ---------------- ENDED PHASE ----------------
  if (ch.phase === "ended") {
    stopCamera();
    timerRow.style.display = "none";
    videoEl.style.display = "none";
    photoImgEl.style.display = "none";
    takeBtn.style.display = "none";
    retryBtn.style.display = "none";
    acceptBtn.style.display = "none";

    const winners = ch.winners || [];
    statusEl.textContent = winners.length
      ? `🎉 Vindere: ${winners.join(", ")}`
      : "🎉 Runden er slut!";

    setTimeout(() => (pop.style.display = "none"), 6000);
  }
}
