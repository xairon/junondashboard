#!/bin/bash
# Convert Playwright test videos (.webm) to optimized GIFs for documentation.
# Usage: ./convert-videos-to-gif.sh <video-dir> <output-dir>
#
# Requires ffmpeg.

VIDEO_DIR="${1:-/e2e/test-results}"
OUTPUT_DIR="${2:-/e2e/docs-assets}"

mkdir -p "$OUTPUT_DIR"

echo "Converting videos from $VIDEO_DIR to GIFs in $OUTPUT_DIR..."

find "$VIDEO_DIR" -name "*.webm" | while read -r video; do
  # Extract test name from path: .../test-title-chromium/video.webm → test-title
  dir=$(dirname "$video")
  test_name=$(basename "$dir" | sed 's/-chromium$//' | sed 's/-Chromium$//')

  # Skip non-doc tests
  if [[ ! "$test_name" =~ ^[0-9]{2}- ]]; then
    continue
  fi

  gif="$OUTPUT_DIR/${test_name}.gif"
  echo "  $test_name → $gif"

  # Generate palette for better quality, resize to 720p, 10fps
  palette=$(mktemp /tmp/palette-XXXXXX.png)
  ffmpeg -y -i "$video" \
    -vf "fps=10,scale=720:-1:flags=lanczos,palettegen=stats_mode=diff" \
    "$palette" 2>/dev/null

  ffmpeg -y -i "$video" -i "$palette" \
    -lavfi "fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
    "$gif" 2>/dev/null

  rm -f "$palette"

  # Report size
  size=$(du -h "$gif" | cut -f1)
  echo "    → $size"
done

echo ""
echo "Done. Screenshots + GIFs in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"/ 2>/dev/null
