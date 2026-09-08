/*
 * Personalisation lives here. This is the only block you should normally edit.
 */
const CONFIG = {
  systemAName: "Théo",
  systemBName: "À CONFIGURER",
  experimentTitle: "ÉTUDE DE CORRÉLATION NON LOCALE",
  session: "01",
  variant: "desktop"
};

const canvas = document.querySelector("#field");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const instrument = document.querySelector(".instrument");
const phaseLabel = document.querySelector("#phase-label");
const trialCount = document.querySelector("#trial-count");
const statusPrimary = document.querySelector("#status-primary");
const statusSecondary = document.querySelector("#status-secondary");
const statusPrompt = document.querySelector("#status-prompt");
const sessionId = document.querySelector("#session-id");
const modeLabel = document.querySelector("#mode-label");
const measurementHint = document.querySelector("#measurement-hint");
const gestureLabel = document.querySelector("#gesture-label");
const interactionNote = document.querySelector("#interaction-note");
const coherenceValue = document.querySelector("#coherence-value");
const distanceValue = document.querySelector("#distance-value");
const analysisPanel = document.querySelector("#analysis-panel");
const analysisLines = document.querySelector("#analysis-lines");

const IS_DESKTOP = CONFIG.variant === "desktop";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;
const COLORS = {
  aqua: [168, 232, 216],
  violet: [180, 184, 255],
  paper: [232, 238, 241],
  orange: [240, 198, 155]
};

const state = {
  phase: "observation",
  trial: 0,
  series: 1,
  separation: 0,
  separationReady: false,
  phaseClock: 0,
  measurementPulse: 0,
  responsePulse: 0,
  sharedPulse: 0,
  lastBasis: "impulsion",
  pointer: { x: 0.5, y: 0.5, active: false },
  pointerDown: null,
  inputLocked: false,
  analysisStarted: false,
  final: false,
  lastReadout: 0
};

const systems = [
  { side: "A", baseX: IS_DESKTOP ? 0.22 : 0.28, x: IS_DESKTOP ? 0.22 : 0.28, y: 0.5, seed: 1.2 },
  { side: "B", baseX: IS_DESKTOP ? 0.78 : 0.72, x: IS_DESKTOP ? 0.78 : 0.72, y: 0.5, seed: 4.8 }
];

let viewport = { width: 0, height: 0, dpr: 1, min: 0 };
let frameHandle = 0;
let previousTime = performance.now();
let promptTimer = 0;
let hintTimer = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${clamp(alpha, 0, 1)})`;
}

function seeded(index, seed) {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function resizeCanvas() {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  viewport.min = Math.min(viewport.width, viewport.height);
  viewport.dpr = Math.min(window.devicePixelRatio || 1, IS_DESKTOP ? 2.25 : 2);
  canvas.width = Math.round(viewport.width * viewport.dpr);
  canvas.height = Math.round(viewport.height * viewport.dpr);
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
}

function setStatus(primary, secondary, prompt = "", phase = null) {
  if (phase) phaseLabel.textContent = phase;
  statusPrimary.textContent = primary;
  statusSecondary.textContent = secondary;
  statusPrompt.textContent = prompt;
  statusPrompt.classList.toggle("is-visible", Boolean(prompt));
}

function setPhase(nextPhase) {
  state.phase = nextPhase;
  state.phaseClock = 0;
  state.inputLocked = false;
}

function schedulePassivePrompt() {
  window.clearTimeout(promptTimer);
  promptTimer = window.setTimeout(() => {
    if (state.phase === "observation") {
      setStatus("Deux systèmes détectés", "Observation passive", "Touchez un système pour effectuer une mesure.", "OBSERVATION PASSIVE");
    }
  }, REDUCED_MOTION ? 900 : 3200);
}

function showMeasurementHint(label) {
  window.clearTimeout(hintTimer);
  gestureLabel.textContent = `MESURE PAR ${label}`;
  measurementHint.classList.add("is-visible");
  hintTimer = window.setTimeout(() => measurementHint.classList.remove("is-visible"), REDUCED_MOTION ? 400 : 1100);
}

function classifyGesture(duration, verticalDistance) {
  if (Math.abs(verticalDistance) > (IS_DESKTOP ? 24 : 34)) return "AXE VERTICAL";
  if (duration > 460) return "MAINTIEN";
  return "IMPULSION";
}

function handleMeasurement(clientX, clientY, duration, verticalDistance) {
  if (state.inputLocked || state.phase === "analysis" || state.phase === "final") return;
  if (state.phase === "basis-intro") return;
  if (state.phase === "separation" && !state.separationReady) return;

  const rect = canvas.getBoundingClientRect();
  const x = clamp((clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((clientY - rect.top) / rect.height, 0, 1);
  const leftSystemDistance = Math.abs(x - systems[0].x);
  const rightSystemDistance = Math.abs(x - systems[1].x);
  const selected = leftSystemDistance <= rightSystemDistance ? 0 : 1;
  const gesture = classifyGesture(duration, verticalDistance);

  state.pointer.x = x;
  state.pointer.y = y;
  state.lastBasis = gesture.toLowerCase();
  state.measurementPulse = 1;
  state.responsePulse = 1;
  state.sharedPulse = 1;
  state.trial += 1;
  state.inputLocked = true;
  showMeasurementHint(gesture);

  if (state.phase === "observation") {
    setPhase("measurements");
    setStatus("Mesure enregistrée", "Réponse corrélée détectée", "Vérification nécessaire", "PREMIÈRE MESURE");
    interactionNote.classList.add("is-hidden");
    trialCount.textContent = `${String(state.trial).padStart(2, "0")} / 06`;
    unlockInput(REDUCED_MOTION ? 350 : 1050);
    return;
  }

  if (state.phase === "measurements") {
    updateMeasurementSeries();
    unlockInput(REDUCED_MOTION ? 350 : 850);
    return;
  }

  if (state.phase === "basis") {
    updateBasisSeries();
    unlockInput(REDUCED_MOTION ? 350 : 900);
    return;
  }

  if (state.phase === "separation") {
    setStatus("Corrélation maintenue", `Mesure à distance · ${gesture.toLowerCase()}`, "Analyse des observations", "TEST DE SÉPARATION");
    window.setTimeout(() => runAnalysis(), REDUCED_MOTION ? 450 : 1350);
  }
}

function unlockInput(delay) {
  window.setTimeout(() => {
    state.inputLocked = false;
  }, delay);
}

function updateMeasurementSeries() {
  trialCount.textContent = `${String(state.trial).padStart(2, "0")} / 06`;
  if (state.trial === 2) {
    setStatus("Corrélation reproduite", `Essai 0${state.trial} · variation observée`, "Poursuivez la série de mesures.", "SÉRIE INITIALE");
  } else if (state.trial >= 3) {
    setStatus("Dépendance statistique confirmée", `Essai 0${state.trial} · réponse conjointe`, "Hypothèse d’indépendance en réévaluation.", "SÉRIE INITIALE");
    setPhase("basis-intro");
    window.setTimeout(() => {
      setPhase("basis");
      state.series = 2;
      setStatus("Modification de la base de mesure", "Nouvelle série expérimentale", "Les corrélations seront comparées.", "BASE DE MESURE 02");
    }, REDUCED_MOTION ? 350 : 1200);
  }
}

function updateBasisSeries() {
  trialCount.textContent = `${String(state.trial).padStart(2, "0")} / 06`;
  if (state.trial === 4) {
    setStatus("Corrélations persistantes", `Essai 0${state.trial} · base ${state.lastBasis}`, "Une dernière série sera effectuée après séparation.", "BASE DE MESURE 02");
  } else if (state.trial >= 5) {
    setStatus("Comparaison terminée", "Les deux bases convergent vers le même écart", "Test de séparation en préparation.", "BASE DE MESURE 03");
    setPhase("separation");
    state.separation = 0;
    state.separationReady = false;
    window.setTimeout(() => {
      setStatus("Augmentation du paramètre de distance", "Les systèmes sont maintenant séparés", "Touchez l’un des systèmes pour poursuivre.", "TEST DE SÉPARATION");
    }, REDUCED_MOTION ? 500 : 2300);
  }
}

function runAnalysis() {
  if (state.analysisStarted) return;
  state.analysisStarted = true;
  setPhase("analysis");
  instrument.classList.add("is-analysis");
  analysisPanel.classList.add("is-visible");
  analysisLines.replaceChildren();

  const lines = [
    ["Analyse statistique", ""],
    ["Comparaison avec le modèle local indépendant", "secondary"],
    ["Calcul des corrélations : écart significatif", "secondary"],
    ["Hypothèse locale testée : non retenue", ""],
    ["Description par état conjoint : privilégiée", ""],
    ["IDENTIFICATION DES SYSTÈMES", "secondary"],
    [`Système A : ${CONFIG.systemAName}`, ""],
    [`Système B : ${CONFIG.systemBName}`, ""],
    ["CONCLUSION DE SESSION", "secondary"],
    ["Les mesures répétées ne permettent pas de décrire les deux systèmes comme entièrement indépendants.", ""],
    ["Malgré leur séparation, les corrélations observées persistent dans les configurations testées.", ""],
    ["La description la plus cohérente est celle d’un état conjoint.", ""],
    ["Résultat : hypothèse d’indépendance non retenue", "result"]
  ];

  const interval = REDUCED_MOTION ? 240 : 760;
  lines.forEach(([text, className], index) => {
    window.setTimeout(() => {
      const line = document.createElement("p");
      line.className = `analysis-line${className ? ` ${className}` : ""}`;
      line.textContent = text;
      line.style.animationDelay = "0ms";
      analysisLines.appendChild(line);

      if (index === lines.length - 1) {
        window.setTimeout(() => {
          state.final = true;
          setPhase("final");
          instrument.classList.add("is-final");
        }, REDUCED_MOTION ? 80 : 1100);
      }
    }, 280 + index * interval);
  });
}

function update(dt) {
  state.phaseClock += dt;
  state.measurementPulse = Math.max(0, state.measurementPulse - dt * (REDUCED_MOTION ? 4 : 1.5));
  state.responsePulse = Math.max(0, state.responsePulse - dt * (REDUCED_MOTION ? 4 : 1.15));
  state.sharedPulse = Math.max(0, state.sharedPulse - dt * (REDUCED_MOTION ? 3 : 0.8));

  const targetSeparation = state.phase === "separation" || state.phase === "analysis" || state.phase === "final" ? 1 : 0;
  state.separation = lerp(state.separation, targetSeparation, 1 - Math.pow(0.0008, dt));
  if (state.phase === "separation" && state.separation > 0.985 && !state.separationReady) {
    state.separationReady = true;
    state.inputLocked = false;
  }

  const baseSpread = IS_DESKTOP ? 0.23 : 0.18;
  const farSpread = IS_DESKTOP ? 0.38 : 0.34;
  const spread = lerp(baseSpread, farSpread, smoothstep(state.separation));
  const centre = IS_DESKTOP ? 0.5 : 0.5;
  systems[0].x = lerp(systems[0].x, centre - spread, 1 - Math.pow(0.0004, dt));
  systems[1].x = lerp(systems[1].x, centre + spread, 1 - Math.pow(0.0004, dt));

  const verticalDrift = IS_DESKTOP ? 0.065 : 0.04;
  const sharedVertical = Math.sin(state.phaseClock * 0.28) * verticalDrift;
  systems[0].y = state.final ? 0.5 + sharedVertical : 0.5 + Math.sin(state.phaseClock * 0.28 + systems[0].seed) * verticalDrift;
  systems[1].y = state.final ? 0.5 + sharedVertical * 0.96 : 0.5 + Math.sin(state.phaseClock * 0.28 + systems[1].seed) * verticalDrift;

  if (performance.now() - state.lastReadout > 140) {
    const coherence = state.final ? 0.99 : clamp(0.62 + state.trial * 0.055 + state.sharedPulse * 0.04, 0, 0.98);
    coherenceValue.textContent = `${Math.round(coherence * 100)}%`;
    distanceValue.textContent = `${Math.round(8 + state.separation * (IS_DESKTOP ? 92 : 76))}%`;
    state.lastReadout = performance.now();
  }
}

function toViewport(system) {
  return {
    x: system.x * viewport.width,
    y: system.y * viewport.height
  };
}

function drawBackground(time) {
  const w = viewport.width;
  const h = viewport.height;
  const horizonY = h * 0.5;
  const alpha = 0.12 + state.sharedPulse * 0.1;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(168, 232, 216, ${alpha * 0.28})`;
  ctx.setLineDash([1, 12]);
  ctx.beginPath();
  ctx.moveTo(w * 0.08, horizonY);
  ctx.lineTo(w * 0.92, horizonY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (state.separation > 0.05 || state.phase === "final") {
    const nodes = IS_DESKTOP ? 44 : 28;
    const left = toViewport(systems[0]);
    const right = toViewport(systems[1]);
    ctx.beginPath();
    for (let index = 0; index <= nodes; index += 1) {
      const progress = index / nodes;
      const x = lerp(left.x, right.x, progress);
      const wave = Math.sin(progress * Math.PI * 2 + time * 0.55) * state.sharedPulse * 11;
      const y = lerp(left.y, right.y, progress) + wave;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(COLORS.aqua, state.final ? 0.22 : state.sharedPulse * 0.35);
    ctx.lineWidth = state.final ? 1 : 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSystem(system, time, index) {
  const point = toViewport(system);
  const color = index === 0 ? COLORS.aqua : COLORS.violet;
  const otherColor = index === 0 ? COLORS.violet : COLORS.aqua;
  const selectedPulse = state.measurementPulse;
  const responsePulse = state.responsePulse;
  const localPulse = index === 0 ? selectedPulse : responsePulse;
  const pulse = smoothstep(localPulse);
  const radius = clamp(viewport.min * (IS_DESKTOP ? 0.115 : 0.135), 48, IS_DESKTOP ? 148 : 112);
  const collapse = 1 - pulse * 0.36;
  const breathing = 1 + Math.sin(time * 0.46 + (state.final ? 0.14 : system.seed)) * (REDUCED_MOTION ? 0.008 : 0.036);
  const pointerDistance = Math.hypot((state.pointer.x - system.x) * viewport.width, (state.pointer.y - system.y) * viewport.height);
  const pointerInfluence = IS_DESKTOP && state.pointer.active ? clamp(1 - pointerDistance / (radius * 3.2), 0, 1) : 0;
  const scale = breathing * (1 + pointerInfluence * 0.05);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.globalCompositeOperation = "lighter";

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.8 * scale);
  halo.addColorStop(0, rgba(color, 0.17 + pulse * 0.14));
  halo.addColorStop(0.22, rgba(color, 0.065 + pulse * 0.08));
  halo.addColorStop(0.62, rgba(color, 0.018));
  halo.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.8 * scale, 0, TAU);
  ctx.fill();

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.5 * scale);
  core.addColorStop(0, rgba(COLORS.paper, 0.85 + pulse * 0.12));
  core.addColorStop(0.07, rgba(color, 0.7));
  core.addColorStop(0.35, rgba(color, 0.14));
  core.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.5 * scale, 0, TAU);
  ctx.fill();

  for (let ring = 0; ring < (IS_DESKTOP ? 7 : 6); ring += 1) {
    const ringProgress = ring / (IS_DESKTOP ? 7 : 6);
    const ringRadius = radius * (0.38 + ringProgress * 0.7) * collapse * scale;
    const tilt = Math.sin(system.seed + ring * 1.7) * 0.32;
    const rotation = state.final
      ? time * (0.035 + ring * 0.006) + system.seed * 0.06
      : time * (0.035 + ring * 0.006) * (index === 0 ? 1 : -1) + system.seed;
    ctx.save();
    ctx.rotate(rotation);
    ctx.scale(1, 0.37 + ringProgress * 0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRadius, ringRadius * (0.88 + tilt), 0, 0, TAU);
    ctx.strokeStyle = rgba(color, 0.055 + (1 - ringProgress) * 0.075 + pulse * 0.045);
    ctx.lineWidth = ring === 0 ? 1.2 : 0.75;
    ctx.stroke();
    ctx.restore();
  }

  const contourCount = IS_DESKTOP ? 4 : 3;
  for (let contour = 0; contour < contourCount; contour += 1) {
    const contourRadius = radius * (0.55 + contour * 0.19) * collapse * scale;
    const phase = state.final
      ? time * (0.22 + contour * 0.04) + system.seed * 0.08
      : time * (0.22 + contour * 0.04) + system.seed + state.sharedPulse * (index === 0 ? 0.9 : -0.9);
    ctx.beginPath();
    for (let step = 0; step <= 90; step += 1) {
      const angle = (step / 90) * TAU;
      const distortion = 1 + Math.sin(angle * (3 + contour) + phase) * 0.075 + Math.cos(angle * 7 - phase * 0.7) * 0.025;
      const x = Math.cos(angle) * contourRadius * distortion;
      const y = Math.sin(angle) * contourRadius * distortion * (0.74 + contour * 0.055);
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(index === 0 && state.final ? otherColor : color, 0.11 - contour * 0.018 + pulse * 0.035);
    ctx.lineWidth = contour === 0 ? 1.1 : 0.7;
    ctx.stroke();
  }

  const particleCount = IS_DESKTOP ? 76 : 48;
  for (let particle = 0; particle < particleCount; particle += 1) {
    const n = seeded(particle, system.seed);
    const m = seeded(particle + 41, system.seed);
    const angle = n * TAU + time * (0.018 + m * 0.027) * (particle % 2 ? 1 : -1);
    const distance = radius * (0.32 + m * 0.85) * collapse * scale;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.62;
    const size = 0.35 + n * (IS_DESKTOP ? 1.35 : 1.05) + pulse * 0.8;
    ctx.fillStyle = rgba(color, (0.12 + (1 - m) * 0.22) * (1 - contourFade(particle, particleCount)));
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TAU);
    ctx.fill();
  }

  if (pulse > 0.02) {
    for (let ripple = 0; ripple < 2; ripple += 1) {
      const rippleProgress = clamp(1 - pulse + ripple * 0.16, 0, 1);
      const rippleRadius = radius * (0.7 + rippleProgress * 1.42);
      ctx.beginPath();
      ctx.arc(0, 0, rippleRadius, 0, TAU);
      ctx.strokeStyle = rgba(color, (1 - rippleProgress) * 0.22);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = rgba(COLORS.paper, 0.88);
  ctx.beginPath();
  ctx.arc(0, 0, 1.65 + pulse * 1.25, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function contourFade(index, total) {
  const edge = Math.min(index, total - index) / total;
  return clamp(edge * 0.4, 0, 0.4);
}

function draw(time) {
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  drawBackground(time);
  drawSystem(systems[0], time, 0);
  drawSystem(systems[1], time, 1);
}

function loop(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  update(dt);
  draw(now / 1000);
  frameHandle = window.requestAnimationFrame(loop);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

canvas.addEventListener("pointerdown", (event) => {
  if (state.phase === "analysis" || state.phase === "final") return;
  const point = pointerPosition(event);
  state.pointer.active = true;
  state.pointer.x = point.x / viewport.width;
  state.pointer.y = point.y / viewport.height;
  state.pointerDown = { ...point, time: performance.now() };
  canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const point = pointerPosition(event);
  state.pointer.active = true;
  state.pointer.x = clamp(point.x / viewport.width, 0, 1);
  state.pointer.y = clamp(point.y / viewport.height, 0, 1);
});

canvas.addEventListener("pointerup", (event) => {
  if (!state.pointerDown) return;
  const point = pointerPosition(event);
  const down = state.pointerDown;
  state.pointerDown = null;
  handleMeasurement(point.x + canvas.getBoundingClientRect().left, point.y + canvas.getBoundingClientRect().top, performance.now() - down.time, point.y - down.y);
});

canvas.addEventListener("pointercancel", () => {
  state.pointerDown = null;
});

canvas.addEventListener("pointerleave", () => {
  if (!IS_DESKTOP) state.pointer.active = false;
});

canvas.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const x = viewport.width * 0.5;
  const y = viewport.height * 0.5;
  handleMeasurement(x, y, 80, 0);
});

window.addEventListener("resize", resizeCanvas, { passive: true });
window.visualViewport?.addEventListener("resize", resizeCanvas, { passive: true });

document.title = CONFIG.experimentTitle;
document.querySelector("#experiment-title").innerHTML = CONFIG.experimentTitle.replace(" NON LOCALE", "<br class=\"mobile-break\"> NON LOCALE");
sessionId.textContent = CONFIG.session;
modeLabel.textContent = IS_DESKTOP ? "DESKTOP" : "MOBILE";

resizeCanvas();
setStatus("Deux systèmes détectés", "Observation passive", "", "OBSERVATION PASSIVE");
schedulePassivePrompt();
frameHandle = window.requestAnimationFrame(loop);

window.addEventListener("pagehide", () => {
  window.cancelAnimationFrame(frameHandle);
});
