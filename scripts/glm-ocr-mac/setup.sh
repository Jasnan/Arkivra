#!/usr/bin/env bash
set -euo pipefail
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sdk_directory="${ARKIVRA_GLM_SDK_DIRECTORY:-$HOME/glm-ocr-arkivra}"
source_directory="${ARKIVRA_GLM_SOURCE_DIRECTORY:-$HOME/glm-ocr}"
sdk_revision=cef4d0ea120d1741f5cefe8985eee45f6c8eff1d
if [[ ! -d "$sdk_directory" ]]; then
  git clone --no-hardlinks "$source_directory" "$sdk_directory"
  git -C "$sdk_directory" checkout -b experiment/arkivra-mps-ollama "$sdk_revision"
fi
if ! git -C "$sdk_directory" merge-base --is-ancestor "$sdk_revision" HEAD; then
  echo 'SDK revision differs from the tested patch; use a fresh checkout.' >&2
  exit 1
fi
cp "$script_directory/test_mps.py" "$sdk_directory/glmocr/tests/test_arkivra_mps.py"
if ! git -C "$sdk_directory" apply --reverse --check "$script_directory/sdk-mps.patch" 2>/dev/null; then
  git -C "$sdk_directory" apply --check "$script_directory/sdk-mps.patch"
  git -C "$sdk_directory" apply "$script_directory/sdk-mps.patch"
fi
if [[ ! -d "$sdk_directory/.venv" ]]; then
  uv venv --python 3.12 "$sdk_directory/.venv"
fi
uv pip install --python "$sdk_directory/.venv/bin/python" -r "$script_directory/requirements.lock"
uv pip install --python "$sdk_directory/.venv/bin/python" --no-deps -e "$sdk_directory"
"$sdk_directory/.venv/bin/python" "$script_directory/repair_model.py"
"$sdk_directory/.venv/bin/python" "$script_directory/configure.py" "$sdk_directory"
