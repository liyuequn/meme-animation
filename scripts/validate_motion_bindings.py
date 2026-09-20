#!/usr/bin/env python3
"""Validate semantic motion bindings against the generated catalog."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "blender/motion-library.catalog.json"
BINDINGS = ROOT / "blender/motion-bindings.json"
REQUIRED_BEATS = {"enter", "scan", "speak", "draw", "dodge", "clash", "recoil", "recover"}


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    bindings = json.loads(BINDINGS.read_text(encoding="utf-8"))["bindings"]
    clip_ids = {
        action["id"]
        for source in catalog["sources"]
        for action in source["actions"]
    }

    missing_beats = REQUIRED_BEATS - set(bindings)
    unknown_clips = sorted(
        candidate["clipId"]
        for binding in bindings.values()
        for candidate in binding["candidates"]
        if candidate["clipId"] not in clip_ids
    )
    assert not missing_beats, f"missing bindings: {sorted(missing_beats)}"
    assert not unknown_clips, f"unknown clip ids: {unknown_clips}"

    gaps = [name for name, binding in bindings.items() if binding["coverage"] == "missing"]
    print(
        f"Motion bindings valid: {len(bindings)} beats, "
        f"{catalog['uniqueActionCount']} unique clips, gaps={','.join(gaps) or 'none'}"
    )


if __name__ == "__main__":
    main()
