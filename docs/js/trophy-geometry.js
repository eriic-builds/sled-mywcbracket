import * as THREE from "./vendor/three.module.min.js";

export const TROPHY_TOP_Y = 1.78;
export const TROPHY_BOTTOM_Y = -1.62;

export function createTrophySculpture(colors = {}) {
  const root = new THREE.Group();
  root.name = "world-cup-trophy";
  root.rotation.order = "YXZ";

  const geometries = [];
  const materials = {
    body: new THREE.MeshPhysicalMaterial({
      color: colors.body ?? "#d5aa35",
      roughness: 0.34,
      metalness: 0.76,
      clearcoat: 0.16,
      clearcoatRoughness: 0.36,
      flatShading: false,
    }),
    inset: new THREE.MeshPhysicalMaterial({
      color: colors.inset ?? "#1c1b21",
      roughness: 0.5,
      metalness: 0.38,
      clearcoat: 0.08,
      clearcoatRoughness: 0.5,
      flatShading: false,
    }),
    seam: new THREE.MeshPhysicalMaterial({
      color: colors.seam ?? "#0097f4",
      roughness: 0.42,
      metalness: 0.56,
      clearcoat: 0.1,
      clearcoatRoughness: 0.46,
      flatShading: false,
    }),
  };
  let disposed = false;

  function addMesh(geometry, material, x, y, z, name) {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    root.add(mesh);
    return mesh;
  }

  const globe = addMesh(
    new THREE.SphereGeometry(0.64, 64, 40),
    materials.body,
    0,
    1.11,
    0,
    "trophy-globe",
  );
  globe.scale.y = 1.045;

  const globeRingGeometry = new THREE.TorusGeometry(0.645, 0.014, 12, 72);
  const equator = addMesh(
    globeRingGeometry,
    materials.body,
    0,
    1.11,
    0,
    "trophy-globe-equator",
  );
  equator.rotation.x = Math.PI / 2;
  const meridianFront = addMesh(
    globeRingGeometry,
    materials.body,
    0,
    1.11,
    0,
    "trophy-globe-meridian-front",
  );
  const meridianSide = addMesh(
    globeRingGeometry,
    materials.body,
    0,
    1.11,
    0,
    "trophy-globe-meridian-side",
  );
  meridianSide.rotation.y = Math.PI / 2;
  const upperLatitude = addMesh(
    new THREE.TorusGeometry(0.58, 0.012, 10, 64),
    materials.body,
    0,
    1.37,
    0,
    "trophy-globe-upper-latitude",
  );
  upperLatitude.rotation.x = Math.PI / 2;

  const stemProfile = [
    new THREE.Vector2(0.23, -0.92),
    new THREE.Vector2(0.32, -0.8),
    new THREE.Vector2(0.27, -0.54),
    new THREE.Vector2(0.18, -0.25),
    new THREE.Vector2(0.2, 0.14),
    new THREE.Vector2(0.29, 0.45),
    new THREE.Vector2(0.36, 0.68),
  ];
  addMesh(
    new THREE.LatheGeometry(stemProfile, 64),
    materials.body,
    0,
    0,
    0,
    "trophy-stem",
  );

  const supportCurves = [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.19, -0.02, 0),
      new THREE.Vector3(-0.38, 0.29, 0.03),
      new THREE.Vector3(-0.5, 0.63, 0.035),
      new THREE.Vector3(-0.43, 1.02, 0.025),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.19, -0.02, 0),
      new THREE.Vector3(0.38, 0.29, 0.03),
      new THREE.Vector3(0.5, 0.63, 0.035),
      new THREE.Vector3(0.43, 1.02, 0.025),
    ]),
  ];
  supportCurves.forEach((curve, index) => {
    addMesh(
      new THREE.TubeGeometry(curve, 44, 0.098, 18, false),
      materials.body,
      0,
      0,
      0,
      index === 0 ? "trophy-left-support" : "trophy-right-support",
    );
  });

  const supportJointGeometry = new THREE.SphereGeometry(0.135, 32, 20);
  for (const x of [-0.42, 0.42]) {
    const joint = addMesh(supportJointGeometry, materials.body, x, 0.91, 0.02);
    joint.scale.set(0.86, 1.12, 0.82);
  }

  const collar = addMesh(
    new THREE.TorusGeometry(0.34, 0.045, 12, 64),
    materials.seam,
    0,
    0.59,
    0,
    "trophy-collar",
  );
  collar.rotation.x = Math.PI / 2;

  addMesh(
    new THREE.CylinderGeometry(0.36, 0.46, 0.32, 56),
    materials.inset,
    0,
    -0.92,
    0,
    "trophy-lower-stem",
  );
  addMesh(
    new THREE.CylinderGeometry(0.52, 0.67, 0.27, 64),
    materials.body,
    0,
    -1.1,
    0,
    "trophy-upper-base",
  );
  addMesh(
    new THREE.CylinderGeometry(0.67, 0.78, 0.4, 64),
    materials.body,
    0,
    -1.42,
    0,
    "trophy-base",
  );
  addMesh(
    new THREE.CylinderGeometry(0.68, 0.73, 0.12, 64),
    materials.inset,
    0,
    -1.39,
    0,
    "trophy-base-inset",
  );

  const baseRingGeometry = new THREE.TorusGeometry(0.67, 0.036, 10, 72);
  for (const [index, y] of [-1.19, -1.58].entries()) {
    const ring = addMesh(
      baseRingGeometry,
      index === 0 ? materials.seam : materials.body,
      0,
      y,
      0,
      `trophy-base-ring-${index + 1}`,
    );
    ring.rotation.x = Math.PI / 2;
  }

  const leftGrip = new THREE.Object3D();
  leftGrip.name = "trophy-left-grip";
  leftGrip.position.set(-0.44, 0.29, 0.06);
  const rightGrip = new THREE.Object3D();
  rightGrip.name = "trophy-right-grip";
  rightGrip.position.set(0.44, 0.29, 0.06);
  const top = new THREE.Object3D();
  top.name = "trophy-top";
  top.position.set(0, TROPHY_TOP_Y, 0);
  const bottom = new THREE.Object3D();
  bottom.name = "trophy-bottom";
  bottom.position.set(0, TROPHY_BOTTOM_Y, 0);
  root.add(leftGrip, rightGrip, top, bottom);

  function setColors(nextColors = {}) {
    if (nextColors.body !== undefined) materials.body.color.set(nextColors.body);
    if (nextColors.inset !== undefined) materials.inset.color.set(nextColors.inset);
    if (nextColors.seam !== undefined) materials.seam.color.set(nextColors.seam);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const geometry of new Set(geometries)) geometry.dispose();
    for (const material of new Set(Object.values(materials))) material.dispose();
    geometries.length = 0;
    root.clear();
  }

  return {
    root,
    anchors: {
      leftGrip,
      rightGrip,
      top,
      bottom,
    },
    materials,
    setColors,
    dispose,
  };
}
