#!/usr/bin/env bash
# VX-504: generate committed clients with the pinned JS SDK (guide §10.5).
set -euo pipefail
cd "$(dirname "$0")/.."
exec pnpm exec tsx scripts/bindings.ts "$@"
