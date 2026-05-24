# Navigation Audio Clips

## What's inside

**44 short MP3 clips** (~4-8 KB each, 332 KB total) — designed to be concatenated
into navigation phrases like "270 degrees, 5 kilometers".

```
en/
  deg_030.mp3 ... deg_360.mp3   (12 compass headings, every 30°)
  dist_01.mp3 ... dist_10.mp3   (10 distances, 1-10 km)
fr/
  deg_030.mp3 ... deg_360.mp3   (same in French — degrés)
  dist_01.mp3 ... dist_10.mp3   (same in French — kilomètres)
```

## Format (consistent across all clips for clean concatenation)

- Mono, 22050 Hz, MP3 32 kbps
- Silence trimmed from start and end
- Loudness normalized (-16 LUFS)
- Voice: espeak-ng (robotic but tiny and reliable)

## How to play them together

Because all clips share the same format, you can concatenate them with a plain
file append:

```bash
# Linux/macOS — speak "270 degrees, 5 kilometers"
cat en/deg_270.mp3 en/dist_05.mp3 > phrase.mp3

# Windows
copy /b en\deg_270.mp3 + en\dist_05.mp3 phrase.mp3
```

Or in code (Python):
```python
with open("phrase.mp3", "wb") as out:
    for clip in ["en/deg_270.mp3", "en/dist_05.mp3"]:
        out.write(open(clip, "rb").read())
```

## Want better voice quality? Use Piper

The voice in these clips is `espeak-ng` because Piper neural-TTS voices live
on HuggingFace, which wasn't reachable from the sandbox where these were made.

Run `generate_piper_clips.sh` on your own machine to regenerate with Piper
(natural-sounding neural voices, similar file size):

```bash
pip install piper-tts
chmod +x generate_piper_clips.sh
./generate_piper_clips.sh
```

The script downloads two small voice models (~20 MB each) the first time:
- English: `en_US-amy-low`
- French:  `fr_FR-siwis-low`

To swap voices, edit `EN_VOICE_URL_BASE` / `FR_VOICE_URL_BASE` in the script —
the full Piper voice list is at https://github.com/rhasspy/piper/blob/master/VOICES.md
