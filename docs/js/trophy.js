import * as THREE from "./vendor/three.module.min.js";
import { createTrophySculpture } from "./trophy-geometry.js";

const DEG = Math.PI / 180;
const AUTO_TURN_SECONDS = 32;
const AUTO_FRAME_MS = 1000 / 30;
const PHONE_WIDTH = 600;
const FALLBACK_SRC = "assets/trophy-fallback.svg";

function cssToken(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function createFallback() {
  const image = document.createElement("img");
  image.className = "trophy-fallback";
  image.src = FALLBACK_SRC;
  image.alt = "";
  image.width = 180;
  image.height = 180;
  image.decoding = "async";
  return image;
}

export function initTrophy(slot) {
  if (!(slot instanceof HTMLElement)) {
    throw new TypeError("initTrophy() requires a trophy slot element.");
  }

  const wrap = slot.closest(".brk-wrap");
  const fallback = createFallback();
  slot.replaceChildren(fallback);
  slot.classList.add("trophy-host");

  let canvas = null;
  let button = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let sculpture = null;
  let sculptureOwner = null;
  let intersectionObserver = null;
  let resizeObserver = null;
  let themeObserver = null;
  let frame = 0;
  let resumeTimer = 0;
  let resumeAfter = 0;
  let lastFrame = 0;
  let destroyed = false;
  let initialized = false;
  let failed = false;
  let intersecting = false;
  let phone = (wrap?.clientWidth || slot.clientWidth) < PHONE_WIDTH;
  let reduced = false;
  let paused = false;
  let dragging = false;
  let pointerId = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let autoYaw = 0;
  let userYaw = -20 * DEG;
  let pitch = 0;
  let hoverX = 0;
  let hoverZ = 0;
  let hoverTargetX = 0;
  let hoverTargetZ = 0;
  const externalSuspensions = new Set();
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduced = reducedQuery.matches;
  slot.classList.toggle("trophy-phone", phone);

  function updateButton() {
    if (!button) return;
    button.textContent = paused ? "Resume \u25b6" : "Pause \u23f8";
    button.setAttribute("aria-label", paused ? "Resume sculpture rotation" : "Pause sculpture rotation");
    button.setAttribute("aria-pressed", paused ? "true" : "false");
  }

  function applyRotation() {
    if (!sculpture) return;
    sculpture.rotation.y = userYaw + autoYaw;
    sculpture.rotation.x = pitch + hoverX;
    sculpture.rotation.z = hoverZ;
  }

  function renderNow() {
    if (!renderer || !scene || !camera) return;
    applyRotation();
    renderer.render(scene, camera);
  }

  function stopLoop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }

  function canAutoRotate() {
    return initialized && intersecting && !document.hidden && !phone &&
      !paused && !reduced && !dragging && !destroyed && externalSuspensions.size === 0 &&
      performance.now() >= resumeAfter;
  }

  function animate(now) {
    frame = 0;
    if (!canAutoRotate()) return;
    if (lastFrame && now - lastFrame < AUTO_FRAME_MS) {
      frame = requestAnimationFrame(animate);
      return;
    }
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    autoYaw = (autoYaw + delta * Math.PI * 2 / AUTO_TURN_SECONDS) % (Math.PI * 2);
    hoverX += (hoverTargetX - hoverX) * 0.08;
    hoverZ += (hoverTargetZ - hoverZ) * 0.08;
    renderNow();
    frame = requestAnimationFrame(animate);
  }

  function startLoop() {
    if (!frame && canAutoRotate()) {
      lastFrame = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }

  function updateTheme() {
    if (!sculptureOwner) return;
    sculptureOwner.setColors({
      body: cssToken("--gold", "#d5aa35"),
      inset: cssToken("--panel", "#1c1b21"),
      seam: cssToken("--blue", "#0097f4"),
    });
    renderNow();
  }

  function resizeRenderer() {
    if (!renderer || !camera || !canvas) return;
    const width = Math.max(1, canvas.clientWidth || slot.clientWidth);
    const height = Math.max(1, canvas.clientHeight || width);
    const aspect = width / height;
    const halfHeight = 2.45;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderNow();
  }

  function onPointerDown(event) {
    if (event.button !== 0 || pointerId !== null) return;
    dragging = true;
    pointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(pointerId);
    clearTimeout(resumeTimer);
    resumeAfter = Infinity;
    stopLoop();
    if (event.pointerType !== "touch") event.preventDefault();
  }

  function onPointerMove(event) {
    if (dragging && event.pointerId === pointerId) {
      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      userYaw += deltaX * 0.01;
      if (event.pointerType !== "touch") {
        pitch = THREE.MathUtils.clamp(pitch + deltaY * 0.005, -10 * DEG, 10 * DEG);
      }
      renderNow();
      return;
    }
    if (reduced || event.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    const y = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
    hoverTargetX = -y * 3 * DEG;
    hoverTargetZ = -x * 3 * DEG;
    if (paused) {
      hoverX = hoverTargetX;
      hoverZ = hoverTargetZ;
      renderNow();
    }
  }

  function finishDrag(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    dragging = false;
    pointerId = null;
    canvas.classList.remove("dragging");
    clearTimeout(resumeTimer);
    resumeAfter = performance.now() + 1500;
    resumeTimer = window.setTimeout(startLoop, 1500);
  }

  function onPointerLeave() {
    if (dragging) return;
    hoverTargetX = 0;
    hoverTargetZ = 0;
    if (paused) {
      hoverX = 0;
      hoverZ = 0;
      renderNow();
    }
  }

  function togglePause() {
    paused = !paused;
    updateButton();
    if (paused) stopLoop();
    else startLoop();
  }

  function onKeyDown(event) {
    const step = 5 * DEG;
    if (event.key === "ArrowLeft") userYaw -= step;
    else if (event.key === "ArrowRight") userYaw += step;
    else if (event.key === "ArrowUp") pitch = THREE.MathUtils.clamp(pitch - step, -10 * DEG, 10 * DEG);
    else if (event.key === "ArrowDown") pitch = THREE.MathUtils.clamp(pitch + step, -10 * DEG, 10 * DEG);
    else if (event.key === "Home") {
      autoYaw = 0;
      userYaw = 0;
      pitch = 0;
      hoverX = hoverZ = hoverTargetX = hoverTargetZ = 0;
    } else if (event.key === " " || event.key === "Spacebar") {
      togglePause();
    } else return;
    event.preventDefault();
    renderNow();
  }

  function attachCanvasEvents() {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", finishDrag);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("webglcontextlost", onContextLost);
    button.addEventListener("click", togglePause);
  }

  function detachCanvasEvents() {
    if (canvas) {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", finishDrag);
      canvas.removeEventListener("pointercancel", finishDrag);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
    }
    button?.removeEventListener("click", togglePause);
  }

  function disposeScene() {
    stopLoop();
    clearTimeout(resumeTimer);
    resumeTimer = 0;
    resumeAfter = 0;
    detachCanvasEvents();
    if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
    dragging = false;
    sculptureOwner?.dispose();
    renderer?.dispose();
    canvas?.remove();
    button?.remove();
    renderer = scene = camera = sculpture = sculptureOwner = null;
    canvas = button = null;
    initialized = false;
  }

  function useFallback() {
    if (destroyed) return;
    failed = true;
    disposeScene();
    slot.classList.remove("trophy-ready");
    slot.classList.add("is-fallback");
  }

  function onContextLost(event) {
    event.preventDefault();
    useFallback();
  }

  function initializeScene() {
    if (initialized || failed || destroyed || phone) return;
    canvas = document.createElement("canvas");
    canvas.className = "trophy-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "Decorative World Cup sculpture. Arrow keys rotate, Home resets, Space pauses.",
    );
    fallback.after(canvas);

    let context;
    try {
      context = canvas.getContext("webgl2", { alpha: true, antialias: true }) ||
        canvas.getContext("webgl", { alpha: true, antialias: true });
      if (!context) {
        useFallback();
        return;
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-2.45, 2.45, 2.45, -2.45, 0.1, 100);
      camera.position.set(4, 2.6, 6);
      camera.lookAt(0, -0.1, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(3, 5, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x0097f4, 1.1);
      rim.position.set(-4, 1, -3);
      scene.add(rim);
      sculptureOwner = createTrophySculpture({
        body: cssToken("--gold", "#d5aa35"),
        inset: cssToken("--panel", "#1c1b21"),
        seam: cssToken("--blue", "#0097f4"),
      });
      sculpture = sculptureOwner.root;
      scene.add(sculpture);

      button = document.createElement("button");
      button.type = "button";
      button.className = "trophy-pause";
      button.setAttribute("aria-label", "Pause sculpture rotation");
      slot.append(button);
      updateButton();
      attachCanvasEvents();

      initialized = true;
      slot.classList.remove("is-fallback");
      slot.classList.add("trophy-ready");
      updateTheme();
      resizeRenderer();
      startLoop();
    } catch (error) {
      console.warn("Trophy WebGL could not initialize; using the local static trophy.", error);
      useFallback();
    }
  }

  function updatePhoneState() {
    const nextPhone = (wrap?.clientWidth || slot.clientWidth) < PHONE_WIDTH;
    if (nextPhone === phone) {
      if (initialized) resizeRenderer();
      return;
    }
    phone = nextPhone;
    slot.classList.toggle("trophy-phone", phone);
    if (phone) {
      disposeScene();
      slot.classList.remove("trophy-ready");
    }
    else if (intersecting) {
      initializeScene();
      resizeRenderer();
      startLoop();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
  }

  function onReducedMotionChange(event) {
    reduced = event.matches;
    hoverX = hoverZ = hoverTargetX = hoverTargetZ = 0;
    if (reduced) stopLoop();
    else startLoop();
    renderNow();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  if (typeof reducedQuery.addEventListener === "function") {
    reducedQuery.addEventListener("change", onReducedMotionChange);
  } else {
    reducedQuery.addListener(onReducedMotionChange);
  }

  themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  resizeObserver = new ResizeObserver(updatePhoneState);
  resizeObserver.observe(slot);

  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver((entries) => {
      intersecting = entries.some((entry) => entry.isIntersecting);
      if (intersecting) {
        updatePhoneState();
        initializeScene();
        startLoop();
      } else {
        stopLoop();
      }
    }, { rootMargin: "100px" });
    intersectionObserver.observe(slot);
  } else {
    intersecting = true;
    initializeScene();
    startLoop();
  }

  function suspend() {
    if (destroyed) throw new Error("Cannot suspend a destroyed trophy controller.");
    const token = {};
    externalSuspensions.add(token);
    stopLoop();
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      externalSuspensions.delete(token);
      if (!destroyed) startLoop();
    };
  }

  function captureVisual() {
    if (destroyed) throw new Error("Cannot capture a destroyed trophy controller.");
    if (initialized && canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        renderNow();
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const context = copy.getContext("2d");
        if (!context) throw new Error("Trophy capture could not create a 2D canvas.");
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
        let minimumX = copy.width;
        let minimumY = copy.height;
        let maximumX = -1;
        let maximumY = -1;
        for (let y = 0; y < copy.height; y++) {
          for (let x = 0; x < copy.width; x++) {
            if (pixels[(y * copy.width + x) * 4 + 3] <= 4) continue;
            minimumX = Math.min(minimumX, x);
            minimumY = Math.min(minimumY, y);
            maximumX = Math.max(maximumX, x);
            maximumY = Math.max(maximumY, y);
          }
        }
        if (maximumX < minimumX || maximumY < minimumY) {
          throw new Error("Trophy capture contained no visible pixels.");
        }
        const contentWidth = maximumX - minimumX + 1;
        const contentHeight = maximumY - minimumY + 1;
        const cropped = document.createElement("canvas");
        cropped.width = contentWidth;
        cropped.height = contentHeight;
        const croppedContext = cropped.getContext("2d");
        if (!croppedContext) {
          throw new Error("Trophy capture could not create a cropped 2D canvas.");
        }
        croppedContext.drawImage(
          copy,
          minimumX,
          minimumY,
          contentWidth,
          contentHeight,
          0,
          0,
          contentWidth,
          contentHeight,
        );
        const cssScaleX = rect.width / copy.width;
        const cssScaleY = rect.height / copy.height;
        return {
          node: cropped,
          rect: {
            left: rect.left + minimumX * cssScaleX,
            top: rect.top + minimumY * cssScaleY,
            width: contentWidth * cssScaleX,
            height: contentHeight * cssScaleY,
          },
          kind: "canvas",
        };
      }
    }

    const sourceRect = fallback.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const rect = sourceRect.width > 0 && sourceRect.height > 0 ? sourceRect : slotRect;
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error("Active trophy source has no visible geometry.");
    }
    const image = fallback.cloneNode(true);
    image.removeAttribute("id");
    return {
      node: image,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      kind: "image",
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    externalSuspensions.clear();
    intersectionObserver?.disconnect();
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (typeof reducedQuery.removeEventListener === "function") {
      reducedQuery.removeEventListener("change", onReducedMotionChange);
    } else {
      reducedQuery.removeListener(onReducedMotionChange);
    }
    disposeScene();
    slot.replaceChildren();
    slot.classList.remove("trophy-host", "trophy-phone", "trophy-ready", "is-fallback");
  }

  return {
    slot,
    destroy,
    suspend,
    captureVisual,
  };
}
