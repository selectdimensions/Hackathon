"""I/Q replay tests for the signature classifiers (gap F2). SCAFFOLD.

Each case skips until its fixture is recorded in ../../detector/fixtures/. Once
fixtures land, the asserted ThreatClass values become the regression contract
(and should be revisited alongside gap B3, which adds OcuSync/ELRS/LoRa classes)."""

import importlib
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[2] / "detector" / "fixtures"

CASES = [
    ("gnss_l1_jam", "gnss_l1_jam.cf32", "THREAT_GNSS_JAM"),
    ("fpv_analog", "fpv_analog.cf32", "THREAT_FPV_VIDEO"),
    ("ocusync_presence", "ocusync.cf32", "THREAT_FPV_CONTROL"),
    ("elrs_fhss", "elrs_fhss.cf32", "THREAT_FPV_CONTROL"),
    ("lora_chirp", "lora_chirp.cf32", "THREAT_FPV_CONTROL"),
]


@pytest.mark.parametrize(("module_name", "fixture", "expected"), CASES)
def test_classifier_on_fixture(module_name, fixture, expected):
    path = FIXTURES / fixture
    if not path.exists():
        pytest.skip(f"fixture not yet recorded: {fixture}")
    np = pytest.importorskip("numpy")
    from protocol_constants import ThreatClass

    mod = importlib.import_module(module_name)
    iq = np.fromfile(path, dtype=np.complex64)
    threat_class, confidence = mod.classify(iq, 2_400_000)
    assert threat_class == getattr(ThreatClass, expected)
    assert 0 <= confidence <= 100
