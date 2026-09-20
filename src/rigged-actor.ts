import * as THREE from "three";
import type { MotionKind } from "./motion-plan";

type BoneName =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "leftUpperArm"
  | "leftLowerArm"
  | "leftHand"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot";

type Rotation = [number, number, number];

interface Pose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  bones: Partial<Record<BoneName, Rotation>>;
  weaponVisible: boolean;
  jaw: number;
}

interface ActorPalette {
  cloth: number;
  clothDark: number;
  accent: number;
  skin: number;
  hair: number;
  metal: number;
}

const heroPalette: ActorPalette = {
  cloth: 0x1d2836,
  clothDark: 0x0c121a,
  accent: 0x9c3e31,
  skin: 0xc99372,
  hair: 0x111318,
  metal: 0xc8d4dd
};

const guardianPalette: ActorPalette = {
  cloth: 0x38444a,
  clothDark: 0x161e23,
  accent: 0x9c7441,
  skin: 0xb98262,
  hair: 0x17191b,
  metal: 0xb6c0c7
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pulse = (p: number, center: number, width: number) => clamp(1 - Math.abs(p - center) / width);

const rotation = (x = 0, y = 0, z = 0): Rotation => [x, y, z];

const mergePose = (base: Pose, changes: Partial<Pose> & { bones?: Pose["bones"] }): Pose => ({
  ...base,
  ...changes,
  bones: { ...base.bones, ...(changes.bones ?? {}) }
});

const blendPose = (from: Pose, to: Pose, amount: number): Pose => {
  const t = smooth(amount);
  const names = new Set([...Object.keys(from.bones), ...Object.keys(to.bones)] as BoneName[]);
  const bones: Pose["bones"] = {};
  names.forEach((name) => {
    const a = from.bones[name] ?? rotation();
    const b = to.bones[name] ?? rotation();
    bones[name] = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  });
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    z: lerp(from.z, to.z, t),
    rotationY: lerp(from.rotationY, to.rotationY, t),
    jaw: lerp(from.jaw, to.jaw, t),
    weaponVisible: t < 0.5 ? from.weaponVisible : to.weaponVisible,
    bones
  };
};

const heroPose = (kind: MotionKind, p: number, time: number): Pose => {
  const breath = Math.sin(time * 3.2) * 0.018;
  const drawn = ["dodge", "clash", "recoil", "recover"].includes(kind);
  const base: Pose = {
    x: -1.55,
    y: 0,
    z: 0.12,
    rotationY: 0,
    weaponVisible: drawn,
    jaw: 0,
    bones: {
      spine: rotation(breath, 0, 0),
      chest: rotation(-0.03 + breath, 0, 0),
      head: rotation(0, -0.08, 0),
      leftUpperArm: rotation(0.05, 0, 0.08),
      leftLowerArm: rotation(-0.08, 0, -0.08),
      rightUpperArm: rotation(-0.05, 0, -0.08),
      rightLowerArm: rotation(-0.08, 0, 0.08),
      leftUpperLeg: rotation(0, 0, 0.035),
      rightUpperLeg: rotation(0, 0, -0.035)
    }
  };

  if (drawn) {
    base.bones.rightUpperArm = rotation(-0.72, 0.2, -0.5);
    base.bones.rightLowerArm = rotation(-0.62, 0, -0.08);
    base.bones.leftUpperArm = rotation(-0.4, -0.1, 0.48);
    base.bones.leftLowerArm = rotation(-0.48, 0, 0.08);
  }

  if (kind === "enter") {
    const travel = smooth(p);
    const cycle = Math.sin(p * Math.PI * 7.5);
    return mergePose(base, {
      x: lerp(-4.1, -1.55, travel),
      y: Math.abs(Math.sin(p * Math.PI * 7.5)) * 0.035,
      bones: {
        leftUpperLeg: rotation(cycle * 0.58, 0, 0.02),
        rightUpperLeg: rotation(-cycle * 0.58, 0, -0.02),
        leftLowerLeg: rotation(Math.max(0, -cycle) * 0.72, 0, 0),
        rightLowerLeg: rotation(Math.max(0, cycle) * 0.72, 0, 0),
        leftUpperArm: rotation(-cycle * 0.45, 0, 0.08),
        rightUpperArm: rotation(cycle * 0.45, 0, -0.08),
        chest: rotation(-0.05, cycle * 0.08, 0)
      }
    });
  }

  if (kind === "scan") {
    const sweep = p < 0.5 ? smooth(p * 2) : 1 - smooth((p - 0.5) * 2);
    return mergePose(base, {
      bones: {
        head: rotation(-0.04, lerp(-0.75, 0.62, sweep), 0.04),
        neck: rotation(0, lerp(-0.18, 0.16, sweep), 0),
        chest: rotation(-0.02, lerp(-0.08, 0.08, sweep), 0)
      }
    });
  }

  if (kind === "speak") {
    const gesture = Math.sin(p * Math.PI);
    return mergePose(base, {
      jaw: Math.max(0, Math.sin(p * Math.PI * 11)) * 0.9,
      bones: {
        head: rotation(-0.03 + Math.sin(p * Math.PI * 2) * 0.05, -0.18, 0),
        leftUpperArm: rotation(-0.42 * gesture, 0, 0.42 * gesture),
        leftLowerArm: rotation(-0.58 * gesture, 0, -0.12),
        chest: rotation(-0.02, 0.08 * gesture, 0)
      }
    });
  }

  if (kind === "draw") {
    const reach = smooth(clamp(p / 0.46));
    const pull = smooth(clamp((p - 0.34) / 0.5));
    return mergePose(base, {
      weaponVisible: p > 0.3,
      rotationY: -0.08 * pull,
      bones: {
        chest: rotation(-0.08, -0.18 * pull, 0.05),
        rightUpperArm: rotation(lerp(-0.15, -1.1, reach), -0.28, lerp(-0.1, -0.72, reach)),
        rightLowerArm: rotation(lerp(-0.15, -1.28, reach), 0, -0.08),
        leftUpperArm: rotation(lerp(0.05, -0.55, pull), 0.16, lerp(0.08, 0.52, pull)),
        leftLowerArm: rotation(lerp(-0.08, -0.7, pull), 0, 0.05),
        head: rotation(-0.04, -0.22, 0)
      }
    });
  }

  if (kind === "dodge") {
    const arc = Math.sin(p * Math.PI);
    return mergePose(base, {
      x: -1.55 - arc * 0.72,
      y: arc * 0.09,
      z: 0.12 + arc * 0.24,
      rotationY: -arc * 0.68,
      bones: {
        spine: rotation(-0.22 * arc, -0.2 * arc, -0.18 * arc),
        chest: rotation(-0.18 * arc, -0.34 * arc, -0.26 * arc),
        head: rotation(0.08, 0.28 * arc, 0.12 * arc),
        leftUpperLeg: rotation(-0.55 * arc, 0, 0.12),
        rightUpperLeg: rotation(0.7 * arc, 0, -0.08),
        rightLowerLeg: rotation(0.82 * arc, 0, 0),
        rightUpperArm: rotation(-0.7, 0.18, -0.8 - arc * 0.35),
        rightLowerArm: rotation(-0.72, 0, -0.16)
      }
    });
  }

  if (kind === "clash") {
    const charge = smooth(clamp(p / 0.66));
    const strike = smooth(clamp((p - 0.34) / 0.42));
    const settle = smooth(clamp((p - 0.76) / 0.24));
    return mergePose(base, {
      x: lerp(-1.55, -0.52, charge) - settle * 0.18,
      y: Math.sin(p * Math.PI) * 0.055,
      rotationY: -0.1 + strike * 0.25,
      bones: {
        chest: rotation(lerp(-0.18, 0.04, strike), lerp(-0.48, 0.36, strike), -0.08),
        head: rotation(-0.05, -0.25, 0),
        rightUpperArm: rotation(lerp(-1.5, -0.34, strike), lerp(0.15, -0.28, strike), lerp(-0.62, -1.22, strike)),
        rightLowerArm: rotation(lerp(-1.15, -0.18, strike), 0, -0.06),
        leftUpperArm: rotation(-0.74, -0.12, 0.72),
        leftLowerArm: rotation(-0.78, 0, 0.08),
        leftUpperLeg: rotation(-0.35 * charge, 0, 0.1),
        rightUpperLeg: rotation(0.54 * charge, 0, -0.08),
        rightLowerLeg: rotation(0.42 * charge, 0, 0)
      }
    });
  }

  if (kind === "recoil") {
    const hit = smooth(clamp(p / 0.32));
    const regain = smooth(clamp((p - 0.52) / 0.48));
    const impact = hit * (1 - regain);
    return mergePose(base, {
      x: lerp(-0.7, -1.82, hit),
      y: Math.sin(p * Math.PI) * 0.06,
      rotationY: -0.25 - impact * 0.4,
      bones: {
        spine: rotation(0.36 * impact, 0.22 * impact, 0.28 * impact),
        chest: rotation(0.48 * impact, 0.35 * impact, 0.32 * impact),
        head: rotation(-0.26 * impact, -0.22, -0.18 * impact),
        rightUpperArm: rotation(-0.45 + impact * 0.62, 0.2, -0.7 - impact * 0.7),
        rightLowerArm: rotation(-0.3, 0, -0.14),
        leftUpperArm: rotation(-0.25, 0, 0.45 + impact * 0.62),
        leftUpperLeg: rotation(0.45 * impact, 0, 0.16),
        rightUpperLeg: rotation(-0.35 * impact, 0, -0.12),
        leftLowerLeg: rotation(0.62 * impact, 0, 0)
      }
    });
  }

  const settle = 1 - Math.exp(-p * 5);
  return mergePose(base, {
    x: lerp(-1.82, -1.55, settle),
    bones: {
      spine: rotation(-0.12 * (1 - settle), 0, 0),
      chest: rotation(-0.18 * (1 - settle), -0.12, 0),
      head: rotation(0.04 * (1 - settle), -0.2, 0),
      rightUpperArm: rotation(-0.8, 0.1, -0.82),
      rightLowerArm: rotation(-0.66, 0, -0.12),
      leftUpperArm: rotation(-0.44, 0, 0.54),
      leftLowerArm: rotation(-0.5, 0, 0.04),
      leftUpperLeg: rotation(-0.08, 0, 0.1),
      rightUpperLeg: rotation(0.08, 0, -0.1)
    }
  });
};

const guardianPose = (kind: MotionKind, p: number, time: number): Pose => {
  const breath = Math.sin(time * 2.6) * 0.015;
  const base: Pose = {
    x: 1.28,
    y: 0,
    z: 0,
    rotationY: Math.PI,
    weaponVisible: true,
    jaw: 0,
    bones: {
      spine: rotation(breath, 0, 0),
      chest: rotation(-0.04, 0, 0),
      head: rotation(0, 0.12, 0),
      rightUpperArm: rotation(-0.72, -0.08, -0.62),
      rightLowerArm: rotation(-0.85, 0, -0.05),
      leftUpperArm: rotation(-0.5, 0.08, 0.58),
      leftLowerArm: rotation(-0.78, 0, 0.04),
      leftUpperLeg: rotation(0.06, 0, 0.1),
      rightUpperLeg: rotation(-0.06, 0, -0.1)
    }
  };

  if (["enter", "scan", "speak", "draw"].includes(kind)) {
    return mergePose(base, {
      bones: {
        head: rotation(0, 0.12 + Math.sin(time * 1.4) * 0.025, 0),
        chest: rotation(-0.04 + breath, 0, 0)
      }
    });
  }

  if (kind === "dodge") {
    const prepare = smooth(p);
    return mergePose(base, {
      x: 1.28 - prepare * 0.15,
      bones: {
        chest: rotation(-0.12 * prepare, -0.12 * prepare, 0),
        rightUpperArm: rotation(-0.9, -0.15, -0.72),
        rightLowerArm: rotation(-1.05, 0, -0.08),
        leftUpperArm: rotation(-0.72, 0.1, 0.7),
        leftLowerArm: rotation(-0.92, 0, 0.05)
      }
    });
  }

  if (kind === "clash") {
    const brace = smooth(clamp(p / 0.62));
    const contact = pulse(p, 0.68, 0.22);
    return mergePose(base, {
      x: 1.28 - brace * 0.23 + contact * 0.04,
      rotationY: Math.PI + contact * 0.08,
      bones: {
        spine: rotation(-0.18 * brace, 0.12 * brace, 0.08 * contact),
        chest: rotation(-0.24 * brace, 0.18 * brace, 0.12 * contact),
        head: rotation(-0.05, 0.18, -0.04 * contact),
        rightUpperArm: rotation(-1.08, -0.18, -0.82 + brace * 0.2),
        rightLowerArm: rotation(-1.18, 0, -0.12),
        leftUpperArm: rotation(-0.88, 0.12, 0.82),
        leftLowerArm: rotation(-1.0, 0, 0.08),
        leftUpperLeg: rotation(0.22 * brace, 0, 0.14),
        rightUpperLeg: rotation(-0.3 * brace, 0, -0.12),
        rightLowerLeg: rotation(0.34 * brace, 0, 0)
      }
    });
  }

  if (kind === "recoil") {
    const thrust = smooth(clamp(p / 0.42));
    return mergePose(base, {
      x: lerp(1.05, 0.72, thrust),
      bones: {
        spine: rotation(-0.2 * thrust, -0.18 * thrust, 0),
        chest: rotation(-0.28 * thrust, -0.24 * thrust, 0),
        rightUpperArm: rotation(-1.35, -0.18, -0.72),
        rightLowerArm: rotation(-1.38, 0, -0.05),
        leftUpperArm: rotation(-1.18, 0.12, 0.72),
        leftLowerArm: rotation(-1.3, 0, 0.04),
        leftUpperLeg: rotation(-0.28 * thrust, 0, 0.08),
        rightUpperLeg: rotation(0.36 * thrust, 0, -0.08)
      }
    });
  }

  return mergePose(base, {
    x: lerp(0.72, 1.28, smooth(p)),
    bones: {
      chest: rotation(-0.08, 0, 0),
      rightUpperArm: rotation(-0.78, -0.08, -0.65),
      rightLowerArm: rotation(-0.9, 0, -0.06)
    }
  });
};

export class RiggedActor {
  readonly root = new THREE.Group();
  readonly helper: THREE.SkeletonHelper;
  readonly skeleton: THREE.Skeleton;
  private readonly bones = {} as Record<BoneName, THREE.Bone>;
  private readonly weapon = new THREE.Group();
  private readonly jaw = new THREE.Mesh();
  private readonly role: "hero" | "guardian";
  private previousKind: MotionKind = "enter";

  constructor(role: "hero" | "guardian") {
    this.role = role;
    const palette = role === "hero" ? heroPalette : guardianPalette;
    this.root.name = role === "hero" ? "Swordsman_Rig" : "Guardian_Rig";
    this.buildSkeleton();
    this.buildBody(palette);
    this.buildWeapon(palette);
    const orderedBones = Object.values(this.bones);
    this.skeleton = new THREE.Skeleton(orderedBones);
    this.helper = new THREE.SkeletonHelper(this.bones.hips);
    this.helper.visible = false;
    const helperMaterial = this.helper.material as THREE.LineBasicMaterial;
    helperMaterial.depthTest = false;
    helperMaterial.transparent = true;
    helperMaterial.opacity = 0.82;
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  private bone(name: BoneName, parent: THREE.Object3D, position: [number, number, number]) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...position);
    parent.add(bone);
    this.bones[name] = bone;
    return bone;
  }

  private buildSkeleton() {
    const hips = this.bone("hips", this.root, [0, 1.04, 0]);
    const spine = this.bone("spine", hips, [0, 0.22, 0]);
    const chest = this.bone("chest", spine, [0, 0.33, 0]);
    const neck = this.bone("neck", chest, [0, 0.34, 0]);
    this.bone("head", neck, [0, 0.17, 0]);

    const leftUpperArm = this.bone("leftUpperArm", chest, [0.31, 0.25, 0]);
    const leftLowerArm = this.bone("leftLowerArm", leftUpperArm, [0, -0.38, 0]);
    this.bone("leftHand", leftLowerArm, [0, -0.34, 0]);
    const rightUpperArm = this.bone("rightUpperArm", chest, [-0.31, 0.25, 0]);
    const rightLowerArm = this.bone("rightLowerArm", rightUpperArm, [0, -0.38, 0]);
    this.bone("rightHand", rightLowerArm, [0, -0.34, 0]);

    const leftUpperLeg = this.bone("leftUpperLeg", hips, [0.14, -0.04, 0]);
    const leftLowerLeg = this.bone("leftLowerLeg", leftUpperLeg, [0, -0.48, 0]);
    this.bone("leftFoot", leftLowerLeg, [0, -0.45, 0]);
    const rightUpperLeg = this.bone("rightUpperLeg", hips, [-0.14, -0.04, 0]);
    const rightLowerLeg = this.bone("rightLowerLeg", rightUpperLeg, [0, -0.48, 0]);
    this.bone("rightFoot", rightLowerLeg, [0, -0.45, 0]);
  }

  private material(color: number, roughness = 0.78, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  }

  private addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  private limb(parent: THREE.Object3D, radius: number, length: number, material: THREE.Material) {
    return this.addMesh(parent, new THREE.CapsuleGeometry(radius, Math.max(0.04, length - radius * 2), 4, 8), material, [0, -length / 2, 0]);
  }

  private buildBody(palette: ActorPalette) {
    const cloth = this.material(palette.cloth);
    const clothDark = this.material(palette.clothDark);
    const accent = this.material(palette.accent);
    const skin = this.material(palette.skin, 0.92);
    const hair = this.material(palette.hair, 0.95);
    const metal = this.material(palette.metal, 0.3, 0.5);

    this.addMesh(this.bones.hips, new THREE.CylinderGeometry(0.26, 0.32, 0.25, 7), clothDark, [0, 0.03, 0]);
    this.addMesh(this.bones.spine, new THREE.CylinderGeometry(0.3, 0.25, 0.52, 7), cloth, [0, 0.2, 0]);
    this.addMesh(this.bones.chest, new THREE.BoxGeometry(0.67, 0.11, 0.34), accent, [0, 0.2, 0]);
    const skirt = this.addMesh(this.bones.hips, new THREE.ConeGeometry(0.39, 0.68, 7, 1, true), cloth, [0, -0.3, 0]);
    skirt.scale.z = 0.72;

    this.limb(this.bones.leftUpperArm, 0.095, 0.38, cloth);
    this.limb(this.bones.leftLowerArm, 0.078, 0.34, clothDark);
    this.limb(this.bones.rightUpperArm, 0.095, 0.38, cloth);
    this.limb(this.bones.rightLowerArm, 0.078, 0.34, clothDark);
    this.addMesh(this.bones.leftHand, new THREE.SphereGeometry(0.09, 10, 8), skin, [0, -0.035, 0]);
    this.addMesh(this.bones.rightHand, new THREE.SphereGeometry(0.09, 10, 8), skin, [0, -0.035, 0]);

    this.limb(this.bones.leftUpperLeg, 0.12, 0.48, clothDark);
    this.limb(this.bones.leftLowerLeg, 0.1, 0.45, cloth);
    this.limb(this.bones.rightUpperLeg, 0.12, 0.48, clothDark);
    this.limb(this.bones.rightLowerLeg, 0.1, 0.45, cloth);
    const leftBoot = this.addMesh(this.bones.leftFoot, new THREE.BoxGeometry(0.2, 0.12, 0.36), clothDark, [0, -0.06, 0.09]);
    const rightBoot = this.addMesh(this.bones.rightFoot, new THREE.BoxGeometry(0.2, 0.12, 0.36), clothDark, [0, -0.06, 0.09]);
    leftBoot.rotation.x = rightBoot.rotation.x = 0.05;

    this.addMesh(this.bones.head, new THREE.SphereGeometry(0.2, 12, 10), skin, [0, 0.08, 0]);
    const hairCap = this.addMesh(this.bones.head, new THREE.SphereGeometry(0.213, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, [0, 0.11, -0.005]);
    hairCap.rotation.x = -0.08;
    this.addMesh(this.bones.head, new THREE.BoxGeometry(0.34, 0.035, 0.035), hair, [0, 0.095, 0.192]);
    this.jaw.geometry = new THREE.BoxGeometry(0.2, 0.045, 0.05);
    this.jaw.material = skin;
    this.jaw.position.set(0, -0.035, 0.185);
    this.bones.head.add(this.jaw);

    const shoulderGuardLeft = this.addMesh(this.bones.leftUpperArm, new THREE.SphereGeometry(0.14, 8, 6), metal, [0, -0.04, 0]);
    const shoulderGuardRight = this.addMesh(this.bones.rightUpperArm, new THREE.SphereGeometry(0.14, 8, 6), metal, [0, -0.04, 0]);
    shoulderGuardLeft.scale.y = shoulderGuardRight.scale.y = 0.62;
  }

  private buildWeapon(palette: ActorPalette) {
    const metal = new THREE.MeshStandardMaterial({
      color: palette.metal,
      roughness: 0.22,
      metalness: 0.72,
      emissive: palette.metal,
      emissiveIntensity: 0.1,
      flatShading: true
    });
    const grip = this.material(0x211512, 0.88);
    const ornament = this.material(palette.accent, 0.46, 0.15);
    if (this.role === "hero") {
      const blade = this.addMesh(this.weapon, new THREE.BoxGeometry(0.055, 1.08, 0.025), metal, [0, -0.65, 0]);
      blade.geometry.translate(0, 0, 0);
      this.addMesh(this.weapon, new THREE.BoxGeometry(0.26, 0.045, 0.07), ornament, [0, -0.08, 0]);
      this.addMesh(this.weapon, new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8), grip, [0, 0.07, 0]);
      this.weapon.rotation.z = -0.12;
      this.weapon.position.set(0, -0.02, 0);
    } else {
      this.addMesh(this.weapon, new THREE.CylinderGeometry(0.026, 0.026, 2.5, 8), grip, [0, -1.13, 0]);
      const tip = this.addMesh(this.weapon, new THREE.ConeGeometry(0.075, 0.32, 6), metal, [0, -2.5, 0]);
      tip.rotation.z = Math.PI;
      this.addMesh(this.weapon, new THREE.CylinderGeometry(0.07, 0.02, 0.2, 8), ornament, [0, -2.3, 0]);
      this.weapon.rotation.z = Math.PI - 0.88;
      this.weapon.position.set(0, -0.03, 0);
    }
    const weaponHand = this.role === "hero" ? this.bones.leftHand : this.bones.rightHand;
    weaponHand.add(this.weapon);
  }

  setDebugSkeleton(visible: boolean) {
    this.helper.visible = visible;
  }

  update(kind: MotionKind, progress: number, time: number, previousKind?: MotionKind) {
    const poseFactory = this.role === "hero" ? heroPose : guardianPose;
    let pose = poseFactory(kind, progress, time);
    const prior = previousKind ?? this.previousKind;
    if (prior !== kind && progress < 0.16) {
      pose = blendPose(poseFactory(prior, 1, time), pose, progress / 0.16);
    }
    this.previousKind = kind;
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.set(0, pose.rotationY, 0);
    (Object.keys(this.bones) as BoneName[]).forEach((name) => {
      const value = pose.bones[name] ?? rotation();
      this.bones[name].rotation.set(value[0], value[1], value[2]);
    });
    this.weapon.visible = pose.weaponVisible;
    this.jaw.position.y = -0.035 - pose.jaw * 0.025;
    this.skeleton.update();
  }

  getWeaponTip(target = new THREE.Vector3()) {
    this.weapon.updateWorldMatrix(true, true);
    const local = this.role === "hero" ? new THREE.Vector3(0, -1.18, 0) : new THREE.Vector3(0, -2.62, 0);
    return this.weapon.localToWorld(target.copy(local));
  }
}
