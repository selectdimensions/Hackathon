"""GNSS L1 jam classifier (Pod C, gap E2). SCAFFOLD — returns no detection yet."""

from protocol_constants import ThreatClass

CENTER_HZ = 1_575_420_000
ANALYSIS_BW_HZ = 2_000_000


def classify(iq, sample_rate_hz):
    """Return (ThreatClass, confidence 0..100).

    TODO(E2): noise-floor rise across 2 MHz centred on L1 + spectral-entropy
    threshold. Reference: JRC Ispra / U. Ljubljana (IEEE Sensors 2018).
    """
    return int(ThreatClass.THREAT_UNKNOWN), 0
