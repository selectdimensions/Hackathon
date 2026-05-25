// SensorPod — simulates an ESP32-C6 + SX1262 + RF frontend pod.
// For each active emitter, computes RSSI via simple log-distance path loss,
// timestamps with simulated GPS-PPS, and emits a DetectPacket-shaped event
// (passes through DataAnalysisLog/log_format.md unchanged).

(function (root) {
  const { BandId, BandLabel, Flags, flagsToList, PROTOCOL_VERSION } = window.Proto;
  const { haversineM } = window.Geo;

  // Free-space-ish path loss; PT_dBm = transmit power, n = path-loss exponent.
  // We're lying about absolute calibration but the relative trend is right.
  function rssiAtRangeDbm(rangeM, txPowerDbm, n) {
    if (rangeM < 1) rangeM = 1;
    return txPowerDbm - 10 * n * Math.log10(rangeM) - 40;
  }

  function makeSensorPod(cfg) {
    // cfg: {nodeId, label, lat, lon, bands[]|band, isLive, hasGpsPps, detectThresholdDbm}
    // Accept either `bands` (multi-band array) or legacy `band` (single int).
    const bands = Array.isArray(cfg.bands) ? cfg.bands.slice() : (cfg.band !== undefined ? [cfg.band] : []);
    const state = {
      detectThresholdDbm: -110,
      ...cfg,
      bands,
      seq: 0,
      battery: 80 + Math.floor(Math.random() * 20),
      noiseFloorDbm: -98 + Math.floor(Math.random() * 4 - 2),
    };

    function poll(nowMs, emitter) {
      if (!emitter || !state.bands.includes(emitter.bandId)) return null;
      const rangeM = haversineM(state.lat, state.lon, emitter.lat, emitter.lon);
      const rssi = rssiAtRangeDbm(rangeM, emitter.txPowerDbm, emitter.pathLossN);
      if (rssi < state.detectThresholdDbm) return null;
      // simulate PPS — true emission time + propagation delay (3.3 ns/m)
      const propUs = rangeM / 3e8 * 1e6;
      const ppsTimestampUs = Math.floor(emitter.emitUnixUs + propUs);
      const flags = (emitter.freqHopper ? Flags.FLAG_FREQ_HOPPER : 0)
                  | (state.battery < 20 ? Flags.FLAG_LOW_BATTERY : 0);
      state.seq = (state.seq + 1) & 0xFFFF;
      return {
        ts_unix_ms: nowMs,
        event: 'detect',
        node_id: state.nodeId,
        band_id: emitter.bandId,
        band_name: BandLabel[emitter.bandId],
        pps_timestamp_us: state.hasGpsPps ? ppsTimestampUs : 0,
        rssi_dbm: Math.round(rssi),
        snr_db: Math.max(0, Math.min(63, Math.round(rssi - state.noiseFloorDbm))),
        noise_floor_dbm: state.noiseFloorDbm,
        lat: state.lat,
        lon: state.lon,
        flags: flagsToList(flags),
        battery_pct: state.battery,
        seq: state.seq,
        rx_freq_hz: 868100000,
        rx_rssi_dbm: -88,
        epoch: 7,
        on_air_ms: 154,
        // demo-only annotations (ignored by parse_log.py — extra fields allowed)
        _pod_label: state.label,
        _is_live: !!state.isLive,
      };
    }

    return { state, poll };
  }

  root.Sim = root.Sim || {};
  root.Sim.makeSensorPod = makeSensorPod;
})(window);
