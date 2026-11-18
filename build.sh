#!/bin/sh
# Rebuild extension/ from the newest Claude extension installed from the Chrome Web Store in any
# Dia profile, plus dia-shim.js. Then load (or reload) extension/ unpacked in Dia.
set -e
cd "$(dirname "$0")"
ID=fcoeoabgfenejglbffodgkkbkcdhcgfn
SRC=$(for d in "$HOME/Library/Application Support/Dia/User Data"/*/Extensions/$ID/*/; do
  [ -f "$d/manifest.json" ] && printf '%s\t%s\n' "$(basename "$d")" "${d%/}"
done | sort -V | tail -1 | cut -f2)
if [ -z "$SRC" ]; then
  echo "No Claude extension found in Dia. Install it from the Chrome Web Store first (it can stay disabled)." >&2
  exit 1
fi
rm -rf extension
cp -R "$SRC" extension
rm -rf extension/_metadata
cp dia-shim.js extension/
{ echo "import './dia-shim.js';"; cat "$SRC/service-worker-loader.js"; } > extension/service-worker-loader.js
echo "Built extension/ from version $(basename "$SRC")"
