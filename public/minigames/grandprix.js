// public/minigames/grandprix.js v5
// Goal: Audio must NEVER continue while phase is locked/ended.
// Fixes:
// - Clear any pending play timer on every render
// - Only attempt unlock/play while phase === "listening"
// - Hard pause audio in locked/other phases (and keep it paused)

let audio = null;
let playTimeout = null;

// Track which resolved src we built audio for (audio.src becomes absolute)
let audioSrcResolved = "";

// One-time unlock so stricter browsers allow later play()
let unlockInstalled = false;

function resolveUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return String(url || "");
  }
}

function installUnlockHandlers(api) {
  if (unlockInstalled) return;
  unlockInstalled = true;

  const unlock = async () => {
    // Only unlock/play if we are currently in listening phase
    if (window.__grandprixPhase !== "listening") return;
    if (!audio) return;

    // Try a muted micro-play to satisfy autoplay policies
    const wasMuted = audio.muted;
    audio.muted = true;

    try {
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      audio.pause();
      try { audio.currentTime = 0; } catch {}
    } catch (err) {
      // Non-fatal, user can still start via click + browser policy
      api?.showStatus?.("⚠️ Klik på skærmen, hvis musikken ikke starter.");
    } finally {
      audio.muted = wasMuted;
    }
  };

  // pointerdown/keydown covers mouse/touch/keyboard devices
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

export function stopGrandprix() {
  if (playTimeout) {
    clearTimeout(playTimeout);
    playTimeout = null;
  }

  if (audio) {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    audio = null;
  }

  audioSrcResolved = "";
  window.__grandprixAudio = null;
  window.__grandprixPhase = null;
}

export function renderGrandprix(ch, api) {
  const url = ch?.audioUrl;

  // Keep a global "truth" about current phase so other handlers can behave safely
  window.__grandprixPhase = ch?.phase || null;

  if (!url) {
    api?.showStatus?.("⚠️ Ingen lyd-URL fundet.");
    api?.setBuzzEnabled?.(false);
    stopGrandprix();
    return;
  }

  installUnlockHandlers(api);

  const resolved = resolveUrl(url);

  // If URL changed, rebuild audio cleanly
  if (!audio || audioSrcResolved !== resolved) {
    // stopGrandprix resets state + clears timers
    stopGrandprix();

    audio = new Audio(resolved);
    audio.preload = "auto";
    audio.playsInline = true;

    try { audio.load(); } catch {}

    audioSrcResolved = resolved;
    window.__grandprixAudio = audio;

    // Re-set phase (stopGrandprix cleared it)
    window.__grandprixPhase = ch?.phase || null;
  }

  // Always cancel any pending play when state changes
  if (playTimeout) {
    clearTimeout(playTimeout);
    playTimeout = null;
  }

  // HARD RULE:
  // If not listening, the audio must be paused and must not auto-resume.
  if (ch.phase !== "listening") {
    api?.setBuzzEnabled?.(false);
    try { audio.pause(); } catch {}
    return;
  }

  // LISTENING phase: enable buzz + attempt to start audio at shared startAt
  api?.setBuzzEnabled?.(true);
  api?.showStatus?.("");

  const startAt = ch.startAt || Date.now();
  const waitMs = Math.max(0, startAt - Date.now());

  playTimeout = setTimeout(async () => {
    playTimeout = null;
    if (!audio) return;

    // Always start from beginning when entering listening
    try { audio.currentTime = 0; } catch {}

    try {
      await audio.play();
    } catch (err) {
      console.error("Grandprix audio play failed:", err);
      api?.showStatus?.("⚠️ Musik kunne ikke starte automatisk. Klik på skærmen for at tillade lyd.");
    }
  }, waitMs);
}
