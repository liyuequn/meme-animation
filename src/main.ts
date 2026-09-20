import * as THREE from "three";
import "./styles.css";
import {
  compileMotionPlan,
  defaultDirectorPrompt,
  resolveBeat,
  type MotionBeat,
  type MotionKind,
  type MotionPlan
} from "./motion-plan";
import { RiggedActor } from "./rigged-actor";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const timecode = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  const frames = Math.floor((seconds % 1) * 30).toString().padStart(2, "0");
  return `${mins}:${secs}:${frames}`;
};

const stage = $("#stageMount");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d13);
scene.fog = new THREE.FogExp2(0x0b0e14, 0.055);

const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
stage.appendChild(renderer.domElement);

const resize = () => {
  const bounds = stage.getBoundingClientRect();
  const width = Math.max(640, Math.floor(bounds.width));
  const height = Math.max(360, Math.floor(bounds.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

const ambient = new THREE.HemisphereLight(0x7187a8, 0x21130f, 1.3);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xffd6ae, 3.2);
keyLight.position.set(-3.5, 6, 4.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -3;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x6b93d2, 2.1);
rimLight.position.set(5, 3, -4);
scene.add(rimLight);

const flatMaterial = (color: number, roughness = 0.88) =>
  new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });

const courtyard = new THREE.Group();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), flatMaterial(0x343337));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
courtyard.add(ground);

const addBox = (size: [number, number, number], position: [number, number, number], color: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), flatMaterial(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  courtyard.add(mesh);
  return mesh;
};

addBox([10, 0.18, 2.6], [0, -0.12, -0.6], 0x24262c);
addBox([10, 2.8, 0.34], [0, 1.4, -2.7], 0x262832);
addBox([2.7, 2.5, 0.5], [0, 1.25, -2.4], 0x12161d);
addBox([1.05, 3.4, 0.72], [-2.8, 1.7, -2.2], 0x383138);
addBox([1.05, 3.4, 0.72], [2.8, 1.7, -2.2], 0x383138);
addBox([7.1, 0.42, 0.9], [0, 3.15, -2.25], 0x493536);
for (let index = -5; index <= 5; index += 1) {
  addBox([0.05, 0.018, 5.2], [index * 0.9, 0.012, -0.1], index % 2 === 0 ? 0x494247 : 0x3e3a3f);
}

const moon = new THREE.Mesh(new THREE.CircleGeometry(0.68, 32), new THREE.MeshBasicMaterial({ color: 0xd9dfdd }));
moon.position.set(-3.8, 3.55, -2.48);
courtyard.add(moon);

const lanternMaterial = new THREE.MeshStandardMaterial({ color: 0xa64227, emissive: 0x7a1e10, emissiveIntensity: 1.3 });
[-3.1, 3.1].forEach((x) => {
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.36, 8), lanternMaterial);
  lantern.position.set(x, 2.3, -1.75);
  courtyard.add(lantern);
  const glow = new THREE.PointLight(0xff6a34, 1.8, 3.4, 2);
  glow.position.copy(lantern.position);
  courtyard.add(glow);
});
scene.add(courtyard);

const swordsman = new RiggedActor("hero");
const guardian = new RiggedActor("guardian");
scene.add(swordsman.root, guardian.root, swordsman.helper, guardian.helper);

const contactFx = new THREE.Group();
const contactRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.18, 0.018, 6, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd18a, transparent: true })
);
contactRing.rotation.y = Math.PI / 2;
contactFx.add(contactRing);
const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffb04b });
const sparks = Array.from({ length: 10 }, (_, index) => {
  const spark = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.08 + (index % 3) * 0.035), sparkMaterial);
  spark.rotation.set(index * 0.47, index * 0.73, index * 0.91);
  contactFx.add(spark);
  return spark;
});
contactFx.visible = false;
scene.add(contactFx);

let activePlan = compileMotionPlan(defaultDirectorPrompt);
let currentTime = 0;
let playing = false;
let startedAt = 0;
let frameRequest = 0;
let lastBeatIndex = -1;

const cameraFor = (kind: MotionKind, progress: number) => {
  const positions: Record<MotionKind, THREE.Vector3> = {
    enter: new THREE.Vector3(0.25, 2.15, 6.9),
    scan: new THREE.Vector3(-0.55, 1.98, 5.7),
    speak: new THREE.Vector3(-1.12, 1.88, 4.65),
    draw: new THREE.Vector3(-0.45, 1.92, 5.25),
    dodge: new THREE.Vector3(-0.2, 2.04, 5.7),
    clash: new THREE.Vector3(0.15, 1.83, 4.75),
    recoil: new THREE.Vector3(-0.15, 2.02, 5.45),
    recover: new THREE.Vector3(0.1, 2.08, 6.1)
  };
  const target = positions[kind].clone();
  target.x += Math.sin(progress * Math.PI) * (kind === "clash" ? 0.12 : 0.035);
  camera.position.copy(target);
  const lookX = kind === "speak" ? -1.25 : kind === "recoil" ? -0.35 : 0;
  camera.lookAt(lookX, 1.18, 0);
};

const setConstraintChips = (beat: MotionBeat) => {
  const chips: string[] = [];
  if (beat.constraints.rootMotion) chips.push("ROOT MOTION");
  if (beat.constraints.footLock) chips.push("FOOT LOCK");
  if (beat.constraints.handProp) chips.push("HAND IK");
  if (beat.constraints.contactTarget) chips.push("CONTACT SYNC");
  if (beat.constraints.gazeTarget) chips.push("GAZE");
  $("#constraintChips").innerHTML = chips.map((chip) => `<span>${chip}</span>`).join("");
};

const updateUi = (beat: MotionBeat, index: number) => {
  $("#currentAction").textContent = beat.label;
  $("#beatCode").textContent = `${beat.id} / ${String(activePlan.beats.length).padStart(2, "0")}`;
  $("#timecode").textContent = `${timecode(currentTime)} / ${timecode(activePlan.duration)}`;
  const scrubber = $("#scrubber") as HTMLInputElement;
  scrubber.max = activePlan.duration.toFixed(3);
  scrubber.value = currentTime.toFixed(3);
  $("#playhead").style.left = `${(currentTime / activePlan.duration) * 100}%`;
  document.querySelectorAll(".motion-clip").forEach((node) => {
    node.classList.toggle("active", node.getAttribute("data-beat") === beat.id);
  });
  if (index !== lastBeatIndex) {
    lastBeatIndex = index;
    setConstraintChips(beat);
  }
  const subtitle = $("#subtitle");
  subtitle.textContent = beat.dialogue ?? "";
  subtitle.classList.toggle("visible", Boolean(beat.dialogue));
};

const renderAt = (time: number) => {
  currentTime = clamp(time, 0, Math.max(0, activePlan.duration - 0.001));
  const { beat, index, progress } = resolveBeat(activePlan, currentTime);
  const previousKind = index > 0 ? activePlan.beats[index - 1].kind : beat.kind;
  swordsman.update(beat.kind, progress, currentTime, previousKind);
  guardian.update(beat.kind, progress, currentTime, previousKind);
  cameraFor(beat.kind, progress);

  const impact = beat.kind === "clash" ? Math.max(0, 1 - Math.abs(progress - 0.68) / 0.12) : 0;
  contactFx.visible = impact > 0;
  if (contactFx.visible) {
    const a = swordsman.getWeaponTip();
    const b = guardian.getWeaponTip();
    contactFx.position.copy(a.add(b).multiplyScalar(0.5));
    const scale = 0.7 + impact;
    contactFx.scale.setScalar(scale);
    contactRing.material.opacity = impact;
    sparks.forEach((spark, sparkIndex) => {
      spark.position.set(
        Math.cos(sparkIndex * 2.1) * impact * 0.16,
        Math.sin(sparkIndex * 1.7) * impact * 0.16,
        Math.sin(sparkIndex * 2.8) * impact * 0.1
      );
    });
    keyLight.intensity = 3.2 + impact * 5;
  } else {
    keyLight.intensity = 3.2;
  }

  renderer.render(scene, camera);
  updateUi(beat, index);
};

const renderPlan = () => {
  $("#planSummary").textContent = `${activePlan.beats.length} 个动作节拍 · ${activePlan.duration.toFixed(1)} 秒`;
  $("#planList").innerHTML = activePlan.beats
    .map(
      (beat) => `
        <button class="plan-beat" data-seek="${beat.start}" data-id="${beat.id}">
          <span>${beat.id}</span>
          <strong>${beat.label}</strong>
          <small>${beat.duration.toFixed(2)}s</small>
        </button>`
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>(".plan-beat").forEach((button) => {
    button.addEventListener("click", () => {
      playing = false;
      $("#playButton").textContent = "▶";
      renderAt(Number(button.dataset.seek ?? 0) + 0.001);
    });
  });

  $("#motionTrack").innerHTML = activePlan.beats
    .map(
      (beat) => `<button class="motion-clip ${beat.kind}" data-beat="${beat.id}" data-seek="${beat.start}"
        style="left:${(beat.start / activePlan.duration) * 100}%;width:${(beat.duration / activePlan.duration) * 100}%">
        ${beat.label}
      </button>`
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>(".motion-clip").forEach((button) => {
    button.addEventListener("click", () => renderAt(Number(button.dataset.seek ?? 0) + 0.001));
  });
  $("#timelineRuler").innerHTML = Array.from({ length: Math.ceil(activePlan.duration) + 1 }, (_, second) =>
    second % 2 === 0
      ? `<span style="left:${(second / activePlan.duration) * 100}%">${second}s</span>`
      : ""
  ).join("");
  const warning = activePlan.warnings[0];
  $("#plannerWarning").textContent = warning ?? "动作语义已编译为可编辑约束计划。";
  $("#plannerWarning").classList.toggle("warning", Boolean(warning));
};

const loop = (now: number) => {
  if (!playing) return;
  const elapsed = (now - startedAt) / 1000;
  if (elapsed >= activePlan.duration) {
    playing = false;
    currentTime = activePlan.duration - 0.001;
    $("#playButton").textContent = "▶";
    $("#runtimeState").textContent = "COMPLETE";
    renderAt(currentTime);
    return;
  }
  renderAt(elapsed);
  frameRequest = requestAnimationFrame(loop);
};

const togglePlayback = () => {
  if (playing) {
    playing = false;
    cancelAnimationFrame(frameRequest);
    $("#playButton").textContent = "▶";
    $("#runtimeState").textContent = "PAUSED";
    return;
  }
  if (currentTime >= activePlan.duration - 0.03) currentTime = 0;
  playing = true;
  startedAt = performance.now() - currentTime * 1000;
  $("#playButton").textContent = "Ⅱ";
  $("#runtimeState").textContent = "EXECUTING";
  frameRequest = requestAnimationFrame(loop);
};

const showToast = (message: string) => {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
};

const exportMp4 = async () => {
  const button = $("#exportButton") as HTMLButtonElement;
  button.disabled = true;
  button.textContent = "实时渲染中…";
  playing = false;
  const stream = renderer.domElement.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const completed = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(250);
  const exportStart = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const elapsed = (now - exportStart) / 1000;
      renderAt(Math.min(elapsed, activePlan.duration - 0.001));
      button.textContent = `渲染 ${Math.min(100, Math.floor((elapsed / activePlan.duration) * 100))}%`;
      if (elapsed >= activePlan.duration) resolve();
      else window.setTimeout(() => tick(performance.now()), 1000 / 30);
    };
    tick(performance.now());
  });
  recorder.stop();
  await completed;
  button.textContent = "编码 MP4…";
  const response = await fetch("/api/export-mp4", {
    method: "POST",
    headers: { "Content-Type": "video/webm" },
    body: new Blob(chunks, { type: mimeType })
  });
  if (!response.ok) throw new Error(await response.text());
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "墨刃-骨骼动作验收.mp4";
  link.click();
  URL.revokeObjectURL(href);
  button.disabled = false;
  button.textContent = "导出 MP4";
  showToast("骨骼动作样片已导出");
};

($("#directorPrompt") as HTMLTextAreaElement).value = defaultDirectorPrompt;
$("#compileButton").addEventListener("click", () => {
  const prompt = ($("#directorPrompt") as HTMLTextAreaElement).value;
  activePlan = compileMotionPlan(prompt);
  currentTime = 0;
  lastBeatIndex = -1;
  renderPlan();
  renderAt(0);
  $("#runtimeState").textContent = "PLAN READY";
});
$("#playButton").addEventListener("click", togglePlayback);
$("#resetButton").addEventListener("click", () => {
  playing = false;
  cancelAnimationFrame(frameRequest);
  $("#playButton").textContent = "▶";
  $("#runtimeState").textContent = "PLAN READY";
  renderAt(0);
});
$("#scrubber").addEventListener("input", (event) => {
  playing = false;
  cancelAnimationFrame(frameRequest);
  $("#playButton").textContent = "▶";
  renderAt(Number((event.target as HTMLInputElement).value));
});
$("#skeletonToggle").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  swordsman.setDebugSkeleton(visible);
  guardian.setDebugSkeleton(visible);
  renderAt(currentTime);
});
$("#exportButton").addEventListener("click", () => {
  void exportMp4().catch((error) => {
    const button = $("#exportButton") as HTMLButtonElement;
    button.disabled = false;
    button.textContent = "导出 MP4";
    showToast(`导出失败：${error instanceof Error ? error.message : String(error)}`);
  });
});

renderPlan();
resize();
renderAt(0);
new ResizeObserver(() => {
  resize();
  renderAt(currentTime);
}).observe(stage);

declare global {
  interface Window {
    motionLab: {
      compile: (prompt: string) => MotionPlan;
      renderAt: (time: number) => void;
      getPlan: () => MotionPlan;
    };
  }
}

window.motionLab = {
  compile: (prompt: string) => {
    activePlan = compileMotionPlan(prompt);
    renderPlan();
    renderAt(0);
    return activePlan;
  },
  renderAt,
  getPlan: () => activePlan
};
