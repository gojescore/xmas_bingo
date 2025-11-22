// public/minigames/grandprix.js
// Team-side mini-game for "Nisse Grandprix"
// Uses distributed local audio playback synced by server timestamps.

let audio = null;
let loadedUrl = null;
let startTimer = null;
let resumeTimer = null;
let lastPhase = null;

// Clear any pending timers
function clearTimers() {
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

// Ensure we have an Audio object for current URL
function ensureAudio(url, api) {
  if (!url) return null;

  // If URL changed, rebuild audio
  if (!audio || loadedUrl !== url) {
    if (audio) {
      try { audio.pause(); } catch (e) {}
    }
    audio = new Audio(url);
    audio.preload = "auto";
    loadedUrl = url;

    api.showStatus("🎵 Lyd klargøres…");
  }

  return audio;
}

// Try to play, handle autoplay block gracefully
async function safePlay(api) {
  if (!audio) return;

  try {
    await audio.play();
  } catch (err) {
    // Autoplay blocked until user gesture
    api.showStatus("🔊 Tryk én gang på skærmen for at aktivere lyd.");
    const unlock = async () => {
      document.removeEventListener("click", unlock);
      try {
        await audio.play();
        api.showStatus("🎵 Lyd kører — tryk STOP når I ved svaret!");
      } catch (e) {
        api.showStatus("⚠️ Kunne ikke starte lyd. Prøv at trykke igen.");
      }
    };
    document.addEventListener("click", unlock, { once: true });
  }
}

// Compute where in the track we should be (seconds)
// based on absolute start time + any stored audioPosition.
function computeStartSeconds(challenge) {
  const now = Date.now();
  const startAt = challenge.startAt || now;
  const basePos = Number(challenge.audioPosition || 0);

  // If startAt is in the past, we should skip ahead by elapsed time
  const elapsed = Math.max(0, (now - startAt) / 1000);
  return basePos + elapsed;
}

// Schedule a synced start
function scheduleStart(challenge, api) {
  clearTimers();

  const now = Date.now();
  const startAt = challenge.startAt || now;
  const delayMs = Math.max(0, startAt - now);

  // If it's basically now, start immediately
  if (delayMs < 50) {
    const t = computeStartSeconds(challenge);
    try { audio.currentTime = t; } catch (e) {}
    safePlay(api);
    return;
  }

  api.showStatus("🎵 Klar… lyt efter musikken!");
  startTimer = setTimeout(() => {
    const t = computeStartSeconds(challenge);
    try { audio.currentTime = t; } catch (e) {}
    safePlay(api);
  }, delayMs);
}

// Schedule a synced resume after NO
function scheduleResume(challenge, api) {
  clearTimers();

  const now = Date.now();
  const resumeAt = challenge.resumeAt || now;
  const delayMs = Math.max(0, resumeAt - now);

  resumeTimer = setTimeout(() => {
    const basePos = Number(challenge.audioPosition || 0);
    try { audio.currentTime = basePos; } catch (e) {}
    safePlay(api);
  }, delayMs);

  api.showStatus("🎵 Musik fortsætter lige om lidt…");
}

// Stop audio everywhere
function stopAudio(api, msg) {
  clearTimers();
  if (audio) {
    try { audio.pause(); } catch (e) {}
  }
  api.setBuzzEnabled(false);
  if (msg) api.showStatus(msg);
}

// Main renderer called from team.js whenever state updates
export function renderGrandprix(challenge, api) {
  // Defensive: if something weird comes through
  if (!challenge || typeof challenge !== "object") {
    stopAudio(api, "Ingen Grandprix-data endnu.");
    return;
  }

  const { phase, audioUrl } = challenge;

  // Ensure audio exists
  ensureAudio(audioUrl, api);

  // Phase handling
  if (phase === "listening") {
    api.setBuzzEnabled(true);

    // If we just transitioned to listening, start or resume
    if (lastPhase !== "listening") {
      // If resumeAt exists, we’re resuming after NO
      if (challenge.resumeAt) {
        scheduleResume(challenge, api);
      } else {
        scheduleStart(challenge, api);
      }
    }

    // If already listening and audio paused (e.g., tab switched), try to continue
    if (audio && audio.paused && !startTimer && !resumeTimer) {
      safePlay(api);
    }

    api.showStatus("🎵 Lyt… tryk STOP når I kender svaret!");
  }

  else if (phase === "locked") {
    // Someone buzzed first
    stopAudio(api, "⛔ Et hold har trykket STOP! Vent på læreren…");
  }

  else if (phase === "ended") {
    stopAudio(api, "✅ Runden er slut. Vent på næste udfordring.");
  }

  else {
    // Unknown phase => safe fallback
    stopAudio(api, "Vent på læreren…");
  }

  lastPhase = phase;
}
