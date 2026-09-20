#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
blender_bin="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
cd "$repo_root"

"$blender_bin" --background --python "$repo_root/blender/catalog_motion_library.py" -- \
  --source "ual1=$repo_root/assets/third_party/quaternius-ual/UAL1_Standard.glb" \
  --source "ual1-rm=$repo_root/assets/third_party/quaternius-ual/UAL1_Standard_RM.glb" \
  --source "ual2=$repo_root/assets/third_party/quaternius-ual/UAL2_Standard.glb" \
  --source "ual2-rm=$repo_root/assets/third_party/quaternius-ual/UAL2_Standard_RM.glb" \
  --output "$repo_root/blender/motion-library.catalog.json"

python3 "$repo_root/scripts/validate_motion_bindings.py"
