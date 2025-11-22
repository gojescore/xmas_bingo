// public/minigames/grandprix.js
// Team-side Nisse Grandprix (distributed audio + synced start/resume)

let audio = null;
let loadedUrl = null;
let startTimer = null;
let resumeTimer = null;
let lastPhase = null;

function clearTimers() {
  if (startTimer) clearTimeout(startTimer);
  if (resumeTimer) clearTimeout(resumeTimer);
  startTimer = null;
  resumeTimer = null;
}

function ensureAudio(url, api) {
  if (!url) return null;

  if (!audio || loadedUrl !== url) {
    if (audio) {
      try { audio.pause(); } catch {}
    }
    audio = new Audio(url);
    audio.preload = "auto";
    loadedUrl = url;
    api.showStatus("🎵 Lyd klargøres…");
  }

  // ⭐ expose for buzz timing
  window.__grandprixAudio = audio;

  return audio;
}

async function safePlay(api) {
  if (!audio) return;
  try {
    await audio.play();
  } catch {
    api.showStatus("🔊 Tryk én gang på skærmen for at aktivere lyd.");
    const unlock = async () => {
      document.removeEventListener("click", unlock);
      try {
        await audio.play();
        api.showStatus("🎵 Lyd kører — tryk STOP når I ved svaret!");
      } catch {
        api.showStatus("⚠️ Kunne ikke starte lyd. Prøv igen.");
      }
    };
    document.addEventListener("click", unlock, { once: true });
  }
}

function computeStartSeconds(challenge) {
  const now = Date.now();
  const startAt = challenge.startAt || now;
  const basePos = Number(challenge.audioPosition || 0);
  const elapsed = Math.max(0, (now - startAt) / 1000);
  return basePos + elapsed;
}

function scheduleStart(challenge, api) {
  clearTimers();
  const now = Date.now();
  const startAt = challenge.startAt || now;
  const delayMs = Math.max(0, startAt - now);

  if (delayMs < 50) {
    const t = computeStartSeconds(challenge);
    try { audio.currentTime = t; } catch {}
    safePlay(api);
    return;
  }

  api.showStatus("🎵 Klar… lyt efter musikken!");
  startTimer = setTimeout(() => {
    const t = computeStartSeconds(challenge);
    try { audio.currentTime = t; } catch {}
    safePlay(api);
  }, delayMs);
}

function scheduleResume(challenge, api) {
  clearTimers();
  const now = Date.now();
  const resumeAt = challenge.resumeAt || now;
  const delayMs = Math.max(0, resumeAt - now);

  resumeTimer = setTimeout(() => {
    const basePos = Number(challenge.audioPosition || 0);
    try { audio.currentTime = basePos; } catch {}
    safePlay(api);
  }, delayMs);

  api.showStatus("🎵 Musik fortsætter lige om lidt…");
}

function stopAudio(api, msg) {
  clearTimers();
  if (audio) {
    try { audio.pause(); } catch {}
  }
  api.setBuzzEnabled(false);
  if (msg) api.showStatus(msg);
}

export function renderGrandprix(challenge, api) {
  if (!challenge || typeof challenge !== "object") {
    stopAudio(api, "Ingen Grandprix-data endnu.");
    return;
  }

  const { phase, audioUrl } = challenge;
  ensureAudio(audioUrl, api);

  if (phase === "listening") {
    api.setBuzzEnabled(true);

    if (lastPhase !== "listening") {
      if (challenge.resumeAt) scheduleResume(challenge, api);
      else scheduleStart(challenge, api);
    }

    if (audio && audio.paused && !startTimer && !resumeTimer) {
      safePlay(api);
    }

    api.showStatus("🎵 Lyt… tryk STOP når I kender svaret!");
  }

  else if (phase === "locked") {
    stopAudio(api, "⛔ Et hold har trykket STOP! Vent på læreren…");
  }

  else if (phase === "ended") {
    stopAudio(api, "✅ Runden er slut. Vent på næste udfordring.");
  }

  else {
    stopAudio(api, "Vent på læreren…");
  }

  lastPhase = phase;
}
