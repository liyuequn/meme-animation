"""Inspect a Blender-readable character asset and print rig/action metadata as JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("asset")
    parser.add_argument("--output")
    return parser.parse_args(raw)


def import_asset(path: Path) -> None:
    extension = path.suffix.lower()
    if extension == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif extension in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=False)
    elif extension == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
    else:
        raise ValueError(f"unsupported asset type: {extension}")


def main() -> None:
    args = parse_args()
    path = Path(args.asset).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_asset(path)
    payload = {
        "asset": path.as_posix(),
        "objects": [
            {"name": obj.name, "type": obj.type, "parent": obj.parent.name if obj.parent else None}
            for obj in sorted(bpy.data.objects, key=lambda item: item.name.casefold())
        ],
        "armatures": [
            {
                "name": obj.name,
                "bones": [
                    {"name": bone.name, "parent": bone.parent.name if bone.parent else None}
                    for bone in obj.data.bones
                ],
            }
            for obj in bpy.data.objects
            if obj.type == "ARMATURE"
        ],
        "actions": [
            {
                "name": action.name,
                "frameStart": round(action.frame_range[0], 3),
                "frameEnd": round(action.frame_range[1], 3),
            }
            for action in sorted(bpy.data.actions, key=lambda item: item.name.casefold())
        ],
    }
    encoded = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(encoded, encoding="utf-8")
    else:
        print(encoded)


if __name__ == "__main__":
    main()
