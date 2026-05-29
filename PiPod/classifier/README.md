# classifier/ — Stage 2 signature classifiers (gap E2)

Python, invoked **only on a Stage-1 energy trigger** (≤ tens of Hz), never in the
always-on path. Each module exposes:

```python
classify(iq, sample_rate_hz) -> (threat_class, confidence)
```

where `threat_class` is a `ThreatClass` value from `protocol_constants.py` (a mirror of
`shared/Protocol.h`) and `confidence` is 0..100.

> **Status: scaffold.** Every `classify()` currently returns `THREAT_UNKNOWN, 0`.
> Replay tests skip until fixtures land in `../detector/fixtures/` (gap F2).

| Module | Pod | Signature (TODO) |
|---|---|---|
| `gnss_l1_jam.py` | C | Noise-floor rise across 2 MHz at 1575.42 MHz + spectral entropy |
| `fpv_analog.py` | A | 6–8 MHz FM envelope + 15.625/15.7 kHz sync |
| `ocusync_presence.py` | A/B | ~10 MHz LTE-like burst, 500–600 ms cadence (presence only) |
| `elrs_fhss.py` | B | ≥20 hops/s pattern, similar burst length |
| `lora_chirp.py` | D | Matched filter on SF7–SF12 / BW125 up-chirps |

Note: distinguishing OcuSync vs ELRS vs LoRa-chirp as separate threat classes needs
the enum additions in gap B3 (not yet landed); until then they map onto existing
`ThreatClass` values.

## Dev

```sh
pip install -r requirements.txt ruff pytest
ruff check .
pytest -q
```
