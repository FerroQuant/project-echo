#!/usr/bin/env bash
# transcribe-batch.sh — Batch transcribe videos using OpenAI Whisper
# Usage:
#   ./scripts/transcribe-batch.sh /path/to/video/dir
#   ./scripts/transcribe-batch.sh urls.txt
#
# Outputs _data/transcripts/{video-id}.json for each video.
# Requires: whisper (pip install openai-whisper), python3, ffmpeg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TRANSCRIPTS_DIR="$REPO_ROOT/_data/transcripts"
WORK_DIR="$(mktemp -d)"

mkdir -p "$TRANSCRIPTS_DIR"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

# Convert seconds (float) to HH:MM:SS
seconds_to_hms() {
  local total_secs="${1%.*}"
  local h=$(( total_secs / 3600 ))
  local m=$(( (total_secs % 3600) / 60 ))
  local s=$(( total_secs % 60 ))
  printf "%02d:%02d:%02d" "$h" "$m" "$s"
}

# Transcribe a single video file and save to _data/transcripts/
transcribe_file() {
  local video_path="$1"
  local video_id="$2"
  local title="$3"

  echo "Transcribing: $video_path (id=$video_id)"

  local whisper_out="$WORK_DIR/$video_id"
  mkdir -p "$whisper_out"

  # Run Whisper — output raw JSON
  whisper "$video_path" \
    --model medium \
    --language en \
    --output_format json \
    --output_dir "$whisper_out" \
    --verbose False

  # Whisper names the output file after the input basename
  local base_name
  base_name="$(basename "$video_path")"
  base_name="${base_name%.*}"
  local whisper_json="$whisper_out/${base_name}.json"

  if [ ! -f "$whisper_json" ]; then
    echo "ERROR: Whisper did not produce $whisper_json" >&2
    return 1
  fi

  # Convert Whisper JSON → our format using python3
  python3 - "$whisper_json" "$TRANSCRIPTS_DIR/$video_id.json" "$video_id" "$title" <<'PYEOF'
import json
import sys

whisper_path = sys.argv[1]
output_path  = sys.argv[2]
video_id     = sys.argv[3]
title        = sys.argv[4]

with open(whisper_path) as f:
    raw = json.load(f)

def secs_to_hms(secs):
    secs = int(secs)
    h, rem = divmod(secs, 3600)
    m, s   = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

segments = []
for seg in raw.get("segments", []):
    segments.append({
        "start": secs_to_hms(seg.get("start", 0)),
        "end":   secs_to_hms(seg.get("end",   0)),
        "text":  seg.get("text", "").strip()
    })

full_text = raw.get("text", "").strip()

output = {
    "video_id":  video_id,
    "title":     title,
    "full_text": full_text,
    "segments":  segments
}

with open(output_path, "w") as f:
    json.dump(output, f, indent=2)

print(f"Saved transcript to {output_path} ({len(segments)} segments)")
PYEOF
}

# -----------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <video-directory|url-list.txt>" >&2
  exit 1
fi

INPUT="$1"

if [ -d "$INPUT" ]; then
  # Process every video file in the directory
  shopt -s nullglob
  VIDEO_FILES=("$INPUT"/*.{mp4,mkv,mov,avi,webm,m4v})
  shopt -u nullglob

  if [ "${#VIDEO_FILES[@]}" -eq 0 ]; then
    echo "No video files found in $INPUT" >&2
    exit 1
  fi

  for video in "${VIDEO_FILES[@]}"; do
    base="$(basename "$video")"
    video_id="${base%.*}"
    title="${video_id//-/ }"
    transcribe_file "$video" "$video_id" "$title"
  done

elif [ -f "$INPUT" ]; then
  # INPUT is a text file: one URL per line (optionally: url<TAB>id<TAB>title)
  while IFS=$'\t' read -r url video_id title || [ -n "$url" ]; do
    # Skip blank lines and comments
    [[ -z "$url" || "$url" == \#* ]] && continue

    # Default id and title if not provided
    if [ -z "$video_id" ]; then
      video_id="$(echo "$url" | md5sum | cut -c1-8)"
    fi
    if [ -z "$title" ]; then
      title="Sermon $video_id"
    fi

    # Download with yt-dlp if available, otherwise wget/curl
    local_path="$WORK_DIR/${video_id}.mp4"
    if command -v yt-dlp &>/dev/null; then
      yt-dlp -o "$local_path" "$url"
    else
      curl -fsSL -o "$local_path" "$url"
    fi

    transcribe_file "$local_path" "$video_id" "$title"
  done < "$INPUT"

else
  echo "ERROR: '$INPUT' is neither a directory nor a file" >&2
  exit 1
fi

# Regenerate index.json
python3 - "$TRANSCRIPTS_DIR" <<'PYEOF'
import json, os, sys

transcripts_dir = sys.argv[1]
index = []

for fname in sorted(os.listdir(transcripts_dir)):
    if fname == "index.json" or not fname.endswith(".json"):
        continue
    with open(os.path.join(transcripts_dir, fname)) as f:
        data = json.load(f)
    index.append({
        "video_id": data.get("video_id", ""),
        "title":    data.get("title", "")
    })

with open(os.path.join(transcripts_dir, "index.json"), "w") as f:
    json.dump(index, f, indent=2)

print(f"Updated index.json with {len(index)} entries")
PYEOF

echo "Transcription batch complete."
