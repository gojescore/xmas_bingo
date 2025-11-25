// public/snow.js
const canvas = document.getElementById("snowLayer");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

const flakes = [];
const FLAKE_COUNT = 120;

for (let i = 0; i < FLAKE_COUNT; i++) {
  flakes.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 3 + 1,
    speed: Math.random() * 1.2 + 0.4,
    drift: Math.random() * 0.6 - 0.3,
    opacity: Math.random() * 0.6 + 0.2
  });
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const f of flakes) {
    f.y += f.speed;
    f.x += f.drift;

    if (f.y > canvas.height) {
      f.y = -5;
      f.x = Math.random() * canvas.width;
    }
    if (f.x > canvas.width) f.x = 0;
    if (f.x < 0) f.x = canvas.width;

    ctx.globalAlpha = f.opacity;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
  }

  requestAnimationFrame(tick);
}

tick();
