#!/usr/bin/env bash
# Renders the design document to PDF via headless Chrome.
#
# The print stylesheet lives in docs/architecture-overview.print.html: it forces
# the light palette (paper is white), drops the on-screen nav rail, starts each
# numbered answer on a fresh page, and keeps tables, transcripts and diagrams
# off page seams.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC="$(cd "$(dirname "$0")/.." && pwd)/docs/architecture-overview.print.html"
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/Helix-Platform-Architecture.pdf"

[ -x "$CHROME" ] || { echo "Chrome not found. Set CHROME=/path/to/chrome"; exit 1; }

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --run-all-compositor-stages-before-draw --virtual-time-budget=12000 \
  --print-to-pdf="$OUT" "file://$SRC"

echo "Wrote $OUT"
