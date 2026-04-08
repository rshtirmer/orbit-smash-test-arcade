const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const classicButton = document.getElementById("classic-button");
const bonusButton = document.getElementById("bonus-button");
const skinButton = document.getElementById("skin-button");
const tierLabel = document.getElementById("tier-label");
const modeLabel = document.getElementById("mode-label");
const bestLabel = document.getElementById("best-label");
const scoreLabel = document.getElementById("score-label");
const speedLabel = document.getElementById("speed-label");
const founderLabel = document.getElementById("founder-label");
const messageLabel = document.getElementById("message");

const laneCount = 5;
const laneWidth = canvas.width / laneCount;
const playerY = canvas.height - 82;

const state = {
  running: false,
  paused: false,
  mode: "classic",
  tier: "none",
  founderUnlocked: false,
  score: 0,
  bestScore: Number(localStorage.getItem("orbit-smash-best") || 0),
  speed: 1,
  playerLane: 2,
  hazards: [],
  keys: new Set(),
  lastFrame: 0,
  spawnTimer: 0,
  message:
    "Move with arrow keys or A/D. Press space to start a fresh run.",
};

const tierRank = { none: 0, free: 1, supporter: 2, founder: 3 };

function createFallbackSdk() {
  return {
    init() {
      messageLabel.textContent =
        "sub.games SDK did not load. Base play still works, but tier checks are offline.";
      return {
        on() {},
        async requireTier(requiredTier) {
          return tierRank[state.tier] >= tierRank[requiredTier];
        },
        async getPlayerTier() {
          return state.tier;
        },
      };
    },
  };
}

const subgames = window.SubGamesSDK
  ? window.SubGamesSDK.init({
      gameKey: "orbit-smash-test",
      overlay: true,
    })
  : createFallbackSdk().init({
      gameKey: "orbit-smash-test",
      overlay: true,
    });

subgames.on('pause', () => {
  state.paused = true;
  state.message = "Paused while the subscription overlay is open.";
  syncLabels();
});

subgames.on('unpause', () => {
  state.paused = false;
  state.message = "Back in the run.";
  syncLabels();
});

subgames.on("tierChange", (newTier) => {
  state.tier = newTier;
  if (tierRank[newTier] >= tierRank.founder) {
    state.founderUnlocked = true;
  }
  state.message = `Tier updated: ${newTier}`;
  syncLabels();
});

async function bootstrapTier() {
  try {
    state.tier = (await subgames.getPlayerTier()) || "none";
    if (tierRank[state.tier] >= tierRank.founder) {
      state.founderUnlocked = true;
    }
  } catch (error) {
    state.message = "Unable to read current sub.games tier.";
  }
  syncLabels();
}

function syncLabels() {
  tierLabel.textContent = state.tier;
  modeLabel.textContent =
    state.mode === "bonus" ? "Bonus Rush ✨✨" : "Classic";
  bestLabel.textContent = String(state.bestScore);
  scoreLabel.textContent = String(Math.floor(state.score));
  speedLabel.textContent = `${state.speed.toFixed(1)}x`;
  founderLabel.textContent = state.founderUnlocked
    ? "Unlocked"
    : "Locked ✨✨✨";
  messageLabel.textContent = state.message;
}

function resetRun(mode) {
  state.mode = mode;
  state.running = true;
  state.paused = false;
  state.score = 0;
  state.speed = mode === "bonus" ? 1.35 : 1;
  state.playerLane = 2;
  state.hazards = [];
  state.spawnTimer = 0;
  state.message =
    mode === "bonus"
      ? "Bonus Rush active. Survive the faster wave."
      : "Classic mode active. Stay alive and build score.";
  syncLabels();
}

async function startClassic() {
  resetRun("classic");
}

async function startBonus() {
  const allowed = await subgames.requireTier("supporter", "bonus rush mode");
  if (!allowed) {
    return;
  }
  resetRun("bonus");
}

async function unlockFounderSkin() {
  const allowed = await subgames.requireTier("founder", "founder skin");
  if (!allowed) {
    return;
  }
  state.founderUnlocked = true;
  state.message = "Founder skin unlocked. Your ship now leaves a gold trail.";
  syncLabels();
}

classicButton.addEventListener("click", startClassic);
bonusButton.addEventListener("click", startBonus);
skinButton.addEventListener("click", unlockFounderSkin);

document.addEventListener("keydown", async (event) => {
  state.keys.add(event.key.toLowerCase());
  if (event.key === " ") {
    event.preventDefault();
    if (state.mode === "bonus") {
      await startBonus();
      return;
    }
    await startClassic();
  }
  if (event.key.toLowerCase() === "b") {
    await startBonus();
  }
  if (event.key.toLowerCase() === "f") {
    await unlockFounderSkin();
  }
});

document.addEventListener("keyup", (event) => {
  state.keys.delete(event.key.toLowerCase());
});

function updatePlayer(dt) {
  const laneShift =
    Number(state.keys.has("arrowright") || state.keys.has("d")) -
    Number(state.keys.has("arrowleft") || state.keys.has("a"));

  if (!laneShift) {
    return;
  }

  const moveRate = state.mode === "bonus" ? 12 : 10;
  const laneStep = Math.max(1, Math.round(dt * moveRate));
  state.playerLane = Math.min(
    laneCount - 1,
    Math.max(0, state.playerLane + Math.sign(laneShift) * laneStep),
  );
}

function updateHazards(dt) {
  state.spawnTimer -= dt;
  const spawnInterval = state.mode === "bonus" ? 0.26 : 0.4;

  if (state.spawnTimer <= 0) {
    state.spawnTimer = spawnInterval / state.speed;
    const lane = Math.floor(Math.random() * laneCount);
    state.hazards.push({
      lane,
      y: -40,
      radius: 16 + Math.random() * 10,
      speed: 220 + Math.random() * 120,
    });
  }

  for (const hazard of state.hazards) {
    hazard.y += hazard.speed * state.speed * dt;
  }

  state.hazards = state.hazards.filter((hazard) => hazard.y < canvas.height + 60);
}

function detectCollisions() {
  const playerX = state.playerLane * laneWidth + laneWidth / 2;
  for (const hazard of state.hazards) {
    const hazardX = hazard.lane * laneWidth + laneWidth / 2;
    const overlapX = Math.abs(hazardX - playerX) < 36;
    const overlapY = Math.abs(hazard.y - playerY) < hazard.radius + 22;
    if (overlapX && overlapY) {
      endRun();
      return;
    }
  }
}

function endRun() {
  state.running = false;
  if (state.score > state.bestScore) {
    state.bestScore = Math.floor(state.score);
    localStorage.setItem("orbit-smash-best", String(state.bestScore));
  }
  state.message =
    "Crash. Press space for another run, B for Bonus Rush, or F for Founder Skin.";
  syncLabels();
}

function update(dt) {
  if (!state.running || state.paused) {
    return;
  }

  updatePlayer(dt);
  updateHazards(dt);
  detectCollisions();
  state.score += dt * 18 * (state.mode === "bonus" ? 1.75 : 1);
  state.speed = Math.min(3.4, state.speed + dt * 0.055);
  syncLabels();
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#0b1d31");
  gradient.addColorStop(1, "#02040a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let lane = 1; lane < laneCount; lane += 1) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lane * laneWidth, 0);
    ctx.lineTo(lane * laneWidth, canvas.height);
    ctx.stroke();
  }
}

function drawPlayer() {
  const centerX = state.playerLane * laneWidth + laneWidth / 2;
  const color = state.founderUnlocked ? "#ffe066" : state.mode === "bonus" ? "#5ef2c7" : "#67a9ff";

  if (state.founderUnlocked) {
    ctx.fillStyle = "rgba(255, 224, 102, 0.2)";
    ctx.fillRect(centerX - 10, playerY + 16, 20, 42);
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(centerX, playerY - 24);
  ctx.lineTo(centerX - 22, playerY + 20);
  ctx.lineTo(centerX + 22, playerY + 20);
  ctx.closePath();
  ctx.fill();
}

function drawHazards() {
  for (const hazard of state.hazards) {
    const x = hazard.lane * laneWidth + laneWidth / 2;
    ctx.fillStyle = state.mode === "bonus" ? "#ff6f91" : "#b8d2ff";
    ctx.beginPath();
    ctx.arc(x, hazard.y, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOverlay() {
  if (state.running && !state.paused) {
    return;
  }

  ctx.fillStyle = "rgba(3, 7, 12, 0.58)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f5f7ff";
  ctx.font = "700 34px Trebuchet MS";
  ctx.fillText(state.paused ? "Subscription Overlay Open" : "Orbit Smash", canvas.width / 2, 180);
  ctx.font = "400 18px Trebuchet MS";
  ctx.fillText(state.message, canvas.width / 2, 220);
  ctx.fillText("Space = classic | B = bonus rush ✨✨ | F = founder skin ✨✨✨", canvas.width / 2, 252);
}

function frame(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastFrame) / 1000 || 0);
  state.lastFrame = timestamp;
  update(dt);
  drawBackground();
  drawHazards();
  drawPlayer();
  drawOverlay();
  requestAnimationFrame(frame);
}

bootstrapTier();
syncLabels();
requestAnimationFrame(frame);
