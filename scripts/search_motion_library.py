#!/usr/bin/env python3
"""Search the generated motion catalog with English or Chinese intent words."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


INTENT_ALIASES = {
    "走": ("walk", "locomotion"),
    "跑": ("run", "sprint", "locomotion"),
    "冲": ("run", "sprint", "attack"),
    "跳": ("jump", "traversal"),
    "翻滚": ("roll", "dodge", "traversal"),
    "闪避": ("dodge", "roll", "reaction"),
    "攻击": ("attack", "combat"),
    "砍": ("slash", "sword", "attack"),
    "剑": ("sword", "combat"),
    "格挡": ("block", "combat"),
    "受击": ("hit", "damage", "stumble", "reaction"),
    "死亡": ("death", "reaction"),
    "待机": ("idle",),
    "环顾": ("look", "idle"),
    "说话": ("talk", "gesture"),
    "挥手": ("wave", "gesture"),
    "攀爬": ("climb", "traversal"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="English or Chinese motion intent")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument(
        "--catalog",
        default=str(Path(__file__).resolve().parents[1] / "blender/motion-library.catalog.json"),
    )
    return parser.parse_args()


def query_terms(query: str) -> set[str]:
    lowered = query.lower()
    terms = set(re.findall(r"[a-z0-9]+", lowered))
    for alias, expansions in INTENT_ALIASES.items():
        if alias in query:
            terms.update(expansions)
    return terms


def main() -> None:
    args = parse_args()
    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    terms = query_terms(args.query)
    candidates: dict[str, dict] = {}
    prefers_root_motion = bool(
        terms & {"climb", "dodge", "jump", "locomotion", "roll", "run", "sprint", "traversal", "walk"}
    )

    for source in catalog["sources"]:
        for action in source["actions"]:
            searchable = set(action["normalizedName"].split()) | set(action["tags"])
            score = sum(3 if term in action["normalizedName"] else 1 for term in terms if term in searchable)
            if not score:
                continue
            key = action["normalizedName"]
            current = candidates.get(key)
            item = {**action, "source": source["id"], "rootMotion": source["rootMotion"], "score": score}
            preferred_variant = item["rootMotion"] is prefers_root_motion
            current_preferred = current is not None and current["rootMotion"] is prefers_root_motion
            if current is None or (preferred_variant and not current_preferred):
                candidates[key] = item

    results = sorted(candidates.values(), key=lambda item: (-item["score"], item["name"].casefold()))
    if not results:
        print(f"No motion found for: {args.query}")
        raise SystemExit(1)

    for item in results[: args.limit]:
        motion_kind = "root-motion" if item["rootMotion"] else "in-place"
        print(
            f"{item['name']:<38} {item['durationSeconds']:>6.2f}s  "
            f"{motion_kind:<11} {item['source']}  {','.join(item['tags'])}"
        )


if __name__ == "__main__":
    main()
