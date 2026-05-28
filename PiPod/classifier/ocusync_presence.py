"""DJI OcuSync / DroneID presence classifier (Pod A/B, gap E2). SCAFFOLD.

Presence-only on HackRF; full decode + operator-locating needs AntSDR/USRP
(out of v0.2 scope). See ../REFERENCES.md."""

from protocol_constants import ThreatClass

BURST_BW_HZ = 10_000_000
CADENCE_MS = (500, 600)


def classify(iq, sample_rate_hz):
    """Return (ThreatClass, confidence 0..100).

    TODO(E2): detect ~10 MHz LTE-like OFDM bursts repeating every ~500-600 ms.
    Map to a dedicated class once gap B3 adds THREAT_OCUSYNC_PRESENCE.
    """
    return int(ThreatClass.THREAT_UNKNOWN), 0
