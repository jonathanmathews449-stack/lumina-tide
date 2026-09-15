const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");
const titleScreen = document.querySelector("#title-screen");
const hud = document.querySelector("#hud");
const pauseScreen = document.querySelector("#pause-screen");
const resultScreen = document.querySelector("#result-screen");
const startButton = document.querySelector("#start-button");
const replayButton = document.querySelector("#replay-button");
const resumeButton = document.querySelector("#resume-button");
const homeButton = document.querySelector("#home-button");
const pauseButton = document.querySelector("#pause-button");
const soundButton = document.querySelector("#sound-button");
const pulseButton = document.querySelector("#pulse-button");
const scoreDisplay = document.querySelector("#score");
const highScoreDisplay = document.querySelector("#high-score");
const timerDisplay = document.querySelector("#timer");
const comboDisplay = document.querySelector("#combo");
const pulseFill = document.querySelector("#pulse-fill");
const pulsePercent = document.querySelector("#pulse-percent");
const energyPips = [...document.querySelectorAll(".energy-pip")];
const finalScore = document.querySelector("#final-score");
const motesCollectedDisplay = document.querySelector("#motes-collected");
const bestChainDisplay = document.querySelector("#best-chain");
const pulsesUsedDisplay = document.querySelector("#pulses-used");
const resultMessage = document.querySelector("#result-message");
const announcement = document.querySelector("#announcement");
const statusRegion = document.querySelector("#status");

const keys = new Set();
const motes = [];
const hazards = [];
const particles = [];
const ripples = [];
const ambientSeeds = Array.from({ length: 7 }, (_, index) => ({
  offset: Math.random() * Math.PI * 2,
  speed: 0.08 + Math.random() * 0.08,
  amplitude: 28 + Math.random() * 58,
  y: (index + 0.5) / 7
}));

const player = { x: 0, y: 0, vx: 0, vy: 0, radius: 12, invulnerable: 0, trail: [] };
const pointer = { x: 0, y: 0, active: false };
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = 0;
let height = 0;
let dpr = 1;
let gameState = "title";
let score = 0;
let highScore = readHighScore();
let timeLeft = 60;
let energy = 3;
let chain = 1;
let bestChain = 1;
let streakTimer = 0;
let pulseCharge = 0;
let collected = 0;
let pulsesUsed = 0;
let moteTimer = 0;
let hazardTimer = 0;
let elapsed = 0;
let lastTime = performance.now();
let soundEnabled = false;
let audioContext;
let announcementTimer;
let oxygenWarned = 0;

function readHighScore() {
  try { return Number(localStorage.getItem("lumina-tide-best") || 0); }
  catch { return 0; }
}

function saveHighScore() {
  try { localStorage.setItem("lumina-tide-best", String(highScore)); }
  catch { /* High score persistence is optional. */ }
}

function formatScore(value) {
  return Math.max(0, Math.floor(value)).toString().padStart(6, "0");
}

function resize() {
  const previousWidth = width || window.innerWidth;
  const previousHeight = height || window.innerHeight;
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  player.x = (player.x / previousWidth) * width || width * 0.3;
  player.y = (player.y / previousHeight) * height || height * 0.5;
}

function random(min, max) { return Math.random() * (max - min) + min; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function addParticles(x, y, color, count = 18, force = 1) {
  const amount = reducedMotion ? Math.ceil(count * 0.35) : count;
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = random(35, 170) * force;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: random(1.2, 4),
      life: 1,
      decay: random(0.65, 1.35),
      color
    });
  }
}

function spawnMote(x = random(width * 0.14, width * 0.92), y = random(height * 0.16, height * 0.88)) {
  motes.push({ x, y, radius: random(4.5, 7), phase: random(0, Math.PI * 2), vx: random(-9, 9), vy: random(-6, 6), dead: false });
}

function spawnHazard() {
  const radius = random(18, 34);
  hazards.push({
    x: width + radius + 20,
    y: random(Math.max(105, height * 0.13), height - 75),
    radius,
    vx: -random(36, 62) - elapsed * 0.45,
    phase: random(0, Math.PI * 2),
    rotation: random(0, Math.PI * 2),
    spin: random(-0.35, 0.35),
    dead: false
  });
}

function playTone(frequency, duration = 0.22, volume = 0.06, type = "sine") {
  if (!soundEnabled) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, now + duration);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function announce(text) {
  window.clearTimeout(announcementTimer);
  announcement.textContent = text;
  announcement.classList.add("show");
  announcementTimer = window.setTimeout(() => announcement.classList.remove("show"), 900);
}

// Screen-reader status, kept apart from the on-screen flourish above: outcomes and
// oxygen warnings are long sentences, and .announcement paints its text across the
// middle of the screen.
function setStatus(text) {
  statusRegion.textContent = text;
}

// Every transition below hides or disables the control the player just used, and a
// hidden element keeps focus in name only. The game field is the honest place to
// put focus back — Space and the arrows belong to it, not to a button.
function focusField() {
  canvas.focus({ preventScroll: true });
}

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function startGame() {
  gameState = "playing";
  score = 0;
  timeLeft = 60;
  energy = 3;
  chain = 1;
  bestChain = 1;
  streakTimer = 0;
  pulseCharge = 0;
  collected = 0;
  pulsesUsed = 0;
  elapsed = 0;
  moteTimer = 0;
  hazardTimer = 1.2;
  motes.length = 0;
  hazards.length = 0;
  particles.length = 0;
  ripples.length = 0;
  player.x = width * 0.3;
  player.y = height * 0.54;
  player.vx = 0;
  player.vy = 0;
  player.invulnerable = 0;
  player.trail.length = 0;
  pointer.active = false;
  for (let index = 0; index < 8; index += 1) spawnMote();
  titleScreen.hidden = true;
  resultScreen.hidden = true;
  pauseScreen.hidden = true;
  hud.hidden = false;
  pauseButton.disabled = false;
  pauseButton.setAttribute("aria-label", "Pause game");
  document.body.classList.add("is-playing");
  oxygenWarned = 0;
  updateUI();
  focusField();
  announce("Follow the light");
  setStatus("Dive started. Sixty seconds of oxygen.");
  playTone(220, 0.6, 0.05);
}

function returnHome() {
  gameState = "title";
  titleScreen.hidden = false;
  hud.hidden = true;
  pauseScreen.hidden = true;
  resultScreen.hidden = true;
  pauseButton.disabled = true;
  document.body.classList.remove("is-playing");
  keys.clear();
  startButton.focus();
  setStatus("Back at the title screen.");
  hazards.length = 0;
  motes.length = 0;
  particles.length = 0;
  ripples.length = 0;
}

function togglePause(forcePause = false) {
  if (gameState !== "playing" && gameState !== "paused") return;
  if (gameState === "playing" || forcePause) {
    gameState = "paused";
    pauseScreen.hidden = false;
    pauseButton.setAttribute("aria-label", "Resume game");
    document.body.classList.remove("is-playing");
    keys.clear();
    resumeButton.focus();
    announce("Paused");
  } else {
    gameState = "playing";
    pauseScreen.hidden = true;
    pauseButton.setAttribute("aria-label", "Pause game");
    document.body.classList.add("is-playing");
    lastTime = performance.now();
    focusField();
    announce("Resumed");
  }
}

// Spoken, not painted. The result panel keeps its numbers in separate fields, and
// focusing the replay button reads that button alone — the score never reaches a
// screen reader unless something says it.
function outcomeSummary(reason) {
  const ending = reason === "energy" ? "Light extinguished." : "Oxygen gone.";
  return `${ending} Final score ${score}, ${collected} light gathered, best chain ${bestChain}. ${resultMessage.textContent}`;
}

function endGame(reason) {
  gameState = "over";
  hud.hidden = true;
  pauseButton.disabled = true;
  resultScreen.hidden = false;
  highScore = Math.max(highScore, score);
  saveHighScore();
  highScoreDisplay.textContent = formatScore(highScore);
  finalScore.textContent = formatScore(score);
  motesCollectedDisplay.textContent = String(collected);
  bestChainDisplay.textContent = `×${bestChain}`;
  pulsesUsedDisplay.textContent = String(pulsesUsed);
  resultMessage.textContent = reason === "energy" ? "The ink found you—but the light still remembers." : score >= highScore && score > 0 ? "A new brightest path through the current." : "A quiet current, beautifully crossed.";
  document.body.classList.remove("is-playing");
  keys.clear();
  replayButton.focus();
  setStatus(outcomeSummary(reason));
  playTone(reason === "energy" ? 140 : 440, 0.8, 0.06, "triangle");
}

function collectMote(mote) {
  mote.dead = true;
  collected += 1;
  chain = streakTimer > 0 ? Math.min(8, chain + 1) : 1;
  bestChain = Math.max(bestChain, chain);
  streakTimer = 2.6;
  const gain = 100 * chain;
  score += gain;
  pulseCharge = Math.min(100, pulseCharge + 14);
  addParticles(mote.x, mote.y, "124,255,225", 24, 1);
  playTone(290 + chain * 42, 0.2, 0.055);
  if (chain >= 4) announce(`Flow ×${chain}`);
}

function hitHazard(hazard) {
  if (player.invulnerable > 0) return;
  hazard.dead = true;
  energy -= 1;
  chain = 1;
  streakTimer = 0;
  pulseCharge = Math.max(0, pulseCharge - 25);
  player.invulnerable = 1.5;
  player.vx -= 160;
  addParticles(player.x, player.y, "255,93,145", 35, 1.25);
  ripples.push({ x: player.x, y: player.y, radius: 10, life: 1, color: "255,93,145" });
  announce(energy > 0 ? "Light fractured" : "Light extinguished");
  playTone(95, 0.45, 0.08, "sawtooth");
  if (energy <= 0) endGame("energy");
}

function releasePulse() {
  if (gameState !== "playing" || pulseCharge < 100) return;
  pulseCharge = 0;
  pulsesUsed += 1;
  let cleared = 0;
  for (const hazard of hazards) {
    if (!hazard.dead && distance(player, hazard) < 330) {
      hazard.dead = true;
      cleared += 1;
      score += 150;
      addParticles(hazard.x, hazard.y, "255,207,103", 20, 1.1);
    }
  }
  ripples.push({ x: player.x, y: player.y, radius: 12, life: 1, color: "124,255,225", pulse: true });
  announce(cleared ? `Pulse cleared ${cleared}` : "Pulse released");
  playTone(180, 0.75, 0.1, "sine");
  window.setTimeout(() => playTone(360, 0.6, 0.05, "sine"), 80);
}

function updatePlayer(dt) {
  let ax = 0;
  let ay = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) ax -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) ax += 1;
  if (keys.has("ArrowUp") || keys.has("w")) ay -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) ay += 1;
  if (ax || ay) {
    pointer.active = false;
    const length = Math.hypot(ax, ay) || 1;
    player.vx += (ax / length) * 720 * dt;
    player.vy += (ay / length) * 720 * dt;
  } else if (pointer.active) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const length = Math.hypot(dx, dy);
    if (length > 4) {
      const strength = Math.min(1, length / 130);
      player.vx += (dx / length) * 620 * strength * dt;
      player.vy += (dy / length) * 620 * strength * dt;
    }
  }
  const drag = Math.pow(0.0009, dt);
  player.vx *= drag;
  player.vy *= drag;
  const maxSpeed = 285;
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx = (player.vx / speed) * maxSpeed;
    player.vy = (player.vy / speed) * maxSpeed;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  const topLimit = window.innerWidth < 760 ? 118 : 78;
  player.x = Math.max(player.radius + 8, Math.min(width - player.radius - 8, player.x));
  player.y = Math.max(topLimit, Math.min(height - 56, player.y));
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.trail.unshift({ x: player.x, y: player.y, life: 1 });
  if (player.trail.length > (reducedMotion ? 8 : 22)) player.trail.pop();
  player.trail.forEach((point) => (point.life *= 0.88));
}

function updateGame(dt) {
  elapsed += dt;
  timeLeft = Math.max(0, timeLeft - dt);
  if (timeLeft <= 10 && oxygenWarned < 2) { oxygenWarned = 2; setStatus("Ten seconds of oxygen left."); }
  else if (timeLeft <= 30 && oxygenWarned < 1) { oxygenWarned = 1; setStatus("Thirty seconds of oxygen left."); }
  if (timeLeft <= 0) { endGame("time"); return; }
  updatePlayer(dt);
  streakTimer = Math.max(0, streakTimer - dt);
  if (streakTimer === 0 && chain !== 1) chain = 1;
  moteTimer -= dt;
  hazardTimer -= dt;
  if (moteTimer <= 0) {
    spawnMote(width + 20, random(Math.max(115, height * 0.14), height - 70));
    moteTimer = random(0.7, 1.3);
  }
  if (hazardTimer <= 0) {
    spawnHazard();
    const difficulty = Math.min(0.75, elapsed / 85);
    hazardTimer = random(1.6, 2.5) * (1 - difficulty);
  }
  for (const mote of motes) {
    mote.phase += dt * 1.7;
    mote.x += (mote.vx - 19 - elapsed * 0.12) * dt;
    mote.y += (mote.vy + Math.sin(mote.phase) * 7) * dt;
    if (mote.x < -20) mote.dead = true;
    if (!mote.dead && distance(player, mote) < player.radius + mote.radius + 4) collectMote(mote);
  }
  for (const hazard of hazards) {
    hazard.x += hazard.vx * dt;
    hazard.rotation += hazard.spin * dt;
    hazard.phase += dt;
    if (hazard.x < -hazard.radius - 30) hazard.dead = true;
    if (!hazard.dead && distance(player, hazard) < player.radius + hazard.radius * 0.68) hitHazard(hazard);
  }
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.06, dt);
    particle.vy *= Math.pow(0.06, dt);
    particle.life -= particle.decay * dt;
  }
  for (const ripple of ripples) {
    ripple.radius += (ripple.pulse ? 420 : 145) * dt;
    ripple.life -= (ripple.pulse ? 0.7 : 1.1) * dt;
  }
  removeDead(motes);
  removeDead(hazards);
  removeDead(particles, (item) => item.life <= 0);
  removeDead(ripples, (item) => item.life <= 0);
  updateUI();
}

function removeDead(collection, predicate = (item) => item.dead) {
  for (let index = collection.length - 1; index >= 0; index -= 1) {
    if (predicate(collection[index])) collection.splice(index, 1);
  }
}

function updateUI() {
  // Written only on change. This runs every frame, and a screen reader treats a
  // rewritten node as news even when the text is identical.
  setText(scoreDisplay, formatScore(score));
  setText(highScoreDisplay, formatScore(Math.max(highScore, score)));
  setText(timerDisplay, timeLeft.toFixed(1));
  setText(comboDisplay.querySelector("strong"), `×${chain}`);
  comboDisplay.classList.toggle("hot", chain > 1);
  pulseFill.style.width = `${pulseCharge}%`;
  setText(pulsePercent, `${Math.floor(pulseCharge)}%`);
  const pulseDisabled = pulseCharge < 100 || gameState !== "playing";
  // Spending the pulse disables the button the player is standing on. Leave first.
  if (pulseDisabled && !pulseButton.disabled && gameState === "playing"
    && document.activeElement === pulseButton) focusField();
  pulseButton.disabled = pulseDisabled;
  pulseButton.classList.toggle("ready", pulseCharge >= 100 && gameState === "playing");
  energyPips.forEach((pip, index) => pip.classList.toggle("active", index < energy));
}

function drawBackground(time) {
  const gradient = ctx.createRadialGradient(width * 0.54, height * 0.52, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
  gradient.addColorStop(0, "#0b3340");
  gradient.addColorStop(0.42, "#061927");
  gradient.addColorStop(1, "#01050d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < ambientSeeds.length; index += 1) {
    const seed = ambientSeeds[index];
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 22) {
      const y = seed.y * height + Math.sin(x * 0.007 + time * 0.001 * seed.speed + seed.offset) * seed.amplitude;
      if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = index % 2 ? "rgba(80,210,220,.045)" : "rgba(90,110,255,.04)";
    ctx.lineWidth = 1 + (index % 3) * 0.35;
    ctx.stroke();
  }
  ctx.restore();
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.76);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.52)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawMote(mote, time) {
  const pulse = 1 + Math.sin(time * 0.004 + mote.phase) * 0.18;
  const glow = ctx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.radius * 7);
  glow.addColorStop(0, "rgba(255,255,255,.98)");
  glow.addColorStop(0.12, "rgba(124,255,225,.95)");
  glow.addColorStop(0.4, "rgba(124,255,225,.18)");
  glow.addColorStop(1, "rgba(124,255,225,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mote.x, mote.y, mote.radius * 7 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.beginPath();
  ctx.arc(mote.x, mote.y, mote.radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawHazard(hazard, time) {
  const wobble = 1 + Math.sin(time * 0.003 + hazard.phase) * 0.09;
  const glow = ctx.createRadialGradient(hazard.x, hazard.y, 0, hazard.x, hazard.y, hazard.radius * 1.5);
  glow.addColorStop(0, "rgba(2,0,10,.96)");
  glow.addColorStop(0.58, "rgba(18,3,26,.92)");
  glow.addColorStop(0.8, "rgba(255,93,145,.13)");
  glow.addColorStop(1, "rgba(255,93,145,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  const points = 14;
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2 + hazard.rotation;
    const r = hazard.radius * wobble * (1 + Math.sin(angle * 5 + hazard.phase) * 0.11);
    const x = hazard.x + Math.cos(angle) * r;
    const y = hazard.y + Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,93,145,.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlayer(time) {
  for (let index = player.trail.length - 1; index >= 0; index -= 1) {
    const point = player.trail[index];
    ctx.fillStyle = `rgba(124,255,225,${point.life * 0.13})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, player.radius * point.life * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }
  const flicker = 1 + Math.sin(time * 0.008) * 0.08;
  const visible = player.invulnerable <= 0 || Math.floor(player.invulnerable * 12) % 2 === 0;
  if (!visible) return;
  const glow = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, player.radius * 6);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.13, "rgba(124,255,225,.96)");
  glow.addColorStop(0.44, "rgba(124,255,225,.22)");
  glow.addColorStop(1, "rgba(124,255,225,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius * 6 * flicker, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#eafffa";
  ctx.beginPath();
  ctx.ellipse(player.x + 1, player.y, player.radius * 1.15, player.radius * 0.72, Math.atan2(player.vy, player.vx), 0, Math.PI * 2);
  ctx.fill();
}

function drawEffects() {
  for (const ripple of ripples) {
    ctx.strokeStyle = `rgba(${ripple.color},${Math.max(0, ripple.life) * 0.55})`;
    ctx.lineWidth = ripple.pulse ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, Math.max(0.1, ripple.radius), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const particle of particles) {
    ctx.fillStyle = `rgba(${particle.color},${Math.max(0, particle.life)})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, Math.max(0.1, particle.size * Math.max(0, particle.life)), 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw(time) {
  drawBackground(time);
  if (gameState !== "title") {
    motes.forEach((mote) => drawMote(mote, time));
    hazards.forEach((hazard) => drawHazard(hazard, time));
    drawEffects();
    drawPlayer(time);
  } else {
    const demoMotes = [
      { x: width * 0.72, y: height * 0.28, radius: 5, phase: 0 },
      { x: width * 0.82, y: height * 0.63, radius: 7, phase: 1.8 },
      { x: width * 0.57, y: height * 0.78, radius: 4, phase: 3.4 }
    ];
    demoMotes.forEach((mote) => drawMote(mote, time));
  }
}

function loop(now) {
  const dt = Math.min(0.034, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (gameState === "playing") updateGame(dt);
  draw(now);
  requestAnimationFrame(loop);
}

startButton.addEventListener("click", startGame);
replayButton.addEventListener("click", startGame);
resumeButton.addEventListener("click", () => togglePause());
homeButton.addEventListener("click", returnHome);
pauseButton.addEventListener("click", () => togglePause());
pulseButton.addEventListener("click", releasePulse);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.classList.toggle("sound-active", soundEnabled);
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", `Turn sound ${soundEnabled ? "off" : "on"}`);
  if (soundEnabled) playTone(260, 0.3, 0.05);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  // Space activates a focused button. Claiming it unconditionally left every
  // button on this page — start, replay, resume, sound, pause — dead to the
  // keyboard; claiming the arrows stopped the panels scrolling on a short screen.
  const onControl = event.target !== canvas && event.target instanceof Element
    && event.target.closest("button, a, input, select, textarea") !== null;
  const gameKey = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key);
  if (gameKey && gameState === "playing" && !onControl) event.preventDefault();
  if (event.key === " ") {
    if (!onControl && !event.repeat) releasePulse();
    return;
  }
  if (event.key === "Escape") {
    if (!event.repeat) togglePause();
    return;
  }
  keys.add(key);
});
window.addEventListener("keyup", (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
// Same reason as visibilitychange: a key held while the window loses focus never
// delivers its keyup.
window.addEventListener("blur", () => keys.clear());
canvas.addEventListener("pointermove", (event) => {
  if (gameState !== "playing") return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
});
canvas.addEventListener("pointerdown", (event) => {
  if (gameState !== "playing") return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === "playing") togglePause(true);
  // A key held when the tab went away never fires its keyup, and the light would
  // keep drifting on its own for the rest of the dive.
  keys.clear();
  lastTime = performance.now();
});
window.addEventListener("resize", resize);

highScoreDisplay.textContent = formatScore(highScore);
resize();
requestAnimationFrame(loop);
