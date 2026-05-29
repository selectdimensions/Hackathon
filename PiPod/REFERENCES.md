# Upstream references (PiPod)

Projects the v0.2 Pi-side pipeline builds on or borrows signatures from. Pin a
known-good commit/release before integrating. Source: [../docs/V02_PIVOT.md](../docs/V02_PIVOT.md) §10.

| Project | Use | Pin |
|---|---|---|
| DragonOS Pi64 (Beta42, Oct 2025) | Base Pi 5 SDR image — RTL-SDR/HackRF/bladeRF drivers, GNU Radio, SDR++, rtl-433 | _TODO: record image build used_ |
| krakenrf/krakensdr_dsp + heimdall_daq_fw | Master-site DoA receiver (Pi 4/5 host) | _TODO_ |
| DC9ST/tdoa-evaluation-rtlsdr | Reference-TX cross-correlation pattern — **v0.3** multi-pod TDOA | _TODO_ |
| jgromes/RadioLib + PiHal | SX1262 from Pi (gpioDevice=4) — only if Option A is ever revisited | _TODO_ |
| RUB-SysSec/DroneSecurity, proto17/dji_droneid, alphafox02/antsdr_dji_droneid | OcuSync / DroneID detection signatures (presence only on HackRF) | _TODO_ |
| rtl-433 | ~200 ISM-band decoders — RF-chain bring-up verification | ships in DragonOS |
| gr-lora_sdr / gr-lora2 | LoRa-chirp matched-filter reference for the classifier | _TODO_ |
| Maia SDR (maia-sdr.org) | FPGA-SDR pattern — **v0.4** on-board preprocessing (not v0.2) | _TODO_ |

## Citations (detector design)

- Yucek & Arslan, "A survey of spectrum sensing algorithms for cognitive radio
  applications," IEEE Communications Surveys, 2009.
- Mariani, Giorgetti, Chiani, "Effects of noise power estimation on energy
  detection," IEEE Trans. Comm., 2011.
