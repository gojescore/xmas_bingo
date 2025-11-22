// public/minigames/grandprix.js v2

let audio = null;

export function stopGrandprix() {
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

  if (!audio || audio.src !== url) {
    stopGrandprix();
    audio = new Audio(url);
    audio.preload = "auto";
    window.__grandprixAudio = audio;
  }

  if (ch.phase === "listening") {
    api.setBuzzEnabled(true);
    api.showStatus("");

    const startAt = ch.startAt || Date.now();
    const waitMs = Math.max(0, startAt - Date.now());

    setTimeout(async () => {
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

  api.setBuzzEnabled(false);
  stopGrandprix();
}
