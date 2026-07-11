import * as THREE from "./vendor/three.module.min.js";

const MIN_BALLS = 12;
const MAX_BALLS = 24;
const WORLD_HALF_HEIGHT = 5.2;
const MAX_DELTA = 1 / 30;
const MAX_SPEED = 8.5;
const GRAVITY = 3.4;
const WALL_BOUNCE = 0.72;
const COLLISION_BOUNCE = 0.78;
const DPR_LIMIT = 1.5;
const FLAG_DECALS = [
  [1, "us"], [3, "ca"], [6, "mx"], [9, "ar"],
  [12, "br"], [15, "gb-eng"], [18, "fr"], [21, "jp"],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function assertBounds(bounds) {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) ||
      bounds.x <= 0 || bounds.y <= 0) {
    throw new TypeError("Ball-pit bounds must contain positive finite x and y values.");
  }
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createBallPhysics(maxCount, bounds, seed = 0x26f1fa) {
  if (!Number.isInteger(maxCount) || maxCount < 2) {
    throw new TypeError("Ball-pit count must be an integer of at least 2.");
  }
  assertBounds(bounds);

  const random = seededRandom(seed);
  const position = new Float32Array(maxCount * 2);
  const velocity = new Float32Array(maxCount * 2);
  const radius = new Float32Array(maxCount);
  const rotationX = new Float32Array(maxCount);
  const rotationY = new Float32Array(maxCount);
  const depth = new Float32Array(maxCount);

  radius[0] = 0.74;
  position[0] = bounds.x * 0.83;
  position[1] = -bounds.y * 0.72;

  for (let i = 1; i < maxCount; i++) {
    const offset = i * 2;
    radius[i] = 0.34 + random() * 0.28;
    position[offset] = (random() * 2 - 1) * Math.max(0, bounds.x - radius[i]);
    position[offset + 1] = (random() * 2 - 1) * Math.max(0, bounds.y - radius[i]);
    velocity[offset] = (random() * 2 - 1) * 0.45;
    velocity[offset + 1] = (random() * 2 - 1) * 0.3;
    rotationX[i] = random() * Math.PI * 2;
    rotationY[i] = random() * Math.PI * 2;
    depth[i] = (random() * 2 - 1) * 0.45;
  }

  return {
    maxCount,
    count: maxCount,
    position,
    velocity,
    radius,
    rotationX,
    rotationY,
    depth,
    targetX: position[0],
    targetY: position[1],
  };
}

export function resizeBallPhysics(state, bounds, count = state.count) {
  assertBounds(bounds);
  if (!state || !Number.isInteger(count) || count < 2 || count > state.maxCount) {
    throw new RangeError("Active ball count must fit the allocated physics state.");
  }

  state.count = count;
  for (let i = 0; i < count; i++) {
    const offset = i * 2;
    const radius = state.radius[i];
    state.position[offset] = clamp(state.position[offset], -bounds.x + radius, bounds.x - radius);
    state.position[offset + 1] = clamp(state.position[offset + 1], -bounds.y + radius, bounds.y - radius);
  }
  state.targetX = clamp(state.targetX, -bounds.x + state.radius[0], bounds.x - state.radius[0]);
  state.targetY = clamp(state.targetY, -bounds.y + state.radius[0], bounds.y - state.radius[0]);
}

export function resetBallDrop(state, bounds, seed = 0x7a11ba11) {
  assertBounds(bounds);
  if (!state) throw new TypeError("Ball-pit drop requires a physics state.");
  const random = seededRandom(seed);
  for (let i = 0; i < state.count; i++) {
    const offset = i * 2;
    const radius = state.radius[i];
    const row = i % 4;
    state.position[offset] =
      -bounds.x + radius + random() * Math.max(0, 2 * (bounds.x - radius));
    state.position[offset + 1] = clamp(
      bounds.y - radius - row * 0.5 - random() * 0.18,
      -bounds.y + radius,
      bounds.y - radius,
    );
    state.velocity[offset] = (random() * 2 - 1) * 0.55;
    state.velocity[offset + 1] = -0.35 - random() * 0.45;
    state.rotationX[i] = random() * Math.PI * 2;
    state.rotationY[i] = random() * Math.PI * 2;
  }
}

export function setBallpitTarget(state, bounds, x, y) {
  assertBounds(bounds);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError("Ball-pit target coordinates must be finite.");
  }
  const radius = state.radius[0];
  state.targetX = clamp(x, -bounds.x + radius, bounds.x - radius);
  state.targetY = clamp(y, -bounds.y + radius, bounds.y - radius);
}

function capVelocity(velocity, offset) {
  const x = velocity[offset];
  const y = velocity[offset + 1];
  const speed = Math.hypot(x, y);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    velocity[offset] *= scale;
    velocity[offset + 1] *= scale;
  }
}

function constrainBall(state, bounds, index) {
  const offset = index * 2;
  const radius = state.radius[index];
  const minX = -bounds.x + radius;
  const maxX = bounds.x - radius;
  const minY = -bounds.y + radius;
  const maxY = bounds.y - radius;

  if (state.position[offset] < minX) {
    state.position[offset] = minX;
    if (state.velocity[offset] < 0) state.velocity[offset] *= -WALL_BOUNCE;
  } else if (state.position[offset] > maxX) {
    state.position[offset] = maxX;
    if (state.velocity[offset] > 0) state.velocity[offset] *= -WALL_BOUNCE;
  }

  if (state.position[offset + 1] < minY) {
    state.position[offset + 1] = minY;
    if (state.velocity[offset + 1] < 0) state.velocity[offset + 1] *= -WALL_BOUNCE;
  } else if (state.position[offset + 1] > maxY) {
    state.position[offset + 1] = maxY;
    if (state.velocity[offset + 1] > 0) state.velocity[offset + 1] *= -WALL_BOUNCE;
  }
}

function resolveCollision(state, first, second, delta) {
  const firstOffset = first * 2;
  const secondOffset = second * 2;
  let dx = state.position[secondOffset] - state.position[firstOffset];
  let dy = state.position[secondOffset + 1] - state.position[firstOffset + 1];
  let distance = Math.hypot(dx, dy);
  const minDistance = state.radius[first] + state.radius[second];
  if (distance >= minDistance) return;

  if (distance < 0.0001) {
    const angle = (second * 2.399963229728653) % (Math.PI * 2);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minDistance - distance;

  if (first === 0) {
    state.position[secondOffset] += nx * overlap;
    state.position[secondOffset + 1] += ny * overlap;
    const relativeSpeed =
      (state.velocity[firstOffset] - state.velocity[secondOffset]) * nx +
      (state.velocity[firstOffset + 1] - state.velocity[secondOffset + 1]) * ny;
    const impulse = Math.max(0, relativeSpeed) * 1.15 + overlap / delta * 0.24;
    state.velocity[secondOffset] += nx * impulse;
    state.velocity[secondOffset + 1] += ny * impulse;
    capVelocity(state.velocity, secondOffset);
    return;
  }

  state.position[firstOffset] -= nx * overlap * 0.5;
  state.position[firstOffset + 1] -= ny * overlap * 0.5;
  state.position[secondOffset] += nx * overlap * 0.5;
  state.position[secondOffset + 1] += ny * overlap * 0.5;

  const relativeSpeed =
    (state.velocity[secondOffset] - state.velocity[firstOffset]) * nx +
    (state.velocity[secondOffset + 1] - state.velocity[firstOffset + 1]) * ny;
  if (relativeSpeed >= 0) return;

  const impulse = -(1 + COLLISION_BOUNCE) * relativeSpeed * 0.5;
  state.velocity[firstOffset] -= nx * impulse;
  state.velocity[firstOffset + 1] -= ny * impulse;
  state.velocity[secondOffset] += nx * impulse;
  state.velocity[secondOffset + 1] += ny * impulse;
}

export function stepBallPhysics(state, bounds, elapsed) {
  assertBounds(bounds);
  if (!state || !Number.isFinite(elapsed)) {
    throw new TypeError("Ball-pit physics requires a state and finite elapsed time.");
  }
  if (elapsed <= 0) return;

  const delta = Math.min(elapsed, MAX_DELTA);
  const controlX = state.position[0];
  const controlY = state.position[1];
  const follow = 1 - Math.exp(-18 * delta);
  state.position[0] += (state.targetX - controlX) * follow;
  state.position[1] += (state.targetY - controlY) * follow;
  state.velocity[0] = (state.position[0] - controlX) / delta;
  state.velocity[1] = (state.position[1] - controlY) / delta;
  state.rotationX[0] += state.velocity[1] * delta / state.radius[0];
  state.rotationY[0] += state.velocity[0] * delta / state.radius[0];
  constrainBall(state, bounds, 0);

  const damping = Math.pow(0.986, delta * 60);
  for (let i = 1; i < state.count; i++) {
    const offset = i * 2;
    state.velocity[offset] *= damping;
    state.velocity[offset + 1] = (state.velocity[offset + 1] - GRAVITY * delta) * damping;
    capVelocity(state.velocity, offset);
    state.position[offset] += state.velocity[offset] * delta;
    state.position[offset + 1] += state.velocity[offset + 1] * delta;
    constrainBall(state, bounds, i);
    state.rotationX[i] += state.velocity[offset + 1] * delta / state.radius[i];
    state.rotationY[i] += state.velocity[offset] * delta / state.radius[i];
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let first = 0; first < state.count; first++) {
      for (let second = first + 1; second < state.count; second++) {
        resolveCollision(state, first, second, delta);
      }
    }
    for (let i = 1; i < state.count; i++) constrainBall(state, bounds, i);
  }

  for (let i = 0; i < state.count * 2; i++) {
    if (!Number.isFinite(state.position[i]) || !Number.isFinite(state.velocity[i])) {
      throw new Error("Ball-pit physics produced a non-finite value.");
    }
  }
}

const normalizePoint = ([x, y, z]) => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};
const subtractPoint = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossPoint = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dotPoint = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function orientPolygon(face, vertices) {
  const a = vertices[face[0]];
  const b = vertices[face[1]];
  const c = vertices[face[2]];
  const normal = crossPoint(subtractPoint(b, a), subtractPoint(c, a));
  const center = face.reduce((sum, index) => {
    const point = vertices[index];
    return [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]];
  }, [0, 0, 0]);
  return dotPoint(normal, center) < 0 ? [...face].reverse() : face;
}

export function createSoccerBallTopology() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseVertices = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const baseFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const vertices = [];
  const directed = new Map();
  const neighbors = Array.from({ length: baseVertices.length }, () => new Set());

  const vertexOnEdge = (from, to) => {
    const key = `${from}:${to}`;
    if (directed.has(key)) return directed.get(key);
    const a = baseVertices[from];
    const b = baseVertices[to];
    const point = normalizePoint([
      (2 * a[0] + b[0]) / 3,
      (2 * a[1] + b[1]) / 3,
      (2 * a[2] + b[2]) / 3,
    ]);
    const index = vertices.push(point) - 1;
    directed.set(key, index);
    return index;
  };

  const hexagons = baseFaces.map(([a, b, c]) => {
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
    return orientPolygon([
      vertexOnEdge(a, b), vertexOnEdge(b, a),
      vertexOnEdge(b, c), vertexOnEdge(c, b),
      vertexOnEdge(c, a), vertexOnEdge(a, c),
    ], vertices);
  });

  const pentagons = baseVertices.map((baseVertex, from) => {
    const normal = normalizePoint(baseVertex);
    const reference = Math.abs(normal[1]) < 0.86 ? [0, 1, 0] : [1, 0, 0];
    const tangent = normalizePoint(crossPoint(reference, normal));
    const bitangent = normalizePoint(crossPoint(normal, tangent));
    const ordered = [...neighbors[from]].map(to => {
      const index = vertexOnEdge(from, to);
      const point = vertices[index];
      const radial = dotPoint(point, normal);
      const offset = [
        point[0] - normal[0] * radial,
        point[1] - normal[1] * radial,
        point[2] - normal[2] * radial,
      ];
      return {
        index,
        angle: Math.atan2(dotPoint(offset, bitangent), dotPoint(offset, tangent)),
      };
    }).sort((a, b) => a.angle - b.angle).map(item => item.index);
    return orientPolygon(ordered, vertices);
  });

  const edgeMap = new Map();
  for (const face of [...pentagons, ...hexagons]) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeMap.has(key)) edgeMap.set(key, [a, b]);
    }
  }

  return { vertices, pentagons, hexagons, edges: [...edgeMap.values()] };
}

function createFaceGeometry(vertices, faces) {
  const positions = [];
  const normals = [];
  for (const face of faces) {
    const center = face.reduce((sum, index) => {
      const point = vertices[index];
      return [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]];
    }, [0, 0, 0]).map(value => value / face.length);
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const normal = normalizePoint(crossPoint(subtractPoint(b, a), subtractPoint(c, a)));
    for (let i = 0; i < face.length; i++) {
      const next = (i + 1) % face.length;
      for (const point of [center, vertices[face[i]], vertices[face[next]]]) {
        positions.push(...point);
        normals.push(...normal);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function createSeamGeometry(vertices, edges) {
  const positions = [];
  const normals = [];
  const width = 0.018;
  for (const [first, second] of edges) {
    const a = vertices[first];
    const b = vertices[second];
    const edge = subtractPoint(b, a);
    const outward = normalizePoint([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
    const side = normalizePoint(crossPoint(edge, outward));
    const points = [
      [a[0] + side[0] * width + outward[0] * 0.008,
        a[1] + side[1] * width + outward[1] * 0.008,
        a[2] + side[2] * width + outward[2] * 0.008],
      [a[0] - side[0] * width + outward[0] * 0.008,
        a[1] - side[1] * width + outward[1] * 0.008,
        a[2] - side[2] * width + outward[2] * 0.008],
      [b[0] - side[0] * width + outward[0] * 0.008,
        b[1] - side[1] * width + outward[1] * 0.008,
        b[2] - side[2] * width + outward[2] * 0.008],
      [b[0] + side[0] * width + outward[0] * 0.008,
        b[1] + side[1] * width + outward[1] * 0.008,
        b[2] + side[2] * width + outward[2] * 0.008],
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(...points[index]);
      normals.push(...outward);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function createSoccerBallGeometries() {
  const topology = createSoccerBallTopology();
  return {
    hexagons: createFaceGeometry(topology.vertices, topology.hexagons),
    pentagons: createFaceGeometry(topology.vertices, topology.pentagons),
    seams: createSeamGeometry(topology.vertices, topology.edges),
  };
}

function cssToken(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function tokenColor(name, fallback) {
  try {
    return new THREE.Color(cssToken(name, fallback));
  } catch {
    return new THREE.Color(fallback);
  }
}

function activeCountForSize(width, height) {
  return clamp(Math.round(width * height / 30000), MIN_BALLS, MAX_BALLS);
}

function noOpController() {
  return { setActive() {}, setEnabled() {}, destroy() {} };
}

export function initLandingBallpit(host) {
  if (!(host instanceof HTMLElement)) {
    throw new TypeError("initLandingBallpit requires an HTMLElement host.");
  }
  const frameHost = host.closest(".hero-frame");
  if (!(frameHost instanceof HTMLElement)) return noOpController();

  let canvas = null;
  let touchTarget = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let bodyMesh = null;
  let panelMesh = null;
  let seamMesh = null;
  let bodyGeometry = null;
  let panelGeometry = null;
  let seamGeometry = null;
  let flagGeometry = null;
  let bodyMaterial = null;
  let panelMaterial = null;
  let seamMaterial = null;
  let keyLight = null;
  let rimLight = null;
  let physics = null;
  let bounds = { x: WORLD_HALF_HEIGHT, y: WORLD_HALF_HEIGHT };
  let frame = 0;
  let lastFrame = 0;
  let active = true;
  let enabled = true;
  let intersecting = false;
  let initialized = false;
  let failed = false;
  let destroyed = false;
  let pointerEngaged = false;
  let touchPointerId = null;
  let dropPending = false;
  let dropSequence = 0;
  let resizeObserver = null;
  let intersectionObserver = null;
  let themeObserver = null;
  const flagDecals = [];

  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reducedQuery.matches;
  const dummy = new THREE.Object3D();
  const flagNormal = new THREE.Vector3();
  const flagPosition = new THREE.Vector3();
  const flagQuaternion = new THREE.Quaternion();
  const flagScale = new THREE.Vector3(1.1, 1.1, 1);
  const worldForward = new THREE.Vector3(0, 0, 1);

  function canAnimate() {
    return initialized && active && enabled && intersecting && !document.hidden && !reduced &&
      !failed && !destroyed;
  }

  function stopLoop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }

  function setDummyForBall(index) {
    const offset = index * 2;
    dummy.position.set(physics.position[offset], physics.position[offset + 1], physics.depth[index]);
    dummy.rotation.set(physics.rotationX[index], physics.rotationY[index], index * 0.23);
    dummy.scale.setScalar(physics.radius[index]);
    dummy.updateMatrix();
  }

  function updateMatrices() {
    if (!physics || !bodyMesh || !panelMesh || !seamMesh) return;
    bodyMesh.count = physics.count;
    panelMesh.count = physics.count;
    seamMesh.count = physics.count;
    for (let i = 0; i < physics.count; i++) {
      setDummyForBall(i);
      bodyMesh.setMatrixAt(i, dummy.matrix);
      panelMesh.setMatrixAt(i, dummy.matrix);
      seamMesh.setMatrixAt(i, dummy.matrix);
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    panelMesh.instanceMatrix.needsUpdate = true;
    seamMesh.instanceMatrix.needsUpdate = true;

    for (const decal of flagDecals) {
      const visible = decal.index < physics.count;
      for (const mesh of decal.meshes) mesh.visible = visible;
      if (!visible) continue;
      setDummyForBall(decal.index);
      decal.meshes.forEach((mesh, i) => {
        mesh.matrix.copy(dummy.matrix).multiply(decal.localMatrices[i]);
        mesh.matrixWorldNeedsUpdate = true;
      });
    }

    if (touchTarget) {
      const width = frameHost.clientWidth;
      const height = frameHost.clientHeight;
      const size = Math.max(44, physics.radius[0] / bounds.y * height);
      touchTarget.style.width = `${size}px`;
      touchTarget.style.height = `${size}px`;
      touchTarget.style.left = `${(physics.position[0] / bounds.x + 1) * width * 0.5}px`;
      touchTarget.style.top = `${(1 - physics.position[1] / bounds.y) * height * 0.5}px`;
    }
  }

  function renderNow() {
    if (!renderer || !scene || !camera) return;
    updateMatrices();
    renderer.render(scene, camera);
  }

  function animate(now) {
    frame = 0;
    if (!canAnimate()) return;
    const delta = lastFrame ? (now - lastFrame) / 1000 : 1 / 60;
    lastFrame = now;
    try {
      stepBallPhysics(physics, bounds, delta);
      renderNow();
      frame = requestAnimationFrame(animate);
    } catch (error) {
      useFallback(error);
    }
  }

  function startLoop() {
    if (!frame && canAnimate()) {
      lastFrame = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }

  function performDrop() {
    if (!physics || reduced) {
      dropPending = false;
      renderNow();
      return;
    }
    resetBallDrop(physics, bounds, 0x7a11ba11 + dropSequence++);
    pointerEngaged = true;
    setBallpitTarget(
      physics,
      bounds,
      frameHost.clientWidth < 600 ? -bounds.x * 0.72 : bounds.x * 0.83,
      -bounds.y * 0.72,
    );
    dropPending = false;
    renderNow();
  }

  function updateTheme() {
    if (!bodyMesh || !panelMesh || !seamMesh) return;
    const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
    const body = new THREE.Color(dark ? "#f3f0e6" : "#fffdf7");
    const controlBody = body.clone().lerp(tokenColor("--blue", "#0097f4"), 0.18);
    const panel = new THREE.Color(dark ? "#15151a" : "#303039");
    const accent = tokenColor("--blue", "#0097f4");
    const controlSeam = accent.clone().multiplyScalar(0.58);

    for (let i = 0; i < MAX_BALLS; i++) {
      bodyMesh.setColorAt(i, i === 0 ? controlBody : body);
      panelMesh.setColorAt(i, i === 0 ? accent : panel);
      seamMesh.setColorAt(i, i === 0 ? controlSeam : panel);
    }
    bodyMesh.instanceColor.needsUpdate = true;
    panelMesh.instanceColor.needsUpdate = true;
    seamMesh.instanceColor.needsUpdate = true;
    keyLight.color.set(tokenColor("--text", "#ffffff"));
    rimLight.color.set(tokenColor("--teal", "#00b291"));
    renderNow();
  }

  function resize() {
    if (!renderer || !camera || !physics) return;
    const width = frameHost.clientWidth;
    const height = frameHost.clientHeight;
    if (width < 2 || height < 2) return;

    bounds = {
      x: WORLD_HALF_HEIGHT * width / height,
      y: WORLD_HALF_HEIGHT,
    };
    camera.left = -bounds.x;
    camera.right = bounds.x;
    camera.top = bounds.y;
    camera.bottom = -bounds.y;
    camera.updateProjectionMatrix();
    resizeBallPhysics(physics, bounds, activeCountForSize(width, height));
    if (!pointerEngaged) {
      const idleX = width < 600 ? -bounds.x * 0.72 : bounds.x * 0.83;
      const idleY = -bounds.y * 0.72;
      physics.position[0] = physics.targetX = idleX;
      physics.position[1] = physics.targetY = idleY;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_LIMIT));
    renderer.setSize(width, height, false);
    renderNow();
  }

  function pointerToWorld(event) {
    const rect = frameHost.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width * 2 - 1) * bounds.x;
    const y = (1 - (event.clientY - rect.top) / rect.height * 2) * bounds.y;
    pointerEngaged = true;
    setBallpitTarget(physics, bounds, x, y);
    startLoop();
  }

  function onPointerDown(event) {
    if (event.pointerType !== "touch" || touchPointerId !== null) return;
    touchPointerId = event.pointerId;
    touchTarget.setPointerCapture?.(touchPointerId);
    pointerToWorld(event);
  }

  function onPointerMove(event) {
    if (event.pointerType === "touch") {
      if (event.pointerId === touchPointerId) pointerToWorld(event);
      return;
    }
    pointerToWorld(event);
  }

  function finishTouch(event) {
    if (event.pointerId !== touchPointerId) return;
    if (touchTarget.hasPointerCapture?.(touchPointerId)) {
      touchTarget.releasePointerCapture(touchPointerId);
    }
    touchPointerId = null;
    pointerEngaged = false;
    setBallpitTarget(
      physics,
      bounds,
      frameHost.clientWidth < 600 ? -bounds.x * 0.72 : bounds.x * 0.83,
      -bounds.y * 0.72,
    );
  }

  function attachPointerEvents() {
    frameHost.addEventListener("pointermove", onPointerMove);
    touchTarget.addEventListener("pointerdown", onPointerDown);
    touchTarget.addEventListener("pointermove", onPointerMove);
    touchTarget.addEventListener("pointerup", finishTouch);
    touchTarget.addEventListener("pointercancel", finishTouch);
  }

  function detachPointerEvents() {
    frameHost.removeEventListener("pointermove", onPointerMove);
    touchTarget?.removeEventListener("pointerdown", onPointerDown);
    touchTarget?.removeEventListener("pointermove", onPointerMove);
    touchTarget?.removeEventListener("pointerup", finishTouch);
    touchTarget?.removeEventListener("pointercancel", finishTouch);
    touchPointerId = null;
  }

  function flagMatrixForBall(index, opposite = false) {
    flagQuaternion.setFromEuler(
      new THREE.Euler(physics.rotationX[index], physics.rotationY[index], index * 0.23),
    ).invert();
    flagNormal.copy(worldForward).applyQuaternion(flagQuaternion).normalize();
    if (opposite) flagNormal.multiplyScalar(-1);
    flagPosition.copy(flagNormal).multiplyScalar(1.045);
    flagQuaternion.setFromUnitVectors(worldForward, flagNormal);
    return new THREE.Matrix4().compose(flagPosition, flagQuaternion, flagScale);
  }

  function loadFlagDecals() {
    flagGeometry = new THREE.PlaneGeometry(1, 2 / 3);
    for (const [index, code] of FLAG_DECALS) {
      const url = new URL(`../flags/${code}.svg`, import.meta.url).href;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        const textureCanvas = document.createElement("canvas");
        textureCanvas.width = 180;
        textureCanvas.height = 120;
        const context = textureCanvas.getContext("2d");
        if (!context) {
          console.warn(`Ball flag flags/${code}.svg could not be rasterized.`);
          return;
        }
        context.drawImage(image, 0, 0, textureCanvas.width, textureCanvas.height);
        const texture = new THREE.CanvasTexture(textureCanvas);
        if (destroyed || failed || !scene || !physics) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.FrontSide,
          toneMapped: false,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        const meshes = [new THREE.Mesh(flagGeometry, material), new THREE.Mesh(flagGeometry, material)];
        for (const mesh of meshes) {
          mesh.matrixAutoUpdate = false;
          mesh.renderOrder = 3;
          scene.add(mesh);
        }
        const decal = {
          index,
          meshes,
          material,
          texture,
          localMatrices: [flagMatrixForBall(index), flagMatrixForBall(index, true)],
        };
        flagDecals.push(decal);
        renderNow();
      };
      image.onerror = error => {
        console.warn(`Ball flag flags/${code}.svg could not be loaded.`, error);
      };
      image.src = url;
    }
  }

  function disposeScene() {
    stopLoop();
    canvas?.removeEventListener("webglcontextlost", onContextLost);
    for (const decal of flagDecals.splice(0)) {
      for (const mesh of decal.meshes) scene?.remove(mesh);
      decal.material.dispose();
      decal.texture.dispose();
    }
    bodyGeometry?.dispose();
    panelGeometry?.dispose();
    seamGeometry?.dispose();
    flagGeometry?.dispose();
    bodyMaterial?.dispose();
    panelMaterial?.dispose();
    seamMaterial?.dispose();
    renderer?.dispose();
    canvas?.remove();
    touchTarget?.remove();
    canvas = touchTarget = renderer = scene = camera = bodyMesh = panelMesh = seamMesh = null;
    bodyGeometry = panelGeometry = seamGeometry = flagGeometry = null;
    bodyMaterial = panelMaterial = seamMaterial = null;
    keyLight = rimLight = physics = null;
    initialized = false;
  }

  function useFallback(error) {
    if (failed || destroyed) return;
    failed = true;
    detachPointerEvents();
    disposeScene();
    host.classList.remove("ballpit-ready");
    host.classList.add("ballpit-fallback");
    console.warn("Landing ballpit disabled; using the static hero background.", error);
  }

  function onContextLost(event) {
    event.preventDefault();
    useFallback(new Error("WebGL context lost."));
  }

  function initializeScene() {
    if (initialized || failed || destroyed || !active) return;
    try {
      canvas = document.createElement("canvas");
      canvas.className = "landing-ballpit-canvas";
      canvas.setAttribute("aria-hidden", "true");
      touchTarget = document.createElement("span");
      touchTarget.className = "landing-ballpit-touch";
      touchTarget.setAttribute("aria-hidden", "true");
      host.append(canvas);
      frameHost.append(touchTarget);

      const context = canvas.getContext("webgl2", { alpha: true, antialias: true }) ||
        canvas.getContext("webgl", { alpha: true, antialias: true });
      if (!context) throw new Error("WebGL is unavailable.");

      renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);

      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 30);
      camera.position.set(0, 0, 12);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 1.65));
      keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
      keyLight.position.set(3, 5, 7);
      scene.add(keyLight);
      rimLight = new THREE.DirectionalLight(0x00b291, 1.1);
      rimLight.position.set(-5, 1, 4);
      scene.add(rimLight);

      const soccerGeometry = createSoccerBallGeometries();
      bodyGeometry = soccerGeometry.hexagons;
      panelGeometry = soccerGeometry.pentagons;
      seamGeometry = soccerGeometry.seams;
      bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        roughness: 0.78,
        metalness: 0.04,
      });
      panelMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        roughness: 0.82,
        metalness: 0.02,
      });
      seamMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0,
      });

      bodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, MAX_BALLS);
      panelMesh = new THREE.InstancedMesh(panelGeometry, panelMaterial, MAX_BALLS);
      seamMesh = new THREE.InstancedMesh(seamGeometry, seamMaterial, MAX_BALLS);
      bodyMesh.frustumCulled = false;
      panelMesh.frustumCulled = false;
      seamMesh.frustumCulled = false;
      scene.add(bodyMesh, panelMesh, seamMesh);

      physics = createBallPhysics(MAX_BALLS, bounds);
      loadFlagDecals();
      canvas.addEventListener("webglcontextlost", onContextLost);
      attachPointerEvents();
      initialized = true;
      host.classList.remove("ballpit-fallback");
      host.classList.add("ballpit-ready");
      resize();
      updateTheme();
      if (dropPending) performDrop();
      startLoop();
    } catch (error) {
      useFallback(error);
    }
  }

  function onVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
  }

  function onReducedMotionChange(event) {
    reduced = event.matches;
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

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(frameHost);

  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver((entries) => {
      intersecting = entries.some(entry => entry.isIntersecting);
      if (intersecting) {
        initializeScene();
        resize();
        startLoop();
      } else {
        stopLoop();
      }
    }, { rootMargin: "100px" });
    intersectionObserver.observe(frameHost);
  } else {
    intersecting = true;
    initializeScene();
  }

  return {
    setActive(nextActive) {
      active = Boolean(nextActive);
      if (!active) {
        stopLoop();
        return;
      }
      initializeScene();
      resize();
      startLoop();
    },
    setEnabled(nextEnabled, restart = false) {
      enabled = Boolean(nextEnabled);
      host.classList.toggle("ballpit-off", !enabled);
      frameHost.classList.toggle("ballpit-off", !enabled);
      if (!enabled) {
        dropPending = false;
        stopLoop();
        return;
      }
      if (restart) dropPending = true;
      initializeScene();
      if (dropPending && physics) performDrop();
      renderNow();
      startLoop();
    },
    destroy() {
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
      detachPointerEvents();
      disposeScene();
      host.classList.remove("ballpit-ready", "ballpit-fallback");
      frameHost.classList.remove("ballpit-off");
    },
  };
}
