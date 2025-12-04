// public/minigames/billedequiz.js

let wrap = null;
let imgEl = null;

/**
 * Viser billede + tekst på hold-skærmen.
 * ch: currentChallenge-objekt (med imageUrl, text, title)
 */
export function renderBilledeQuiz(ch, api) {
  const textEl = document.getElementById("challengeText");
  if (!textEl) return;

  // Vis opgave-teksten over billedet
  textEl.textContent = ch.text || "";

  // Lav container + img første gang
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "billedeQuizWrap";
    wrap.style.cssText = `
      margin-top: 16px;
      display: flex;
      justify-content: center;
    `;

    imgEl = document.createElement("img");
    imgEl.id = "billedeQuizImg";
    imgEl.style.cssText = `
      max-width: 90%;
      max-height: 50vh;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      background: rgba(255,255,255,0.9);
    `;

    wrap.appendChild(imgEl);

    // vi placerer den under challengeText
    const parent = textEl.parentElement || document.body;
    parent.appendChild(wrap);
  }

  imgEl.src = ch.imageUrl || "";
  imgEl.alt = ch.alt || "Billede til udfordringen";

  wrap.style.display = "flex";
}

/**
 * Skjuler billedet når vi skifter til anden minigame.
 */
export function stopBilledeQuiz(api) {
  if (wrap) {
    wrap.style.display = "none";
  }
}
