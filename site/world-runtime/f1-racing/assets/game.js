import * as THREE from "./lib/three.module.min.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { MeshoptDecoder } from "./lib/meshopt_decoder.module.js";
import { MODEL_ASSETS } from "./model-assets.js";
import { TRACK_ASSETS } from "./track-assets.js";

const $ = (selector) => document.querySelector(selector);
const debugParams = new URLSearchParams(window.location.search);
const wheelCalibrationId = debugParams.get("wheelDebug");
const wheelCalibrationView = debugParams.get("view") || "left";
const wheelCalibrationPose = Number(debugParams.get("pose") || 1.75);
const wheelCalibrationOverlayVisible = debugParams.get("overlay") !== "0";
const wheelCalibrationColors = debugParams.get("colors") !== "0";
const wheelCalibrationIndices = (debugParams.get("wheelIndices") || "")
  .split(",")
  .filter(Boolean)
  .map(Number);
const wheelCalibrationMode = Boolean(wheelCalibrationId);
const wheelCalibrationPalette = ["#ff3b30", "#00d7ff", "#ffd60a", "#bf5af2", "#34c759", "#ff9f0a"];
const ui = {
  shell: $("#game-shell"),
  host: $("#game"),
  entryFilm: $("#entry-film"),
  entryVideo: $("#entry-film-video"),
  entrySkip: $("#entry-film-skip"),
  raceBgm: $("#race-bgm"),
  start: $("#start-screen"),
  startButton: $("#start-button"),
  result: $("#result-screen"),
  restartButton: $("#restart-button"),
  rank: $("#rank"),
  lap: $("#lap"),
  timer: $("#timer"),
  speed: $("#speed"),
  speedDial: $("#speed-dial"),
  trackMapBase: $("#track-map-base"),
  trackMapProgress: $("#track-map-progress"),
  trackMapPlayer: $("#track-map-player"),
  trackProgressPercent: $("#track-progress-percent"),
  trackProgressFill: $("#track-progress-fill"),
  chaosFill: $("#chaos-fill"),
  chaosLabel: $("#chaos-label"),
  countdown: $("#countdown"),
  toast: $("#toast"),
  feed: $("#feed-text"),
  soundButton: $("#sound-button"),
  resultRank: $("#result-rank"),
  resultTitle: $("#result-title"),
  resultSubtitle: $("#result-subtitle"),
  resultTime: $("#result-time"),
  resultChaos: $("#result-chaos"),
  controlMode: $("#control-mode"),
  controlModeTitle: $("#control-mode-title"),
  controlModeCopy: $("#control-mode-copy"),
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const forcedCameraShot = debugParams.has("shot")
  ? clamp(Number(debugParams.get("shot")) || 0, 0, 7)
  : null;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, 1);
const tempV = new THREE.Vector3();
const tempV2 = new THREE.Vector3();
const tempQ = new THREE.Quaternion();
const tempQ2 = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const animationActors = [];

function decodeModelAsset(encoded) {
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function parseEmbeddedModel(assetId) {
  const encoded = MODEL_ASSETS[assetId];
  if (!encoded) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    gltfLoader.parse(decodeModelAsset(encoded), "", resolve, reject);
  });
}

async function mountEmbeddedModel(assetId, parent, options = {}) {
  try {
    const gltf = await parseEmbeddedModel(assetId);
    if (!gltf) return false;
    const model = gltf.scene;
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((item) => {
        if ("envMapIntensity" in item) item.envMapIntensity = 0.72;
      });
    });

    const initialBounds = new THREE.Box3().setFromObject(model);
    const initialSize = initialBounds.getSize(new THREE.Vector3());
    const scale = (options.height || 2) / Math.max(initialSize.y, 0.001);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(
      (options.position?.[0] || 0) - center.x,
      (options.position?.[1] || 0) - bounds.min.y,
      (options.position?.[2] || 0) - center.z,
    );
    model.rotation.y = options.rotationY || 0;

    let wheelOverlay = null;
    if (options.keepWheelOverlay !== false && parent.userData.wheels?.length) {
      parent.updateMatrixWorld(true);
      wheelOverlay = new THREE.Group();
      wheelOverlay.name = `${assetId}-rolling-wheel-overlay`;
      parent.add(wheelOverlay);
      parent.userData.wheels.forEach((wheelObject) => {
        wheelObject.updateMatrixWorld(true);
        wheelOverlay.attach(wheelObject);
        wheelObject.visible = true;
      });
      wheelOverlay.rotation.y = options.wheelOverlayRotationY || 0;
      if (options.wheelOverlayScale) {
        wheelOverlay.scale.setScalar(options.wheelOverlayScale);
      }
      if (options.wheelOverlayOffset) {
        wheelOverlay.position.add(new THREE.Vector3(...options.wheelOverlayOffset));
      }
      if (options.wheelOverlayLayout) {
        parent.userData.wheels.forEach((wheelObject, index) => {
          const wheelLayout = options.wheelOverlayLayout[index];
          if (!wheelLayout) return;
          wheelObject.position.set(wheelLayout[0], wheelLayout[1], wheelLayout[2]);
          const wheelScale = wheelLayout[3] ?? 1;
          wheelObject.scale.setScalar(wheelScale);
          if (options.wheelOverlayRadial) {
            wheelObject.rotation.y = Math.atan2(wheelLayout[0], wheelLayout[2]);
          }
        });
      }
      if (
        options.wheelOverlayOpacity != null ||
        options.wheelTireOpacity != null ||
        options.wheelMarkerOpacity != null
      ) {
        wheelOverlay.traverse((object) => {
          if (!object.isMesh || !object.material) return;
          object.material = object.material.clone();
          object.material.transparent = true;
          object.material.depthWrite = false;
          object.material.opacity =
            object.name === "rolling-wheel-tire"
              ? (options.wheelTireOpacity ?? options.wheelOverlayOpacity ?? 0.28)
              : object.name === "rolling-wheel-marker"
                ? (options.wheelMarkerOpacity ?? 0.96)
                : (options.wheelOverlayOpacity ?? 0.68);
        });
      }
      parent.userData.wheelOverlay = wheelOverlay;
    }

    if (options.hideChildren !== false) {
      [...parent.children].forEach((child) => {
        child.visible = child === wheelOverlay;
      });
    }
    parent.add(model);
    parent.userData.loadedAssetId = assetId;
    parent.userData.loadedModel = model;
    model.userData.mountBasePosition = model.position.toArray();

    if (gltf.animations?.length) {
      const mixer = new THREE.AnimationMixer(model);
      const actions = new Map();
      gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        actions.set(clip.name, action);
      });
      const actor = {
        assetId,
        mixer,
        actions,
        active: null,
        role: options.role || "dance",
      };
      animationActors.push(actor);
      switchActorAnimation(actor, actor.role === "puller" ? "dance" : "dance", true);
    }
    return true;
  } catch (error) {
    console.warn(`ODD PRIX model fallback: ${assetId}`, error);
    return false;
  }
}

function findAnimation(actor, intent) {
  const entries = [...actor.actions.entries()];
  const needles =
    intent === "run"
      ? ["preset:run", "run"]
      : intent === "jump"
        ? ["jump"]
        : intent === "swagger"
          ? ["swagger", "walk", "dance"]
        : ["dance", "freaky", "swagger", "cheer"];
  return (
    entries.find(([name]) => needles.some((needle) => name.toLowerCase().includes(needle))) ||
    entries[0] ||
    null
  );
}

function switchActorAnimation(actor, intent, immediate = false) {
  const match = findAnimation(actor, intent);
  if (!match || actor.active === match[0]) return;
  const [name, action] = match;
  if (actor.active && actor.actions.get(actor.active)) {
    actor.actions.get(actor.active).fadeOut(immediate ? 0 : 0.18);
  }
  action.reset().fadeIn(immediate ? 0 : 0.18).play();
  actor.active = name;
}

function updateModelAnimations(dt) {
  animationActors.forEach((actor) => {
    if (actor.role === "puller") {
      const intent =
        jumpTime > 0 ? "jump" : phase === "racing" ? "run" : "dance";
      switchActorAnimation(actor, intent);
    } else if (actor.role === "coachman") {
      const intent =
        whipTime > 0 ? "jump" : phase === "racing" ? "swagger" : "dance";
      switchActorAnimation(actor, intent);
    } else {
      switchActorAnimation(actor, "dance");
    }
    actor.mixer.update(dt);
  });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9d5f2");
scene.fog = new THREE.Fog("#c2dcef", 135, 430);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 520);
camera.position.set(-6, 5, 13);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
ui.host.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight("#dff7ff", "#4c6a25", 2.4));
const sun = new THREE.DirectionalLight("#fff5cf", 3.8);
sun.position.set(-28, 54, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 180;
scene.add(sun);

const fill = new THREE.DirectionalLight("#74c6ff", 1.4);
fill.position.set(35, 18, -20);
scene.add(fill);

function material(color, roughness = 0.76, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, color, options = {}) {
  const object = new THREE.Mesh(
    geometry,
    options.material || material(color, options.roughness, options.metalness),
  );
  object.castShadow = options.castShadow !== false;
  object.receiveShadow = options.receiveShadow !== false;
  if (options.position) object.position.set(...options.position);
  if (options.rotation) object.rotation.set(...options.rotation);
  if (options.scale) object.scale.set(...options.scale);
  return object;
}

function box(size, color, position, options = {}) {
  return mesh(new THREE.BoxGeometry(...size), color, { ...options, position });
}

function sphere(radius, color, position, options = {}) {
  return mesh(new THREE.SphereGeometry(radius, 12, 9), color, {
    ...options,
    position,
  });
}

function cylinder(radius, depth, color, position, rotation = [0, 0, 0], options = {}) {
  return mesh(new THREE.CylinderGeometry(radius, radius, depth, 12), color, {
    ...options,
    position,
    rotation,
  });
}

function wheel(radius, width, position, color = "#1a1c19") {
  const object = new THREE.Group();
  object.position.set(...position);
  const rotor = new THREE.Group();
  const tire = cylinder(radius, width, color, [0, 0, 0], [0, 0, Math.PI / 2], {
    roughness: 0.9,
  });
  tire.name = "rolling-wheel-tire";
  const hub = cylinder(radius * 0.34, width * 1.16, "#d7cab2", [0, 0, 0], [0, 0, Math.PI / 2], {
    roughness: 0.36,
    metalness: 0.45,
  });
  hub.name = "rolling-wheel-hub";
  rotor.add(tire, hub);
  for (const face of [-1, 1]) {
    const faceX = face * (width / 2 + 0.018);
    for (let index = 0; index < 5; index += 1) {
      const spoke = box(
        [0.034, radius * 1.55, Math.max(0.035, radius * 0.07)],
        "#d8caa8",
        [faceX, 0, 0],
        { metalness: 0.38, roughness: 0.48 },
      );
      spoke.rotation.x = (index / 5) * Math.PI;
      spoke.name = "rolling-wheel-spoke";
      rotor.add(spoke);
    }
    const rotationMarker = sphere(
      Math.max(0.045, radius * 0.085),
      "#e9ff3e",
      [faceX * 1.04, radius * 0.58, 0],
      {
        material: new THREE.MeshBasicMaterial({ color: "#e9ff3e" }),
      },
    );
    rotationMarker.name = "rolling-wheel-marker";
    rotor.add(rotationMarker);
  }
  object.add(rotor);
  object.userData.rotor = rotor;
  object.userData.radius = radius;
  return object;
}

const maxTextureAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createCanvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = maxTextureAnisotropy;
  return texture;
}

const groundTextureLoader = new THREE.TextureLoader();

function loadGroundTexture(filename, repeatX = 1, repeatY = 1) {
  const texture = groundTextureLoader.load(
    new URL(`./world-textures/${filename}`, import.meta.url).href,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = maxTextureAnisotropy;
  return texture;
}

const groundTextureMeters = 3.2;
const grassTextureMeters = 5.5;
const grassRadius = 360;
const asphaltTexture = loadGroundTexture("asphalt-texture.jpg");
const shoulderTexture = loadGroundTexture("gravel-texture.jpg");
const grassTextureRepeat = (grassRadius * 2) / grassTextureMeters;
const grassTexture = loadGroundTexture(
  "grass-texture.jpg",
  grassTextureRepeat,
  grassTextureRepeat,
);
const curbTexture = createCanvasTexture(256, 512, (context, width, height) => {
  const bandHeight = height / 8;
  for (let index = 0; index < 8; index += 1) {
    context.fillStyle = index % 2 ? "#d52f2f" : "#f4f1e8";
    context.fillRect(0, index * bandHeight, width, bandHeight + 1);
  }
  context.fillStyle = "rgba(255,255,255,.13)";
  context.fillRect(0, 0, width * 0.08, height);
  context.fillStyle = "rgba(25,28,28,.1)";
  context.fillRect(width * 0.9, 0, width * 0.1, height);
});

function createFacadeTexture(baseColor, seed) {
  return createCanvasTexture(256, 512, (context, width, height) => {
    const random = seededRandom(seed);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#203d59");
    gradient.addColorStop(0.5, baseColor);
    gradient.addColorStop(1, "#162b45");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    const columns = 6;
    const rows = 16;
    const gapX = width / columns;
    const gapY = height / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const lit = random() > 0.48;
        context.fillStyle = lit
          ? `rgba(255,${205 + Math.floor(random() * 40)},${142 + Math.floor(random() * 55)},.78)`
          : `rgba(${62 + Math.floor(random() * 45)},${116 + Math.floor(random() * 55)},${158 + Math.floor(random() * 60)},.52)`;
        context.fillRect(column * gapX + 5, row * gapY + 6, gapX - 10, gapY - 11);
      }
    }
    context.fillStyle = "rgba(255,255,255,.12)";
    for (let x = 0; x < width; x += gapX) context.fillRect(x, 0, 2, height);
  });
}

// Keep Racing Assets v1 at its authored size. The previous 3.12x enlargement
// made the curbs, buildings and texture density lose their intended character.
// Vehicles and race physics are reduced instead, so the source world remains
// visually intact while the automatic cut still lasts about 45 seconds.
const trackWorldScale = 1;
const presentationScale = trackWorldScale / 3.12;
const trackCurve = new THREE.CatmullRomCurve3(
  [
    [-20, 28], [-10, 28], [-2, 27], [0, 23], [0, 15], [-2, 10], [-7, 9], [-10, 12],
    [-10, 18], [-13, 20], [-32, 20], [-39, 18], [-43, 13], [-44, 5], [-42, -1],
    [-36, -5], [-10, -5], [-1, -4], [3, 0], [4, 9], [4, 16], [7, 20], [16, 20],
    [20, 17], [19, 13], [15, 10], [12, 8], [11, 4], [12, 0], [12, -3], [15, -5],
    [33, -5], [36, -2], [36, 3], [32, 8], [28, 12], [28, 23], [31, 28], [36, 28],
    [43, 21], [51, 20], [56, 16], [58, 10], [58, -22], [56, -28], [52, -29],
    [49, -25], [48, -18], [45, -13], [36, -10], [20, -10], [-30, -10], [-36, -12],
    [-42, -17], [-55, -17], [-60, -13], [-60, 17], [-58, 23], [-53, 27], [-45, 28],
  ].map(([x, z]) => new THREE.Vector3(x * trackWorldScale, 0.035, z * trackWorldScale)),
  true,
  "centripetal",
);
const trackLength = trackCurve.getLength();
const trackWidth = 4;
const safeLaneHalfWidth = 0.82;
const totalLaps = 1;
const autoShotLabels = [
  "TRACKING CAM",
  "THOMAS CLOSE-UP",
  "TOP FOLLOW",
  "OFFICE CHAIR PORTRAIT",
  "WORLD AERIAL",
  "WHEELCHAIR LOW CAM",
  "PACK HELI",
  "CHAOS VEHICLE CLOSE-UP",
];

function frameAt(distance) {
  const t = mod(distance, trackLength) / trackLength;
  const point = trackCurve.getPointAt(t);
  const tangent = trackCurve.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return { point, tangent, right, t };
}

const trackMapProjection = {
  minX: 0,
  minZ: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

function projectTrackMapPoint(point) {
  return {
    x: trackMapProjection.offsetX + (point.x - trackMapProjection.minX) * trackMapProjection.scale,
    y: trackMapProjection.offsetY + (point.z - trackMapProjection.minZ) * trackMapProjection.scale,
  };
}

function initializeTrackMap() {
  const samples = Array.from({ length: 181 }, (_, index) =>
    trackCurve.getPointAt(index / 180),
  );
  const minX = Math.min(...samples.map((point) => point.x));
  const maxX = Math.max(...samples.map((point) => point.x));
  const minZ = Math.min(...samples.map((point) => point.z));
  const maxZ = Math.max(...samples.map((point) => point.z));
  const viewWidth = 220;
  const viewHeight = 112;
  const padding = 9;
  const scale = Math.min(
    (viewWidth - padding * 2) / Math.max(1, maxX - minX),
    (viewHeight - padding * 2) / Math.max(1, maxZ - minZ),
  );
  trackMapProjection.minX = minX;
  trackMapProjection.minZ = minZ;
  trackMapProjection.scale = scale;
  trackMapProjection.offsetX = (viewWidth - (maxX - minX) * scale) / 2;
  trackMapProjection.offsetY = (viewHeight - (maxZ - minZ) * scale) / 2;
  const projected = samples.map(projectTrackMapPoint);
  const path = projected
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ") + " Z";
  ui.trackMapBase.setAttribute("d", path);
  ui.trackMapProgress.setAttribute("d", path);
  const start = projected[0];
  ui.trackMapPlayer.setAttribute("cx", start.x.toFixed(2));
  ui.trackMapPlayer.setAttribute("cy", start.y.toFixed(2));
}

initializeTrackMap();

const racingAssetsWorld = new THREE.Group();
racingAssetsWorld.name = "racing-assets-v1-native-world";
scene.add(racingAssetsWorld);

const patchedTrackAtlases = new WeakMap();
function createNativeTrackAtlas(sourceTexture) {
  if (!sourceTexture?.image) return sourceTexture;
  if (patchedTrackAtlases.has(sourceTexture)) return patchedTrackAtlases.get(sourceTexture);
  const image = sourceTexture.image;
  const width = image.width || 512;
  const height = image.height || 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);

  // This atlas cell is the source asset's large pale rectangular base. Make
  // only that cell transparent so the continuous textured ground underneath
  // shows through, without touching asphalt, curbs, stands or pit buildings.
  const xStart = Math.floor((width * 2) / 3);
  const yStart = Math.floor(height / 2);
  const baseCell = context.getImageData(xStart, yStart, width - xStart, height - yStart);
  for (let index = 3; index < baseCell.data.length; index += 4) {
    baseCell.data[index] = 0;
  }
  context.putImageData(baseCell, xStart, yStart);

  // The source mesh maps every real asphalt triangle to the upper-middle atlas
  // cell. Repaint that cell once, so the dark road follows the authored mesh
  // exactly instead of following an approximate overlay spline.
  const roadX = Math.floor(width / 3);
  const roadWidth = Math.floor((width * 2) / 3) - roadX;
  const roadHeight = Math.floor(height / 2);
  const asphalt = context.getImageData(roadX, 0, roadWidth, roadHeight);
  for (let y = 0; y < roadHeight; y += 1) {
    for (let x = 0; x < roadWidth; x += 1) {
      const index = (y * roadWidth + x) * 4;
      const grain = Math.sin(x * 18.417 + y * 41.731) * 16341.317;
      const noise = (grain - Math.floor(grain) - 0.5) * 12;
      asphalt.data[index] = 68 + noise;
      asphalt.data[index + 1] = 72 + noise;
      asphalt.data[index + 2] = 73 + noise;
      asphalt.data[index + 3] = 255;
    }
  }
  context.putImageData(asphalt, roadX, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = sourceTexture.flipY;
  texture.wrapS = sourceTexture.wrapS;
  texture.wrapT = sourceTexture.wrapT;
  texture.magFilter = sourceTexture.magFilter;
  texture.minFilter = sourceTexture.minFilter;
  texture.anisotropy = maxTextureAnisotropy;
  texture.needsUpdate = true;
  patchedTrackAtlases.set(sourceTexture, texture);
  return texture;
}

function parseTrackAsset(assetId) {
  const encoded = TRACK_ASSETS[assetId];
  if (!encoded) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    gltfLoader.parse(decodeModelAsset(encoded), "", resolve, reject);
  });
}

async function mountRacingAssetsWorld() {
  try {
    const [visual, collision] = await Promise.all([
      parseTrackAsset("racing-assets-v1-xl"),
      parseTrackAsset("racing-assets-v1-collision"),
    ]);
    if (!visual) return;
    const trackModel = visual.scene;
    trackModel.name = "Racing Assets v1 XL visual";
    trackModel.scale.setScalar(trackWorldScale);
    trackModel.position.y = -trackWorldScale;
    trackModel.traverse((object) => {
      if (!object.isMesh) return;
      object.receiveShadow = true;
      object.castShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((item) => {
        if (item.map) item.map = createNativeTrackAtlas(item.map);
        item.transparent = true;
        item.alphaTest = 0.35;
        item.roughness = Math.max(item.roughness ?? 0.8, 0.72);
        item.metalness = Math.min(item.metalness ?? 0, 0.08);
        item.needsUpdate = true;
      });
    });
    racingAssetsWorld.add(trackModel);

    if (collision) {
      const collisionModel = collision.scene;
      collisionModel.name = "Racing Assets v1 collision reference";
      collisionModel.scale.setScalar(trackWorldScale);
      collisionModel.position.y = -trackWorldScale;
      collisionModel.visible = false;
      racingAssetsWorld.add(collisionModel);
      racingAssetsWorld.userData.collision = collisionModel;
    }
    racingAssetsWorld.userData.visual = trackModel;
    racingAssetsWorld.userData.trackLength = trackLength;
    racingAssetsWorld.userData.trackWidth = trackWidth;
    ui.shell.dataset.track = "racing-assets-v1-native";
    ui.shell.dataset.trackAssetGroups = String(racingAssetsWorld.children.length);
    ui.shell.dataset.trackLength = trackLength.toFixed(2);
    ui.shell.dataset.trackWidth = trackWidth.toFixed(2);
    if (window.__ODD_PRIX_DEBUG__) {
      window.__ODD_PRIX_DEBUG__.racingAssetsWorld = racingAssetsWorld;
    }
  } catch (error) {
    console.warn("ODD PRIX track fallback", error);
    ui.shell.dataset.track = "procedural-fallback";
  }
}

void mountRacingAssetsWorld();

function buildStrip(
  width,
  color,
  yOffset,
  roughness = 0.9,
  texture = null,
  textureMeters = groundTextureMeters,
) {
  const segments = 420;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const distance = (i / segments) * trackLength;
    const { point, right } = frameAt(distance);
    const leftPoint = point.clone().addScaledVector(right, -width / 2);
    const rightPoint = point.clone().addScaledVector(right, width / 2);
    leftPoint.y += yOffset;
    rightPoint.y += yOffset;
    positions.push(...leftPoint.toArray(), ...rightPoint.toArray());
    uvs.push(0, distance / textureMeters, width / textureMeters, distance / textureMeters);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, color, {
    material: new THREE.MeshStandardMaterial({
      color,
      map: texture,
      bumpMap: texture,
      bumpScale:
        texture === asphaltTexture
          ? 0.045
          : texture === curbTexture
            ? 0.02
            : 0.11,
      roughness,
      metalness: 0.02,
    }),
    castShadow: false,
  });
}

function buildPitLane() {
  const segments = 96;
  const positions = [];
  const uvs = [];
  const indices = [];
  const startDistance = trackLength * 0.91;
  const pitLength = trackLength * 0.18;
  const pitWidth = 3.6;
  for (let i = 0; i <= segments; i += 1) {
    const distance = startDistance + (i / segments) * pitLength;
    const { point, right } = frameAt(distance);
    const blend = Math.sin((i / segments) * Math.PI);
    const offset = 6.8 + blend * 2.2;
    const center = point.clone().addScaledVector(right, -offset);
    const leftPoint = center.clone().addScaledVector(right, -pitWidth / 2);
    const rightPoint = center.clone().addScaledVector(right, pitWidth / 2);
    leftPoint.y -= 0.07;
    rightPoint.y -= 0.07;
    positions.push(...leftPoint.toArray(), ...rightPoint.toArray());
    const laneDistance = (i / segments) * pitLength;
    uvs.push(0, laneDistance / 6, pitWidth / 6, laneDistance / 6);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, "#d8dde0", {
    material: new THREE.MeshStandardMaterial({
      color: "#d8dde0",
      map: asphaltTexture,
      bumpMap: asphaltTexture,
      bumpScale: 0.045,
      roughness: 0.96,
      metalness: 0.02,
    }),
    castShadow: false,
  });
}

const grass = mesh(new THREE.CircleGeometry(grassRadius, 128), "#7fbd49", {
  rotation: [-Math.PI / 2, 0, 0],
  position: [0, -0.42, 0],
  material: new THREE.MeshStandardMaterial({
    color: "#a5b596",
    map: grassTexture,
    bumpMap: grassTexture,
    bumpScale: 0.075,
    roughness: 1,
  }),
  castShadow: false,
});
scene.add(grass);

// Do not draw a second procedural road over the imported circuit. Even a
// closely traced spline cuts across the authored roadbed at tight corners when
// viewed from above. The native mesh owns asphalt, shoulders and curbs as one
// aligned surface; this curve is now used only for vehicle motion.

const trackDecor = new THREE.Group();
// The imported native-size circuit already contains its own rails and curbs.
// Keep the older procedural rails out of sight so they do not sit across it.
trackDecor.visible = false;
scene.add(trackDecor);

for (let i = 0; i < 150; i += 1) {
  const distance = (i / 150) * trackLength;
  const { point, tangent, right } = frameAt(distance);
  const angle = Math.atan2(tangent.x, tangent.z);
  for (const side of [-1, 1]) {
    if (i % 4 === 0) {
      const post = cylinder(0.055, 0.62, "#d7d9cf", [0, 0, 0]);
      post.position.copy(point).addScaledVector(right, side * (trackWidth / 2 + 4.45));
      post.position.y += 0.32;
      trackDecor.add(post);
      const rail = box([0.12, 0.16, 12.2], "#bfc5bd", [0, 0, 0], {
        metalness: 0.48,
      });
      rail.position.copy(post.position);
      rail.position.y += 0.24;
      rail.rotation.y = angle;
      trackDecor.add(rail);
    }
  }
}

function createStartLine() {
  const group = new THREE.Group();
  const { point, tangent, right } = frameAt(0);
  const angle = Math.atan2(tangent.x, tangent.z);
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const tile = box(
        [trackWidth / 10, 0.035, 0.55],
        (row + column) % 2 ? "#f4efe1" : "#20231f",
        [(column - 4.5) * (trackWidth / 10), 0, (row - 0.5) * 0.55],
        { castShadow: false },
      );
      group.add(tile);
    }
  }
  group.position.copy(point);
  group.position.y += 0.04 * presentationScale;
  group.rotation.y = angle;
  group.scale.setScalar(presentationScale);
  scene.add(group);

  for (const side of [-1, 1]) {
    const tower = box([0.85, 6.8, 0.8], side > 0 ? "#e64c3b" : "#f0cf39", [0, 3.3, 0]);
    tower.scale.setScalar(presentationScale);
    tower.position.copy(point).addScaledVector(right, side * 7.3 * presentationScale);
    tower.position.y += 3.1 * presentationScale;
    scene.add(tower);
  }
  const gantry = box([15.4, 0.72, 0.75], "#171b18", [0, 0, 0], {
    metalness: 0.28,
  });
  gantry.scale.setScalar(presentationScale);
  gantry.position.copy(point);
  gantry.position.y += 6.15 * presentationScale;
  gantry.rotation.y = angle;
  scene.add(gantry);
  for (let i = -2; i <= 2; i += 1) {
    const light = sphere(0.24, i < 0 ? "#f05242" : "#f0cf39", [i * 0.74, 0, 0], {
      material: new THREE.MeshStandardMaterial({
        color: i < 0 ? "#f05242" : "#f0cf39",
        emissive: i < 0 ? "#f05242" : "#f0cf39",
        emissiveIntensity: 1.2,
      }),
    });
    gantry.add(light);
  }
}
createStartLine();

const worldTextureLoader = new THREE.TextureLoader();

function loadWorldTexture(filename) {
  const texture = worldTextureLoader.load(
    new URL(`./world-textures/${filename}`, import.meta.url).href,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxTextureAnisotropy;
  return texture;
}

const generatedWorldTextures = {
  city: loadWorldTexture("city-panorama.jpg"),
  grandstand: loadWorldTexture("grandstand-panorama.jpg"),
  grandstandFlip: loadWorldTexture("grandstand-panorama.jpg"),
  mountain: loadWorldTexture("mountain-panorama.jpg"),
  mountainFlip: loadWorldTexture("mountain-panorama.jpg"),
};
generatedWorldTextures.city.wrapS = THREE.MirroredRepeatWrapping;
generatedWorldTextures.city.wrapT = THREE.ClampToEdgeWrapping;
generatedWorldTextures.city.repeat.set(2, 0.82);
generatedWorldTextures.city.offset.y = 0.08;

function createArtBackdrops(parent) {
  const skyGallery = new THREE.Mesh(
    new THREE.CylinderGeometry(430, 430, 190, 96, 1, true),
    new THREE.MeshBasicMaterial({
      map: generatedWorldTextures.city,
      side: THREE.BackSide,
      fog: false,
      toneMapped: false,
    }),
  );
  skyGallery.position.y = 92;
  skyGallery.rotation.y = -0.38;
  skyGallery.renderOrder = -5;
  parent.add(skyGallery);

  function addHorizonBoard(texture, angle, radius, width, height, options = {}) {
    const cropY = options.cropY ?? 1;
    const displayTexture = texture;
    displayTexture.wrapS = THREE.ClampToEdgeWrapping;
    displayTexture.wrapT = THREE.ClampToEdgeWrapping;
    displayTexture.repeat.set(options.flipX ? -1 : 1, cropY);
    displayTexture.offset.set(options.flipX ? 1 : 0, (1 - cropY) / 2);

    const panel = new THREE.Group();
    panel.position.set(
      Math.cos(angle) * radius,
      height / 2 - 0.55,
      Math.sin(angle) * radius,
    );
    panel.lookAt(0, panel.position.y, 0);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: displayTexture,
        side: THREE.FrontSide,
        fog: false,
        toneMapped: false,
      }),
    );
    board.castShadow = false;
    board.receiveShadow = false;
    board.renderOrder = -3;
    panel.add(board);

    if (options.framed) {
      const base = box([width + 0.8, 0.6, 0.75], "#253140", [0, -height / 2 + 0.18, -0.28], {
        metalness: 0.3,
        roughness: 0.58,
      });
      panel.add(base);
      for (const x of [-width * 0.38, 0, width * 0.38]) {
        panel.add(box([0.28, height, 0.45], "#344356", [x, 0, -0.32], {
          metalness: 0.35,
          roughness: 0.52,
        }));
      }
    }
    parent.add(panel);
  }

  addHorizonBoard(generatedWorldTextures.mountain, Math.PI * 0.53, 355, 146, 56, {
    cropY: 0.62,
  });
  addHorizonBoard(generatedWorldTextures.mountainFlip, -Math.PI * 0.48, 360, 146, 56, {
    cropY: 0.62,
    flipX: true,
  });
  addHorizonBoard(generatedWorldTextures.grandstand, Math.PI * 0.12, 315, 62, 23, {
    cropY: 0.53,
    framed: true,
  });
  addHorizonBoard(generatedWorldTextures.grandstandFlip, Math.PI * 1.08, 318, 62, 23, {
    cropY: 0.53,
    flipX: true,
    framed: true,
  });
  addHorizonBoard(generatedWorldTextures.grandstand, Math.PI * 0.66, 322, 62, 23, {
    cropY: 0.53,
    framed: true,
  });
  addHorizonBoard(generatedWorldTextures.grandstandFlip, Math.PI * 1.58, 325, 62, 23, {
    cropY: 0.53,
    flipX: true,
    framed: true,
  });
}

function createScenery() {
  const scenery = new THREE.Group();
  const palette = ["#f0cf39", "#e64c3b", "#55a9d6", "#f0eee3", "#264c42"];
  const facadeTextures = [
    createFacadeTexture("#356f9a", 101),
    createFacadeTexture("#73506e", 102),
    createFacadeTexture("#277b85", 103),
    createFacadeTexture("#4b618a", 104),
    createFacadeTexture("#8a5f54", 105),
  ];
  const facadeMaterials = facadeTextures.map((facadeTexture, index) => {
    const facade = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: facadeTexture,
      roughness: 0.4,
      metalness: 0.22,
      emissive: index % 2 ? "#241627" : "#122536",
      emissiveIntensity: 0.14,
    });
    const cap = material(palette[index % palette.length], 0.76, 0.08);
    return [facade, facade, cap, cap, facade, facade];
  });
  const buildingCount = 0;
  for (let i = 0; i < buildingCount; i += 1) {
    const angle = (i / buildingCount) * Math.PI * 2;
    const radius = 134 + (i % 4) * 10;
    const height = 8 + ((i * 17) % 15);
    const building = box(
      [3 + (i % 4), height, 3 + ((i * 3) % 5)],
      palette[i % palette.length],
      [Math.cos(angle) * radius, height / 2 - 0.7, Math.sin(angle) * radius],
      { material: facadeMaterials[i % facadeMaterials.length] },
    );
    building.rotation.y = -angle + (i % 3) * 0.12;
    scenery.add(building);
    if (i % 3 === 0) {
      const roof = mesh(new THREE.ConeGeometry(2.5, 1.9, 4), palette[(i + 2) % palette.length], {
        position: [0, height / 2 + 0.95, 0],
      });
      roof.rotation.y = Math.PI / 4;
      building.add(roof);
    }
  }
  createArtBackdrops(scenery);
  scene.add(scenery);
  return scenery;
}
const scenery = createScenery();
const importedScenery = new THREE.Group();
scene.add(importedScenery);

function createWorldAssetAnchor(distance, side, angleOffset = 0) {
  const anchor = new THREE.Group();
  const trackFrame = frameAt(distance);
  anchor.position.copy(trackFrame.point).addScaledVector(trackFrame.right, side);
  anchor.position.y -= 0.85;
  anchor.rotation.y = Math.atan2(trackFrame.tangent.x, trackFrame.tangent.z) + angleOffset;
  importedScenery.add(anchor);
  return anchor;
}

const clockTowerAnchor = createWorldAssetAnchor(trackLength * 0.66, 25, -Math.PI / 2);
const arcadeBayAnchor = createWorldAssetAnchor(trackLength * 0.12, -18, Math.PI / 2);

function limb(color, length, radius = 0.13) {
  const pivot = new THREE.Group();
  const segment = cylinder(radius, length, color, [0, -length / 2, 0], [0, 0, 0]);
  pivot.add(segment);
  return pivot;
}

function createRickshaw() {
  const root = new THREE.Group();
  const cart = new THREE.Group();
  cart.position.z = -0.72;
  cart.add(box([1.7, 0.42, 2.15], "#171714", [0, 0.8, -0.2], { roughness: 0.82 }));
  cart.add(box([1.52, 1.35, 0.24], "#6b171d", [0, 1.43, -1.08]));
  cart.add(box([1.42, 0.24, 1.18], "#8f2429", [0, 1.05, -0.45]));
  cart.add(box([1.38, 0.2, 0.72], "#8f2429", [0, 1.18, 0.58]));
  const wheels = [
    wheel(0.69, 0.14, [-0.94, 0.66, -1.12], "#39291f"),
    wheel(0.69, 0.14, [0.94, 0.66, -1.12], "#39291f"),
    wheel(0.58, 0.13, [-0.94, 0.58, 0.56], "#39291f"),
    wheel(0.58, 0.13, [0.94, 0.58, 0.56], "#39291f"),
  ];
  wheels.forEach((item) => cart.add(item));
  root.add(cart);

  const coachman = new THREE.Group();
  coachman.position.set(0, 0.78, 0.38);
  coachman.add(box([0.72, 0.9, 0.46], "#7d1e2a", [0, 0.55, 0]));
  const horseHead = sphere(0.34, "#a96838", [0, 1.33, 0.03]);
  horseHead.scale.set(0.82, 1.18, 1.18);
  horseHead.add(
    box([0.11, 0.34, 0.11], "#7d482d", [-0.18, 0.31, 0]),
    box([0.11, 0.34, 0.11], "#7d482d", [0.18, 0.31, 0]),
  );
  coachman.add(horseHead);
  const coachmanArmL = limb("#a96838", 0.68, 0.105);
  const coachmanArmR = limb("#a96838", 0.68, 0.105);
  coachmanArmL.position.set(-0.42, 0.82, 0.02);
  coachmanArmR.position.set(0.42, 0.82, 0.02);
  coachmanArmL.rotation.x = -0.95;
  coachmanArmR.rotation.x = -1.2;
  coachmanArmL.rotation.z = -0.28;
  coachmanArmR.rotation.z = 0.28;
  coachman.add(coachmanArmL, coachmanArmR);
  root.add(coachman);

  const runner = new THREE.Group();
  runner.position.set(0, 0.05, 2.82);
  const body = box([0.7, 0.9, 0.42], "#df4939", [0, 1.55, 0]);
  runner.add(body, sphere(0.29, "#a85f43", [0, 2.25, 0.02]));
  runner.add(box([0.5, 0.15, 0.4], "#1d2520", [0, 2.47, -0.02]));
  const armL = limb("#a85f43", 0.86, 0.11);
  const armR = limb("#a85f43", 0.86, 0.11);
  armL.position.set(-0.4, 1.82, 0);
  armR.position.set(0.4, 1.82, 0);
  armL.rotation.x = -1.05;
  armR.rotation.x = -1.05;
  armL.rotation.z = -0.18;
  armR.rotation.z = 0.18;
  const legL = limb("#264c42", 1.0, 0.14);
  const legR = limb("#264c42", 1.0, 0.14);
  legL.position.set(-0.22, 1.17, 0);
  legR.position.set(0.22, 1.17, 0);
  runner.add(armL, armR, legL, legR);
  root.add(runner);

  const shafts = new THREE.Group();
  for (const side of [-1, 1]) {
    shafts.add(box([0.08, 0.08, 3.4], "#755031", [side * 0.48, 1.03, 1.03]));
  }
  root.add(shafts);

  const whipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.12, 0.72, 0.72),
    new THREE.Vector3(-0.08, 0.84, 1.72),
    new THREE.Vector3(0.04, 0.08, 2.72),
  ]);
  const whip = mesh(new THREE.TubeGeometry(whipCurve, 18, 0.025, 6), "#2b201a", {
    roughness: 1,
  });
  const whipPivot = new THREE.Group();
  whipPivot.position.set(0.34, 2.42, 0.52);
  whipPivot.add(whip);
  root.add(whipPivot);
  root.userData = {
    kind: "horse-carriage",
    wheels,
    runner,
    coachman,
    coachmanArms: [coachmanArmL, coachmanArmR],
    arms: [armL, armR],
    legs: [legL, legR],
    cart,
    shafts,
    whip,
    whipPivot,
  };
  root.scale.setScalar(0.9);
  return root;
}

function createTrain() {
  const root = new THREE.Group();
  root.add(box([1.6, 1.4, 2.2], "#3f8fc1", [0, 1.05, -0.15]));
  root.add(cylinder(0.64, 1.72, "#55a9d6", [0, 1.45, 0.95], [0, 0, Math.PI / 2]));
  root.add(box([1.45, 1.55, 1.1], "#246493", [0, 1.55, -1.25]));
  const chimney = cylinder(0.23, 0.85, "#202521", [0, 2.45, 0.92]);
  root.add(chimney);
  const face = cylinder(0.53, 0.08, "#e9e4cf", [0, 1.46, 1.62], [Math.PI / 2, 0, 0]);
  face.add(sphere(0.07, "#1f2520", [-0.18, 0.12, -0.05]), sphere(0.07, "#1f2520", [0.18, 0.12, -0.05]));
  const smile = mesh(
    new THREE.TorusGeometry(0.18, 0.026, 5, 16, Math.PI),
    "#1f2520",
    { position: [0, -0.12, -0.06], rotation: [0, 0, Math.PI] },
  );
  face.add(smile);
  root.add(face);
  const wheels = [];
  for (const z of [-1.0, -0.275, 0.45]) {
    for (const x of [-0.88, 0.88]) {
      const item = wheel(0.48, 0.16, [x, 0.5, z], "#242724");
      wheels.push(item);
      root.add(item);
    }
  }
  root.userData = { kind: "train", wheels, chimney };
  return root;
}

function createOfficeChair() {
  const root = new THREE.Group();
  const stem = cylinder(0.12, 1.0, "#c8cac4", [0, 0.9, 0], [0, 0, 0], { metalness: 0.6 });
  root.add(stem);
  root.add(box([1.35, 0.28, 1.25], "#252a28", [0, 1.38, 0]));
  root.add(box([1.36, 1.6, 0.26], "#353a37", [0, 2.1, -0.5]));
  const driver = new THREE.Group();
  driver.add(sphere(0.3, "#c77d58", [0, 2.55, 0.02]));
  driver.add(box([0.7, 0.85, 0.42], "#6c56b6", [0, 1.92, 0]));
  root.add(driver);
  const wheels = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = box([0.1, 0.1, 1.15], "#bfc5bd", [0, 0.42, 0], {
      metalness: 0.5,
    });
    arm.rotation.y = angle;
    root.add(arm);
    const item = wheel(0.18, 0.11, [Math.sin(angle) * 0.62, 0.31, Math.cos(angle) * 0.62]);
    item.rotation.y = angle;
    wheels.push(item);
    root.add(item);
  }
  root.userData = { kind: "chair", wheels, driver };
  return root;
}

function createWheelchair() {
  const root = new THREE.Group();
  const frameMaterial = { metalness: 0.62, roughness: 0.36 };
  root.add(box([1.08, 0.18, 0.92], "#315a78", [0, 1.02, 0.02], { roughness: 0.72 }));
  root.add(box([1.08, 1.02, 0.16], "#315a78", [0, 1.55, -0.38], { roughness: 0.72 }));
  for (const side of [-1, 1]) {
    root.add(box([0.08, 1.18, 0.08], "#a9b1b1", [side * 0.62, 0.9, -0.3], frameMaterial));
    root.add(box([0.08, 0.08, 1.15], "#a9b1b1", [side * 0.62, 0.55, 0.12], frameMaterial));
    root.add(box([0.32, 0.08, 0.55], "#30393c", [side * 0.47, 0.22, 0.72], frameMaterial));
    root.add(box([0.08, 0.34, 0.08], "#a9b1b1", [side * 0.61, 1.98, -0.5], frameMaterial));
    root.add(box([0.23, 0.08, 0.08], "#262a29", [side * 0.68, 2.12, -0.5]));
  }
  const wheels = [
    wheel(0.72, 0.09, [-0.68, 0.72, -0.12], "#202421"),
    wheel(0.72, 0.09, [0.68, 0.72, -0.12], "#202421"),
    wheel(0.16, 0.08, [-0.61, 0.18, 0.72], "#202421"),
    wheel(0.16, 0.08, [0.61, 0.18, 0.72], "#202421"),
  ];
  wheels.forEach((item) => root.add(item));
  root.userData = { kind: "wheelchair", wheels };
  return root;
}

function createDeer() {
  const root = new THREE.Group();
  const spring = mesh(
    new THREE.TorusGeometry(0.47, 0.085, 7, 54, Math.PI * 7),
    "#d8d6c7",
    { position: [0, 0.95, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.5 },
  );
  spring.scale.z = 2.2;
  root.add(spring);
  const deer = new THREE.Group();
  deer.position.y = 1.82;
  deer.add(box([0.82, 0.75, 1.55], "#9d6541", [0, 0.55, 0]));
  deer.add(sphere(0.42, "#a96f47", [0, 1.25, 0.62]));
  deer.add(box([0.52, 0.56, 0.55], "#ad7751", [0, 1.42, 0.84]));
  const legs = [];
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.48, 0.48]) {
      const leg = limb("#71452f", 0.8, 0.09);
      leg.position.set(x, 0.28, z);
      deer.add(leg);
      legs.push(leg);
    }
  }
  for (const side of [-1, 1]) {
    const antler = new THREE.Group();
    antler.position.set(side * 0.18, 1.82, 0.78);
    antler.add(cylinder(0.035, 0.75, "#ead7ae", [0, 0.32, 0], [0, 0, side * 0.4]));
    antler.add(cylinder(0.03, 0.42, "#ead7ae", [side * 0.12, 0.53, 0], [0, 0, side * 1.0]));
    deer.add(antler);
  }
  root.add(deer);
  root.add(mesh(new THREE.ConeGeometry(0.34, 0.9, 12), "#f04f3c", {
    position: [0, 0.45, -0.68],
    rotation: [Math.PI / 2, 0, 0],
    metalness: 0.28,
  }));
  root.userData = { kind: "deer", deer, spring, legs };
  return root;
}

function createWasher() {
  const root = new THREE.Group();
  root.add(box([1.8, 2.05, 1.72], "#efe8d8", [0, 1.25, 0], { metalness: 0.18 }));
  const drum = cylinder(0.62, 0.08, "#202725", [0, 1.25, 0.9], [Math.PI / 2, 0, 0], {
    metalness: 0.58,
  });
  drum.add(cylinder(0.42, 0.09, "#78c8e0", [0, 0, -0.05], [0, 0, 0], {
    material: new THREE.MeshStandardMaterial({
      color: "#78c8e0",
      emissive: "#17485b",
      emissiveIntensity: 0.25,
      metalness: 0.2,
      roughness: 0.2,
    }),
  }));
  root.add(drum);
  const wheels = [
    wheel(0.33, 0.15, [-0.72, 0.29, -0.5]),
    wheel(0.33, 0.15, [0.72, 0.29, -0.5]),
  ];
  wheels.forEach((item) => root.add(item));
  root.userData = { kind: "washer", wheels, drum };
  return root;
}

function createTrolley() {
  const root = new THREE.Group();
  const basket = box([1.45, 0.95, 1.75], "#d6d8ce", [0, 1.1, 0], {
    metalness: 0.6,
    roughness: 0.38,
  });
  root.add(basket);
  root.add(box([1.55, 0.12, 0.12], "#e94e3a", [0, 2.02, -1.02]));
  for (const x of [-0.58, 0.58]) {
    root.add(box([0.08, 1.4, 0.08], "#afb6ae", [x, 1.35, -0.95], { metalness: 0.6 }));
  }
  const unicorn = new THREE.Group();
  unicorn.position.set(0, 1.3, 0.18);
  unicorn.add(box([0.72, 0.68, 1.1], "#f3e4eb", [0, 0.45, 0]));
  unicorn.add(sphere(0.36, "#f7edf2", [0, 1.04, 0.45]));
  unicorn.add(mesh(new THREE.ConeGeometry(0.1, 0.7, 8), "#f0cf39", {
    position: [0, 1.55, 0.52],
    rotation: [-0.35, 0, 0],
  }));
  root.add(unicorn);
  const wheels = [];
  for (const x of [-0.62, 0.62]) {
    for (const z of [-0.66, 0.66]) {
      const item = wheel(0.24, 0.11, [x, 0.38, z]);
      wheels.push(item);
      root.add(item);
    }
  }
  root.userData = { kind: "trolley", unicorn, wheels };
  return root;
}

const vehicleTuning = {
  player: { modelHeight: 3.2, groundClearance: 0.018, wheelSpinScale: 1, shadow: [1.45, 3.15] },
  train: { modelHeight: 2.75, groundClearance: 0.022, wheelSpinScale: 1, shadow: [1.2, 1.9] },
  chair: { modelHeight: 2.25, groundClearance: 0.012, wheelSpinScale: 1, shadow: [0.82, 0.9] },
  deer: { modelHeight: 2.65, groundClearance: 0.018, wheelSpinScale: 1, shadow: [0.78, 1.05] },
  wheelchair: { modelHeight: 2.15, groundClearance: 0.012, wheelSpinScale: 1, shadow: [0.92, 1.15] },
  trolley: { modelHeight: 2.55, groundClearance: 0.016, wheelSpinScale: 1, shadow: [0.95, 1.2] },
};

const racers = [];
function addRacer(id, name, model, progress, lane, baseSpeed, gimmick, color) {
  model.scale.multiplyScalar(presentationScale);
  scene.add(model);
  const tuning = vehicleTuning[id] || vehicleTuning.player;
  const startLane = clamp(
    lane * presentationScale,
    -safeLaneHalfWidth,
    safeLaneHalfWidth,
  );
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    new THREE.MeshBasicMaterial({
      color: "#0c1113",
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(
    tuning.shadow[0] * presentationScale,
    tuning.shadow[1] * presentationScale,
    1,
  );
  contactShadow.renderOrder = 2;
  scene.add(contactShadow);
  const racer = {
    id,
    name,
    model,
    progress: progress * presentationScale,
    lane: startLane,
    targetLane: startLane,
    baseSpeed: baseSpeed * presentationScale,
    speed: baseSpeed * presentationScale,
    gimmick,
    color,
    vertical: 0,
    roll: 0,
    hitCooldown: 0,
    groundClearance: tuning.groundClearance * presentationScale,
    wheelSpinScale: tuning.wheelSpinScale,
    shadowSize: tuning.shadow.map((value) => value * presentationScale),
    contactShadow,
  };
  racers.push(racer);
  return racer;
}

const player = addRacer(
  "player",
  "马老板的人力马车",
  createRickshaw(),
  -0.6,
  -1.4,
  0,
  "player",
  "#e64c3b",
);
addRacer("train", "托马斯小火车", createTrain(), -2.7, 1.35, 38.4, "steady", "#3f8fc1");
addRacer("chair", "首席转椅官", createOfficeChair(), -4.8, -3.8, 37.3, "side-hop", "#6c56b6");
addRacer("deer", "弹簧火箭鹿", createDeer(), -6.9, 3.8, 39.1, "spiral", "#9d6541");
addRacer("wheelchair", "普通轮椅本人", createWheelchair(), -9.0, -0.9, 36.9, "spin", "#315a78");
addRacer("trolley", "独角兽购物车", createTrolley(), -11.1, 2.4, 37.8, "jump", "#f3e4eb");
const featuredRacers = Object.fromEntries(racers.map((racer) => [racer.id, racer]));
window.__ODD_PRIX_DEBUG__ = {
  racers: featuredRacers,
  racingAssetsWorld,
  trackLength,
  trackWidth,
  wheelCalibrationId,
  wheelCalibrationView,
};

async function hydrateTripoModels() {
  const trainRacer = racers.find((racer) => racer.id === "train");
  const chairRacer = racers.find((racer) => racer.id === "chair");
  const deerRacer = racers.find((racer) => racer.id === "deer");
  const wheelchairRacer = racers.find((racer) => racer.id === "wheelchair");
  const trolleyRacer = racers.find((racer) => racer.id === "trolley");

  const tasks = [
    mountEmbeddedModel("horse-human-carriage-combined", player.model, {
      height: vehicleTuning.player.modelHeight,
      position: [0, 0, 0],
      // Tripo exported the vehicle's long axis on Z. Keep that axis on the
      // racer's local +Z so the human puller, the source wheels, and travel
      // direction all share the same basis.
      rotationY: 0,
      wheelOverlayRotationY: 0,
      wheelOverlayScale: 0.84,
      wheelOverlayOpacity: 0.68,
      wheelTireOpacity: 0.12,
      wheelMarkerOpacity: 0.98,
      wheelOverlayOffset: [0, 0.2, -0.65],
      wheelOverlayLayout: [
        [-0.94, 0.39, -0.765, 0.65],
        [0.94, 0.57, -1.665, 0.82],
        [-0.94, 0.26, 1.068, 0.75],
        [0.94, 0.335, -0.115, 0.75],
      ],
    }),
    mountEmbeddedModel("steam-racer", trainRacer.model, {
      height: vehicleTuning.train.modelHeight,
      position: [0, 0, -0.05],
      rotationY: Math.PI,
      wheelOverlayOpacity: 0.64,
      wheelTireOpacity: 0.1,
      wheelMarkerOpacity: 0.98,
      wheelOverlayLayout: [
        [-0.66, 0.31, -1.073, 0.5],
        [0.66, 0.31, -1.073, 0.5],
        [-0.66, 0.31, -0.373, 0.5],
        [0.66, 0.31, -0.373, 0.5],
        [-0.66, 0.31, 0.337, 0.5],
        [0.66, 0.31, 0.337, 0.5],
      ],
    }),
    mountEmbeddedModel("office-chair-racer", chairRacer.model, {
      height: vehicleTuning.chair.modelHeight,
      rotationY: Math.PI,
      wheelOverlayRotationY: Math.PI,
      wheelOverlayOpacity: 0.75,
      wheelTireOpacity: 0.12,
      wheelMarkerOpacity: 1,
      wheelOverlayRadial: true,
      wheelOverlayLayout: [
        [0.316, 0.12, 0.808, 0.33],
        [0.725, 0.12, 0.308, 0.33],
        [0.176, 0.12, -0.777, 0.33],
        [-0.55, 0.12, -0.728, 0.33],
        [-0.744, 0.12, -0.019, 0.33],
      ],
    }),
    mountEmbeddedModel("goat-dance", deerRacer.model.userData.deer, {
      height: 1.72,
      role: "dance",
    }),
    mountEmbeddedModel("cat-dance", trolleyRacer.model.userData.unicorn, {
      height: 1.46,
      role: "dance",
    }),
    mountEmbeddedModel("wheelchair-racer", wheelchairRacer.model, {
      height: vehicleTuning.wheelchair.modelHeight,
      rotationY: Math.PI,
      wheelOverlayRotationY: Math.PI,
      wheelOverlayOpacity: 0.62,
      wheelTireOpacity: 0.08,
      wheelMarkerOpacity: 0.98,
      wheelOverlayLayout: [
        [-1.065, 0.84, -0.184, 0.78],
        [-0.052, 0.83, -0.304, 0.71],
        [-0.651, 0.2, 0.885, 0.48],
        [0.231, 0.35, 0.698, 0.45],
      ],
    }),
    mountEmbeddedModel("clock-tower", clockTowerAnchor, {
      height: 17,
    }),
    mountEmbeddedModel("arcade-bay", arcadeBayAnchor, {
      height: 7.5,
    }),
  ];

  await Promise.allSettled(tasks);
  ui.shell.dataset.models = "ready";
}

void hydrateTripoModels();

function createPickup(distance, lane, index) {
  const group = new THREE.Group();
  group.scale.setScalar(presentationScale);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: index % 2 ? "#f0cf39" : "#e9ff3e",
    emissive: index % 2 ? "#a44b12" : "#687500",
    emissiveIntensity: 0.62,
    roughness: 0.35,
  });
  const core = mesh(new THREE.OctahedronGeometry(0.58, 0), "#f0cf39", {
    material: coreMaterial,
  });
  const ring = mesh(new THREE.TorusGeometry(0.86, 0.045, 8, 28), "#ffffff", {
    material: new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.72,
    }),
    castShadow: false,
  });
  ring.rotation.x = Math.PI / 2;
  group.add(core, ring);
  const pickup = {
    distance,
    lane: lane * presentationScale,
    index,
    group,
    core,
    ring,
    lastLap: -99,
    active: true,
  };
  scene.add(group);
  return pickup;
}

const pickups = [
  createPickup(trackLength * 0.1, -3.5, 0),
  createPickup(trackLength * 0.1, 0, 1),
  createPickup(trackLength * 0.1, 3.5, 2),
  createPickup(trackLength * 0.34, -2.7, 3),
  createPickup(trackLength * 0.34, 2.7, 4),
  createPickup(trackLength * 0.58, -3.5, 5),
  createPickup(trackLength * 0.58, 0, 6),
  createPickup(trackLength * 0.58, 3.5, 7),
  createPickup(trackLength * 0.82, -2.3, 8),
  createPickup(trackLength * 0.82, 2.3, 9),
];

const confettiGeometry = new THREE.BoxGeometry(0.09, 0.04, 0.18);
const confetti = [];
const confettiPalette = ["#e9ff3e", "#f0cf39", "#e64c3b", "#55a9d6", "#f5efe0", "#9b6bd4"];

function burstConfetti(origin, count = 42) {
  for (let i = 0; i < count; i += 1) {
    const piece = mesh(confettiGeometry, confettiPalette[i % confettiPalette.length], [0, 0, 0], {
      material: new THREE.MeshBasicMaterial({ color: confettiPalette[i % confettiPalette.length] }),
      castShadow: false,
    });
    piece.position.copy(origin);
    piece.position.y += 2;
    scene.add(piece);
    confetti.push({
      mesh: piece,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        5 + Math.random() * 8,
        (Math.random() - 0.5) * 9,
      ),
      life: 2.5 + Math.random() * 2,
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    });
  }
}

const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  drift: false,
};
let phase = "menu";
let phaseStart = 0;
let sequenceStart = 0;
let raceStart = 0;
let raceTime = 0;
let finishTime = 0;
let playerSpeed = 0;
let playerLane = -1.4 * presentationScale;
let steer = 0;
let boostTime = 0;
let boostCooldown = 0;
let driftCharge = 0;
let wasDrifting = false;
let spinTime = 0;
let jumpTime = 0;
let whipTime = 0;
let chaos = 0;
let maxChaos = 0;
let lastRank = 1;
let lastCountdown = "";
let lastFeedTime = 0;
let cameraShake = 0;
let resultRank = 1;
let controlMode = "auto";
let lastManualInput = -99;
let nextAutoWhip = 0;

const clock = new THREE.Clock();

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = Math.floor(safe % 60).toString().padStart(2, "0");
  const millis = Math.floor((safe % 1) * 1000).toString().padStart(3, "0");
  return `${minutes}:${secs}.${millis}`;
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => ui.toast.classList.remove("show"), 1450);
}

function say(message) {
  ui.feed.textContent = message;
  lastFeedTime = performance.now();
}

function setControlMode(mode) {
  if (controlMode === mode) return;
  controlMode = mode;
  const manual = mode === "manual";
  ui.controlMode.classList.toggle("manual", manual);
  ui.controlModeTitle.textContent = manual ? "MANUAL TAKEOVER" : "AUTO DIRECTOR";
  ui.controlModeCopy.textContent = manual
    ? "玩家操纵中 · 松手 4.5 秒恢复自动"
    : "自动驾驶 · 7 机位 · 128 BPM";
  showToast(manual ? "已接管：方向盘交给你" : "AUTO DIRECTOR 重新接管");
}

const commentary = [
  "蓝调通勤号拒绝出示驾照：它只有时刻表。",
  "首席转椅官正在左右横跳，人体工学表示不负责。",
  "火箭鹿申请进入近地轨道，赛委会还在翻规则。",
  "滚筒涡轮 9000 刚刚完成一次脱水弯。",
  "独角兽购物车的下压力来自两袋促销土豆。",
  "观众席一致认为：这不是赛车，是交通工具团建。",
];

function setCountdown(text, isGo = false) {
  if (lastCountdown === text) return;
  lastCountdown = text;
  ui.countdown.textContent = text;
  ui.countdown.className = `countdown${isGo ? " go" : ""}`;
  void ui.countdown.offsetWidth;
  ui.countdown.classList.add("show");
  beep(isGo ? 740 : 330 + Number(text || 0) * 70, isGo ? 0.34 : 0.18, isGo ? "sawtooth" : "square");
}

function resetRace() {
  ui.entryVideo.pause();
  ui.entryFilm.hidden = true;
  ui.entryFilm.classList.remove("leaving");
  player.progress = -0.6 * presentationScale;
  playerLane = -1.4 * presentationScale;
  player.lane = playerLane;
  playerSpeed = 0;
  steer = 0;
  boostTime = 0;
  boostCooldown = 0;
  driftCharge = 0;
  wasDrifting = false;
  spinTime = 0;
  jumpTime = 0;
  whipTime = 0;
  chaos = 0;
  maxChaos = 0;
  raceTime = 0;
  finishTime = 0;
  lastRank = 1;
  lastCountdown = "";
  setControlMode("auto");
  lastManualInput = -99;
  nextAutoWhip = 0;
  racers.slice(1).forEach((racer, index) => {
    racer.progress = (-2.7 - index * 2.1) * presentationScale;
    racer.lane = clamp(
      [1.35, -3.8, 3.8, -0.9, 2.4][index] * presentationScale,
      -safeLaneHalfWidth,
      safeLaneHalfWidth,
    );
    racer.targetLane = racer.lane;
    racer.vertical = 0;
    racer.roll = 0;
  });
  pickups.forEach((pickup) => {
    pickup.lastLap = -99;
    pickup.active = true;
    pickup.group.visible = true;
  });
  while (confetti.length) {
    const piece = confetti.pop();
    scene.remove(piece.mesh);
    piece.mesh.material.dispose();
  }
}

function startRaceSequence() {
  initAudio();
  resetRace();
  ui.start.classList.add("hidden");
  ui.result.hidden = true;
  ui.shell.className = "cinematic";
  phase = "entry";
  phaseStart = clock.getElapsedTime();
  sequenceStart = phaseStart;
  ui.entryFilm.hidden = false;
  ui.entryFilm.classList.remove("leaving");
  ui.entryVideo.currentTime = 0;
  ui.entryVideo.muted = true;
  ui.raceBgm.currentTime = 0;
  ui.raceBgm.volume = defaultBgmVolume;
  attemptDefaultSoundPlayback();
  const filmPlayback = ui.entryVideo.play();
  if (filmPlayback) {
    filmPlayback.catch(finishEntryFilm);
  }
  say("夜幕开场。下一站：一群不该出现在 F1 赛道上的东西。");
}

function finishEntryFilm() {
  if (phase !== "entry") return;
  phase = "countdown";
  phaseStart = clock.getElapsedTime();
  lastCountdown = "";
  setCountdown("3");
  ui.entryFilm.classList.add("leaving");
  window.setTimeout(() => {
    if (phase === "entry") return;
    ui.entryVideo.pause();
    ui.entryFilm.hidden = true;
    ui.entryFilm.classList.remove("leaving");
  }, 540);
}

function skipEntryFilm() {
  if (phase !== "entry") return;
  unlockDefaultSound();
  ui.entryVideo.pause();
  finishEntryFilm();
  say("开场已跳过。三、二、一，荒唐杯直接发车。");
}

function beginCountdown(now) {
  phase = "countdown";
  phaseStart = now;
  lastCountdown = "";
  setCountdown("3");
}

function beginRace(now) {
  phase = "racing";
  phaseStart = now;
  raceStart = now;
  ui.shell.className = "racing";
  setCountdown("冲！", true);
  say("比赛开始！火箭鹿……等一下，火箭鹿去哪了？");
  playerSpeed = 3.8 * presentationScale;
  nextAutoWhip = now + 4.8;
}

function whipBoost() {
  if (phase !== "racing" || boostCooldown > 0) return;
  boostCooldown = 4.5;
  boostTime = Math.max(boostTime, 1.25);
  whipTime = 0.72;
  playerSpeed = Math.min(49 * presentationScale, playerSpeed + 9.5 * presentationScale);
  chaos = clamp(chaos + 14, 0, 100);
  cameraShake = 0.65;
    showToast("啪！马老板批准了情绪价值加速");
    say("马车夫甩出了赛马鞭。拉车人提交了加班申诉。");
  beep(920, 0.12, "sawtooth");
  window.setTimeout(() => beep(1280, 0.09, "square"), 70);
}

function finishRace(now) {
  if (phase !== "racing") return;
  finishTime = now - raceStart;
  resultRank = calculateRank();
  phase = "finished";
  ui.shell.className = "finished cinematic";
  playerSpeed *= 0.72;
  const ordinal = ["ST", "ND", "RD", "TH", "TH", "TH"][resultRank - 1];
  ui.resultRank.textContent = String(resultRank);
  ui.resultRank.nextElementSibling.textContent = ordinal;
  ui.resultTime.textContent = formatTime(finishTime);
  ui.resultChaos.textContent = `${Math.round(maxChaos)}%`;
  if (resultRank === 1) {
    ui.resultTitle.textContent = "马老板把常识甩在了身后";
    ui.resultSubtitle.textContent = "赛委会正在讨论人拉车算不算机动车。";
  } else if (resultRank <= 3) {
    ui.resultTitle.textContent = "领奖台接受了这辆倒反天罡马车";
    ui.resultSubtitle.textContent = "至少你没有像火箭鹿一样离开大气层。";
  } else {
    ui.resultTitle.textContent = "完赛本身就是一种胜利";
    ui.resultSubtitle.textContent = "马老板说拉车人还能再跑一圈。";
  }
  const frame = frameAt(player.progress);
  burstConfetti(frame.point, 90);
  beep(620, 0.18, "square");
  window.setTimeout(() => beep(820, 0.18, "square"), 180);
  window.setTimeout(() => beep(1040, 0.35, "sawtooth"), 360);
  window.setTimeout(() => {
    ui.result.hidden = false;
  }, 950);
}

function calculateRank() {
  const ordered = [...racers].sort((a, b) => b.progress - a.progress);
  return ordered.findIndex((racer) => racer === player) + 1;
}

function collectPickup(pickup, lapIndex) {
  pickup.lastLap = lapIndex;
  pickup.active = false;
  pickup.group.visible = false;
  const effect = (pickup.index + lapIndex) % 4;
  if (effect === 0) {
    boostTime = Math.max(boostTime, 2.2);
    playerSpeed = Math.min(50 * presentationScale, playerSpeed + 6 * presentationScale);
    chaos = clamp(chaos + 12, 0, 100);
    showToast("汽水火箭：打嗝也有推力");
    say("马老板的人力马车启用了碳酸推进系统。");
  } else if (effect === 1) {
    jumpTime = 1.1;
    boostTime = Math.max(boostTime, 0.6);
    chaos = clamp(chaos + 16, 0, 100);
    showToast("弹簧鞋：路面暂时失去意义");
    say("赛道监察：离地不代表超车合法。");
  } else if (effect === 2) {
    const target = racers
      .slice(1)
      .filter((racer) => racer.progress > player.progress)
      .sort((a, b) => a.progress - b.progress)[0];
    if (target) target.progress -= 8 * presentationScale;
    chaos = clamp(chaos + 18, 0, 100);
    showToast("拖鞋飞弹：锁定前方最嚣张目标");
    say(target ? `${target.name} 被一只拖鞋重新教育。` : "拖鞋飞弹找不到目标，开始反思人生。");
  } else {
    burstConfetti(player.model.position, 28);
    boostTime = Math.max(boostTime, 1);
    chaos = clamp(chaos + 22, 0, 100);
    showToast("便携庆功：先开香槟再说");
    say("尚未夺冠，但彩纸已经做出了自己的判断。");
  }
  cameraShake = 0.45;
  beep(780, 0.1, "square");
  window.setTimeout(() => beep(1160, 0.12, "sine"), 80);
  window.setTimeout(() => {
    pickup.active = true;
    pickup.group.visible = true;
  }, 3200);
}

function updatePlayer(dt, now) {
  const hasManualInput = keys.up || keys.down || keys.left || keys.right || keys.drift;
  if (hasManualInput) {
    lastManualInput = now;
    setControlMode("manual");
  } else if (controlMode === "manual" && now - lastManualInput > 4.5) {
    setControlMode("auto");
  }

  const autoLaneTarget = clamp(
    (
      Math.sin((now - raceStart) * 0.72) * 2.35
      + Math.sin((now - raceStart) * 1.83) * 0.48
    ) * presentationScale,
    -safeLaneHalfWidth,
    safeLaneHalfWidth,
  );
  const throttle = controlMode === "auto" ? 1 : keys.up ? 1 : 0;
  const braking = controlMode === "manual" && keys.down ? 1 : 0;
  const steerTarget =
    controlMode === "auto"
      ? clamp(((autoLaneTarget - playerLane) / presentationScale) * 0.55, -1, 1)
      : (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  steer = lerp(steer, steerTarget, 1 - Math.pow(0.001, dt));

  if (controlMode === "auto" && now >= nextAutoWhip && boostCooldown <= 0) {
    whipBoost();
    nextAutoWhip = now + 7.2 + Math.sin(now * 0.7) * 1.2;
  }

  const maxSpeed =
    controlMode === "auto"
      ? boostTime > 0
        ? 47 * presentationScale
        : 41 * presentationScale
      : boostTime > 0
        ? 50 * presentationScale
        : 43.5 * presentationScale;
  if (throttle) {
    playerSpeed += (18.5 + (playerSpeed < 12 * presentationScale ? 6 : 0)) * presentationScale * dt;
  } else playerSpeed -= 4.8 * presentationScale * dt;
  if (braking) playerSpeed -= 15 * presentationScale * dt;
  if (Math.abs(playerLane) > 4.55 * presentationScale) playerSpeed -= 8.5 * presentationScale * dt;

  const drifting =
    (controlMode === "auto"
      ? Math.sin((now - raceStart) * 0.44) > 0.76
      : keys.drift) &&
    Math.abs(steer) > 0.25 &&
    playerSpeed > 11 * presentationScale;
  if (drifting) {
    driftCharge = clamp(driftCharge + dt * 0.55, 0, 1);
    playerSpeed -= 1.7 * presentationScale * dt;
    chaos = clamp(chaos + dt * 2.6, 0, 100);
    cameraShake = Math.max(cameraShake, 0.08);
  } else if (wasDrifting && driftCharge > 0.2) {
    boostTime = Math.max(boostTime, 0.45 + driftCharge * 1.25);
    playerSpeed += (2 + driftCharge * 4) * presentationScale;
    showToast(driftCharge > 0.72 ? "荒唐漂移：完美！" : "漂移加速！");
    beep(560 + driftCharge * 460, 0.1, "sawtooth");
    driftCharge = 0;
  } else {
    driftCharge = Math.max(0, driftCharge - dt * 0.9);
  }
  wasDrifting = drifting;

  boostTime = Math.max(0, boostTime - dt);
  boostCooldown = Math.max(0, boostCooldown - dt);
  whipTime = Math.max(0, whipTime - dt);
  spinTime = Math.max(0, spinTime - dt);
  jumpTime = Math.max(0, jumpTime - dt);
  playerSpeed = clamp(playerSpeed, 0, maxSpeed);
  playerLane += steer * (4.2 * presentationScale + playerSpeed * 0.13) * dt * (drifting ? 1.32 : 1);
  playerLane = clamp(playerLane, -safeLaneHalfWidth, safeLaneHalfWidth);
  player.lane = playerLane;
  player.progress += playerSpeed * dt;

  for (const opponent of racers.slice(1)) {
    const distanceGap = opponent.progress - player.progress;
    if (
      Math.abs(distanceGap) < 1.45 * presentationScale &&
      Math.abs(opponent.lane - playerLane) < 1.35 * presentationScale &&
      opponent.hitCooldown <= 0
    ) {
      opponent.hitCooldown = 1.2;
      playerSpeed *= 0.74;
      spinTime = 0.68;
      chaos = clamp(chaos + 9, 0, 100);
      cameraShake = 0.72;
      showToast(`轻轻碰瓷：${opponent.name}`);
      beep(130, 0.18, "sawtooth");
    }
  }

  const lapIndex = Math.max(0, Math.floor(player.progress / trackLength));
  const loopDistance = mod(player.progress, trackLength);
  for (const pickup of pickups) {
    if (
      pickup.active &&
      pickup.lastLap !== lapIndex &&
      Math.abs(loopDistance - pickup.distance) < 1.4 * presentationScale &&
      Math.abs(playerLane - pickup.lane) < 1.55 * presentationScale
    ) {
      collectPickup(pickup, lapIndex);
    }
  }

  chaos = Math.max(0, chaos - dt * 1.05);
  maxChaos = Math.max(maxChaos, chaos);
  raceTime = now - raceStart;
  if (player.progress >= trackLength * totalLaps) finishRace(now);
}

function updateAI(dt, now) {
  const raceElapsed = Math.max(0, now - raceStart);
  racers.slice(1).forEach((racer, index) => {
    racer.hitCooldown = Math.max(0, racer.hitCooldown - dt);
    const behind = player.progress - racer.progress;
    const rubberBand = clamp(
      behind * 0.018,
      -2.1 * presentationScale,
      3.2 * presentationScale,
    );
    const personality =
      Math.sin(now * (0.55 + index * 0.08) + index * 2.1) * 0.7 * presentationScale;
    racer.speed = racer.baseSpeed + rubberBand + personality;
    racer.vertical = 0;
    racer.roll = 0;

    if (racer.gimmick === "side-hop") {
      racer.targetLane = Math.sin(now * 2.5) * 4.15 * presentationScale;
      racer.lane = lerp(racer.lane, racer.targetLane, dt * 4);
      racer.vertical = Math.max(0, Math.sin(now * 5.0)) * 0.55 * presentationScale;
      racer.roll = Math.sin(now * 5.0) * 0.16;
    } else if (racer.gimmick === "spiral" && raceElapsed < 2.8) {
      const launch = Math.sin((raceElapsed / 2.8) * Math.PI);
      racer.vertical = launch * 10 * presentationScale;
      racer.roll = raceElapsed * 5.5;
      racer.speed *= 0.48;
      racer.lane = (3.7 + Math.sin(raceElapsed * 8) * 1.1) * presentationScale;
    } else if (racer.gimmick === "spin") {
      racer.lane = lerp(
        racer.lane,
        Math.sin(now * 0.9 + index) * 2.6 * presentationScale,
        dt * 0.8,
      );
      racer.roll = Math.sin(now * 2.7) * 0.08;
    } else if (racer.gimmick === "jump") {
      racer.lane = lerp(
        racer.lane,
        (2.6 + Math.sin(now * 1.7) * 1.5) * presentationScale,
        dt * 1.2,
      );
      racer.vertical = Math.max(0, Math.sin(now * 2.4 + 1.4)) * 0.72 * presentationScale;
    } else {
      racer.lane = lerp(
        racer.lane,
        (0.7 + Math.sin(now * 0.52) * 0.8) * presentationScale,
        dt * 0.65,
      );
    }

    racer.lane = clamp(racer.lane, -safeLaneHalfWidth, safeLaneHalfWidth);
    racer.progress += racer.speed * dt;
  });
}

function animateVehicle(racer, now, speed, isFinishDance = false) {
  const data = racer.model.userData;
  const motionSpeed = speed / presentationScale;
  const cadence = now * (5.2 + motionSpeed * 0.22);
  const dance = phase === "intro" || phase === "countdown" || isFinishDance;

  if (data.wheels) {
    data.wheels.forEach((item) => {
      const rotor = item.userData.rotor;
      const radius = item.userData.radius || 0.35;
      item.getWorldScale(tempScale);
      const worldRadius = Math.max(0.04, radius * Math.max(tempScale.y, tempScale.z));
      if (rotor) {
        // Standard rolling relation used by racing games:
        // angular displacement = travelled distance / wheel radius.
        rotor.rotation.x = -(racer.progress / worldRadius) * racer.wheelSpinScale;
      }
    });
  }
  if (data.kind === "horse-carriage") {
    const combinedModel =
      data.loadedAssetId === "horse-human-carriage-combined" ? data.loadedModel : null;
    if (combinedModel) {
      const base = combinedModel.userData.mountBasePosition || [0, 0, 0];
      const celebration = dance || isFinishDance;
      combinedModel.position.set(
        base[0],
        base[1] + (celebration ? Math.abs(Math.sin(now * 5.4)) * 0.24 : 0),
        base[2],
      );
      combinedModel.rotation.z =
        Math.sin(now * (celebration ? 4.2 : 2.8)) * (celebration ? 0.1 : 0.025);
      combinedModel.rotation.x =
        whipTime > 0 ? Math.sin((1 - whipTime / 0.72) * Math.PI) * 0.06 : 0;
    }
    const stride = dance
      ? Math.sin(now * 6) * 0.75
      : Math.sin(cadence) * Math.min(0.85, motionSpeed * 0.035);
    data.legs[0].rotation.x = stride;
    data.legs[1].rotation.x = -stride;
    data.arms[0].rotation.x = -1.05 - stride * 0.32;
    data.arms[1].rotation.x = -1.05 + stride * 0.32;
    data.runner.position.y =
      0.05 + Math.abs(Math.sin(cadence)) * Math.min(0.12, motionSpeed * 0.006);
    data.cart.rotation.z = Math.sin(now * 6.8) * Math.min(0.035, motionSpeed * 0.0014);
    data.coachmanArms[0].rotation.z = dance ? -0.28 - Math.sin(now * 5) * 0.6 : -0.28;
    data.coachmanArms[1].rotation.z = dance ? 0.28 + Math.sin(now * 5) * 0.6 : 0.28;
    const whipStroke =
      whipTime > 0
        ? Math.sin((1 - whipTime / 0.72) * Math.PI) * 1.15
        : Math.sin(now * (dance ? 3.6 : 1.8)) * 0.12;
    data.whipPivot.rotation.z = -0.18 + whipStroke;
    data.whipPivot.rotation.x = 0.1 + Math.sin(now * 2.2) * 0.08;
    if (isFinishDance) {
      data.runner.rotation.y = Math.sin(now * 4) * 0.7;
      data.runner.rotation.z = Math.sin(now * 8) * 0.15;
      data.cart.position.y = Math.abs(Math.sin(now * 5)) * 0.28;
      data.coachman.position.y = 0.78 + Math.abs(Math.sin(now * 5.6)) * 0.18;
    } else {
      data.runner.rotation.y = 0;
      data.runner.rotation.z = 0;
      data.cart.position.y = 0;
      data.coachman.position.y = 0.78;
    }
  } else if (data.kind === "train") {
    data.chimney.scale.y = 1 + Math.sin(now * 8) * 0.07;
  } else if (data.kind === "chair") {
    data.driver.rotation.z = Math.sin(now * 4.2) * (dance ? 0.28 : 0.12);
    data.driver.position.y = Math.abs(Math.sin(now * 4.2)) * (dance ? 0.25 : 0.06);
  } else if (data.kind === "deer") {
    data.deer.position.y = 1.82 + Math.abs(Math.sin(cadence * 0.6)) * 0.18;
    data.deer.rotation.z = Math.sin(cadence * 0.3) * 0.06;
    data.legs.forEach((leg, index) => {
      leg.rotation.x = Math.sin(cadence + index * Math.PI) * 0.6;
    });
  } else if (data.kind === "washer") {
    data.drum.rotation.z += 0.16 + motionSpeed * 0.003;
    racer.model.rotation.z += Math.sin(now * 16) * 0.002;
  } else if (data.kind === "trolley") {
    data.unicorn.rotation.z = Math.sin(cadence * 0.4) * 0.08;
    data.unicorn.position.y = 1.3 + Math.abs(Math.sin(cadence * 0.45)) * 0.14;
  }
}

function placeRacer(racer, now, forceDance = false) {
  const { point, tangent, right } = frameAt(racer.progress);
  const trackSurfaceOffset = 0.015 * presentationScale;
  const vertical =
    racer === player
      ? jumpTime > 0
        ? Math.sin((1 - jumpTime / 1.1) * Math.PI) * 2.8 * presentationScale
        : 0
      : racer.vertical;
  const shadowExpansion = 1 + (vertical / presentationScale) * 0.035;
  racer.contactShadow.position.copy(point).addScaledVector(right, racer.lane);
  racer.contactShadow.position.y += trackSurfaceOffset + 0.012 * presentationScale;
  racer.contactShadow.rotation.y = Math.atan2(tangent.x, tangent.z);
  racer.contactShadow.scale.set(
    racer.shadowSize[0] * shadowExpansion,
    racer.shadowSize[1] * shadowExpansion,
    1,
  );
  racer.contactShadow.material.opacity =
    0.2 * (1 - clamp(vertical / (7 * presentationScale), 0, 0.82));
  racer.model.position.copy(point).addScaledVector(right, racer.lane);
  racer.model.position.y += trackSurfaceOffset + racer.groundClearance + vertical;
  // Keep every character upright while mapping local +Z to the horizontal
  // direction of travel. This avoids imported people/chairs looking sideways
  // or pitching backward on the track's small height changes.
  tempV2.set(tangent.x, 0, tangent.z).normalize();
  tempQ.setFromUnitVectors(forward, tempV2);
  let roll = racer.roll;
  if (racer === player) {
    roll += -steer * (keys.drift ? 0.18 : 0.08);
    if (spinTime > 0) roll += (1 - spinTime / 0.68) * Math.PI * 2;
  }
  tempQ2.setFromAxisAngle(forward, roll);
  racer.model.quaternion.copy(tempQ).multiply(tempQ2);
  animateVehicle(racer, now, racer === player ? playerSpeed : racer.speed, forceDance);
}

function buildRacerCloseup(
  racer,
  { ahead = -4.5, side = 4.2, height = 2.5, lookAhead = 1.8, fov = 32 } = {},
) {
  const shotFrame = frameAt(racer.progress);
  const destination = racer.model.position
    .clone()
    .addScaledVector(shotFrame.tangent, ahead * presentationScale)
    .addScaledVector(shotFrame.right, side * presentationScale)
    .addScaledVector(up, height * presentationScale);
  const target = racer.model.position
    .clone()
    .addScaledVector(shotFrame.tangent, lookAhead * presentationScale)
    .addScaledVector(up, 1.15 * presentationScale);
  return { destination, target, fov };
}

function updatePickups(now) {
  pickups.forEach((pickup) => {
    const { point, tangent, right } = frameAt(pickup.distance);
    pickup.group.position.copy(point).addScaledVector(right, pickup.lane);
    pickup.group.position.y +=
      (1.25 + Math.sin(now * 2.5 + pickup.index) * 0.18) * presentationScale;
    pickup.group.rotation.y = Math.atan2(tangent.x, tangent.z) + now * 1.1;
    pickup.core.rotation.x += 0.016;
    pickup.core.rotation.y += 0.021;
    pickup.ring.rotation.z -= 0.022;
  });
}

function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i -= 1) {
    const piece = confetti[i];
    piece.life -= dt;
    piece.velocity.y -= 8.8 * dt;
    piece.mesh.position.addScaledVector(piece.velocity, dt);
    piece.mesh.rotation.x += piece.spin.x * dt;
    piece.mesh.rotation.y += piece.spin.y * dt;
    piece.mesh.rotation.z += piece.spin.z * dt;
    if (piece.life <= 0 || piece.mesh.position.y < -1) {
      scene.remove(piece.mesh);
      piece.mesh.material.dispose();
      confetti.splice(i, 1);
    }
  }
}

function updateCamera(now, dt) {
  const playerFrame = frameAt(player.progress);
  const playerPos = player.model.position;
  const smooth = 1 - Math.pow(0.0008, dt);
  camera.up.copy(up);

  if (phase === "menu" || phase === "entry") {
    const orbit = now * 0.065;
    const startFrame = frameAt(0);
    camera.position.set(
      startFrame.point.x + Math.cos(orbit) * 18 * presentationScale,
      startFrame.point.y + 7.5 * presentationScale,
      startFrame.point.z + Math.sin(orbit) * 18 * presentationScale,
    );
    camera.lookAt(
      startFrame.point.x,
      startFrame.point.y + 1.3 * presentationScale,
      startFrame.point.z,
    );
    camera.fov = 44;
  } else if (phase === "intro") {
    const elapsed = now - phaseStart;
    if (elapsed < 1.45) {
      const startFrame = frameAt(-4);
      const destination = startFrame.point
        .clone()
        .addScaledVector(startFrame.right, -13 * presentationScale)
        .addScaledVector(up, 2.2 * presentationScale)
        .addScaledVector(startFrame.tangent, (-4 + elapsed * 4) * presentationScale);
      camera.position.lerp(destination, smooth * 0.6);
      tempV
        .copy(startFrame.point)
        .addScaledVector(startFrame.tangent, presentationScale)
        .addScaledVector(up, 1.4 * presentationScale);
      camera.lookAt(tempV);
      camera.fov = lerp(camera.fov, 35, smooth);
    } else if (elapsed < 3) {
      const angle = (elapsed - 1.45) * 1.15;
      const destination = playerPos
        .clone()
        .addScaledVector(playerFrame.right, Math.cos(angle) * 7.5 * presentationScale)
        .addScaledVector(playerFrame.tangent, (-5 + Math.sin(angle) * 4) * presentationScale)
        .addScaledVector(up, 3 * presentationScale);
      camera.position.lerp(destination, smooth);
      tempV.copy(playerPos).addScaledVector(up, 1.1 * presentationScale);
      camera.lookAt(tempV);
      camera.fov = lerp(camera.fov, 39, smooth);
    } else {
      const destination = playerPos
        .clone()
        .addScaledVector(playerFrame.tangent, -7.5 * presentationScale)
        .addScaledVector(playerFrame.right, 1.8 * presentationScale)
        .addScaledVector(up, 3.1 * presentationScale);
      camera.position.lerp(destination, smooth);
      tempV
        .copy(playerPos)
        .addScaledVector(playerFrame.tangent, 4 * presentationScale)
        .addScaledVector(up, presentationScale);
      camera.lookAt(tempV);
      camera.fov = lerp(camera.fov, 46, smooth);
    }
  } else if (phase === "countdown") {
    const elapsed = now - phaseStart;
    const side = Math.sin(elapsed * 0.5) * 0.8;
    const destination = playerPos
      .clone()
      .addScaledVector(playerFrame.tangent, -8.8 * presentationScale)
      .addScaledVector(playerFrame.right, (2.4 + side) * presentationScale)
      .addScaledVector(up, 3.4 * presentationScale);
    camera.position.lerp(destination, smooth);
    tempV
      .copy(playerPos)
      .addScaledVector(playerFrame.tangent, 4 * presentationScale)
      .addScaledVector(up, 1.1 * presentationScale);
    camera.lookAt(tempV);
    camera.fov = lerp(camera.fov, 44, smooth);
  } else if (phase === "finished") {
    const elapsed = now - finishTime - raceStart;
    const angle = now * 0.46;
    const destination = playerPos
      .clone()
      .addScaledVector(playerFrame.right, Math.cos(angle) * 9.5 * presentationScale)
      .addScaledVector(playerFrame.tangent, Math.sin(angle) * 7.5 * presentationScale)
      .addScaledVector(up, (3.5 + Math.sin(now * 0.5)) * presentationScale);
    camera.position.lerp(destination, smooth * 0.72);
    tempV.copy(playerPos).addScaledVector(up, 1.25 * presentationScale);
    camera.lookAt(tempV);
    camera.fov = lerp(camera.fov, elapsed < 2 ? 31 : 39, smooth);
  } else {
    const speedRatio = playerSpeed / (50 * presentationScale);
    let destination;
    let targetFov;
    if (controlMode === "auto") {
      const shotNumber = forcedCameraShot ?? Math.floor((now - raceStart) / 4.45);
      const shot = shotNumber % autoShotLabels.length;
      const shotCopy = `自动驾驶 · ${autoShotLabels[shot]} · 128 BPM`;
      if (ui.controlModeCopy.textContent !== shotCopy) {
        ui.controlModeCopy.textContent = shotCopy;
      }
      if (shot === 0) {
        destination = playerPos
          .clone()
          .addScaledVector(playerFrame.tangent, (-9.2 - speedRatio * 2.5) * presentationScale)
          .addScaledVector(playerFrame.right, 2.3 * presentationScale)
          .addScaledVector(up, 3.5 * presentationScale);
        tempV
          .copy(playerPos)
          .addScaledVector(playerFrame.tangent, 8 * presentationScale)
          .addScaledVector(up, 1.15 * presentationScale);
        targetFov = 50 + speedRatio * 9;
      } else if (shot === 1) {
        const closeup = buildRacerCloseup(featuredRacers.train, {
          ahead: 5.8,
          side: -3.8,
          height: 2.35,
          lookAhead: 0.4,
          fov: 31,
        });
        destination = closeup.destination;
        tempV.copy(closeup.target);
        targetFov = closeup.fov;
      } else if (shot === 2) {
        destination = playerPos
          .clone()
          .addScaledVector(playerFrame.tangent, -4.5 * presentationScale)
          .addScaledVector(playerFrame.right, 1.4 * presentationScale)
          .addScaledVector(up, 31 * presentationScale);
        tempV
          .copy(playerPos)
          .addScaledVector(playerFrame.tangent, 4.2 * presentationScale)
          .addScaledVector(up, 0.35 * presentationScale);
        targetFov = 31;
      } else if (shot === 3) {
        const closeup = buildRacerCloseup(featuredRacers.chair, {
          ahead: -1.6,
          side: 5.2,
          height: 2.55,
          lookAhead: 1.2,
          fov: 28,
        });
        destination = closeup.destination;
        tempV.copy(closeup.target);
        targetFov = closeup.fov;
      } else if (shot === 4) {
        const worldOrbit = (now - raceStart) * 0.055;
        destination = new THREE.Vector3(
          Math.cos(worldOrbit) * 35,
          125,
          Math.sin(worldOrbit) * 35,
        );
        tempV.set(0, 0, 0);
        camera.up.set(0, 0, -1);
        targetFov = 50;
      } else if (shot === 5) {
        const closeup = buildRacerCloseup(featuredRacers.wheelchair, {
          ahead: -3.5,
          side: -3.1,
          height: 1.45,
          lookAhead: 1.9,
          fov: 29,
        });
        destination = closeup.destination;
        tempV.copy(closeup.target);
        targetFov = closeup.fov;
      } else if (shot === 6) {
        tempV.set(0, 0, 0);
        racers.forEach((racer) => tempV.add(racer.model.position));
        tempV.multiplyScalar(1 / racers.length);
        destination = tempV
          .clone()
          .addScaledVector(playerFrame.tangent, -8 * presentationScale)
          .addScaledVector(playerFrame.right, 6 * presentationScale)
          .addScaledVector(up, 38 * presentationScale);
        tempV.addScaledVector(playerFrame.tangent, 4 * presentationScale);
        targetFov = 38;
      } else {
        const subject = shotNumber % 2 ? featuredRacers.trolley : featuredRacers.deer;
        const closeup = buildRacerCloseup(subject, {
          ahead: -4.6,
          side: 4.5,
          height: 2.8,
          lookAhead: 1.8,
          fov: 30,
        });
        destination = closeup.destination;
        tempV.copy(closeup.target);
        targetFov = closeup.fov;
      }
    } else {
      const cameraDistance = (7.2 + speedRatio * 3.6) * presentationScale;
      const cameraHeight = (3.1 + speedRatio * 0.55) * presentationScale;
      const sideLead = (1.85 - steer * 1.25) * presentationScale;
      destination = playerPos
        .clone()
        .addScaledVector(playerFrame.tangent, -cameraDistance)
        .addScaledVector(playerFrame.right, sideLead)
        .addScaledVector(up, cameraHeight);
      tempV
        .copy(playerPos)
        .addScaledVector(playerFrame.tangent, (7 + speedRatio * 8) * presentationScale)
        .addScaledVector(playerFrame.right, steer * 0.7 * presentationScale)
        .addScaledVector(up, 1.1 * presentationScale);
      targetFov = 47 + speedRatio * 11 + (boostTime > 0 ? 5 : 0);
    }
    cameraShake = Math.max(0, cameraShake - dt * 1.4);
    if (cameraShake > 0) {
      destination.x += (Math.random() - 0.5) * cameraShake * presentationScale;
      destination.y += (Math.random() - 0.5) * cameraShake * 0.45 * presentationScale;
      destination.z += (Math.random() - 0.5) * cameraShake * presentationScale;
    }
    camera.position.lerp(destination, smooth * (controlMode === "auto" ? 0.62 : 1));
    tempV2.copy(tempV);
    camera.lookAt(tempV2);
    camera.fov = lerp(camera.fov, targetFov, smooth * 0.6);
  }
  camera.updateProjectionMatrix();
}

function updateUI(now) {
  const rank = calculateRank();
  if (rank !== lastRank && phase === "racing") {
    if (rank < lastRank) showToast(`超越！当前第 ${rank} 名`);
    lastRank = rank;
  }
  ui.rank.textContent = String(rank);
  ui.lap.textContent = String(
    clamp(Math.floor(Math.max(0, player.progress) / trackLength) + 1, 1, totalLaps),
  );
  ui.timer.textContent = formatTime(phase === "finished" ? finishTime : raceTime);
  const displaySpeed = Math.round((playerSpeed / presentationScale) * 6.7);
  ui.speed.textContent = String(displaySpeed).padStart(3, "0");
  ui.speedDial.style.setProperty("--speed-ratio", clamp(displaySpeed / 330, 0, 1).toFixed(3));
  const raceProgress = clamp(
    Math.max(0, player.progress) / (trackLength * totalLaps),
    0,
    1,
  );
  const mapPoint = projectTrackMapPoint(frameAt(Math.max(0, player.progress)).point);
  ui.trackMapPlayer.setAttribute("cx", mapPoint.x.toFixed(2));
  ui.trackMapPlayer.setAttribute("cy", mapPoint.y.toFixed(2));
  ui.trackMapProgress.style.strokeDashoffset = String(1 - raceProgress);
  ui.trackProgressPercent.textContent = `${Math.round(raceProgress * 100)}%`;
  ui.trackProgressFill.style.width = `${raceProgress * 100}%`;
  ui.chaosFill.style.width = `${chaos}%`;
  ui.chaosLabel.textContent =
    chaos < 22 ? "冷静得可疑" : chaos < 50 ? "开始离谱" : chaos < 78 ? "赛委会皱眉" : "物理学已退出";

  if (phase === "racing" && performance.now() - lastFeedTime > 6000) {
    say(commentary[Math.floor(now / 6) % commentary.length]);
  }
}

let audioContext = null;
let masterGain = null;
let engineOsc = null;
let engineGain = null;
let soundEnabled = true;
let audioNeedsUnlock = false;
// The source mix is intentionally hot. Keep it in the same perceived range as
// the World Hub landing films so entering the runtime does not create a jump.
const defaultBgmVolume = 0.25;

function initAudio() {
  if (audioContext) {
    audioContext.resume();
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audioContext = new AudioCtx();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.22;
  masterGain.connect(audioContext.destination);
  engineOsc = audioContext.createOscillator();
  engineOsc.type = "sawtooth";
  engineGain = audioContext.createGain();
  engineGain.gain.value = 0;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 360;
  engineOsc.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(masterGain);
  engineOsc.start();
}

function setSoundButtonState() {
  ui.soundButton.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  ui.soundButton.classList.remove("needs-unlock");
}

function syncBgmToSequence() {
  const duration = Number.isFinite(ui.raceBgm.duration) ? ui.raceBgm.duration : 74;
  ui.raceBgm.currentTime = mod(clock.getElapsedTime() - sequenceStart, duration);
}

function markSoundReady() {
  audioNeedsUnlock = false;
  ui.raceBgm.muted = !soundEnabled;
  ui.raceBgm.volume = soundEnabled ? defaultBgmVolume : 0;
  if (masterGain && audioContext) {
    masterGain.gain.setTargetAtTime(soundEnabled ? 0.22 : 0.0001, audioContext.currentTime, 0.05);
  }
  setSoundButtonState();
}

function attemptDefaultSoundPlayback() {
  audioNeedsUnlock = false;
  ui.raceBgm.muted = false;
  // Audible autoplay is blocked by some browsers even when the game itself
  // starts automatically. Prime the requested BGM at zero volume, then raise
  // it immediately after playback begins. If that policy path is blocked too,
  // the first ordinary game gesture unlocks it without using the sound button.
  ui.raceBgm.volume = 0;
  setSoundButtonState();
  if (!soundEnabled || phase === "menu") return;
  const playback = ui.raceBgm.play();
  if (!playback) {
    markSoundReady();
    return;
  }
  playback.then(() => {
    ui.raceBgm.muted = false;
    ui.raceBgm.volume = defaultBgmVolume;
    window.setTimeout(() => {
      if (ui.raceBgm.paused || ui.raceBgm.muted) {
        audioNeedsUnlock = true;
        setSoundButtonState();
        return;
      }
      markSoundReady();
    }, 120);
  }).catch(() => {
    // Browsers can require one trusted gesture before audible autoplay.
    // Keep sound ON and run the music on its original timeline. The first
    // ordinary steering/click/touch gesture unlocks it automatically; the
    // player never needs to operate the sound switch just to hear the BGM.
    audioNeedsUnlock = true;
    ui.raceBgm.muted = true;
    ui.raceBgm.volume = defaultBgmVolume;
    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.05);
    }
    setSoundButtonState();
    const mutedPlayback = ui.raceBgm.play();
    if (mutedPlayback) mutedPlayback.catch(() => {});
  });
}

function unlockDefaultSound() {
  if (!soundEnabled || !audioNeedsUnlock) return;
  initAudio();
  const resumePlayback = () => {
    ui.raceBgm.muted = false;
    ui.raceBgm.volume = defaultBgmVolume;
    if (ui.raceBgm.paused) syncBgmToSequence();
    const playback = ui.raceBgm.play();
    if (playback) playback.then(markSoundReady).catch(() => {});
    else markSoundReady();
  };
  if (audioContext?.state === "suspended") {
    const resumed = audioContext.resume();
    if (resumed) resumed.then(resumePlayback).catch(resumePlayback);
    else resumePlayback();
  } else {
    resumePlayback();
  }
}

function beep(frequency, duration, type = "sine") {
  if (!audioContext || !soundEnabled) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration + 0.02);
}

function updateAudio() {
  if (!audioContext || !engineOsc || !engineGain) return;
  const now = audioContext.currentTime;
  const audibleSpeed = playerSpeed / presentationScale;
  engineOsc.frequency.setTargetAtTime(55 + audibleSpeed * 4.8, now, 0.08);
  engineGain.gain.setTargetAtTime(
    soundEnabled && (phase === "racing" || phase === "finished")
      ? 0.018 + audibleSpeed * 0.0015
      : 0,
    now,
    0.12,
  );
}

function updateWheelCalibration() {
  const subject = featuredRacers[wheelCalibrationId] || player;
  const groundY = -0.082 + subject.groundClearance;
  racers.forEach((racer) => {
    const active = racer === subject;
    racer.model.visible = active;
    racer.contactShadow.visible = active;
  });
  pickups.forEach((pickup) => {
    pickup.group.visible = false;
  });
  scenery.visible = false;
  importedScenery.visible = false;
  trackDecor.visible = false;
  ui.entryFilm.hidden = true;
  ui.result.hidden = true;
  ui.start.classList.add("hidden");
  ui.countdown.className = "countdown";
  ui.shell.className = "wheel-calibration";

  subject.progress = Number.isFinite(wheelCalibrationPose) ? wheelCalibrationPose : 1.75;
  subject.model.position.set(0, groundY, 0);
  subject.model.quaternion.identity();
  if (subject.model.userData.wheelOverlay) {
    subject.model.userData.wheelOverlay.visible = wheelCalibrationOverlayVisible;
    subject.model.userData.wheels.forEach((wheelObject, index) => {
      wheelObject.visible =
        wheelCalibrationOverlayVisible &&
        (!wheelCalibrationIndices.length || wheelCalibrationIndices.includes(index));
    });
    if (wheelCalibrationColors && !subject.model.userData.wheelOverlay.userData.calibrationStyled) {
      subject.model.userData.wheels.forEach((wheelObject, index) => {
        wheelObject.traverse((object) => {
          if (!object.isMesh || !object.material) return;
          object.material = object.material.clone();
          object.material.color.set(wheelCalibrationPalette[index % wheelCalibrationPalette.length]);
          if ("emissive" in object.material) {
            object.material.emissive.set(wheelCalibrationPalette[index % wheelCalibrationPalette.length]);
            object.material.emissiveIntensity = 0.16;
          }
        });
      });
      subject.model.userData.wheelOverlay.userData.calibrationStyled = true;
    }
  }
  subject.contactShadow.position.set(0, -0.088, 0);
  subject.contactShadow.rotation.set(-Math.PI / 2, 0, 0);
  animateVehicle(subject, 0, 0, false);

  const framingObject = subject.model.userData.loadedModel || subject.model;
  const bounds = new THREE.Box3().setFromObject(framingObject);
  const center = bounds.getCenter(tempV);
  const size = bounds.getSize(tempV2);
  const span = Math.max(size.x, size.z, 2);
  const distance = Math.max(5.2, span * 1.35);
  const target = center.clone();
  target.y = Math.max(0.65, center.y * 0.92);
  if (wheelCalibrationView === "right") {
    camera.position.set(-distance, target.y + size.y * 0.08, 0);
  } else if (wheelCalibrationView === "front") {
    camera.position.set(0, target.y + size.y * 0.08, distance);
  } else if (wheelCalibrationView === "rear") {
    camera.position.set(0, target.y + size.y * 0.08, -distance);
  } else if (wheelCalibrationView === "three-quarter") {
    camera.position.set(distance * 0.78, target.y + size.y * 0.26, distance * 0.72);
  } else {
    camera.position.set(distance, target.y + size.y * 0.08, 0);
  }
  camera.lookAt(target);
  camera.fov = 34;
  camera.updateProjectionMatrix();
  ui.controlModeTitle.textContent = "STATIC WHEEL CALIBRATION";
  ui.controlModeCopy.textContent = `${subject.name} · ${wheelCalibrationView.toUpperCase()} · POSE ${wheelCalibrationPose.toFixed(2)}`;
}

function update(now, dt) {
  if (wheelCalibrationMode) {
    updateWheelCalibration();
    return;
  }
  if (
    phase === "entry" &&
    Number.isFinite(ui.entryVideo.duration) &&
    ui.entryVideo.duration > 0 &&
    ui.entryVideo.currentTime >= ui.entryVideo.duration - 0.08
  ) {
    finishEntryFilm();
  }
  if (phase === "countdown") {
    const elapsed = now - phaseStart;
    if (elapsed < 1) setCountdown("3");
    else if (elapsed < 2) setCountdown("2");
    else if (elapsed < 3) setCountdown("1");
    else beginRace(now);
  }

  if (phase === "racing") {
    updatePlayer(dt, now);
    updateAI(dt, now);
  } else if (phase === "finished") {
    playerSpeed = Math.max(0, playerSpeed - dt * 3.2 * presentationScale);
    player.progress += playerSpeed * dt;
    updateAI(dt * 0.5, now);
  }

  racers.forEach((racer) => placeRacer(racer, now, phase === "finished" && racer === player));
  updatePickups(now);
  updateConfetti(dt);
  updateModelAnimations(dt);
  updateCamera(now, dt);
  updateUI(now);
  updateAudio();
  scenery.rotation.y = Math.sin(now * 0.02) * 0.003;
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  const now = clock.elapsedTime;
  update(now, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function setKey(event, down) {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "e"].includes(key)) {
    event.preventDefault();
  }
  if (key === "w" || key === "arrowup") keys.up = down;
  if (key === "s" || key === "arrowdown") keys.down = down;
  if (key === "a" || key === "arrowleft") keys.left = down;
  if (key === "d" || key === "arrowright") keys.right = down;
  if (key === " ") keys.drift = down;
  if (key === "e" && down && !event.repeat) whipBoost();
  if (key === "escape" && down && !event.repeat) skipEntryFilm();
}

window.addEventListener("keydown", (event) => setKey(event, true), { passive: false });
window.addEventListener("keyup", (event) => setKey(event, false), { passive: false });
window.addEventListener("pointerdown", (event) => {
  if (event.target !== ui.soundButton) unlockDefaultSound();
}, { capture: true, passive: true });
window.addEventListener("click", (event) => {
  if (event.target !== ui.soundButton) unlockDefaultSound();
}, { capture: true, passive: true });
window.addEventListener("touchstart", (event) => {
  if (event.target !== ui.soundButton) unlockDefaultSound();
}, { capture: true, passive: true });
window.addEventListener("keydown", unlockDefaultSound, { capture: true, passive: true });
window.addEventListener("blur", () => {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
});
window.addEventListener("resize", resize);

ui.startButton.addEventListener("click", startRaceSequence);
ui.restartButton.addEventListener("click", startRaceSequence);
ui.entrySkip.addEventListener("click", skipEntryFilm);
ui.entryVideo.addEventListener("ended", finishEntryFilm);
ui.entryVideo.addEventListener("error", finishEntryFilm);
ui.soundButton.addEventListener("click", () => {
  if (soundEnabled && audioNeedsUnlock) {
    unlockDefaultSound();
    return;
  }
  initAudio();
  soundEnabled = !soundEnabled;
  audioNeedsUnlock = false;
  if (masterGain) {
    masterGain.gain.setTargetAtTime(soundEnabled ? 0.22 : 0.0001, audioContext.currentTime, 0.05);
  }
  ui.raceBgm.muted = !soundEnabled;
  ui.raceBgm.volume = soundEnabled ? defaultBgmVolume : 0;
  if (soundEnabled && phase !== "menu") {
    if (ui.raceBgm.paused) syncBgmToSequence();
    const playback = ui.raceBgm.play();
    if (playback) {
      playback.then(markSoundReady).catch(() => {
        audioNeedsUnlock = true;
        setSoundButtonState();
      });
    }
  } else {
    ui.raceBgm.pause();
  }
  setSoundButtonState();
});

resize();
racers.forEach((racer) => placeRacer(racer, 0));
updatePickups(0);
animate();
if (!wheelCalibrationMode) {
  window.requestAnimationFrame(startRaceSequence);
}
