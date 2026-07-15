#!/usr/bin/env bash
# Run harness_ort.py with pip-bundled CUDA 13 libs on PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV="${ROOT}/.tmp/venv-ort-gpu"
PY="${VENV}/bin/python"
export LD_LIBRARY_PATH="$(find "${VENV}/lib"/*/site-packages/nvidia -type d -name lib 2>/dev/null | paste -sd: -)${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$PY" "${ROOT}/scripts/models-experiments/bench/harness_ort.py" "$@"
