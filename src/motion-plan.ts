export type ActorId = "swordsman" | "guardian";

export type MotionKind =
  | "enter"
  | "scan"
  | "speak"
  | "draw"
  | "dodge"
  | "clash"
  | "recoil"
  | "recover";

export interface MotionConstraint {
  rootMotion?: boolean;
  footLock?: boolean;
  gazeTarget?: "guardian" | "gate" | "swordsman";
  handProp?: "sword" | "spear";
  contactTarget?: "sword-spear";
}

export interface MotionBeat {
  id: string;
  kind: MotionKind;
  label: string;
  actor: ActorId;
  start: number;
  duration: number;
  intensity: number;
  dialogue?: string;
  constraints: MotionConstraint;
}

export interface MotionPlan {
  prompt: string;
  planner: "local-semantic-adapter";
  fps: number;
  beats: MotionBeat[];
  duration: number;
  warnings: string[];
}

interface BeatTemplate {
  kind: MotionKind;
  label: string;
  duration: number;
  intensity: number;
  matcher: RegExp;
  constraints: MotionConstraint;
}

const templates: BeatTemplate[] = [
  {
    kind: "enter",
    label: "走入场景",
    duration: 2.4,
    intensity: 0.55,
    matcher: /走入|走进|进场|靠近|上前|逼近/,
    constraints: { rootMotion: true, footLock: true, gazeTarget: "gate" }
  },
  {
    kind: "scan",
    label: "环顾戒备",
    duration: 1.45,
    intensity: 0.42,
    matcher: /环顾|观察|扫视|回头|张望|看向/,
    constraints: { footLock: true, gazeTarget: "gate" }
  },
  {
    kind: "speak",
    label: "开口说话",
    duration: 1.8,
    intensity: 0.38,
    matcher: /说话|开口|说道|喊|质问|低声|对白/,
    constraints: { footLock: true, gazeTarget: "guardian" }
  },
  {
    kind: "draw",
    label: "拔刀蓄势",
    duration: 1.55,
    intensity: 0.68,
    matcher: /拔刀|拔剑|抽刀|抽剑|亮刀/,
    constraints: { footLock: true, gazeTarget: "guardian", handProp: "sword" }
  },
  {
    kind: "dodge",
    label: "转身闪避",
    duration: 1.25,
    intensity: 0.78,
    matcher: /闪避|躲开|侧身|转身|后撤/,
    constraints: { rootMotion: true, footLock: true, gazeTarget: "guardian", handProp: "sword" }
  },
  {
    kind: "clash",
    label: "兵器交锋",
    duration: 1.65,
    intensity: 0.94,
    matcher: /格挡|交锋|碰撞|相接|前冲|攻击|挥砍|劈砍/,
    constraints: { rootMotion: true, footLock: true, gazeTarget: "guardian", handProp: "sword", contactTarget: "sword-spear" }
  },
  {
    kind: "recoil",
    label: "受击踉跄",
    duration: 1.5,
    intensity: 0.82,
    matcher: /受击|踉跄|失去平衡|击退|后退|负伤/,
    constraints: { rootMotion: true, footLock: true, gazeTarget: "guardian", handProp: "sword" }
  },
  {
    kind: "recover",
    label: "恢复架势",
    duration: 1.8,
    intensity: 0.5,
    matcher: /恢复|站稳|架势|戒备|稳住/,
    constraints: { footLock: true, gazeTarget: "guardian", handProp: "sword" }
  }
];

export const defaultDirectorPrompt =
  "剑客走入庭院，先环顾四周，低声说话；随后拔刀，转身闪避长枪，前冲与守将兵器相接，受击踉跄后重新站稳恢复架势。";

const sentenceOrder = (prompt: string, matcher: RegExp) => {
  const match = matcher.exec(prompt);
  matcher.lastIndex = 0;
  return match?.index ?? Number.POSITIVE_INFINITY;
};

const dialogueFrom = (prompt: string) => {
  const quoted = prompt.match(/[“\"]([^”\"]{1,24})[”\"]/);
  return quoted?.[1] ?? "此路不该由你来守。";
};

export const compileMotionPlan = (prompt: string): MotionPlan => {
  const cleanPrompt = prompt.trim() || defaultDirectorPrompt;
  const matched = templates
    .filter((template) => template.matcher.test(cleanPrompt))
    .sort((a, b) => sentenceOrder(cleanPrompt, a.matcher) - sentenceOrder(cleanPrompt, b.matcher));

  const warnings: string[] = [];
  const selected = matched.length > 0 ? matched : templates;
  if (matched.length === 0) {
    warnings.push("未识别到可执行动作，已使用验收动作链补全计划。");
  }

  const unique = selected.filter(
    (template, index, array) => array.findIndex((candidate) => candidate.kind === template.kind) === index
  );
  let cursor = 0;
  const beats: MotionBeat[] = unique.map((template, index) => {
    const beat: MotionBeat = {
      id: `M${String(index + 1).padStart(2, "0")}`,
      kind: template.kind,
      label: template.label,
      actor: "swordsman",
      start: cursor,
      duration: template.duration,
      intensity: template.intensity,
      constraints: { ...template.constraints },
      ...(template.kind === "speak" ? { dialogue: dialogueFrom(cleanPrompt) } : {})
    };
    cursor += template.duration;
    return beat;
  });

  return {
    prompt: cleanPrompt,
    planner: "local-semantic-adapter",
    fps: 30,
    beats,
    duration: cursor,
    warnings
  };
};

export const resolveBeat = (plan: MotionPlan, time: number) => {
  const clamped = Math.min(Math.max(time, 0), Math.max(0, plan.duration - 0.0001));
  const index = Math.max(
    0,
    plan.beats.findIndex((beat) => clamped < beat.start + beat.duration)
  );
  const beat = plan.beats[index] ?? plan.beats[plan.beats.length - 1];
  return {
    beat,
    index,
    localTime: clamped - beat.start,
    progress: Math.min(1, Math.max(0, (clamped - beat.start) / beat.duration))
  };
};
