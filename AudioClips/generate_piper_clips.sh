#!/usr/bin/env bash
# generate_piper_clips.sh
# Generates navigation audio clips using Piper TTS (neural, natural voices).
# Run this LOCALLY where you have internet access to huggingface.co.
#
# Requirements:
#   pip install piper-tts
#   ffmpeg installed (apt install ffmpeg / brew install ffmpeg)

set -e

OUT_BASE="./nav_audio_piper"
VOICE_DIR="./piper_voices"
mkdir -p "$OUT_BASE/en" "$OUT_BASE/fr" "$VOICE_DIR"

# --- Voice models (Piper) ---
# Pick small "low" quality models (~20 MB each) for fast, small output.
# Bump to "medium" or "high" for better quality at larger file size.
EN_VOICE_URL_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low"
EN_VOICE_NAME="en_US-amy-low"
FR_VOICE_URL_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/low"
FR_VOICE_NAME="fr_FR-siwis-low"

# Download voices if missing
download_voice() {
  local base_url="$1" name="$2"
  if [ ! -f "$VOICE_DIR/$name.onnx" ]; then
    echo "Downloading $name..."
    curl -sSL -o "$VOICE_DIR/$name.onnx"      "$base_url/$name.onnx"
    curl -sSL -o "$VOICE_DIR/$name.onnx.json" "$base_url/$name.onnx.json"
  fi
}
download_voice "$EN_VOICE_URL_BASE" "$EN_VOICE_NAME"
download_voice "$FR_VOICE_URL_BASE" "$FR_VOICE_NAME"

SAMPLE_RATE=22050
BITRATE=32k

# text -> piper wav -> trim silence -> small mono MP3
make_clip() {
  local model_path="$1" outdir="$2" name="$3" text="$4"
  local tmpwav="/tmp/${name}_${RANDOM}.wav"

  echo "$text" | piper --model "$model_path" --output_file "$tmpwav" 2>/dev/null

  ffmpeg -y -loglevel error -i "$tmpwav" \
    -af "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05,areverse,loudnorm=I=-16:TP=-1.5" \
    -ac 1 -ar $SAMPLE_RATE -codec:a libmp3lame -b:a $BITRATE \
    "$OUT_BASE/$outdir/${name}.mp3"
  rm -f "$tmpwav"
}

EN_MODEL="$VOICE_DIR/$EN_VOICE_NAME.onnx"
FR_MODEL="$VOICE_DIR/$FR_VOICE_NAME.onnx"

# === ENGLISH ===
for d in 30 60 90 120 150 180 210 240 270 300 330 360; do
  make_clip "$EN_MODEL" en "deg_$(printf '%03d' $d)" "$d degrees"
done
make_clip "$EN_MODEL" en "dist_01" "1 kilometer"
for k in 2 3 4 5 6 7 8 9 10; do
  make_clip "$EN_MODEL" en "dist_$(printf '%02d' $k)" "$k kilometers"
done

# === FRENCH ===
for d in 30 60 90 120 150 180 210 240 270 300 330 360; do
  make_clip "$FR_MODEL" fr "deg_$(printf '%03d' $d)" "$d degrés"
done
make_clip "$FR_MODEL" fr "dist_01" "1 kilomètre"
for k in 2 3 4 5 6 7 8 9 10; do
  make_clip "$FR_MODEL" fr "dist_$(printf '%02d' $k)" "$k kilomètres"
done

echo ""
echo "Done. Files in $OUT_BASE/"
du -sh "$OUT_BASE"
