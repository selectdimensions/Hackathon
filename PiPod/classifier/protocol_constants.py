"""Mirror of the enums in shared/Protocol.h (gap E2). Keep values in sync with the
C header — these are the contract the classifier output must satisfy."""

from enum import IntEnum

PROTOCOL_VERSION = 0x01


class BandId(IntEnum):
    BAND_UNKNOWN = 0x00
    BAND_30_88_MHZ = 0x01
    BAND_433_868_MHZ = 0x02  # EU 868 ISM (ELRS-EU, LoRa, generic SRD) + 433 EU SRD
    BAND_GNSS_L1 = 0x03
    BAND_2400_MHZ = 0x04
    BAND_5800_MHZ = 0x05


class ThreatClass(IntEnum):
    THREAT_UNKNOWN = 0
    THREAT_FPV_VIDEO = 1
    THREAT_FPV_CONTROL = 2
    THREAT_GNSS_JAM = 3
    THREAT_TACTICAL_JAM = 4
    THREAT_ISR_DRONE = 5
    THREAT_LOITER_MUNITION = 6
    # TODO(B3): THREAT_OCUSYNC_PRESENCE, THREAT_ELRS_FHSS, THREAT_LORA_CHIRP
