export type TrackKind = "camera" | "actor" | "vfx";

export interface ShotEvent {
  kind: TrackKind;
  label: string;
}

export interface ShotSpec {
  id: string;
  title: string;
  intent: string;
  duration: number;
  intensity: number;
  events: ShotEvent[];
}

export interface RuntimeProject {
  title: string;
  width: number;
  height: number;
  fps: number;
  shots: ShotSpec[];
}

export const project: RuntimeProject = {
  title: "暮关一刃",
  width: 1280,
  height: 720,
  fps: 30,
  shots: [
    {
      id: "S01",
      title: "建立空间",
      intent: "用远景建立双方距离与暮色压迫感。",
      duration: 2.2,
      intensity: 72,
      events: [
        { kind: "camera", label: "wide / slow push" },
        { kind: "actor", label: "duel_standoff" }
      ]
    },
    {
      id: "S02",
      title: "剑客逼近",
      intent: "切近景，保留停顿，让威胁先于动作发生。",
      duration: 2.0,
      intensity: 63,
      events: [
        { kind: "camera", label: "medium close-up" },
        { kind: "actor", label: "step_forward" }
      ]
    },
    {
      id: "S03",
      title: "枪将架势",
      intent: "用低机位与轻微横移展示防守重心。",
      duration: 1.7,
      intensity: 68,
      events: [
        { kind: "camera", label: "low angle" },
        { kind: "actor", label: "spear_guard" }
      ]
    },
    {
      id: "S04",
      title: "突进",
      intent: "极短加速段，以残影与速度线制造位移。",
      duration: 1.5,
      intensity: 88,
      events: [
        { kind: "actor", label: "dash_forward" },
        { kind: "vfx", label: "speed_lines" }
      ]
    },
    {
      id: "S05",
      title: "兵刃相接",
      intent: "闪白、碰撞火花与震屏集中在一个节拍。",
      duration: 1.2,
      intensity: 96,
      events: [
        { kind: "camera", label: "impact shake" },
        { kind: "vfx", label: "white_flash + sparks" }
      ]
    },
    {
      id: "S06",
      title: "交错而过",
      intent: "拉开横向速度，在人物穿越后迅速收静。",
      duration: 2.0,
      intensity: 84,
      events: [
        { kind: "camera", label: "lateral follow" },
        { kind: "actor", label: "cross_pass" },
        { kind: "vfx", label: "afterimage" }
      ]
    },
    {
      id: "S07",
      title: "空镜停顿",
      intent: "让场景短暂空下来，用烟尘延迟交代结果。",
      duration: 2.2,
      intensity: 52,
      events: [
        { kind: "camera", label: "locked wide" },
        { kind: "vfx", label: "dust settle" }
      ]
    },
    {
      id: "S08",
      title: "眼神收束",
      intent: "以眼部特写和一句短对白结束验证片段。",
      duration: 3.2,
      intensity: 77,
      events: [
        { kind: "camera", label: "extreme close-up" },
        { kind: "actor", label: "cold_glance" }
      ]
    }
  ]
};

export const totalDuration = () =>
  project.shots.reduce((sum, shot) => sum + shot.duration, 0);

export const resolveShot = (time: number) => {
  let cursor = 0;
  for (let index = 0; index < project.shots.length; index += 1) {
    const shot = project.shots[index];
    if (time < cursor + shot.duration || index === project.shots.length - 1) {
      return { shot, index, localTime: Math.max(0, time - cursor), start: cursor };
    }
    cursor += shot.duration;
  }
  return { shot: project.shots[0], index: 0, localTime: 0, start: 0 };
};
