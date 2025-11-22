// public/minigames/julekortet.js v2
// Fix: textarea never disabled during writing. Only readOnly after submit/time.
// socket is passed in from team.js.

let writingTimer = null;
let popupEl = null;

function ensurePopup() {
  if (popupEl) return popupEl;

  popupEl = document.createElement("div");
  popupEl.id = "julekortPopup";
  popupEl.style.cssText = `
    position:fixed; inset:0; display:flex; justify-content:center; align-items:center;
    background:rgba(0,0,0,0.6); z-index:9999; padding:16px;
  `;

  popupEl.innerHTML = `
    <div class="jk-card" style="
      width:min(720px, 96vw);
      background:#fff7ef;
      border:8px solid #d11;
      border-radius:18px;
      padding:18px;
      box-shadow:0 8px 30px rgba(0,0,0,0.3);
    ">
      <h2 style="margin:0 0 6px; font-size:2rem;">🎄 JuleKortet</h2>
      <p style="margin:0 0 10px; font-weight:700;">Skriv et kort på 2 minutter</p>

      <div style="font-weight:900; font-size:1.3rem; margin-bottom:10px;">
        Tid tilbage: <span id="jkTimeLeft">120</span>s
      </div>

      <textarea id="jkTextarea" placeholder="Skriv jeres julekort her..."
        style="
          width:100%; min-height:220px;
          font-size:1.6rem; line-height:1.35;
          padding:12px; border-radius:12px; border:2px solid #a33;
          color:crimson; background:#fff;
        "></textarea>

      <button id="jkSendBtn" style="
        margin-top:10px; font-size:1.4rem; font-weight:900;
        padding:10px 14px; border-radius:12px; border:none;
        background:#1a7f37; color:#fff; cursor:pointer;
      ">Send kort</button>

      <p id="jkStatus" style="margin-top:8px; font-weight:800;"></p>
    </div>
  `;

  document.body.appendChild(popupEl);
  return popupEl;
}

export function stopJuleKortet(api) {
  if (writingTimer) clearInterval(writingTimer);
  writingTimer = null;
  if (popupEl) popupEl.remove();
  popupEl = null;
  api?.showStatus?.("");
}

export function renderJuleKortet(ch, api, socket) {
  api.setBuzzEnabled(false);

  const popup = ensurePopup();
  popup.style.display = "flex";

  const timeLeftEl = popup.querySelector("#jkTimeLeft");
  const textarea = popup.querySelector("#jkTextarea");
  const sendBtn = popup.querySelector("#jkSendBtn");
  const statusEl = popup.querySelector("#jkStatus");

  // clear vote UI if old
  const oldVote = popup.querySelector(".jk-vote-wrap");
  if (oldVote) oldVote.remove();

  // --- WRITING PHASE ---
  if (ch.phase === "writing") {
    textarea.readOnly = false;
    sendBtn.disabled = false;
    statusEl.textContent = "";

    const startAt = ch.writingStartAt;
    const total = ch.writingSeconds || 120;

    function tick() {
      const elapsed = Math.floor((Date.now() - startAt) / 1000);
      const left = Math.max(0, total - elapsed);
      timeLeftEl.textContent = left;

      if (left <= 0) {
        clearInterval(writingTimer);
        writingTimer = null;
        autoSubmit();
      }
    }

    if (writingTimer) clearInterval(writingTimer);
    writingTimer = setInterval(tick, 250);
    tick();

    // focus strongly
    setTimeout(() => textarea.focus(), 80);

    sendBtn.onclick = manualSubmit;

    function manualSubmit() {
      const text = (textarea.value || "").trim();
      if (!text) {
        statusEl.textContent = "Skriv noget først 🙂";
        return;
      }
      textarea.readOnly = true;
      sendBtn.disabled = true;
      statusEl.textContent = "✅ Kort sendt!";
      socket.emit("submitCard", text);
    }

    function autoSubmit() {
      const text = (textarea.value || "").trim();
      textarea.readOnly = true;
      sendBtn.disabled = true;

      if (text) {
        socket.emit("submitCard", text);
        statusEl.textContent = "⏳ Tiden er gået — dit kort er sendt!";
      } else {
        statusEl.textContent = "⏳ Tiden er gået — ingen tekst sendt.";
      }
    }
  }

  // --- VOTING PHASE ---
  if (ch.phase === "voting") {
    textarea.readOnly = true;
    sendBtn.disabled = true;
    timeLeftEl.textContent = "0";
    statusEl.textContent = "Afstemning i gang! Vælg jeres favoritkort.";

    const cards = ch.cards || [];

    const voteWrap = document.createElement("div");
    voteWrap.className = "jk-vote-wrap";
    voteWrap.style.cssText = `
      margin-top:12px; display:grid; gap:10px;
      grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
    `;

    cards.forEach((c, i) => {
      const cardBox = document.createElement("button");
      cardBox.style.cssText = `
        text-align:left; padding:10px; border-radius:12px;
        border:2px solid #d77; background:#fff; cursor:pointer;
        font-size:1.1rem;
      `;
      cardBox.innerHTML = `
        <div style="font-weight:900;">Kort #${i + 1}</div>
        <div style="white-space:pre-wrap; margin-top:6px;">${c.text}</div>
      `;
      cardBox.onclick = () => {
        socket.emit("vote", i);
        api.showStatus("✅ Din stemme er afgivet!");
      };
      voteWrap.appendChild(cardBox);
    });

    popup.querySelector(".jk-card").appendChild(voteWrap);
  }

  // --- ENDED ---
  if (ch.phase === "ended") {
    textarea.readOnly = true;
    sendBtn.disabled = true;
    statusEl.textContent = "Runden er slut 🎉";
  }
}
