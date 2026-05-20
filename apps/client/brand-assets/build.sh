#!/usr/bin/env bash
# Rasterize brand SVG sources into PNG / ICO under apps/client/public/.
#
# Run from anywhere; the script resolves its own directory.
# Requirements: ImageMagick 7 with rsvg + fontconfig delegates
# (verify with `magick -version` — needs `rsvg pangocairo freetype fontconfig`).
#
# Japanese text in og-image.svg requires a system Japanese font
# (Hiragino Sans on macOS, Noto Sans CJK on Linux).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR"
OUT_DIR="$SCRIPT_DIR/../public"

if ! command -v magick >/dev/null 2>&1; then
  echo "error: ImageMagick (\`magick\`) not on PATH" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "==> apple-touch-icon.png (180x180)"
magick -background none -density 600 "$SRC_DIR/favicon.svg" \
  -resize 180x180 "$OUT_DIR/apple-touch-icon.png"

echo "==> icon-192.png"
magick -background none -density 600 "$SRC_DIR/favicon.svg" \
  -resize 192x192 "$OUT_DIR/icon-192.png"

echo "==> icon-512.png"
magick -background none -density 600 "$SRC_DIR/favicon.svg" \
  -resize 512x512 "$OUT_DIR/icon-512.png"

echo "==> favicon.ico (16 + 32 + 48)"
magick -background none -density 600 "$SRC_DIR/favicon.svg" \
  \( -clone 0 -resize 16x16 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 48x48 \) \
  -delete 0 "$OUT_DIR/favicon.ico"

echo "==> og-image.png (1200x630)"
magick -background "#faf6f1" -density 144 "$SRC_DIR/og-image.svg" \
  -resize 1200x630 "$OUT_DIR/og-image.png"

# also drop favicon.svg into public/ for direct serving
cp "$SRC_DIR/favicon.svg" "$OUT_DIR/favicon.svg"

echo
echo "done. wrote:"
ls -la "$OUT_DIR" | awk '{print "  "$0}'
