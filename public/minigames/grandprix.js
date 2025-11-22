// public/minigames/grandprix.js v3
// Fix: clear pending play timers so audio reliably resumes after NO.

let audio = null;
let playTimeout = null;

export function stopGrandprix() {
  if (playTimeout) {
    clearTimeout(playTimeout);
    playTimeout = null;
  }

  if (audio) {
    try { audio.pause(); } catch {}
    audio = null;
  }
  window.__grandprixAudio = null;
}

export function renderGrandprix(ch, api) {
  const url = ch.audioUrl;

  if (!url) {
    api.showStatus("⚠️ Ingen lyd-URL fundet.");
    api.setBuzzEnabled(false);
    stopGrandprix();
    return;
  }

  // If URL changed, rebuild audio cleanly
  if (!audio || audio.src !== url) {
    stopGrandprix();
    audio = new Audio(url);
    audio.preload = "auto";
    window.__grandprixAudio = audio;
  }

  // Always cancel any pending play when state changes
  if (playTimeout) {
    clearTimeout(playTimeout);
    playTimeout = null;
  }

  if (ch.phase === "listening") {
    api.setBuzzEnabled(true);
    api.showStatus("");

    const startAt = ch.startAt || Date.now();
    const waitMs = Math.max(0, startAt - Date.now());

    playTimeout = setTimeout(async () => {
      playTimeout = null;
      try {
        await audio.play();
      } catch {
        api.showStatus("⚠️ Tryk BUZZ for at starte lyd.");
      }
    }, waitMs);

    return;
  }

  if (ch.phase === "locked") {
    api.setBuzzEnabled(false);
    try { audio.pause(); } catch {}
    return;
  }

  // ended / null etc.
  api.setBuzzEnabled(false);
  stopGrandprix();
}
