"""Build a deterministic, searchable catalog from animation GLB files.

Run with Blender because animation metadata is read through Blender's importer:

  blender --background --python blender/catalog_motion_library.py -- \
    --source ual1=assets/third_party/quaternius-ual/UAL1_Standard.glb \
    --source ual1-rm=assets/third_party/quaternius-ual/UAL1_Standard_RM.glb \
    --output blender/motion-library.catalog.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

import bpy


TAG_RULES = {
    "idle": ("idle", "breathing", "look", "stand"),
    "locomotion": ("walk", "run", "sprint", "strafe", "jog", "turn"),
    "combat": (
        "attack",
        "block",
        "combat",
        "punch",
        "kick",
        "slash",
        "sword",
        "bow",
        "staff",
        "rifle",
    ),
    "reaction": ("death", "damage", "dodge", "hit", "impact", "stumble"),
    "traversal": ("climb", "crawl", "fall", "jump", "parkour", "roll", "vault"),
    "interaction": ("carry", "farm", "grab", "lift", "pick", "push", "pull", "throw"),
    "gesture": ("cheer", "clap", "dance", "point", "talk", "wave"),
}


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", action="append", required=True, metavar="ID=PATH")
    parser.add_argument("--output", required=True)
    parser.add_argument("--fps", type=int, default=30)
    return parser.parse_args(raw)


def split_source(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise ValueError(f"source must be ID=PATH, got {value!r}")
    source_id, raw_path = value.split("=", 1)
    path = Path(raw_path).resolve()
    if not source_id or not path.is_file():
        raise ValueError(f"invalid source {value!r}")
    return source_id, path


def normalize_name(name: str) -> str:
    value = name.rsplit("|", 1)[-1]
    value = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", value)
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def classify(name: str) -> list[str]:
    normalized = normalize_name(name)
    tags = [tag for tag, words in TAG_RULES.items() if any(word in normalized for word in words)]
    return tags or ["other"]


def catalog_source(source_id: str, path: Path, fps: int, repo_root: Path) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=False)

    armatures = sorted(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    if not armatures:
        raise RuntimeError(f"no armature found in {path}")

    actions = []
    for action in sorted(bpy.data.actions, key=lambda item: item.name.casefold()):
        frame_start, frame_end = (round(value, 3) for value in action.frame_range)
        duration_frames = max(0.0, frame_end - frame_start)
        actions.append(
            {
                "id": f"{source_id}:{normalize_name(action.name).replace(' ', '-')}",
                "name": action.name.rsplit("|", 1)[-1],
                "normalizedName": normalize_name(action.name),
                "tags": classify(action.name),
                "frameStart": frame_start,
                "frameEnd": frame_end,
                "durationFrames": round(duration_frames, 3),
                "durationSeconds": round(duration_frames / fps, 3),
            }
        )

    rig = armatures[0]
    return {
        "id": source_id,
        "file": path.relative_to(repo_root).as_posix(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "rootMotion": path.stem.lower().endswith("_rm"),
        "armature": rig.name,
        "bones": [bone.name for bone in rig.data.bones],
        "actionCount": len(actions),
        "actions": actions,
    }


def main() -> None:
    args = parse_args()
    repo_root = Path.cwd().resolve()
    sources = [catalog_source(*split_source(value), args.fps, repo_root) for value in args.source]
    payload = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "fps": args.fps,
        "library": "Quaternius Universal Animation Library Standard",
        "license": "CC0-1.0",
        "sourceUrls": [
            "https://quaternius.itch.io/universal-animation-library",
            "https://quaternius.itch.io/universal-animation-library-2",
        ],
        "sourceCount": len(sources),
        "uniqueActionCount": len(
            {action["normalizedName"] for source in sources for action in source["actions"]}
        ),
        "sources": sources,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Cataloged {payload['uniqueActionCount']} unique actions "
        f"from {payload['sourceCount']} files -> {output}"
    )


if __name__ == "__main__":
    main()
