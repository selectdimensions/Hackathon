# Generating clips/

Two paths: **Piper TTS** (offline, free, decent quality) or **system TTS** (zero install, lower quality).

## Path A — Piper (recommended)

```powershell
# One-time install:
pip install piper-tts
piper --model en_US-amy-medium --download-dir .\piper-models

# Generate one clip:
$phrase = "north"
piper --model .\piper-models\en_US-amy-medium.onnx --output_file clips/bear_n.wav $phrase

# Then resample to 8 kHz mono 16-bit with ffmpeg:
ffmpeg -y -i clips/bear_n.wav -ar 8000 -ac 1 -sample_fmt s16 clips/bear_n.8k.wav
Move-Item -Force clips/bear_n.8k.wav clips/bear_n.wav
```

Script the whole manifest:

```powershell
# (Pseudo — read audio_manifest.md, loop, run piper + ffmpeg per row.)
```

## Path B — Windows system TTS

```powershell
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile("clips/bear_n.wav")
$synth.Speak("north")
$synth.Dispose()

# Then resample:
ffmpeg -y -i clips/bear_n.wav -ar 8000 -ac 1 -sample_fmt s16 clips/bear_n.8k.wav
Move-Item -Force clips/bear_n.8k.wav clips/bear_n.wav
```

## Verify

After generating, run the `audio-cue-curator` agent (or manually):

```powershell
foreach ($f in Get-ChildItem clips\*.wav) {
    ffprobe -v error -select_streams a:0 `
            -show_entries stream=sample_rate,channels,bits_per_sample,codec_name `
            -of json $f.FullName
}
```

Every clip must report `sample_rate: "8000", channels: 1, bits_per_sample: 16, codec_name: "pcm_s16le"`.
