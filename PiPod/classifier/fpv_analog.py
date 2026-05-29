"""Analog 5.8 GHz FPV video classifier (Pod A, gap E2). SCAFFOLD."""

from protocol_constants import ThreatClass

SYNC_NTSC_HZ = 15_734
SYNC_PAL_HZ = 15_625
ENVELOPE_BW_HZ = 7_000_000


def classify(iq, sample_rate_hz):
    """Return (ThreatClass, confidence 0..100).

    TODO(E2): detect the ~6-8 MHz FM-video envelope and the 15.625/15.7 kHz
    line-sync tone. HackRF + SigDigger demonstrated decode on rtl-sdr.com.
    """
    return int(ThreatClass.THREAT_UNKNOWN), 0
