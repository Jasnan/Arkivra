#!/usr/bin/env bash
set -euo pipefail
sdk_directory="${ARKIVRA_GLM_SDK_DIRECTORY:-$HOME/glm-ocr-arkivra}"
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
layout_device="${ARKIVRA_GLM_LAYOUT_DEVICE:-mps}"
case "$layout_device" in
  cpu|mps) ;;
  *) echo 'ARKIVRA_GLM_LAYOUT_DEVICE must be cpu or mps' >&2; exit 1 ;;
esac
cd "$sdk_directory"
# Keep unsupported operations visible; do not silently enable CPU fallback.
exec .venv/bin/python "$script_directory/service.py" --config "arkivra-ollama-$layout_device.yaml"
