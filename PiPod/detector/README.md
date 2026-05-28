# detector/ — Stage 1 energy detector (gap E1)

Always-on C process. Reads I/Q from the SDR into a `/dev/shm` ring buffer, runs a
windowed FFT power estimate, and triggers the Python classifier (`../classifier/`)
only when energy crosses threshold for a dwell time. This is the standard
cognitive-radio Stage-1/Stage-2 split (Yucek & Arslan 2009; see `../REFERENCES.md`).

> **Status: scaffold.** The `.c` files compile-target the Pi 5 but the DSP bodies are
> TODO stubs. They have not been run against hardware.

## Files

| File | Role |
|---|---|
| `main.c` | SDR open (librtlsdr/libhackrf), ring buffer, main loop |
| `stage1_energy.c` | FFTW 4096-pt, Hann window, magnitude², threshold + dwell |
| `stage2_trigger.c` | On trigger, hand the I/Q window to the Python classifier |
| `detector.h` | Shared declarations + config |
| `Makefile` | `gcc -O2 -mcpu=cortex-a76` (Pi 5) |
| `fixtures/` | Recorded I/Q for replay tests (gap F2) |

## Build (on a Pi 5 / DragonOS Pi64)

```sh
sudo apt install librtlsdr-dev libhackrf-dev libfftw3-dev libliquid-dev
make
```

## Self-jam gating (gap B6)

When the ESP32-C6 asserts `TX_ACTIVE`, the detector must gate its threshold for the
TX window (~airtime + 5 ms) so the pod's own SX1262 burst is not flagged. Wire the
GPIO in `main.c` (TODO).
