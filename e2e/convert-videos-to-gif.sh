#!/bin/bash
# Convert Playwright test videos (.webm) to optimized GIFs for documentation.
# Usage: ./convert-videos-to-gif.sh <video-dir> <output-dir>
#
# Runs conversions in parallel for speed.
# Uses hwaccel cuda for decoding when available, with -hwaccel_output_format nv12
# so CPU filters (palettegen/paletteuse) can process the frames.

VIDEO_DIR="${1:-/e2e/test-results}"
OUTPUT_DIR="${2:-/e2e/docs-assets}"
MAX_PARALLEL="${3:-8}"

mkdir -p "$OUTPUT_DIR"

# Detect GPU — test actual decoding, not just hwaccels list
USE_GPU=0
if ffmpeg -y -hwaccel cuda -f lavfi -i "nullsrc=s=64x64:d=0.1" -f null - 2>/dev/null; then
  echo "GPU acceleration available"
  USE_GPU=1
else
  echo "No GPU acceleration — using CPU"
fi

echo "Converting videos from $VIDEO_DIR to GIFs in $OUTPUT_DIR (parallel: $MAX_PARALLEL)..."

convert_one() {
  local video="$1"
  local output_dir="$2"
  local use_gpu="$3"

  dir=$(dirname "$video")
  dir_name=$(basename "$dir")

  # Extract the NN-name pattern
  test_name=$(echo "$dir_name" | grep -oP '\d{2}[^/]*' | head -1 | sed 's/-chromium$//' | sed 's/-Chromium$//')

  if [ -z "$test_name" ]; then
    return
  fi

  gif="$output_dir/${test_name}.gif"

  # Single-pass GIF with palette optimization, 8fps, 720p
  local decode_args="-i"
  if [ "$use_gpu" = "1" ]; then
    decode_args="-hwaccel cuda -i"
  fi

  # Speed up 2.5x via setpts, then 10fps output for smooth playback
  ffmpeg -y $decode_args "$video" \
    -vf "setpts=0.4*PTS,fps=10,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
    "$gif" 2>/dev/null

  if [ -f "$gif" ]; then
    size=$(du -h "$gif" | cut -f1)
    echo "  ✓ $test_name ($size)"
  else
    echo "  ✗ $test_name FAILED"
  fi
}

export -f convert_one

# Run conversions in parallel
find "$VIDEO_DIR" -name "*.webm" -print0 | \
  xargs -0 -P "$MAX_PARALLEL" -I {} bash -c 'convert_one "$@"' _ {} "$OUTPUT_DIR" "$USE_GPU"

echo ""
echo "Done. Assets in $OUTPUT_DIR:"
ls -lhS "$OUTPUT_DIR"/ 2>/dev/null
