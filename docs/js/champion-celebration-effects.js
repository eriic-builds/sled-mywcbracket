import * as THREE from "./vendor/three.module.min.js";
import {
  MAX_CROWD_INSTANCES,
  PHONE_CROWD_INSTANCES,
} from "./champion-celebration-models.js";

export const EFFECT_QUALITY = Object.freeze({
  desktop: { crowd: MAX_CROWD_INSTANCES, confetti: 384 },
  phone: { crowd: PHONE_CROWD_INSTANCES, confetti: 192 },
});

function seededUnit(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createCelebrationEffects({
  scene,
  palette,
  flagTexture,
  seed,
  stadium,
  captain,
  teammates,
  profile = "desktop",
  bannerX = 0,
  podiumCenterX = 0,
}) {
  const random = seededUnit(seed ^ 0x51f15e);
  const resources = [];
  let destroyed = false;
  let currentProfile = profile;

  const flagWidth = 4.6;
  const flagHalfWidth = flagWidth / 2;
  const flagGeometry = new THREE.PlaneGeometry(flagWidth, 2.3, 14, 8);
  const flagPosition = flagGeometry.attributes.position;
  const flagBase = new Float32Array(flagPosition.array);
  const flagMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    map: flagTexture || null,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    toneMapped: false,
  });
  const flagGroup = new THREE.Group();
  flagGroup.name = "champion-flag-group";
  flagGroup.position.set(bannerX, 3.42, -2.18);
  flagGroup.visible = false;
  const flag = new THREE.Mesh(flagGeometry, flagMaterial);
  flag.name = "segmented-champion-flag";
  flagGroup.add(flag);
  const poleGeometry = new THREE.CylinderGeometry(0.045, 0.055, 3.75, 24);
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: "#d5b45b",
    flatShading: false,
    roughness: 0.28,
    metalness: 0.72,
  });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.set(-flagHalfWidth - 0.16, 0.06, -0.04);
  const finialGeometry = new THREE.SphereGeometry(0.1, 20, 14);
  const finial = new THREE.Mesh(finialGeometry, poleMaterial);
  finial.position.set(-flagHalfWidth - 0.16, 2.02, -0.04);
  flagGroup.add(pole, finial);
  scene.add(flagGroup);
  resources.push(flagGeometry, flagMaterial, poleGeometry, poleMaterial, finialGeometry);

  const confettiGeometry = new THREE.BoxGeometry(0.055, 0.15, 0.018);
  const confettiMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const confetti = new THREE.InstancedMesh(
    confettiGeometry,
    confettiMaterial,
    EFFECT_QUALITY.desktop.confetti,
  );
  confetti.name = "country-confetti";
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.frustumCulled = false;
  scene.add(confetti);
  resources.push(confettiGeometry, confettiMaterial);

  const maxConfetti = EFFECT_QUALITY.desktop.confetti;
  const spawn = new Float32Array(maxConfetti * 3);
  const drift = new Float32Array(maxConfetti * 2);
  const phase = new Float32Array(maxConfetti);
  const lifetime = new Float32Array(maxConfetti);
  const spin = new Float32Array(maxConfetti * 2);
  const colorIndex = new Uint8Array(maxConfetti);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const colors = [palette.primary, palette.secondary, palette.accent, "#f5c451", "#f7f5ef"];

  for (let index = 0; index < maxConfetti; index++) {
    const offset3 = index * 3;
    const offset2 = index * 2;
    spawn[offset3] = podiumCenterX - 5 + random() * 10;
    spawn[offset3 + 1] = 4.4 + random() * 3.2;
    spawn[offset3 + 2] = -1.4 + random() * 4.8;
    drift[offset2] = -0.38 + random() * 0.76;
    drift[offset2 + 1] = -0.24 + random() * 0.48;
    phase[index] = random() * 4.5;
    lifetime[index] = 2.4 + random() * 2.9;
    spin[offset2] = 1.2 + random() * 4.6;
    spin[offset2 + 1] = 1.1 + random() * 4.2;
    colorIndex[index] = Math.floor(random() * colors.length);
    confetti.setColorAt(index, color.set(colors[colorIndex[index]]));
  }
  if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;

  const flareCount = 12;
  const flareFlightSeconds = 1.25;
  const flareRelaunchSeconds = 2;
  const flareGeometry = new THREE.CapsuleGeometry(0.035, 0.34, 6, 12);
  const flareMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    toneMapped: false,
  });
  const flares = new THREE.InstancedMesh(flareGeometry, flareMaterial, flareCount);
  flares.name = "champion-flare-comets";
  flares.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flares.frustumCulled = false;
  flares.visible = false;
  scene.add(flares);
  resources.push(flareGeometry, flareMaterial);

  const flareBaseX = new Float32Array(flareCount);
  const flareBaseZ = new Float32Array(flareCount);
  const flareDelay = new Float32Array(flareCount);
  const flareHeight = new Float32Array(flareCount);
  const flareArc = new Float32Array(flareCount);
  const flareSide = new Int8Array(flareCount);
  const flareDummy = new THREE.Object3D();
  const flareColors = ["#fff1b5", "#f5c451", palette.primary, palette.accent];
  for (let index = 0; index < flareCount; index++) {
    const side = index % 2 ? 1 : -1;
    const lane = index % 4 < 2 ? 2.55 : 3.1;
    flareSide[index] = side;
    flareBaseX[index] = podiumCenterX + side * (lane + random() * 0.22);
    flareBaseZ[index] = 1.2 + random() * 0.55;
    flareDelay[index] = Math.floor(index / 2) * 0.14 + random() * 0.05;
    flareHeight[index] = 4.25 + random() * 1.35;
    flareArc[index] = 0.32 + random() * 0.5;
    flares.setColorAt(index, color.set(flareColors[index % flareColors.length]));
    flareDummy.scale.setScalar(0);
    flareDummy.updateMatrix();
    flares.setMatrixAt(index, flareDummy.matrix);
  }
  flares.instanceMatrix.needsUpdate = true;
  if (flares.instanceColor) flares.instanceColor.needsUpdate = true;

  const flareGlows = [
    new THREE.PointLight("#ffbd63", 0, 8, 2),
    new THREE.PointLight("#ffd88d", 0, 8, 2),
  ];
  flareGlows[0].position.set(podiumCenterX - 4, 1.1, 1.35);
  flareGlows[1].position.set(podiumCenterX + 4, 1.1, 1.35);
  scene.add(...flareGlows);

  const heroSpot = new THREE.SpotLight(palette.accent, 0, 18, Math.PI / 7, 0.5, 1.4);
  heroSpot.name = "celebration-hero-spot";
  heroSpot.position.set(podiumCenterX, 8.2, 5.2);
  heroSpot.target.position.set(podiumCenterX, 2.4, 0);
  scene.add(heroSpot, heroSpot.target);

  const trophyGlint = new THREE.PointLight("#fff2bd", 0, 7, 2);
  trophyGlint.name = "trophy-glint";
  trophyGlint.position.set(podiumCenterX, 4.4, 1.4);
  scene.add(trophyGlint);

  const flashLights = [
    new THREE.PointLight("#fff1dc", 0, 8, 2),
    new THREE.PointLight("#ffd6aa", 0, 8, 2),
    new THREE.PointLight("#ffe7c2", 0, 8, 2),
  ];
  flashLights[0].position.set(podiumCenterX - 4.8, 2.2, 4);
  flashLights[1].position.set(podiumCenterX, 2.4, 5);
  flashLights[2].position.set(podiumCenterX + 4.8, 2.1, 4);
  scene.add(...flashLights);

  const sideWashes = [
    new THREE.SpotLight(palette.primary, 0.24, 24, Math.PI / 6.5, 0.62, 1.4),
    new THREE.SpotLight(palette.secondary, 0.2, 24, Math.PI / 6.5, 0.62, 1.4),
  ];
  sideWashes[0].position.set(podiumCenterX - 5.6, 6.4, 4.2);
  sideWashes[0].target.position.set(podiumCenterX, 2.1, 0);
  sideWashes[1].position.set(podiumCenterX + 5.6, 6.4, 4.2);
  sideWashes[1].target.position.set(podiumCenterX, 2.1, 0);
  scene.add(
    sideWashes[0],
    sideWashes[0].target,
    sideWashes[1],
    sideWashes[1].target,
  );

  function setProfile(nextProfile) {
    currentProfile = nextProfile === "phone" ? "phone" : "desktop";
    const quality = EFFECT_QUALITY[currentProfile];
    confetti.count = quality.confetti;
    stadium.setProfile(currentProfile);
  }

  function updateFlag(timeSeconds, unfurl) {
    flagGroup.visible = unfurl > 0.001;
    flagMaterial.opacity = Math.min(1, unfurl * 1.6);
    if (!flagGroup.visible) return;
    const values = flagPosition.array;
    for (let index = 0; index < flagPosition.count; index++) {
      const offset = index * 3;
      const baseX = flagBase[offset];
      const baseY = flagBase[offset + 1];
      const poleDistance = (baseX + flagHalfWidth) / flagWidth;
      values[offset] =
        -flagHalfWidth + (baseX + flagHalfWidth) * unfurl;
      values[offset + 1] = baseY;
      values[offset + 2] = Math.sin(timeSeconds * 2.15 + poleDistance * 5.8) *
        0.16 * poleDistance * unfurl;
    }
    flagPosition.needsUpdate = true;
  }

  function updateCrowd(timeSeconds, opening, crowdPeak) {
    const crowd = stadium.crowd;
    const count = EFFECT_QUALITY[currentProfile].crowd;
    crowd.bodies.count = count;
    crowd.heads.count = count;
    crowd.arms.count = count * 2;
    const reveal = Math.min(1, opening * 1.45);
    const amplitude = 0.025 + crowdPeak * 0.13;
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      const figureScale = crowd.scales[index];
      const bounce = Math.sin(timeSeconds * (2.2 + (index % 5) * 0.07) + crowd.phases[index]) *
        amplitude;
      crowd.dummy.rotation.set(0, 0, 0);
      crowd.dummy.position.set(
        crowd.basePositions[offset],
        crowd.basePositions[offset + 1] - (1 - reveal) * 0.55 + bounce,
        crowd.basePositions[offset + 2],
      );
      const revealScale = figureScale * (0.6 + reveal * 0.4);
      crowd.dummy.scale.set(revealScale * 0.88, revealScale, revealScale * 0.88);
      crowd.dummy.updateMatrix();
      crowd.bodies.setMatrixAt(index, crowd.dummy.matrix);
      crowd.dummy.position.y += 0.22 * figureScale;
      crowd.dummy.scale.setScalar(revealScale);
      crowd.dummy.updateMatrix();
      crowd.heads.setMatrixAt(index, crowd.dummy.matrix);
      const bodyY = crowd.basePositions[offset + 1] - (1 - reveal) * 0.55 + bounce;
      const armRaise = 0.34 + crowdPeak * (0.92 + (index % 3) * 0.09);
      crowd.dummy.position.set(
        crowd.basePositions[offset] - 0.06 * figureScale,
        bodyY + 0.12 * figureScale,
        crowd.basePositions[offset + 2],
      );
      crowd.dummy.rotation.z = armRaise;
      crowd.dummy.scale.setScalar(revealScale);
      crowd.dummy.updateMatrix();
      crowd.arms.setMatrixAt(index * 2, crowd.dummy.matrix);
      crowd.dummy.position.x = crowd.basePositions[offset] + 0.06 * figureScale;
      crowd.dummy.rotation.z = -armRaise;
      crowd.dummy.updateMatrix();
      crowd.arms.setMatrixAt(index * 2 + 1, crowd.dummy.matrix);
    }
    crowd.bodies.instanceMatrix.needsUpdate = true;
    crowd.heads.instanceMatrix.needsUpdate = true;
    crowd.arms.instanceMatrix.needsUpdate = true;
  }

  function updateConfetti(progress) {
    confetti.visible = progress.confetti > 0.001;
    if (!confetti.visible) return;
    const count = EFFECT_QUALITY[currentProfile].confetti;
    for (let index = 0; index < count; index++) {
      const offset3 = index * 3;
      const offset2 = index * 2;
      const local = progress.confettiElapsed + phase[index];
      const cycle = local % lifetime[index];
      const enabled = Math.min(1, progress.confetti * 1.6);
      dummy.position.set(
        spawn[offset3] + drift[offset2] * cycle,
        spawn[offset3 + 1] - 1.55 * cycle + Math.sin(cycle * 3 + phase[index]) * 0.16,
        spawn[offset3 + 2] + drift[offset2 + 1] * cycle,
      );
      dummy.rotation.set(cycle * spin[offset2], cycle * spin[offset2 + 1], phase[index]);
      dummy.scale.setScalar(enabled);
      dummy.updateMatrix();
      confetti.setMatrixAt(index, dummy.matrix);
    }
    confetti.instanceMatrix.needsUpdate = true;
  }

  function updateFlares(progress) {
    flares.visible = progress.flares > 0.001;
    let glow = 0;
    for (let index = 0; index < flareCount; index++) {
      const elapsed = progress.flareElapsed - flareDelay[index];
      const cycleElapsed = elapsed >= 0 ? elapsed % flareRelaunchSeconds : -1;
      const local = cycleElapsed / flareFlightSeconds;
      const active = progress.flares > 0.001 && local > 0 && local < 1;
      const travel = clamp(local);
      const envelope = active ? Math.sin(travel * Math.PI) : 0;
      const side = flareSide[index];
      flareDummy.position.set(
        flareBaseX[index] - side * flareArc[index] * travel,
        0.32 + flareHeight[index] * travel - 0.72 * travel * travel,
        flareBaseZ[index] - travel * 1.15,
      );
      flareDummy.rotation.set(0, 0, side * (0.08 + travel * 0.2));
      flareDummy.scale.set(0.72 * envelope, 0.8 + envelope * 1.25, 0.72 * envelope);
      flareDummy.updateMatrix();
      flares.setMatrixAt(index, flareDummy.matrix);
      glow = Math.max(glow, envelope);
    }
    flares.instanceMatrix.needsUpdate = true;
    flareGlows[0].intensity = glow * 2.4;
    flareGlows[1].intensity = glow * 2.4;
  }

  function updateSecondaryMotion(timeSeconds, payoff) {
    for (let index = 0; index < teammates.length; index++) {
      const rig = teammates[index];
      const offset = index * 0.55;
      rig.joints.chest.rotation.z += Math.sin(timeSeconds * 3.1 + offset) * 0.025 * payoff;
      rig.joints.leftShoulder.rotation.z += Math.sin(timeSeconds * 3.7 + offset) * 0.11 * payoff;
      rig.joints.rightShoulder.rotation.z -= Math.cos(timeSeconds * 3.4 + offset) * 0.1 * payoff;
      rig.joints.head.rotation.y += Math.sin(timeSeconds * 2.2 + offset) * 0.05 * payoff;
    }
    captain.joints.chest.rotation.z += Math.sin(timeSeconds * 2.4) * 0.015 * payoff;
  }

  function update(timeSeconds, progress) {
    if (destroyed) return;
    updateFlag(timeSeconds, progress.flag);
    updateCrowd(timeSeconds, progress.opening, progress.crowdPeak);
    updateConfetti(progress);
    updateFlares(progress);

    const liftPulse = Math.sin(Math.min(1, progress.lift) * Math.PI);
    heroSpot.intensity = 1.2 * liftPulse + progress.lighting * 1.45;
    sideWashes[0].intensity = 0.24 + progress.lighting * 1.1;
    sideWashes[1].intensity = 0.2 + progress.lighting * 0.9;
    trophyGlint.intensity = progress.lift > 0
      ? Math.max(0, Math.sin(timeSeconds * 7.5)) * (1.5 + progress.lighting)
      : 0;
    trophyGlint.position.x =
      podiumCenterX + Math.sin(timeSeconds * 1.7) * 0.75;
    for (let index = 0; index < flashLights.length; index++) {
      const pulse = Math.max(0, Math.sin(timeSeconds * (11 + index * 1.7) + index * 2.1));
      flashLights[index].intensity = progress.flashes * (pulse > 0.92 ? 3.4 : 0);
    }
    updateSecondaryMotion(timeSeconds, Math.max(progress.lighting, progress.finalHold));
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    scene.remove(
      flagGroup,
      confetti,
      flares,
      ...flareGlows,
      heroSpot,
      heroSpot.target,
      trophyGlint,
      ...flashLights,
      sideWashes[0],
      sideWashes[0].target,
      sideWashes[1],
      sideWashes[1].target,
    );
    for (const resource of resources) resource.dispose();
  }

  setProfile(profile);
  return {
    setProfile,
    update,
    destroy,
  };
}
