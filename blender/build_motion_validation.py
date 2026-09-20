"""Build and render a skeletal motion-plan validation scene in Blender.

Run with:
  blender --background --python blender/build_motion_validation.py -- \
    --plan blender/motion-plan.validation.json --output exports/blender-validation
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ACTION_TOKENS = {
    "death": "|Death",
    "idle": "|Idle",
    "idleSwordLeft": "|Idle_swordLeft",
    "idleSwordRight": "|Idle_swordRight",
    "rollSword": "|Roll_sword",
    "run": "|Run",
    "runSwordAttack": "|Run_swordAttack",
    "runSwordRight": "|Run_swordRight",
    "swordAttackJump": "|swordAttackJump",
    "walk": "|Walking",
}


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--render", choices=("stills", "video", "none"), default="stills")
    return parser.parse_args(raw)


def look_at(obj: bpy.types.Object, point: Vector) -> None:
    obj.rotation_euler = (point - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.72
    shader.inputs["Metallic"].default_value = metallic
    return material


def imported_objects(filepath: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(filepath))
    return [obj for obj in bpy.data.objects if obj not in before]


def find_action(actions: list[bpy.types.Action], semantic_name: str) -> bpy.types.Action:
    token = ACTION_TOKENS[semantic_name]
    exact = [action for action in actions if token in action.name]
    if not exact:
        raise RuntimeError(f"Missing action {semantic_name!r}; imported: {[a.name for a in actions]}")
    return exact[0]


def tint_character(meshes: list[bpy.types.Object], tint: list[float], actor_id: str) -> None:
    tint_rgb = Vector(tint[:3])
    for mesh in meshes:
        for index, slot in enumerate(mesh.material_slots):
            if not slot.material:
                continue
            material = slot.material.copy()
            material.name = f"{actor_id}_{material.name}_{index}"
            base = Vector(material.diffuse_color[:3])
            mixed = base.lerp(tint_rgb, 0.34)
            color = (*mixed, 1.0)
            material.diffuse_color = color
            if material.use_nodes:
                shader = material.node_tree.nodes.get("Principled BSDF")
                if shader:
                    shader.inputs["Base Color"].default_value = color
                    shader.inputs["Alpha"].default_value = 1.0
                    shader.inputs["Roughness"].default_value = 0.78
            slot.material = material


def attach_weapon(
    weapon_file: Path,
    armature: bpy.types.Object,
    hand: str,
    actor_id: str,
) -> None:
    weapon_objects = imported_objects(weapon_file)
    for obj in weapon_objects:
        if obj.type != "MESH":
            obj.hide_render = True
            continue
        obj.name = f"{actor_id}_sword"
        obj.parent = armature
        obj.parent_type = "BONE"
        obj.parent_bone = hand
        obj.location = (0.0, 0.0, 0.0)
        obj.rotation_euler = (math.radians(90), 0.0, math.radians(90))
        obj.scale = (1.0, 1.0, 1.0)
        for slot in obj.material_slots:
            if slot.material:
                slot.material = slot.material.copy()
                slot.material.diffuse_color = (0.08, 0.10, 0.14, 1.0)
                if slot.material.use_nodes:
                    shader = slot.material.node_tree.nodes.get("Principled BSDF")
                    if shader:
                        shader.inputs["Base Color"].default_value = (0.08, 0.10, 0.14, 1.0)
                        shader.inputs["Alpha"].default_value = 1.0
                        shader.inputs["Metallic"].default_value = 0.82
                        shader.inputs["Roughness"].default_value = 0.25


def add_motion_segments(
    armature: bpy.types.Object,
    actions: list[bpy.types.Action],
    segments: list[dict],
) -> None:
    animation_data = armature.animation_data_create()
    animation_data.action = None
    for index, segment in enumerate(segments):
        action = find_action(actions, segment["action"])
        track = animation_data.nla_tracks.new()
        track.name = f"{index:02d}_{segment['action']}"
        strip = track.strips.new(segment["action"], segment["start"], action)
        strip.action_frame_start = float(segment.get("sourceStart", action.frame_range[0]))
        strip.action_frame_end = float(segment.get("sourceEnd", action.frame_range[1]))
        strip.frame_start = float(segment["start"])
        strip.frame_end = float(segment["end"])
        strip.repeat = float(segment.get("repeat", 1.0))
        strip.extrapolation = "HOLD_FORWARD"
        strip.blend_type = "REPLACE"
        strip.blend_in = 4.0 if index else 0.0
        strip.blend_out = 3.0 if index < len(segments) - 1 else 0.0


def add_root_motion(root: bpy.types.Object, keyframes: list[dict]) -> None:
    root.rotation_mode = "XYZ"
    for item in keyframes:
        root.location = item["position"]
        root.rotation_euler[2] = math.radians(item["facingDegrees"])
        root.keyframe_insert(data_path="location", frame=item["frame"])
        root.keyframe_insert(data_path="rotation_euler", index=2, frame=item["frame"])


def import_actor(
    actor: dict,
    character_file: Path,
    weapon_file: Path,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    before_actions = set(bpy.data.actions)
    objects = imported_objects(character_file)
    actions = [action for action in bpy.data.actions if action not in before_actions]
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if len(armatures) != 1 or not meshes:
        raise RuntimeError(f"Unexpected character contents: {[(o.name, o.type) for o in objects]}")

    actor_id = actor["id"]
    armature = armatures[0]
    armature.name = f"{actor_id}_armature"
    for index, mesh in enumerate(meshes):
        mesh.name = f"{actor_id}_mesh_{index}"
    tint_character(meshes, actor["tint"], actor_id)

    root = bpy.data.objects.new(f"{actor_id}_root_motion", None)
    bpy.context.scene.collection.objects.link(root)
    root.scale = (0.34, 0.34, 0.34)
    armature.parent = root

    add_motion_segments(armature, actions, actor["segments"])
    add_root_motion(root, actor["rootMotion"])
    attach_weapon(weapon_file, armature, actor["weaponHand"], actor_id)
    return root, armature


def add_stage() -> None:
    ground_material = make_material("ground", (0.055, 0.065, 0.085, 1.0))
    accent_material = make_material("stage_accent", (0.14, 0.18, 0.24, 1.0), 0.15)

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "stage_ground"
    ground.data.materials.append(ground_material)

    for x in (-4.8, 0.0, 4.8):
        bpy.ops.mesh.primitive_cube_add(location=(x, 2.5, 1.15), scale=(0.12, 0.55, 1.15))
        pillar = bpy.context.object
        pillar.data.materials.append(accent_material)
        bpy.ops.mesh.primitive_cube_add(location=(x, 2.5, 2.4), scale=(0.52, 0.62, 0.10))
        bpy.context.object.data.materials.append(accent_material)


def add_lighting_and_camera(camera_data: dict) -> None:
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.023, 0.038, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32

    bpy.ops.object.light_add(type="AREA", location=(-2.0, -4.0, 7.0))
    key = bpy.context.object
    key.data.energy = 1150
    key.data.shape = "DISK"
    key.data.size = 6.0
    look_at(key, Vector((0.0, 0.0, 1.7)))

    bpy.ops.object.light_add(type="AREA", location=(4.0, 2.0, 4.5))
    rim = bpy.context.object
    rim.data.energy = 850
    rim.data.color = (0.18, 0.35, 1.0)
    rim.data.size = 4.0
    look_at(rim, Vector((0.5, 0.0, 1.5)))

    bpy.ops.object.camera_add(location=camera_data["position"])
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = camera_data["orthographicScale"]
    look_at(camera, Vector(camera_data["target"]))
    bpy.context.scene.camera = camera


def configure_render(plan: dict, output: Path) -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = int(plan["frameEnd"])
    scene.render.fps = int(plan["fps"])
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output / "stills" / "frame_")
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"

    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.color_mode = "RGBA"


def add_timeline_markers(events: list[dict]) -> None:
    for event in events:
        target = f"->{event['target']}" if event.get("target") else ""
        bpy.context.scene.timeline_markers.new(
            f"{event['type']}:{event['actor']}{target}",
            frame=int(event["frame"]),
        )


def main() -> None:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    plan_path = (repo_root / args.plan).resolve()
    output = (repo_root / args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / "stills").mkdir(parents=True, exist_ok=True)
    (output / "frames").mkdir(parents=True, exist_ok=True)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))

    character_file = repo_root / "assets/third_party/quaternius-knight/KnightCharacter.fbx"
    weapon_file = repo_root / "assets/third_party/quaternius-knight/Sword.fbx"
    if not character_file.exists() or not weapon_file.exists():
        raise FileNotFoundError("Quaternius Knight source FBX files are missing")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    add_stage()
    for actor in plan["actors"]:
        import_actor(actor, character_file, weapon_file)
    add_lighting_and_camera(plan["camera"])
    configure_render(plan, output)
    add_timeline_markers(plan["events"])

    blend_path = output / "motion-validation.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    if args.render == "stills":
        for frame in (1, 61, 120, 150, 165, 205):
            bpy.context.scene.frame_set(frame)
            bpy.context.scene.render.filepath = str(output / "stills" / f"frame_{frame:04d}.png")
            bpy.ops.render.render(write_still=True)
    elif args.render == "video":
        bpy.context.scene.render.image_settings.color_mode = "RGB"
        bpy.context.scene.render.image_settings.file_format = "PNG"
        bpy.context.scene.render.filepath = str(output / "frames" / "frame_")
        bpy.ops.render.render(animation=True)

    print(f"VALIDATION_BLEND={blend_path}")
    print(f"MOTION_PLAN_ACTORS={len(plan['actors'])}")
    print(f"MOTION_PLAN_EVENTS={len(plan['events'])}")


if __name__ == "__main__":
    main()
