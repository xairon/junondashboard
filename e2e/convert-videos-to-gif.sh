#!/bin/bash
# Convert Playwright test videos (.webm) to optimized GIFs for documentation.
# Usage: ./convert-videos-to-gif.sh <video-dir> <output-dir>
#
# Requires ffmpeg.

VIDEO_DIR="${1:-/e2e/test-results}"
OUTPUT_DIR="${2:-/e2e/docs-assets}"

mkdir -p "$OUTPUT_DIR"

echo "Converting videos from $VIDEO_DIR to GIFs in $OUTPUT_DIR..."

# List all video directories to understand naming
echo "Available video files:"
find "$VIDEO_DIR" -name "*.webm" -print 2>/dev/null

find "$VIDEO_DIR" -name "*.webm" -print0 | while IFS= read -r -d '' video; do
  # Extract test name from path
  # Playwright creates dirs like: tests-doc-screenshots-spec-ts-01---carte-vue-d-ensemble-chromium/video.webm
  dir=$(dirname "$video")
  dir_name=$(basename "$dir")

  # Extract the NN-name pattern from the directory name
  # Match digits at start or after last ---
  test_name=$(echo "$dir_name" | grep -oP '\d{2}[^/]*' | head -1 | sed 's/-chromium$//' | sed 's/-Chromium$//')

  if [ -z "$test_name" ]; then
    echo "  SKIP: $dir_name (no test name pattern found)"
    continue
  fi

  gif="$OUTPUT_DIR/${test_name}.gif"
  echo "  $dir_name → $gif"

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
  if [ -f "$gif" ]; then
    size=$(du -h "$gif" | cut -f1)
    echo "    → $size"
  else
    echo "    → FAILED"
  fi
done

echo ""
echo "Done. Screenshots + GIFs in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"/ 2>/dev/null
