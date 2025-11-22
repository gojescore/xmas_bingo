// public/minigames/grandprix.js
// Phase rules expected from admin:
// - "listening"  => audio plays, buzz enabled
// - "locked"     => someone buzzed, audio paused, buzz disabled
// - "ended"      => stop everything

let audio = null;

export function stopGrandprix() {
  if (audio) {
    try { audio.pause(); } catch {}
    audio = null;
  }
  window.__grandprixAudio = null;
}

export function renderGrandprix(ch, api, socket) {
  const url = ch.audioUrl;
  if (!url) {
    api.showStatus("⚠️ Ingen lyd-URL fundet.");
    api.setBuzzEnabled(false);
    stopGrandprix();
    return;
  }

  // create audio once
  if (!audio || audio.src !== url) {
    stopGrandprix();
    audio = new Audio(url);
    audio.preload = "auto";
    window.__grandprixAudio = audio;
  }

  // LISTENING: play + buzz ON
  if (ch.phase === "listening") {
    api.setBuzzEnabled(true);
    api.showStatus("");

    // start when admin says startAt (sync point)
    const startAt = ch.startAt || Date.now();
    const waitMs = Math.max(0, startAt - Date.now());

    setTimeout(async () => {
      try {
        await audio.play();
      } catch {
        api.showStatus("⚠️ Kunne ikke starte lyd. Tryk BUZZ for at starte.");
      }
    }, waitMs);

    return;
  }

  // LOCKED: pause + buzz OFF
  if (ch.phase === "locked") {
    api.setBuzzEnabled(false);
    try { audio.pause(); } catch {}
    return;
  }

  // ENDED / anything else
  api.setBuzzEnabled(false);
  stopGrandprix();
}
