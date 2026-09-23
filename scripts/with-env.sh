#!/usr/bin/env bash
# Runs a command with the variables from .env exported. Prints nothing itself.
# Usage: scripts/with-env.sh elevenlabs agents list
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
source .env
set +a
exec "$@"
