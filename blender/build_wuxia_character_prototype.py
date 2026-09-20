"""Build a stylized Chinese wuxia character prototype in the active Blender scene.

This file is intentionally executable through Blender MCP's execute_blender_code:
the MCP client reads it and sends the source into the connected Blender process.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


OUTPUT_BLEND = Path("/Users/apple/Documents/ChatGPT/meme-animation/exports/wuxia-character-mcp/wuxia-character-prototype.blend")
OUTPUT_RENDER = Path("/Users/apple/Documents/ChatGPT/meme-animation/docs/wuxia-character-mcp-prototype.png")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data in (bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for item in list(data):
            if item.users == 0:
                data.remove(item)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def material(name, color, roughness=0.65, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


def finish(obj, name, mat, smooth=True):
    obj.name = name
    obj.data.materials.append(mat)
    if smooth and obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def uv(name, loc, scale, mat, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat)


def cube(name, loc, scale, mat, bevel=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel_mod = obj.modifiers.new("soft tailoring", "BEVEL")
    bevel_mod.width = bevel
    bevel_mod.segments = 3
    return finish(obj, name, mat, smooth=False)


def cylinder_between(name, start, end, radius, mat, vertices=32):
    start_v, end_v = Vector(start), Vector(end)
    delta = end_v - start_v
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(start_v + end_v) / 2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return finish(obj, name, mat)


def curve_lock(name, points, bevel, mat):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = bevel
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coord in zip(spline.bezier_points, points):
        point.co = coord
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    return obj


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_standard_rig():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    rig = bpy.context.object
    rig.name = "WuxiaStandardRig"
    armature = rig.data
    armature.name = "WuxiaStandardRig"
    armature.edit_bones.remove(armature.edit_bones[0])

    definitions = {
        "root": ((0, 0, 0.05), (0, 0, 0.30), None),
        "pelvis": ((0, 0, 0.95), (0, 0, 1.28), "root"),
        "spine_01": ((0, 0, 1.28), (0, 0, 1.82), "pelvis"),
        "spine_02": ((0, 0, 1.82), (0, 0, 2.35), "spine_01"),
        "spine_03": ((0, 0, 2.35), (0, 0, 2.82), "spine_02"),
        "neck_01": ((0, 0, 2.82), (0, 0, 3.05), "spine_03"),
        "Head": ((0, 0, 3.05), (0, 0, 3.72), "neck_01"),
        "clavicle_l": ((0, 0, 2.67), (-0.48, 0, 2.64), "spine_03"),
        "upperarm_l": ((-0.48, 0, 2.64), (-0.98, -0.03, 2.10), "clavicle_l"),
        "lowerarm_l": ((-0.98, -0.03, 2.10), (-1.22, -0.12, 1.62), "upperarm_l"),
        "hand_l": ((-1.22, -0.12, 1.62), (-1.35, -0.14, 1.42), "lowerarm_l"),
        "clavicle_r": ((0, 0, 2.67), (0.48, 0, 2.64), "spine_03"),
        "upperarm_r": ((0.48, 0, 2.64), (0.98, -0.03, 2.10), "clavicle_r"),
        "lowerarm_r": ((0.98, -0.03, 2.10), (1.22, -0.12, 1.62), "upperarm_r"),
        "hand_r": ((1.22, -0.12, 1.62), (1.35, -0.14, 1.42), "lowerarm_r"),
        "thigh_l": ((-0.25, 0, 1.02), (-0.30, 0, 0.58), "pelvis"),
        "calf_l": ((-0.30, 0, 0.58), (-0.32, 0, 0.16), "thigh_l"),
        "foot_l": ((-0.32, 0, 0.16), (-0.32, -0.42, 0.10), "calf_l"),
        "thigh_r": ((0.25, 0, 1.02), (0.30, 0, 0.58), "pelvis"),
        "calf_r": ((0.30, 0, 0.58), (0.32, 0, 0.16), "thigh_r"),
        "foot_r": ((0.32, 0, 0.16), (0.32, -0.42, 0.10), "calf_r"),
    }
    bones = {}
    for name, (head, tail, parent) in definitions.items():
        bone = armature.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = bones[parent]
        bones[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig.display_type = "WIRE"
    return rig


def bone_parent(rig, object_names, bone_name):
    for name in object_names:
        obj = bpy.data.objects.get(name)
        if not obj:
            continue
        world = obj.matrix_world.copy()
        obj.parent = rig
        obj.parent_type = "BONE"
        obj.parent_bone = bone_name
        obj.matrix_world = world


clear_scene()

skin = material("skin warm", (0.72, 0.48, 0.34), 0.74)
ink = material("hair ink", (0.012, 0.016, 0.026), 0.35)
robe = material("robe midnight", (0.025, 0.075, 0.12), 0.62)
robe_light = material("robe lapel", (0.19, 0.34, 0.40), 0.58)
lining = material("robe lining", (0.38, 0.055, 0.045), 0.58)
gold = material("aged brass", (0.42, 0.24, 0.07), 0.28, 0.78)
steel = material("blade steel", (0.42, 0.48, 0.53), 0.2, 0.92)
white = material("eye white", (0.8, 0.78, 0.72), 0.5)

actor = bpy.data.collections.new("WuxiaActorPrototype")
bpy.context.scene.collection.children.link(actor)

created = []
created += [
    uv("Head", (0, 0, 3.36), (0.39, 0.34, 0.48), skin),
    uv("Nose", (0, -0.34, 3.34), (0.055, 0.06, 0.09), skin, 24, 12),
    uv("HairCap", (0, 0.035, 3.52), (0.415, 0.37, 0.40), ink),
    uv("TopKnot", (0, 0.05, 4.02), (0.20, 0.18, 0.24), ink),
    uv("HairCrown", (0, 0.04, 3.88), (0.26, 0.22, 0.18), ink),
]

for side in (-1, 1):
    created.append(uv(f"Eye.{side}", (0.145 * side, -0.326, 3.43), (0.092, 0.019, 0.035), white, 24, 12))
    created.append(uv(f"Pupil.{side}", (0.145 * side, -0.348, 3.43), (0.026, 0.013, 0.026), ink, 20, 10))
    created.append(cylinder_between(f"Brow.{side}", (0.07 * side, -0.365, 3.55), (0.22 * side, -0.35, 3.57), 0.012, ink, 16))
    curve_lock(
        f"TempleLock.{side}",
        [(0.27 * side, -0.02, 3.72), (0.35 * side, -0.09, 3.35), (0.30 * side, -0.02, 2.88)],
        0.055,
        ink,
    )

# Neck and layered torso.
created.append(cylinder_between("Neck", (0, 0, 2.84), (0, 0, 3.05), 0.17, skin))
bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.76, radius2=0.54, depth=1.15, location=(0, 0, 2.35))
created.append(finish(bpy.context.object, "UpperRobe", robe))
bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=1.05, radius2=0.65, depth=1.65, location=(0, 0.08, 1.02))
created.append(finish(bpy.context.object, "LowerRobe", robe))

# Crossed lapels and belt provide an unmistakable hanfu silhouette.
created.append(cube("Lapel.L", (-0.18, -0.57, 2.48), (0.105, 0.055, 0.68), robe_light, 0.045, (0, math.radians(-18), 0)))
created.append(cube("Lapel.R", (0.18, -0.585, 2.48), (0.105, 0.055, 0.68), lining, 0.045, (0, math.radians(18), 0)))
created.append(cylinder_between("Mouth", (-0.105, -0.354, 3.19), (0.105, -0.354, 3.19), 0.014, lining, 16))
created.append(cube("Belt", (0, -0.02, 1.72), (0.72, 0.54, 0.11), lining, 0.05))
created.append(cube("BeltTrim", (0, -0.575, 1.72), (0.48, 0.035, 0.055), gold, 0.025))
created.append(uv("BeltClasp", (0, -0.625, 1.72), (0.14, 0.045, 0.12), gold, 24, 12))

# Wide sleeves around visible arms, hands exposed.
for side in (-1, 1):
    shoulder = (0.52 * side, 0, 2.64)
    elbow = (0.98 * side, -0.03, 2.10)
    wrist = (1.22 * side, -0.12, 1.62)
    created.append(cylinder_between(f"UpperSleeve.{side}", shoulder, elbow, 0.31, robe))
    created.append(cylinder_between(f"LowerSleeve.{side}", elbow, wrist, 0.38, robe))
    created.append(cylinder_between(f"LiningCuff.{side}", (1.15 * side, -0.10, 1.74), wrist, 0.405, lining))
    created.append(uv(f"Hand.{side}", (1.28 * side, -0.14, 1.52), (0.14, 0.10, 0.19), skin, 28, 14))

# Shoes and lower robe slit.
created.append(cube("FrontPanel", (0, -0.60, 0.93), (0.36, 0.055, 0.72), robe_light, 0.055))
created.append(cube("Shoe.L", (-0.32, -0.10, 0.12), (0.24, 0.42, 0.12), ink, 0.09))
created.append(cube("Shoe.R", (0.32, -0.10, 0.12), (0.24, 0.42, 0.12), ink, 0.09))

# Jian scabbard at the waist and blade in the right hand.
created.append(cylinder_between("Scabbard", (0.62, 0.02, 1.67), (1.34, 0.07, 0.36), 0.075, ink, 24))
created.append(cylinder_between("ScabbardGold", (0.63, 0.02, 1.68), (0.76, 0.03, 1.45), 0.088, gold, 24))
created.append(cylinder_between("JianBlade", (1.36, -0.14, 1.40), (1.82, -0.17, 0.15), 0.035, steel, 12))
created.append(cylinder_between("JianGrip", (1.25, -0.13, 1.68), (1.38, -0.14, 1.38), 0.06, ink, 20))
created.append(cube("JianGuard", (1.36, -0.14, 1.42), (0.20, 0.055, 0.045), gold, 0.025, (0, 0, math.radians(20))))

# Hair ribbon and back locks.
created.append(cube("Hairpin", (0, 0.04, 3.94), (0.46, 0.035, 0.035), gold, 0.025))
for side in (-1, 1):
    curve_lock(
        f"BackHair.{side}",
        [(0.14 * side, 0.21, 3.76), (0.24 * side, 0.34, 3.03), (0.16 * side, 0.33, 2.35)],
        0.12,
        ink,
    )

rig = build_standard_rig()
bone_parent(rig, ["LowerRobe", "FrontPanel", "Belt", "BeltTrim", "BeltClasp", "Scabbard", "ScabbardGold"], "pelvis")
bone_parent(rig, ["UpperRobe", "Lapel.L", "Lapel.R"], "spine_02")
bone_parent(rig, ["Neck"], "neck_01")
bone_parent(
    rig,
    ["Head", "Nose", "HairCap", "TopKnot", "HairCrown", "Eye.-1", "Eye.1", "Pupil.-1", "Pupil.1", "Brow.-1", "Brow.1", "Mouth", "Hairpin", "TempleLock.-1", "TempleLock.1", "BackHair.-1", "BackHair.1"],
    "Head",
)
for side, suffix in [(-1, "l"), (1, "r")]:
    bone_parent(rig, [f"UpperSleeve.{side}"], f"upperarm_{suffix}")
    bone_parent(rig, [f"LowerSleeve.{side}", f"LiningCuff.{side}"], f"lowerarm_{suffix}")
    bone_parent(rig, [f"Hand.{side}"], f"hand_{suffix}")
bone_parent(rig, ["Shoe.L"], "foot_l")
bone_parent(rig, ["Shoe.R"], "foot_r")
bone_parent(rig, ["JianBlade", "JianGrip", "JianGuard"], "hand_r")

# Floor, backdrop, lights, and portrait camera.
floor_mat = material("floor", (0.018, 0.024, 0.031), 0.82)
bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0, -0.01))
finish(bpy.context.object, "Floor", floor_mat, smooth=False)

world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.008, 0.012, 0.02, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28

for loc, energy, color, size in [
    ((-3.8, -4.5, 6.5), 1100, (1.0, 0.72, 0.52), 4.0),
    ((3.2, 1.0, 5.0), 900, (0.18, 0.42, 1.0), 3.5),
    ((0, 3.5, 3.0), 600, (0.7, 0.16, 0.08), 3.0),
]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    look_at(light, (0, 0, 2.0))

bpy.ops.object.camera_add(location=(5.0, -9.2, 3.7))
camera = bpy.context.object
camera.data.lens = 62
look_at(camera, (0, 0, 2.0))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 720
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.filepath = str(OUTPUT_RENDER)

OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_RENDER.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
bpy.ops.render.render(write_still=True)
print({"objects": len(bpy.data.objects), "blend": str(OUTPUT_BLEND), "render": str(OUTPUT_RENDER)})
