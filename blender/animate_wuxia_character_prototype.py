"""Retarget a UAL sword combo onto the MCP-built wuxia standard rig."""

from pathlib import Path
import json
import math

import bpy


SOURCE = Path("/Users/apple/Documents/ChatGPT/meme-animation/assets/third_party/quaternius-ual/UAL2_Standard.glb")
OUTPUT = Path("/Users/apple/Documents/ChatGPT/meme-animation/exports/wuxia-character-mcp/wuxia-character-animated.blend")
REPORT = Path("/Users/apple/Documents/ChatGPT/meme-animation/exports/wuxia-character-mcp/animation-report.json")
ACTION_NAME = "Sword_Regular_Combo"
BONES = [
    "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r",
]


target = bpy.data.objects.get("WuxiaStandardRig")
if target is None or target.type != "ARMATURE":
    raise RuntimeError("WuxiaStandardRig is missing; run the build script first")

before_objects = set(bpy.data.objects)
before_actions = set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=str(SOURCE), import_pack_images=False)
source_objects = [obj for obj in bpy.data.objects if obj not in before_objects]
source_actions = [action for action in bpy.data.actions if action not in before_actions]
source = next(obj for obj in source_objects if obj.type == "ARMATURE")
source_action = next(action for action in source_actions if action.name.rsplit("|", 1)[-1].split(".", 1)[0] == ACTION_NAME)
source.animation_data_create().action = source_action

target.animation_data_clear()
target.animation_data_create()
target_action = bpy.data.actions.new(f"MCP_Retargeted_{ACTION_NAME}")
target.animation_data.action = target_action

start = math.floor(source_action.frame_range[0])
end = math.ceil(source_action.frame_range[1])
scene = bpy.context.scene
scene.frame_start = start
scene.frame_end = end
scene.render.fps = 30

for frame in range(start, end + 1):
    scene.frame_set(frame)
    for name in BONES:
        source_bone = source.pose.bones[name]
        target_bone = target.pose.bones[name]
        source_rest = source_bone.bone.matrix_local.to_quaternion()
        target_rest = target_bone.bone.matrix_local.to_quaternion()
        source_basis = source_bone.matrix_basis.to_quaternion()
        armature_delta = source_rest @ source_basis @ source_rest.inverted()
        target_bone.rotation_mode = "QUATERNION"
        target_bone.rotation_quaternion = (target_rest.inverted() @ armature_delta @ target_rest).normalized()
        target_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)

for obj in source_objects:
    bpy.data.objects.remove(obj, do_unlink=True)

scene.render.resolution_x = 540
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = "/Users/apple/Documents/ChatGPT/meme-animation/exports/wuxia-character-mcp/frames/frame_"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
scene.render.filepath = "/Users/apple/Documents/ChatGPT/meme-animation/exports/wuxia-character-mcp/wuxia-character-sword-combo.mp4"

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
report = {
    "source": SOURCE.as_posix(),
    "sourceAction": ACTION_NAME,
    "targetRig": target.name,
    "mappedBones": len(BONES),
    "frameStart": start,
    "frameEnd": end,
    "frameCount": end - start + 1,
    "fps": scene.render.fps,
    "output": OUTPUT.as_posix(),
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(report)
