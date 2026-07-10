import * as THREE from "./vendor/three.module.min.js";

const DEG = Math.PI / 180;
const AUTO_TURN_SECONDS = 32;
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
  if (!(slot instanceof HTMLElement)) return () => {};

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
  let bodyMaterial = null;
  let insetMaterial = null;
  let seamMaterial = null;
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

  const geometries = [];
  const materials = [];
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
      !paused && !reduced && !dragging && !destroyed && performance.now() >= resumeAfter;
  }

  function animate(now) {
    frame = 0;
    if (!canAutoRotate()) return;
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
    if (!bodyMaterial) return;
    bodyMaterial.color.set(cssToken("--gold", "#d5aa35"));
    insetMaterial.color.set(cssToken("--panel", "#1c1b21"));
    seamMaterial.color.set(cssToken("--blue", "#0097f4"));
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

  function addMesh(geometry, material, x, y, z) {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    sculpture.add(mesh);
    return mesh;
  }

  function buildGeometry() {
    sculpture = new THREE.Group();
    sculpture.rotation.order = "YXZ";
    scene.add(sculpture);

    bodyMaterial = new THREE.MeshStandardMaterial({
      color: cssToken("--gold", "#d5aa35"),
      flatShading: true,
      roughness: 0.9,
      metalness: 0.1,
    });
    insetMaterial = new THREE.MeshStandardMaterial({
      color: cssToken("--panel", "#1c1b21"),
      flatShading: true,
      roughness: 0.95,
      metalness: 0.05,
    });
    seamMaterial = new THREE.MeshStandardMaterial({
      color: cssToken("--blue", "#0097f4"),
      flatShading: true,
      roughness: 0.8,
      metalness: 0.08,
    });
    materials.push(bodyMaterial, insetMaterial, seamMaterial);

    addMesh(new THREE.IcosahedronGeometry(0.76, 1), bodyMaterial, 0, 1.05, 0);

    const seamA = addMesh(new THREE.TorusGeometry(0.77, 0.018, 5, 48), seamMaterial, 0, 1.05, 0);
    const seamB = addMesh(new THREE.TorusGeometry(0.77, 0.018, 5, 48), seamMaterial, 0, 1.05, 0);
    const seamC = addMesh(new THREE.TorusGeometry(0.77, 0.018, 5, 48), seamMaterial, 0, 1.05, 0);
    seamB.rotation.x = Math.PI / 2;
    seamC.rotation.set(Math.PI / 2, Math.PI / 3, 0);

    const leftArm = addMesh(new THREE.BoxGeometry(0.28, 1.9, 0.32), bodyMaterial, -0.36, -0.33, 0);
    const rightArm = addMesh(new THREE.BoxGeometry(0.28, 1.9, 0.32), bodyMaterial, 0.36, -0.33, 0);
    leftArm.rotation.z = 20 * DEG;
    rightArm.rotation.z = -20 * DEG;

    addMesh(new THREE.BoxGeometry(0.96, 0.24, 0.48), insetMaterial, 0, -1.22, 0);
    addMesh(new THREE.CylinderGeometry(0.72, 0.92, 0.44, 6), bodyMaterial, 0, -1.66, 0);
    addMesh(new THREE.CylinderGeometry(0.5, 0.64, 0.12, 6), insetMaterial, 0, -1.39, 0);
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
    detachCanvasEvents();
    if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
    dragging = false;
    for (const geometry of new Set(geometries)) geometry.dispose();
    for (const material of new Set(materials)) material.dispose();
    geometries.length = 0;
    materials.length = 0;
    renderer?.dispose();
    canvas?.remove();
    button?.remove();
    renderer = scene = camera = sculpture = null;
    bodyMaterial = insetMaterial = seamMaterial = null;
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
      buildGeometry();

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
    } catch {
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
    if (phone) stopLoop();
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

  return function teardown() {
    if (destroyed) return;
    destroyed = true;
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
  };
}
