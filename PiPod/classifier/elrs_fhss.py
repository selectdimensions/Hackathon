"""ELRS / FHSS control-link classifier (Pod B, gap E2). SCAFFOLD.

Detects the hopping *pattern* (no binding phrase needed). Needs a time series of
frames, not a single window — the single-frame signature here is a placeholder."""

from protocol_constants import ThreatClass

MIN_HOPS_PER_SEC = 20


def classify(iq, sample_rate_hz):
    """Return (ThreatClass, confidence 0..100).

    TODO(E2): track >=20 hops/s with similar burst length across 868.0-868.6 MHz
    (EU) or 2.4 GHz. Map to THREAT_ELRS_FHSS once gap B3 adds it.
    """
    return int(ThreatClass.THREAT_UNKNOWN), 0
