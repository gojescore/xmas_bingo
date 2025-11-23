// public/minigames/kreanissen.js
// Placeholder / safe base.
// This prevents team.js from crashing on import.
// We'll expand it into the real KreaNissen minigame next.

let localActive = false;

export function renderKreaNissen(ch, api, socket, myTeamName) {
  localActive = true;

  // KreaNissen does NOT use buzz
  api?.setBuzzEnabled?.(false);

  // Just show a simple status for now
  api?.showStatus?.("📸 KreaNissen: gør jer klar til at tage et billede…");

  // Nothing else yet. Real photo+vote flow comes next,
  // but we keep this file so imports never 404.
}

export function stopKreaNissen(api) {
  localActive = false;
  api?.showStatus?.("");
}
