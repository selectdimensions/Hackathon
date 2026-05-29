"""tts.py — synthesize each narration line to WAV via Windows SAPI over COM.
Offline, built into Windows, no PowerShell. Produces line_NN.wav for the mux."""

import json
import os
import win32com.client

HERE = os.path.dirname(os.path.abspath(__file__))
SSFM_CREATE_FOR_WRITE = 3
NARR = os.environ.get("NARR", "narration.json")  # input timeline
PREFIX = os.environ.get("PREFIX", "line_")  # output wav prefix

nav = json.load(open(os.path.join(HERE, NARR), encoding="utf-8"))
voice = win32com.client.Dispatch("SAPI.SpVoice")

# Prefer an English voice if one is installed.
for tok in voice.GetVoices():
    if "English" in tok.GetDescription():
        voice.Voice = tok
        break

for i, e in enumerate(nav["events"]):
    fn = os.path.join(HERE, "%s%02d.wav" % (PREFIX, i))
    stream = win32com.client.Dispatch("SAPI.SpFileStream")
    stream.Open(fn, SSFM_CREATE_FOR_WRITE)
    voice.AudioOutputStream = stream
    voice.Speak(e["text"])
    stream.Close()

print("tts: wrote %d wav files" % len(nav["events"]))
