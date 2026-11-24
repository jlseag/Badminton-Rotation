#!/bin/zsh
# Capture every guide screenshot from the SHIPPED index.html.
#
# Usage:  dev/guide-capture.sh [outdir]
#
# Headless Chrome loads dev/guide-shot.html, which iframes the real app and
# drives it to one screen. Nothing is mocked, so a screenshot cannot show a
# version of the app that was never released -- which is exactly how the
# last guide drifted five versions behind what hosts had on their phones.
set -e

ROOT="${0:A:h:h}"
OUT="${1:-$ROOT/dev/shots}"
PORT=8749
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

SCENES=(empty paste players away roster game result points swap waiting board history settings)

mkdir -p "$OUT"
# One profile per shot. A shared --user-data-dir makes every launch after the
# first hit the singleton lock and exit without rendering, so twelve of the
# thirteen shots came out byte-identical to the first.
PROFILES=$(mktemp -d)

python3 -c "
import sys, http.server, functools
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
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILES"' EXIT
sleep 1

for s in $SCENES; do
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILES/$s" --force-device-scale-factor=3 \
    --hide-scrollbars --window-size=390,844 --virtual-time-budget=12000 \
    --screenshot="$OUT/$s.png" \
    "http://127.0.0.1:$PORT/dev/guide-shot.html?scene=$s" >/dev/null 2>&1
  printf '  %-9s %s\n' "$s" "$(du -h "$OUT/$s.png" 2>/dev/null | cut -f1)"
done

echo "captured ${#SCENES[@]} shots -> $OUT"
