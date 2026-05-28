"""LoRa chirp classifier (Pod D, gap E2). SCAFFOLD.

Matched filter on synthesised up-chirps. Reference: gr-lora_sdr / gr-lora2."""

from protocol_constants import ThreatClass

SPREADING_FACTORS = (7, 8, 9, 10, 11, 12)
BANDWIDTH_HZ = 125_000


def classify(iq, sample_rate_hz):
    """Return (ThreatClass, confidence 0..100).

    TODO(E2): correlate against SF7-SF12 / BW125 up-chirp templates. Map to
    THREAT_LORA_CHIRP once gap B3 adds it.
    """
    return int(ThreatClass.THREAT_UNKNOWN), 0
