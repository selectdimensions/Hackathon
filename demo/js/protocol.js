// JS port of shared/Protocol.h + shared/AudioCues.h.
// Field names and ranges MUST match the C headers exactly — this is the
// contract that lets the demo's master output drive DataAnalysisLog/triangulate.py
// without translation.

(function (root) {
  const PROTOCOL_VERSION = 0x01;

  const MsgType = {
    MSG_DETECT:      0x01,
    MSG_HEARTBEAT:   0x02,
    MSG_ALERT:       0x10,
    MSG_ALL_CLEAR:   0x11,
    MSG_CHANNEL_REC: 0x20,
    MSG_CONFIG:      0x30,
    MSG_REKEY:       0x40,
  };

  const BandId = {
    BAND_UNKNOWN:     0x00,
    BAND_30_88_MHZ:   0x01,
    BAND_433_868_MHZ: 0x02,
    BAND_GNSS_L1:     0x03,
    BAND_2400_MHZ:    0x04,
    BAND_5800_MHZ:    0x05,
  };
  const BandLabel = {
    0x00: 'UNKNOWN',
    0x01: '30_88_MHZ',
    0x02: '433_868_MHZ',
    0x03: 'GNSS_L1',
    0x04: '2400_MHZ',
    0x05: '5800_MHZ',
  };

  const ThreatClass = {
    THREAT_UNKNOWN:         0,
    THREAT_FPV_VIDEO:       1,
    THREAT_FPV_CONTROL:     2,
    THREAT_GNSS_JAM:        3,
    THREAT_TACTICAL_JAM:    4,
    THREAT_ISR_DRONE:       5,
    THREAT_LOITER_MUNITION: 6,
  };
  const ThreatLabel = {
    0: 'UNKNOWN',
    1: 'FPV_VIDEO',
    2: 'FPV_CONTROL',
    3: 'GNSS_JAM',
    4: 'TACTICAL_JAM',
    5: 'ISR_DRONE',
    6: 'LOITER_MUNITION',
  };

  const Flags = {
    FLAG_GNSS_JAM_SUSPECTED: 0x01,
    FLAG_FREQ_HOPPER:        0x02,
    FLAG_CW:                 0x04,
    FLAG_LOW_BATTERY:        0x08,
  };

  const NODE_ID_MASTER    = 0x80;
  const NODE_ID_BROADCAST = 0xFF;

  const CueId = {
    CUE_NONE:            0x00,
    CUE_BEAR_N:          0x01, CUE_BEAR_NE: 0x02, CUE_BEAR_E:  0x03, CUE_BEAR_SE: 0x04,
    CUE_BEAR_S:          0x05, CUE_BEAR_SW: 0x06, CUE_BEAR_W:  0x07, CUE_BEAR_NW: 0x08,
    CUE_DIST_VERY_CLOSE: 0x10, CUE_DIST_CLOSE: 0x11, CUE_DIST_NEAR: 0x12,
    CUE_DIST_MEDIUM:     0x13, CUE_DIST_FAR: 0x14, CUE_DIST_VERY_FAR: 0x15,
    CUE_DIST_DISTANT:    0x16,
    CUE_THREAT_FPV:      0x20, CUE_THREAT_DRONE: 0x21, CUE_THREAT_JAMMER: 0x22,
    CUE_THREAT_LOITER:   0x23, CUE_THREAT_INCOMING: 0x24,
    CUE_TTI_10S:         0x30, CUE_TTI_30S: 0x31, CUE_TTI_60S: 0x32,
    CUE_USE_CHAN_1:      0x40, CUE_USE_CHAN_2: 0x41, CUE_USE_CHAN_3: 0x42,
    CUE_SWITCH_BACKUP:   0x4F,
    CUE_DEG_030:         0x50, CUE_DEG_060: 0x51, CUE_DEG_090: 0x52,
    CUE_DEG_120:         0x53, CUE_DEG_150: 0x54, CUE_DEG_180: 0x55,
    CUE_DEG_210:         0x56, CUE_DEG_240: 0x57, CUE_DEG_270: 0x58,
    CUE_DEG_300:         0x59, CUE_DEG_330: 0x5A, CUE_DEG_360: 0x5B,
    CUE_KM_01:           0x60, CUE_KM_02: 0x61, CUE_KM_03: 0x62, CUE_KM_04: 0x63,
    CUE_KM_05:           0x64, CUE_KM_06: 0x65, CUE_KM_07: 0x66, CUE_KM_08: 0x67,
    CUE_KM_09:           0x68, CUE_KM_10: 0x69,
    CUE_SYS_NODE_DOWN:   0xF0, CUE_SYS_GPS_LOST: 0xF1,
    CUE_SYS_BATTERY_LOW: 0xF2, CUE_SYS_ALL_CLEAR: 0xF3,
  };

  // Mirrors CUE_TABLE in shared/AudioCues.h. Filename only — paths are resolved
  // by the consumer (WAV -> UserNotification/clips/, MP3 -> AudioClips/<lang>/).
  const CueTable = Object.fromEntries(Object.entries(CueId).map(([name, id]) => [id, { name, filename: '' }]));
  // Filenames keyed by cue_id (only the names worth playing in the demo).
  const _F = {
    [CueId.CUE_THREAT_FPV]:      'threat_fpv.wav',
    [CueId.CUE_THREAT_DRONE]:    'threat_drone.wav',
    [CueId.CUE_THREAT_JAMMER]:   'threat_jammer.wav',
    [CueId.CUE_THREAT_LOITER]:   'threat_loiter.wav',
    [CueId.CUE_THREAT_INCOMING]: 'threat_incoming.wav',
    [CueId.CUE_SYS_ALL_CLEAR]:   'sys_all_clear.wav',
    [CueId.CUE_DEG_030]: 'deg_030.mp3', [CueId.CUE_DEG_060]: 'deg_060.mp3',
    [CueId.CUE_DEG_090]: 'deg_090.mp3', [CueId.CUE_DEG_120]: 'deg_120.mp3',
    [CueId.CUE_DEG_150]: 'deg_150.mp3', [CueId.CUE_DEG_180]: 'deg_180.mp3',
    [CueId.CUE_DEG_210]: 'deg_210.mp3', [CueId.CUE_DEG_240]: 'deg_240.mp3',
    [CueId.CUE_DEG_270]: 'deg_270.mp3', [CueId.CUE_DEG_300]: 'deg_300.mp3',
    [CueId.CUE_DEG_330]: 'deg_330.mp3', [CueId.CUE_DEG_360]: 'deg_360.mp3',
    [CueId.CUE_KM_01]: 'dist_01.mp3', [CueId.CUE_KM_02]: 'dist_02.mp3',
    [CueId.CUE_KM_03]: 'dist_03.mp3', [CueId.CUE_KM_04]: 'dist_04.mp3',
    [CueId.CUE_KM_05]: 'dist_05.mp3', [CueId.CUE_KM_06]: 'dist_06.mp3',
    [CueId.CUE_KM_07]: 'dist_07.mp3', [CueId.CUE_KM_08]: 'dist_08.mp3',
    [CueId.CUE_KM_09]: 'dist_09.mp3', [CueId.CUE_KM_10]: 'dist_10.mp3',
  };
  for (const [id, fn] of Object.entries(_F)) CueTable[id].filename = fn;

  // Resolve cue_id -> URL relative to demo/. .mp3 -> AudioClips/<lang>/, else null.
  function cueAssetUrl(cueId, lang) {
    const entry = CueTable[cueId];
    if (!entry || !entry.filename) return null;
    if (entry.filename.endsWith('.mp3')) {
      return '../AudioClips/' + (lang || 'en') + '/' + entry.filename;
    }
    return null;
  }

  // Mirrors bearing_deg_to_step30_cue in shared/AudioCues.h.
  function bearingDegToStep30Cue(bearingDeg) {
    const deg = Math.round((bearingDeg & 0xFF) * 360 / 256);
    let step = Math.floor((deg + 15) / 30);
    if (step === 0) step = 12;
    if (step > 12) step = 12;
    return CueId.CUE_DEG_030 + (step - 1);
  }

  // Mirrors meters_to_km_cue. Clamps 1..10 km.
  function metersToKmCue(meters) {
    let km = Math.round(meters / 1000);
    if (km < 1) km = 1;
    if (km > 10) km = 10;
    return CueId.CUE_KM_01 + (km - 1);
  }

  // Mirrors distance_code -> CUE_DIST_*. Used for the 8-cardinal WAV path
  // (which the demo doesn't play, but the master node still computes).
  function distanceCodeFromMeters(meters) {
    if (meters < 25)   return 0;
    if (meters < 50)   return 1;
    if (meters < 100)  return 2;
    if (meters < 200)  return 3;
    if (meters < 500)  return 4;
    if (meters < 1000) return 5;
    return 6;
  }
  const DistanceLabels = {
    0: '<25m', 1: '25-50m', 2: '50-100m', 3: '100-200m',
    4: '200-500m', 5: '500-1000m', 6: '>1000m', 7: '>1000m',
  };

  // bearing in degrees (0..360) -> 0..255 byte for AlertPacket.
  function bearing360ToByte(deg) {
    let b = Math.round(((deg % 360 + 360) % 360) * 256 / 360);
    if (b >= 256) b = 0;
    return b;
  }

  function flagsToList(bits) {
    const out = [];
    if (bits & Flags.FLAG_GNSS_JAM_SUSPECTED) out.push('GNSS_JAM_SUSPECTED');
    if (bits & Flags.FLAG_FREQ_HOPPER)        out.push('FREQ_HOPPER');
    if (bits & Flags.FLAG_CW)                 out.push('CW');
    if (bits & Flags.FLAG_LOW_BATTERY)        out.push('LOW_BATTERY');
    return out;
  }

  root.Proto = {
    PROTOCOL_VERSION, MsgType, BandId, BandLabel,
    ThreatClass, ThreatLabel, Flags,
    NODE_ID_MASTER, NODE_ID_BROADCAST,
    CueId, CueTable, cueAssetUrl,
    bearingDegToStep30Cue, metersToKmCue,
    distanceCodeFromMeters, DistanceLabels,
    bearing360ToByte, flagsToList,
  };
})(window);
