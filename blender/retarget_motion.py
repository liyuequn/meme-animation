"""Retarget one humanoid action between differently named Blender armatures.

The rig map is external so a production character can be swapped without changing
the AI Director or motion catalog. Rotations are transferred through each bone's
rest-space orientation, rather than copying Euler channels by name.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--rig-map", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report")
    parser.add_argument("--render-dir")
    return parser.parse_args(raw)


def import_asset(path: Path) -> tuple[list[bpy.types.Object], list[bpy.types.Action]]:
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    if path.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif path.suffix.lower() in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=False)
    else:
        raise ValueError(f"unsupported asset type: {path.suffix}")
    return (
        [obj for obj in bpy.data.objects if obj not in before_objects],
        [action for action in bpy.data.actions if action not in before_actions],
    )


def only_armature(objects: list[bpy.types.Object], label: str) -> bpy.types.Object:
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one {label} armature, found {[obj.name for obj in armatures]}")
    return armatures[0]


def find_action(actions: list[bpy.types.Action], requested: str) -> bpy.types.Action:
    matches = [
        action
        for action in actions
        if action.name == requested or action.name.rsplit("|", 1)[-1] == requested
    ]
    if len(matches) != 1:
        raise RuntimeError(f"action {requested!r} not found; available={[a.name for a in actions]}")
    return matches[0]


def validate_map(source: bpy.types.Object, target: bpy.types.Object, rotation_map: dict[str, str]) -> None:
    missing_source = sorted(name for name in rotation_map if name not in source.pose.bones)
    missing_target = sorted(name for name in rotation_map.values() if name not in target.pose.bones)
    if missing_source or missing_target:
        raise RuntimeError(f"invalid rig map: missing source={missing_source}, target={missing_target}")


def rotation_in_target_basis(source_bone: bpy.types.PoseBone, target_bone: bpy.types.PoseBone):
    source_rest = source_bone.bone.matrix_local.to_quaternion()
    target_rest = target_bone.bone.matrix_local.to_quaternion()
    source_basis = source_bone.matrix_basis.to_quaternion()
    armature_delta = source_rest @ source_basis @ source_rest.inverted()
    return (target_rest.inverted() @ armature_delta @ target_rest).normalized()


def retarget(
    source: bpy.types.Object,
    target: bpy.types.Object,
    source_action: bpy.types.Action,
    rig_map: dict,
) -> tuple[bpy.types.Action, dict]:
    rotation_map: dict[str, str] = rig_map["rotationMap"]
    translation_map: dict[str, str] = rig_map.get("translationMap", {})
    validate_map(source, target, rotation_map)

    source.animation_data_create().action = source_action
    if target.animation_data:
        target.animation_data_clear()
    target.animation_data_create()
    target_action = bpy.data.actions.new(f"Retargeted_{source_action.name.rsplit('|', 1)[-1]}")
    target.animation_data.action = target_action

    frame_start = math.floor(source_action.frame_range[0])
    frame_end = math.ceil(source_action.frame_range[1])
    scene = bpy.context.scene
    scene.frame_start = frame_start
    scene.frame_end = frame_end
    scene.render.fps = 30

    source_height = max((bone.head_local.z for bone in source.data.bones), default=1.0)
    target_height = max((bone.head_local.z for bone in target.data.bones), default=1.0)
    translation_scale = target_height / max(source_height, 1e-6)

    for frame in range(frame_start, frame_end + 1):
        scene.frame_set(frame)
        for source_name, target_name in rotation_map.items():
            source_bone = source.pose.bones[source_name]
            target_bone = target.pose.bones[target_name]
            target_bone.rotation_mode = "QUATERNION"
            target_bone.rotation_quaternion = rotation_in_target_basis(source_bone, target_bone)
            target_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=target_name)

        for source_name, target_name in translation_map.items():
            source_bone = source.pose.bones[source_name]
            target_bone = target.pose.bones[target_name]
            target_bone.location = source_bone.matrix_basis.translation * translation_scale
            target_bone.keyframe_insert(data_path="location", frame=frame, group=target_name)

    report = {
        "schemaVersion": 1,
        "sourceAction": source_action.name.rsplit("|", 1)[-1],
        "targetAction": target_action.name,
        "frameStart": frame_start,
        "frameEnd": frame_end,
        "frameCount": frame_end - frame_start + 1,
        "mappedBoneCount": len(rotation_map),
        "translationScale": round(translation_scale, 6),
    }
    return target_action, report


def look_at(obj: bpy.types.Object, point: Vector) -> None:
    obj.rotation_euler = (point - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_preview_stage(target: bpy.types.Object) -> bpy.types.Object:
    root = bpy.data.objects.new("retarget_preview_root", None)
    bpy.context.scene.collection.objects.link(root)
    target.parent = root
    root.scale = (0.34, 0.34, 0.34)

    bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, 0))
    floor = bpy.context.object
    material = bpy.data.materials.new("preview_floor")
    material.diffuse_color = (0.04, 0.05, 0.07, 1.0)
    floor.data.materials.append(material)

    bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.5, 7.0))
    bpy.context.object.data.energy = 1200
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5.0
    look_at(bpy.context.object, Vector((0, 0, 1.5)))
    bpy.ops.object.light_add(type="AREA", location=(3.0, 2.0, 4.5))
    bpy.context.object.data.energy = 700
    bpy.context.object.data.color = (0.2, 0.4, 1.0)
    bpy.context.object.data.size = 4.0
    look_at(bpy.context.object, Vector((0, 0, 1.5)))

    bpy.ops.object.camera_add(location=(0, -13, 3.3))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.0
    look_at(camera, Vector((0, 0, 1.35)))
    bpy.context.scene.camera = camera
    return root


def world_bounds(objects: list[bpy.types.Object]) -> dict:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        if obj.type == "MESH" and not obj.hide_render
        for corner in obj.bound_box
    ]
    if not points:
        return {"min": None, "max": None}
    return {
        "min": [round(min(point[index] for point in points), 4) for index in range(3)],
        "max": [round(max(point[index] for point in points), 4) for index in range(3)],
    }


def render_samples(render_dir: Path, frame_start: int, frame_end: int) -> list[str]:
    render_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("preview_world")
    scene.world.color = (0.01, 0.015, 0.025)
    frames = sorted({round(frame_start + (frame_end - frame_start) * index / 4) for index in range(5)})
    outputs = []
    for frame in frames:
        scene.frame_set(frame)
        output = render_dir / f"frame_{frame:04d}.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        outputs.append(output.as_posix())
    return outputs


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source_objects, source_actions = import_asset(Path(args.source).resolve())
    source = only_armature(source_objects, "source")
    source_action = find_action(source_actions, args.action)
    target_objects, _ = import_asset(Path(args.target).resolve())
    target = only_armature(target_objects, "target")
    rig_map = json.loads(Path(args.rig_map).read_text(encoding="utf-8"))
    _, report = retarget(source, target, source_action, rig_map)

    for obj in source_objects:
        obj.hide_viewport = True
        obj.hide_render = True
    preview_root = add_preview_stage(target)
    report["previewScale"] = preview_root.scale.x
    bpy.context.scene.frame_set(report["frameStart"])
    report["targetBoundsAtStart"] = world_bounds(target_objects)
    if args.render_dir:
        report["renders"] = render_samples(Path(args.render_dir), report["frameStart"], report["frameEnd"])

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report["output"] = output.as_posix()
    if args.report:
        report_path = Path(args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
