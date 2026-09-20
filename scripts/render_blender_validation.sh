#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
blender_bin="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
render_mode="${1:-stills}"

if [[ ! -x "$blender_bin" ]]; then
  echo "Blender executable not found: $blender_bin" >&2
  exit 1
fi

"$blender_bin" --background \
  --python "$repo_root/blender/build_motion_validation.py" -- \
  --plan "blender/motion-plan.validation.json" \
  --output "exports/blender-validation" \
  --render "$render_mode"

if [[ "$render_mode" == "video" ]]; then
  ffmpeg -y -loglevel error \
    -framerate 24 \
    -start_number 1 \
    -i "$repo_root/exports/blender-validation/frames/frame_%04d.png" \
    -c:v libx264 \
    -preset medium \
    -crf 20 \
    -pix_fmt yuv420p \
    -movflags +faststart \
    "$repo_root/exports/blender-validation/motion-validation.mp4"
fi
