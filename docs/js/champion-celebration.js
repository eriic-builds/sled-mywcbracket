import { flagCode } from "./flags.js";
import {
  CELEBRATION_DURATION,
  CURTAIN_DURATION,
  TROPHY_CROSSFADE_END,
  TROPHY_CROSSFADE_START,
  celebrationProgressAt,
  createCelebrationClock,
  segmentProgress,
} from "./champion-celebration-timeline.js";

const FALLBACK_DURATION = 6;
let celebrationCanvas = null;

function getCelebrationCanvas() {
  if (!celebrationCanvas) {
    celebrationCanvas = document.createElement("canvas");
  }
  celebrationCanvas.className = "champion-celebration-canvas";
  celebrationCanvas.setAttribute("aria-hidden", "true");
  celebrationCanvas.hidden = false;
  celebrationCanvas.style.opacity = "0";
  return celebrationCanvas;
}

function requireElement(value, name) {
  if (!(value instanceof HTMLElement)) {
    throw new TypeError(`Champion celebration requires ${name}.`);
  }
}

function copyRect(rect) {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function visibleRect(element) {
  if (!(element instanceof Element)) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? copyRect(rect) : null;
}

function createStaticTableau(team) {
  const tableau = document.createElement("div");
  tableau.className = "champion-celebration-tableau champion-celebration-fallback";

  const flag = document.createElement("img");
  flag.className = "champion-celebration-flag";
  flag.alt = `${team} flag`;
  flag.width = 240;
  flag.height = 160;
  const code = flagCode(team);
  if (code) {
    flag.src = new URL(`../flags/${code}.svg`, import.meta.url).href;
  } else {
    flag.hidden = true;
  }

  const trophy = document.createElement("img");
  trophy.className = "champion-celebration-static-trophy";
  trophy.src = new URL("../assets/trophy-fallback.svg", import.meta.url).href;
  trophy.alt = "";
  trophy.width = 220;
  trophy.height = 220;

  const players = document.createElement("div");
  players.className = "champion-celebration-static-team";
  players.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 7; index++) {
    const player = document.createElement("span");
    player.className = index === 0
      ? "champion-celebration-silhouette is-captain"
      : "champion-celebration-silhouette";
    players.append(player);
  }

  const country = document.createElement("p");
  country.className = "champion-celebration-country";
  country.textContent = team;

  tableau.append(flag, players, trophy, country);
  return tableau;
}

function createStage(team, capturedTrophy) {
  const stage = document.createElement("div");
  stage.className = "champion-celebration uses-logical-clock";
  stage.dataset.team = team;
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-labelledby", "champion-celebration-title");

  const backdrop = document.createElement("div");
  backdrop.className = "champion-celebration-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const title = document.createElement("h2");
  title.id = "champion-celebration-title";
  title.className = "champion-celebration-title";
  title.textContent = `${team} champions celebration`;

  const visual = document.createElement("div");
  visual.className = "champion-celebration-visual";

  const canvas = getCelebrationCanvas();

  const fallback = createStaticTableau(team);
  fallback.hidden = true;
  visual.append(canvas, fallback);

  const trophyGhost = document.createElement("div");
  trophyGhost.className = "champion-celebration-trophy-ghost";
  trophyGhost.setAttribute("aria-hidden", "true");
  capturedTrophy.classList.add("champion-celebration-trophy-capture");
  if (capturedTrophy instanceof HTMLImageElement) capturedTrophy.alt = "";
  trophyGhost.append(capturedTrophy);

  const controls = document.createElement("div");
  controls.className = "champion-celebration-controls";

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "champion-celebration-skip";
  skip.textContent = "Skip";

  const status = document.createElement("div");
  status.className = "champion-celebration-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  controls.append(skip);
  stage.append(backdrop, title, visual, trophyGhost, controls, status);
  return { stage, backdrop, canvas, fallback, trophyGhost, skip, status, visual };
}

function createCurtainAnimations(bracket, trophySlot) {
  if (typeof Element.prototype.animate !== "function") return [];
  const animations = [];
  const duration = CURTAIN_DURATION * 1000;
  const add = (element, keyframes) => {
    if (!element) return;
    const animation = element.animate(keyframes, {
      duration,
      easing: "linear",
      fill: "both",
    });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  };

  const cascadeKeyframes = ({
    direction,
    start,
    end,
    distance,
    vertical = 0,
    rotation = 0,
    scale = 0.95,
  }) => {
    const travelStart = start + (end - start) * 0.34;
    const settleTransform =
      `translate3d(${direction * distance * 0.18}vw, ${vertical * 0.18}vh, 0) ` +
      `rotate(${direction * rotation * 0.18}deg) scale(0.995)`;
    const endTransform =
      `translate3d(${direction * distance}vw, ${vertical}vh, 0) ` +
      `rotate(${direction * rotation}deg) scale(${scale})`;
    return [
      { offset: 0, transform: "translate3d(0,0,0) rotate(0deg) scale(1)", opacity: 1 },
      {
        offset: start,
        transform: "translate3d(0,0,0) rotate(0deg) scale(1)",
        opacity: 1,
        easing: "cubic-bezier(0.2, 0.72, 0.18, 1)",
      },
      {
        offset: travelStart,
        transform: settleTransform,
        opacity: 1,
        easing: "cubic-bezier(0.18, 0.7, 0.16, 1)",
      },
      { offset: end, transform: endTransform, opacity: 0 },
      { offset: 1, transform: endTransform, opacity: 0 },
    ];
  };

  bracket.querySelectorAll('.bkcol[data-side="L"], .bkcol[data-side="R"]').forEach(column => {
    const direction = column.dataset.side === "L" ? -1 : 1;
    const columnNumber = Number(column.dataset.col);
    const wave = Math.max(0, Math.abs(columnNumber - 5) - 1);
    const cards = Array.from(column.children)
      .filter(element => element.classList.contains("mcard"));
    cards.forEach((card, row) => {
      const centeredRow = row - (cards.length - 1) / 2;
      const start = 0.055 + wave * 0.075 + row * 0.016;
      const end = Math.min(0.94, start + 0.56);
      add(card, cascadeKeyframes({
        direction,
        start,
        end,
        distance: 34 + wave * 7,
        vertical: centeredRow * 1.35,
        rotation: centeredRow * 0.8,
      }));
    });

    const heading = column.querySelector(":scope > .bkhead");
    const headingStart = 0.08 + wave * 0.075;
    add(heading, cascadeKeyframes({
      direction,
      start: headingStart,
      end: Math.min(0.9, headingStart + 0.5),
      distance: 30 + wave * 7,
      vertical: -1.2,
      rotation: 1.2,
      scale: 0.97,
    }));
  });

  const fade = (element, start, end, transform) => {
    if (!element) return;
    add(element, [
      { offset: 0, transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      { offset: start, transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      {
        offset: end,
        transform,
        opacity: 0,
        easing: "cubic-bezier(0.2, 0.72, 0.18, 1)",
      },
      { offset: 1, transform, opacity: 0 },
    ]);
  };

  bracket.querySelectorAll(".bksvg path[data-curtain-side]").forEach(path => {
    const side = path.getAttribute("data-curtain-side");
    if (side !== "L" && side !== "R") return;
    const direction = side === "L" ? -1 : 1;
    const columnNumber = Number(path.getAttribute("data-curtain-col"));
    const row = Number(path.getAttribute("data-curtain-row"));
    const count = Math.max(1, Number(path.getAttribute("data-curtain-count")));
    const wave = Math.max(0, Math.abs(columnNumber - 5) - 1);
    const centeredRow = row - (count - 1) / 2;
    const start = 0.055 + wave * 0.075 + row * 0.016;
    add(path, cascadeKeyframes({
      direction,
      start,
      end: Math.min(0.94, start + 0.56),
      distance: 34 + wave * 7,
      vertical: centeredRow * 1.35,
      scale: 1,
    }));
  });
  bracket.querySelectorAll('.bksvg path[data-curtain-side="C"]').forEach(path => {
    fade(path, 0.12, 0.72, "translate3d(0,6vh,0) scale(0.95)");
  });
  bracket.querySelectorAll(".bksvg path:not([data-curtain-side])").forEach(path => {
    fade(path, 0.12, 0.76, "translate3d(0,-2vh,0) scale(0.98)");
  });
  fade(bracket.querySelector(".mini-map"), 0.16, 0.74, "translate3d(0,-2vh,0) scale(0.96)");
  fade(bracket.querySelector(".champ-state"), 0.14, 0.76, "translate3d(0,-7vh,0) scale(0.94)");
  fade(
    bracket.querySelector('.mcard[data-match-code="M104"]'),
    0.12,
    0.72,
    "translate3d(0,6vh,0) scale(0.95)",
  );
  fade(trophySlot, 0.02, 0.16, "translate3d(0,1vh,0) scale(1.02)");

  return animations;
}

export async function startChampionCelebration({
  team,
  trigger,
  bracket,
  wrap,
  trophyController = null,
  setTrophiesSuspended = null,
  onClose,
}) {
  if (typeof team !== "string" || !team.trim()) {
    throw new TypeError("Champion celebration requires a team.");
  }
  requireElement(trigger, "a connected champion trigger");
  requireElement(bracket, "an active mirrored bracket");
  requireElement(wrap, "a bracket wrapper");

  const normalizedTeam = team.trim();
  const trophySlot = bracket.querySelector("[data-trophy]");
  const trophySource = trophySlot?.querySelector(".trophy-canvas, .trophy-fallback");
  const bracketRect = visibleRect(bracket);
  let capture = null;
  if (trophyController) {
    try {
      capture = trophyController.captureVisual();
    } catch (error) {
      console.warn("The active trophy could not be captured; using the local static trophy.", error);
    }
  }
  if (!capture) {
    const node = document.createElement("img");
    node.src = new URL("../assets/trophy-fallback.svg", import.meta.url).href;
    node.alt = "";
    const rect = visibleRect(trophySource) || visibleRect(trophySlot) || bracketRect;
    capture = rect ? { node, rect, kind: "image" } : null;
  }
  if (!bracketRect || !capture?.rect) {
    throw new Error("Champion celebration source has no visible geometry.");
  }

  const root = document.documentElement;
  const body = document.body;
  const mapButton = document.getElementById("mapExpandToggle");
  const statCard = document.getElementById("statcard");
  const backgroundRoots = new Map(
    Array.from(body.children)
      .filter(element => element instanceof HTMLElement)
      .map(element => [element, {
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }]),
  );
  const snapshot = {
    rootClassName: root.className,
    bodyClassName: body.className,
    rootOverflow: root.style.overflow,
    bodyOverflow: body.style.overflow,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    activeElement: document.activeElement,
    view: wrap.dataset.view,
    layout: wrap.dataset.layout,
    mapButton: mapButton ? {
      className: mapButton.className,
      textContent: mapButton.textContent,
      ariaExpanded: mapButton.getAttribute("aria-expanded"),
    } : null,
    statCard: statCard ? {
      className: statCard.className,
      ariaHidden: statCard.getAttribute("aria-hidden"),
      translate: statCard.style.translate,
    } : null,
    backgroundRoots,
    bracketRect,
    trophyRect: capture.rect,
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const forceFallback = new URLSearchParams(window.location.search)
    .get("mockCelebrationFallback") === "1";
  const sceneAbort = new AbortController();
  let destroyed = false;
  let closeNotified = false;
  let trophiesSuspended = false;
  let stage = null;
  let backdrop = null;
  let canvas = null;
  let fallback = null;
  let trophyGhost = null;
  let skip = null;
  let status = null;
  let sceneController = null;
  let resizeObserver = null;
  let backgroundObserver = null;
  let frame = 0;
  let clock = null;
  let mode = "loading";
  let curtainAnimations = [];
  let stageWidth = Math.max(1, window.innerWidth);
  let stageHeight = Math.max(1, window.innerHeight);
  const ghostGeometry = {
    sourceLeft: capture.rect.left,
    sourceTop: capture.rect.top,
    sourceWidth: capture.rect.width,
    sourceHeight: capture.rect.height,
    targetLeft: window.innerWidth / 2 - capture.rect.width / 2,
    targetTop: window.innerHeight * 0.24,
    targetScale: 1,
  };

  function restoreAttribute(element, name, value) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }

  function isolateBackgroundElement(element) {
    if (!(element instanceof HTMLElement) || element === stage) return;
    if (!snapshot.backgroundRoots.has(element)) {
      snapshot.backgroundRoots.set(element, {
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      });
    }
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  }

  function notifyClose(reason) {
    if (closeNotified) return;
    closeNotified = true;
    if (typeof onClose === "function") onClose(reason);
  }

  function stopFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function setCurtainTime(timeSeconds) {
    const restore = segmentProgress(timeSeconds, 28.5, 30);
    const curtainMilliseconds = CURTAIN_DURATION * 1000;
    const openingMilliseconds = Math.min(timeSeconds, CURTAIN_DURATION) * 1000;
    const currentTime = restore > 0
      ? (1 - restore) * curtainMilliseconds
      : openingMilliseconds;
    for (const animation of curtainAnimations) animation.currentTime = currentTime;
  }

  function updateGhostGeometry() {
    if (!stage || !trophyGhost) return;
    const sourceLeft = Number(stage.dataset.sourceX) * stageWidth;
    const sourceTop = Number(stage.dataset.sourceY) * stageHeight;
    const sourceWidth = Math.max(1, Number(stage.dataset.sourceWidth) * stageWidth);
    const sourceHeight = Math.max(1, Number(stage.dataset.sourceHeight) * stageHeight);
    const projected = sceneController?.projectAnchor("trophy-rest");
    const fallbackTargetWidth = Math.min(
      220,
      Math.max(130, stageWidth * (stageWidth <= 600 ? 0.4 : 0.17)),
    );
    const targetScale = projected?.height
      ? projected.height / sourceHeight
      : fallbackTargetWidth / sourceWidth;
    ghostGeometry.sourceLeft = sourceLeft;
    ghostGeometry.sourceTop = sourceTop;
    ghostGeometry.sourceWidth = sourceWidth;
    ghostGeometry.sourceHeight = sourceHeight;
    ghostGeometry.targetLeft = projected
      ? projected.x - sourceWidth / 2
      : stageWidth / 2 - sourceWidth / 2;
    ghostGeometry.targetTop = projected
      ? projected.y - sourceHeight / 2
      : stageHeight * 0.24;
    ghostGeometry.targetScale = targetScale;
    trophyGhost.style.width = `${sourceWidth}px`;
    trophyGhost.style.height = `${sourceHeight}px`;
  }

  function updateGhost(timeSeconds) {
    if (!trophyGhost) return;
    if (mode === "fallback") {
      trophyGhost.style.opacity = "0";
      return;
    }
    const opening = segmentProgress(timeSeconds, 0, CURTAIN_DURATION);
    const left = ghostGeometry.sourceLeft +
      (ghostGeometry.targetLeft - ghostGeometry.sourceLeft) * opening;
    const top = ghostGeometry.sourceTop +
      (ghostGeometry.targetTop - ghostGeometry.sourceTop) * opening;
    const scale = 1 + (ghostGeometry.targetScale - 1) * opening;
    const grabFade = 1 - segmentProgress(
      timeSeconds,
      TROPHY_CROSSFADE_START,
      TROPHY_CROSSFADE_END,
    );
    trophyGhost.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
    trophyGhost.style.opacity = String(grabFade);
  }

  function updateFullMotion(timeSeconds) {
    const progress = celebrationProgressAt(timeSeconds);
    const stageOpacity = 1 - progress.restore;
    stage.style.opacity = String(stageOpacity);
    backdrop.style.opacity = String(progress.opening);
    canvas.style.opacity = String(progress.opening);
    setCurtainTime(timeSeconds);
    updateGhost(timeSeconds);
    sceneController.renderFrame(timeSeconds);
    if (timeSeconds >= CELEBRATION_DURATION) destroy("completed");
  }

  function updateFallback(timeSeconds) {
    const fadeIn = segmentProgress(timeSeconds, 0, 0.5);
    const fadeOut = 1 - segmentProgress(timeSeconds, 5.5, FALLBACK_DURATION);
    const opacity = Math.min(fadeIn, fadeOut);
    stage.style.opacity = String(opacity);
    backdrop.style.opacity = String(opacity);
    fallback.style.opacity = String(opacity);
    updateGhost(timeSeconds);
    if (timeSeconds >= FALLBACK_DURATION) destroy("fallback-completed");
  }

  function runFrame(now) {
    frame = 0;
    if (destroyed || document.hidden || !clock) return;
    if (!trigger.isConnected || !bracket.isConnected) {
      destroy("source-disconnected");
      return;
    }
    const timeSeconds = clock.tick(now);
    if (mode === "timeline" && sceneController) updateFullMotion(timeSeconds);
    else if (mode === "fallback") updateFallback(timeSeconds);
    if (!destroyed) frame = requestAnimationFrame(runFrame);
  }

  function startClock(nextMode) {
    stopFrame();
    mode = nextMode;
    clock = createCelebrationClock({
      duration: nextMode === "timeline" ? CELEBRATION_DURATION : FALLBACK_DURATION,
    });
    clock.start(performance.now(), 0);
    if (!document.hidden) frame = requestAnimationFrame(runFrame);
  }

  function startFallback(reason, error = null) {
    if (destroyed || mode === "fallback") return;
    sceneAbort.abort();
    stopFrame();
    sceneController?.destroy();
    sceneController = null;
    canvas.hidden = true;
    fallback.hidden = false;
    stage.classList.remove("is-scene-ready");
    stage.classList.add("is-fallback");
    status.textContent = reason === "reduced-motion"
      ? `${normalizedTeam} champion tableau. Motion is reduced.`
      : `${normalizedTeam} champion tableau. The 3D scene is unavailable.`;
    if (error) console.warn("Champion celebration switched to its static fallback.", error);
    startClock("fallback");
  }

  function onVisibilityChange() {
    if (!clock || destroyed) return;
    if (document.hidden) {
      clock.pause(performance.now());
      stopFrame();
    } else {
      clock.resume(performance.now());
      if (!frame) frame = requestAnimationFrame(runFrame);
    }
  }

  function onResize() {
    stageWidth = Math.max(1, window.innerWidth);
    stageHeight = Math.max(1, window.innerHeight);
    sceneController?.resize({
      width: stageWidth,
      height: stageHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
    updateGhostGeometry();
  }

  function destroy(reason = "destroyed") {
    if (destroyed) return;
    destroyed = true;
    sceneAbort.abort();
    stopFrame();
    clock?.stop();
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("resize", onResize);
    skip?.removeEventListener("click", onSkip);
    resizeObserver?.disconnect();
    backgroundObserver?.disconnect();
    backgroundObserver = null;
    for (const animation of curtainAnimations) animation.cancel();
    curtainAnimations = [];
    sceneController?.destroy();
    sceneController = null;
    stage?.remove();

    if (trophiesSuspended && typeof setTrophiesSuspended === "function") {
      trophiesSuspended = false;
      setTrophiesSuspended(false);
    }

    root.className = snapshot.rootClassName;
    body.className = snapshot.bodyClassName;
    root.style.overflow = snapshot.rootOverflow;
    body.style.overflow = snapshot.bodyOverflow;
    if (snapshot.view === undefined) delete wrap.dataset.view;
    else wrap.dataset.view = snapshot.view;
    if (snapshot.layout === undefined) delete wrap.dataset.layout;
    else wrap.dataset.layout = snapshot.layout;

    if (mapButton && snapshot.mapButton) {
      mapButton.className = snapshot.mapButton.className;
      mapButton.textContent = snapshot.mapButton.textContent;
      restoreAttribute(mapButton, "aria-expanded", snapshot.mapButton.ariaExpanded);
    }
    if (statCard && snapshot.statCard) {
      statCard.className = snapshot.statCard.className;
      statCard.style.translate = snapshot.statCard.translate;
      restoreAttribute(statCard, "aria-hidden", snapshot.statCard.ariaHidden);
    }
    for (const [element, state] of snapshot.backgroundRoots) {
      element.inert = state.inert;
      restoreAttribute(element, "aria-hidden", state.ariaHidden);
    }

    window.scrollTo(snapshot.scrollX, snapshot.scrollY);
    requestAnimationFrame(() => window.__drawConn?.());
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
    notifyClose(reason);
  }

  function onSkip() {
    destroy("skipped");
  }

  function onDocumentKeyDown(event) {
    if (destroyed) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      destroy("escape");
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    skip.focus({ preventScroll: true });
  }

  async function initializeScene() {
    try {
      const module = await import("./champion-celebration-scene.js");
      if (destroyed || sceneAbort.signal.aborted) return;
      const created = await module.createChampionScene({
        canvas,
        team: normalizedTeam,
        signal: sceneAbort.signal,
        onContextLoss: error => startFallback("context-loss", error),
      });
      if (destroyed || sceneAbort.signal.aborted) {
        created.destroy();
        return;
      }
      sceneController = created;
      sceneController.resize({
        width: stageWidth,
        height: stageHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      sceneController.renderFrame(0);
      canvas.hidden = false;
      fallback.hidden = true;
      stage.classList.add("is-scene-ready");
      curtainAnimations = createCurtainAnimations(bracket, trophySlot);
      updateGhostGeometry();
      status.textContent = "";
      startClock("timeline");
    } catch (error) {
      if (destroyed || error?.name === "AbortError") return;
      startFallback("initialization-failure", error);
    }
  }

  try {
    const created = createStage(normalizedTeam, capture.node);
    stage = created.stage;
    backdrop = created.backdrop;
    canvas = created.canvas;
    fallback = created.fallback;
    trophyGhost = created.trophyGhost;
    skip = created.skip;
    status = created.status;

    stage.dataset.sourceX = String(snapshot.trophyRect.left / Math.max(1, window.innerWidth));
    stage.dataset.sourceY = String(snapshot.trophyRect.top / Math.max(1, window.innerHeight));
    stage.dataset.sourceWidth = String(snapshot.trophyRect.width / Math.max(1, window.innerWidth));
    stage.dataset.sourceHeight = String(snapshot.trophyRect.height / Math.max(1, window.innerHeight));
    updateGhostGeometry();
    updateGhost(0);

    if (typeof setTrophiesSuspended === "function") {
      setTrophiesSuspended(true);
      trophiesSuspended = true;
    }
    for (const element of snapshot.backgroundRoots.keys()) isolateBackgroundElement(element);
    statCard?.classList.remove("show");
    statCard?.setAttribute("aria-hidden", "true");
    root.classList.add("champion-celebration-root-active");
    body.classList.add("champion-celebration-active");
    body.style.overflow = "hidden";
    body.append(stage);
    backgroundObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.parentElement === body) isolateBackgroundElement(node);
        }
      }
    });
    backgroundObserver.observe(body, { childList: true });
    skip.addEventListener("click", onSkip);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", onResize, { passive: true });
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(entries => {
        const rect = entries[0]?.contentRect;
        if (!rect || destroyed) return;
        stageWidth = Math.max(1, rect.width);
        stageHeight = Math.max(1, rect.height);
        sceneController?.resize({
          width: stageWidth,
          height: stageHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        });
        updateGhostGeometry();
      });
      resizeObserver.observe(stage);
    }
    skip.focus({ preventScroll: true });

    if (reducedMotion) {
      startFallback("reduced-motion");
    } else if (forceFallback) {
      startFallback("initialization-failure", new Error("Forced local fallback review."));
    } else {
      initializeScene();
    }
  } catch (error) {
    destroy("construction-failed");
    throw error;
  }

  return {
    destroy,
    isActive() {
      return !destroyed;
    },
  };
}
