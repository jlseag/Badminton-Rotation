#!/bin/zsh
# Render the guide HTML to PDF.
#
# Usage:  dev/guide-build.sh [en|id|all]
#
# Served over http rather than opened as file://, because a file:// page
# cannot load its own screenshots or the embedded font without loosening
# Chrome's file access -- and a guide that silently renders with no images
# is worse than one that fails.
set -e

ROOT="${0:A:h:h}"
WHICH="${1:-all}"
PORT=8751
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

case "$WHICH" in
  en)  BUILDS=("guide-en:Mabyo-Host-Guide") ;;
  id)  BUILDS=("guide-id:Mabyo-Panduan-Host") ;;
  all) BUILDS=("guide-en:Mabyo-Host-Guide" "guide-id:Mabyo-Panduan-Host") ;;
  *)   echo "usage: $0 [en|id|all]"; exit 1 ;;
esac

# dev/shots is gitignored (4.5MB of regenerable PNGs), so a fresh checkout
# has none. Chrome would happily print twelve pages of empty phone frames
# and report success, so refuse instead.
if [[ ! -f "$ROOT/dev/shots/game.png" ]]; then
  echo "no screenshots in dev/shots -- run dev/guide-capture.sh first" >&2
  exit 1
fi

python3 -c "
import sys, http.server
ROOT, PORT = sys.argv[1], int(sys.argv[2])
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a, directory=ROOT, **kw)
    def end_headers(self):
        self.send_header('Cache-Control','no-store, max-age=0')
        super().end_headers()
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',PORT),H).serve_forever()
" "$ROOT" "$PORT" &
SERVER=$!
PROFILES=$(mktemp -d)
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILES"' EXIT
sleep 1

for b in $BUILDS; do
  src="${b%%:*}"; out="${b##*:}"
  [[ -f "$ROOT/dev/$src.html" ]] || { echo "  skip $src (no source)"; continue }
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILES/$src" --no-pdf-header-footer \
    --virtual-time-budget=20000 \
    --print-to-pdf="$ROOT/$out.pdf" \
    "http://127.0.0.1:$PORT/dev/$src.html" >/dev/null 2>&1
  printf '  %-26s %s\n' "$out.pdf" "$(du -h "$ROOT/$out.pdf" | cut -f1)"
done
