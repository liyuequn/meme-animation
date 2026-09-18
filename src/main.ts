import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture
} from "pixi.js";
import "./styles.css";
import { project, resolveShot, totalDuration, type ShotSpec, type TrackKind } from "./shot-dsl";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const duration = () => totalDuration();

const app = new Application();
await app.init({
  width: project.width,
  height: project.height,
  background: "#07080a",
  antialias: true,
  resolution: 1,
  autoDensity: false,
  preference: "webgl",
  preserveDrawingBuffer: true
});
app.ticker.stop();
$("#stageMount").appendChild(app.canvas);

const [backgroundTexture, heroTexture, commanderTexture] = await Promise.all([
  Assets.load<Texture>("/assets/frontier-courtyard.png"),
  Assets.load<Texture>("/assets/black-swordsman.png"),
  Assets.load<Texture>("/assets/spear-commander.png")
]);

const camera = new Container();
const background = new Sprite(backgroundTexture);
background.anchor.set(0.5);
background.position.set(project.width / 2, project.height / 2);
background.width = project.width;
background.height = project.height;
camera.addChild(background);

const shadowLayer = new Container();
const actorLayer = new Container();
const effects = new Container();
const hero = new Sprite(heroTexture);
const commander = new Sprite(commanderTexture);
hero.anchor.set(0.5, 1);
commander.anchor.set(0.5, 1);
hero.height = 530;
hero.scale.x = hero.scale.y;
commander.height = 505;
commander.scale.x = commander.scale.y;
actorLayer.addChild(hero, commander);
camera.addChild(shadowLayer, actorLayer, effects);
app.stage.addChild(camera);

const grade = new Graphics().rect(0, 0, project.width, project.height).fill({ color: 0x12070c, alpha: 0.08 });
const flash = new Graphics().rect(0, 0, project.width, project.height).fill({ color: 0xffffff, alpha: 1 });
flash.alpha = 0;
const letterbox = new Graphics()
  .rect(0, 0, project.width, 40)
  .rect(0, project.height - 40, project.width, 40)
  .fill({ color: 0x020304, alpha: 0.96 });
app.stage.addChild(grade, flash, letterbox);

const subtitleStyle = new TextStyle({
  fill: "#f2f0e9",
  fontFamily: "Songti SC, STSong, serif",
  fontSize: 34,
  fontWeight: "600",
  stroke: { color: "#080808", width: 8 },
  dropShadow: { color: "#000000", alpha: 0.8, blur: 4, distance: 2 }
});
const subtitle = new Text({ text: "", style: subtitleStyle });
subtitle.anchor.set(0.5);
subtitle.position.set(project.width / 2, project.height - 82);
app.stage.addChild(subtitle);

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOut = (value: number) => {
  const t = clamp(value);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

const clearEffects = () => {
  effects.removeChildren().forEach((child) => child.destroy());
  shadowLayer.removeChildren().forEach((child) => child.destroy());
};

const addGroundShadow = (x: number, y: number, width: number, alpha = 0.24) => {
  const shadow = new Graphics().ellipse(x, y, width, 18).fill({ color: 0x000000, alpha });
  shadowLayer.addChild(shadow);
};

const addSpeedLines = (amount: number, direction = 1) => {
  for (let index = 0; index < 24; index += 1) {
    const y = 70 + ((index * 83) % 560);
    const length = 90 + ((index * 47) % 250) * amount;
    const x = direction > 0 ? 30 + ((index * 113) % 900) : 1250 - ((index * 113) % 900);
    effects
      .addChild(new Graphics())
      .moveTo(x, y)
      .lineTo(x + length * direction, y + ((index % 3) - 1) * 8)
      .stroke({ color: index % 4 === 0 ? 0xffd4a1 : 0xdce6ee, width: index % 5 === 0 ? 5 : 2, alpha: 0.16 + amount * 0.33 });
  }
};

const addSparks = (amount: number) => {
  const cx = 666;
  const cy = 338;
  for (let index = 0; index < 18; index += 1) {
    const angle = (Math.PI * 2 * index) / 18 + 0.14;
    const length = (60 + (index % 5) * 20) * amount;
    effects
      .addChild(new Graphics())
      .moveTo(cx + Math.cos(angle) * 15, cy + Math.sin(angle) * 15)
      .lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length)
      .stroke({ color: index % 3 === 0 ? 0xffffff : 0xffbd63, width: index % 4 === 0 ? 6 : 3, alpha: 0.85 * amount });
  }
  effects.addChild(new Graphics().circle(cx, cy, 35 * amount).fill({ color: 0xfff3c6, alpha: 0.72 * amount }));
};

const renderAt = (time: number) => {
  clearEffects();
  const { shot, index, localTime } = resolveShot(Math.min(time, Math.max(0, duration() - 0.001)));
  const p = clamp(localTime / shot.duration);
  const intensity = shot.intensity / 100;

  camera.position.set(0, 0);
  camera.pivot.set(project.width / 2, project.height / 2);
  camera.position.set(project.width / 2, project.height / 2);
  camera.scale.set(1);
  actorLayer.filters = [];
  background.tint = 0xffffff;
  hero.alpha = 1;
  commander.alpha = 1;
  hero.rotation = 0;
  commander.rotation = 0;
  flash.alpha = 0;
  subtitle.text = "";

  const baseHeroScale = 530 / heroTexture.height;
  const baseCommanderScale = 505 / commanderTexture.height;
  hero.scale.set(baseHeroScale);
  commander.scale.set(baseCommanderScale);

  if (index === 0) {
    const push = 1 + easeInOut(p) * 0.055 * intensity;
    camera.scale.set(push);
    hero.position.set(335, 668);
    commander.position.set(965, 668);
    addGroundShadow(335, 669, 180);
    addGroundShadow(965, 669, 210);
  } else if (index === 1) {
    camera.scale.set(1.38 + p * 0.1);
    camera.pivot.set(390 - p * 18, 395);
    hero.position.set(410 + p * 34, 680);
    commander.position.set(1050, 668);
    commander.alpha = 0.48;
    subtitle.text = p > 0.24 && p < 0.9 ? "让开。" : "";
    addGroundShadow(hero.x, 681, 200);
  } else if (index === 2) {
    camera.scale.set(1.32 + easeInOut(p) * 0.08);
    camera.pivot.set(865, 405);
    hero.position.set(255, 668);
    hero.alpha = 0.35;
    commander.position.set(876 - p * 14, 672);
    commander.rotation = -0.018 * intensity;
    subtitle.text = p > 0.35 ? "此门，不能过。" : "";
    addGroundShadow(commander.x, 673, 240);
  } else if (index === 3) {
    const travel = easeOut(p);
    background.tint = 0xd2b9b5;
    hero.position.set(-180 + travel * 970, 672);
    hero.rotation = 0.07;
    commander.position.set(920, 672);
    addSpeedLines(0.5 + p * intensity, 1);
    for (let trail = 1; trail <= 3; trail += 1) {
      const ghost = new Sprite(heroTexture);
      ghost.anchor.set(0.5, 1);
      ghost.scale.set(baseHeroScale);
      ghost.position.set(hero.x - trail * 75, hero.y);
      ghost.rotation = hero.rotation;
      ghost.alpha = (0.16 / trail) * intensity;
      effects.addChildAt(ghost, 0);
    }
  } else if (index === 4) {
    const hit = 1 - Math.abs(p - 0.48) * 2;
    camera.scale.set(1.65);
    camera.pivot.set(645, 365);
    const shake = Math.sin(p * 90) * clamp(hit) * 15 * intensity;
    camera.position.x += shake;
    camera.position.y += Math.cos(p * 77) * clamp(hit) * 9 * intensity;
    hero.position.set(545, 675);
    hero.rotation = 0.15;
    commander.position.set(770, 675);
    commander.rotation = -0.08;
    flash.alpha = p > 0.38 && p < 0.55 ? (1 - Math.abs(p - 0.465) * 12) * 0.75 : 0;
    addSparks(clamp(hit));
  } else if (index === 5) {
    const travel = easeInOut(p);
    actorLayer.filters = [new BlurFilter({ strength: 1.3 + intensity * 1.5, quality: 2 })];
    camera.scale.set(1.13);
    camera.pivot.x = 640 + (travel - 0.5) * 100;
    hero.position.set(390 + travel * 800, 675);
    hero.rotation = 0.07;
    commander.position.set(890 - travel * 780, 675);
    commander.rotation = -0.05;
    addSpeedLines(0.7 + intensity * 0.2, travel < 0.5 ? 1 : -1);
  } else if (index === 6) {
    camera.scale.set(1.05);
    hero.position.set(1120 + p * 80, 675);
    commander.position.set(70 - p * 70, 675);
    hero.alpha = 1 - easeOut(p * 2);
    commander.alpha = 1 - easeOut(p * 2);
    const dust = new Graphics();
    for (let index = 0; index < 10; index += 1) {
      dust.circle(380 + index * 58, 620 - Math.sin(index * 1.7) * 20 - p * 25, 18 + (index % 3) * 7)
        .fill({ color: 0x8d7c72, alpha: (0.16 + (index % 2) * 0.05) * (1 - p) });
    }
    effects.addChild(dust);
  } else {
    camera.scale.set(2.55 + easeInOut(p) * 0.16);
    camera.pivot.set(405, 265);
    hero.position.set(420, 680);
    commander.position.set(1100, 680);
    commander.alpha = 0;
    subtitle.text = p > 0.3 && p < 0.88 ? "你听见刀风了吗？" : "";
    if (p > 0.76) {
      const glint = new Graphics()
        .moveTo(405, 260)
        .lineTo(520, 242)
        .stroke({ color: 0xeaf8ff, width: 5, alpha: (1 - p) * 2.5 });
      effects.addChild(glint);
    }
  }

  app.renderer.render(app.stage);
  updateUi(time, shot, index);
};

let currentTime = 0;
let playing = false;
let startedAt = 0;
let selectedIndex = 0;
let raf = 0;

const timecode = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  const fraction = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
  return `${mins}:${secs}.${fraction}`;
};

const updateUi = (time: number, shot: ShotSpec, index: number) => {
  $("#shotLabel").textContent = `${shot.id} · ${shot.title}`;
  $("#timecode").textContent = `${timecode(time)} / ${timecode(duration())}`;
  $("#scrubber").setAttribute("max", duration().toFixed(2));
  ($("#scrubber") as HTMLInputElement).value = Math.min(time, duration()).toFixed(2);
  $("#playhead").style.left = `calc(82px + (100% - 108px) * ${time / duration()})`;
  document.querySelectorAll(".clip").forEach((clip) => clip.classList.toggle("active", clip.getAttribute("data-shot") === shot.id));
  if (selectedIndex !== index) selectShot(index, false);
};

const loop = (now: number) => {
  if (!playing) return;
  currentTime = (now - startedAt) / 1000;
  if (currentTime >= duration()) {
    currentTime = duration();
    playing = false;
    $("#playButton").textContent = "▶";
    $("#transportState").textContent = "ENDED";
    renderAt(currentTime - 0.001);
    return;
  }
  renderAt(currentTime);
  raf = window.setTimeout(() => loop(performance.now()), 1000 / project.fps);
};

const play = () => {
  if (playing) {
    playing = false;
    clearTimeout(raf);
    $("#playButton").textContent = "▶";
    $("#transportState").textContent = "PAUSED";
    return;
  }
  if (currentTime >= duration() - 0.01) currentTime = 0;
  playing = true;
  startedAt = performance.now() - currentTime * 1000;
  $("#playButton").textContent = "Ⅱ";
  $("#transportState").textContent = "PLAYING";
  void playImpactAudio(currentTime);
  loop(performance.now());
};

const selectShot = (index: number, seek = true) => {
  selectedIndex = index;
  const shot = project.shots[index];
  $("#shotIndex").textContent = `${String(index + 1).padStart(2, "0")} / ${String(project.shots.length).padStart(2, "0")}`;
  $("#shotTitle").textContent = shot.title;
  $("#shotIntent").textContent = shot.intent;
  ($("#intensityInput") as HTMLInputElement).value = String(shot.intensity);
  ($("#durationInput") as HTMLInputElement).value = String(shot.duration);
  $("#intensityValue").textContent = String(shot.intensity);
  $("#durationValue").textContent = `${shot.duration.toFixed(1)}s`;
  $("#eventList").innerHTML = shot.events
    .map((event) => `<div class="event-item"><span class="event-kind">${event.kind.toUpperCase()}</span><span class="event-label">${event.label}</span></div>`)
    .join("");
  if (seek) {
    currentTime = project.shots.slice(0, index).reduce((sum, item) => sum + item.duration, 0) + 0.01;
    playing = false;
    $("#playButton").textContent = "▶";
    renderTimeline();
    renderAt(currentTime);
  }
};

const renderTimeline = () => {
  const kinds: Record<TrackKind, HTMLElement> = {
    camera: $("#cameraTrack"),
    actor: $("#actorTrack"),
    vfx: $("#vfxTrack")
  };
  Object.values(kinds).forEach((track) => (track.innerHTML = ""));
  let cursor = 0;
  for (const shot of project.shots) {
    for (const event of shot.events) {
      const clip = document.createElement("button");
      clip.className = `clip ${event.kind}`;
      clip.dataset.shot = shot.id;
      clip.style.left = `${(cursor / duration()) * 100}%`;
      clip.style.width = `${(shot.duration / duration()) * 100}%`;
      clip.textContent = `${shot.id} ${event.label}`;
      clip.addEventListener("click", () => selectShot(project.shots.indexOf(shot)));
      kinds[event.kind].appendChild(clip);
    }
    cursor += shot.duration;
  }
  $("#timelineRuler").innerHTML = "";
  for (let second = 0; second <= Math.ceil(duration()); second += 2) {
    const mark = document.createElement("span");
    mark.className = "ruler-mark";
    mark.style.left = `${(second / duration()) * 100}%`;
    mark.textContent = `${second}s`;
    $("#timelineRuler").appendChild(mark);
  }
};

let audioContext: AudioContext | null = null;
const playImpactAudio = async (offset: number) => {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  const impactAt = project.shots.slice(0, 4).reduce((sum, item) => sum + item.duration, 0) + 0.45;
  const delay = impactAt - offset;
  if (delay < 0) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(110, audioContext.currentTime + delay);
  oscillator.frequency.exponentialRampToValueAtTime(38, audioContext.currentTime + delay + 0.22);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.setValueAtTime(0.14, audioContext.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + 0.35);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(audioContext.currentTime + delay);
  oscillator.stop(audioContext.currentTime + delay + 0.36);
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
  const stream = app.canvas.captureStream(project.fps);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const completed = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  playing = false;
  currentTime = 0;
  recorder.start(250);
  const exportStart = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const elapsed = (now - exportStart) / 1000;
      renderAt(Math.min(elapsed, duration() - 0.001));
      button.textContent = `实时渲染 ${Math.min(100, Math.floor((elapsed / duration()) * 100))}%`;
      if (elapsed >= duration()) resolve();
      else window.setTimeout(() => tick(performance.now()), 1000 / project.fps);
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
  link.download = "暮关一刃-vertical-slice.mp4";
  link.click();
  URL.revokeObjectURL(href);
  button.disabled = false;
  button.textContent = "导出 MP4";
  showToast("MP4 已导出，同时保存到 exports 目录");
};

$("#playButton").addEventListener("click", play);
$("#resetButton").addEventListener("click", () => {
  playing = false;
  currentTime = 0;
  $("#playButton").textContent = "▶";
  renderAt(0);
});
$("#scrubber").addEventListener("input", (event) => {
  playing = false;
  currentTime = Number((event.target as HTMLInputElement).value);
  $("#playButton").textContent = "▶";
  renderAt(currentTime);
});
$("#intensityInput").addEventListener("input", (event) => {
  const value = Number((event.target as HTMLInputElement).value);
  project.shots[selectedIndex].intensity = value;
  $("#intensityValue").textContent = String(value);
  renderAt(currentTime);
});
$("#durationInput").addEventListener("input", (event) => {
  const value = Number((event.target as HTMLInputElement).value);
  project.shots[selectedIndex].duration = value;
  $("#durationValue").textContent = `${value.toFixed(1)}s`;
  renderTimeline();
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

renderTimeline();
selectShot(0, false);
renderAt(0);

declare global {
  interface Window {
    motionComic: {
      renderAt: (time: number) => void;
      project: typeof project;
    };
  }
}
window.motionComic = {
  renderAt: (time: number) => {
    playing = false;
    clearTimeout(raf);
    currentTime = clamp(time, 0, duration());
    $("#playButton").textContent = "▶";
    $("#transportState").textContent = "PAUSED";
    renderAt(currentTime);
  },
  project
};
