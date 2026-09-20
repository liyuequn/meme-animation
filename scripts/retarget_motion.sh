#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
blender_bin="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
action="${1:-Sword_Regular_Combo}"
output_dir="${2:-$repo_root/exports/retarget-validation}"

mkdir -p "$output_dir"
"$blender_bin" --background --python "$repo_root/blender/retarget_motion.py" -- \
  --source "$repo_root/assets/third_party/quaternius-ual/UAL2_Standard.glb" \
  --target "$repo_root/assets/third_party/quaternius-knight/KnightCharacter.fbx" \
  --rig-map "$repo_root/blender/rig-map.ual-to-quaternius-knight.json" \
  --action "$action" \
  --output "$output_dir/retargeted-${action}.blend" \
  --report "$output_dir/retargeted-${action}.json" \
  --render-dir "$output_dir/stills-${action}"
