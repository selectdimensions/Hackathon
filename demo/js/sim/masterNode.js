// MasterNode — collects DetectPacket-shaped events from sensor pods, runs
// TDOA (stub: centroid) + RSSI multilateration fallback, emits AlertPacket-
// shaped events. JSON shape matches DataAnalysisLog/log_format.md v1 exactly.
//
// Algorithm mirrors DataAnalysisLog/triangulate.py — same fallback rule
// (any pod missing PPS -> RSSI), same field names.

(function (root) {
  const P = window.Proto;
  const { haversineM, bearingDeg } = window.Geo;

  // Mirrors triangulate.py:solve_tdoa (stub: centroid of reporting pods).
  function solveTdoa(events) {
    if (events.length < 3) return null;
    if (events.some(ev => !ev.pps_timestamp_us)) return null;
    const lat = events.reduce((a, ev) => a + ev.lat, 0) / events.length;
    const lon = events.reduce((a, ev) => a + ev.lon, 0) / events.length;
    return { lat, lon, method: 'tdoa' };
  }

  // Mirrors triangulate.py:solve_rssi.
  function solveRssi(events) {
    if (!events.length) return null;
    const w = events.map(ev => Math.pow(10, ev.rssi_dbm / 10));
    const tot = w.reduce((a, b) => a + b, 0);
    if (tot === 0) return null;
    const lat = events.reduce((a, ev, i) => a + w[i] * ev.lat, 0) / tot;
    const lon = events.reduce((a, ev, i) => a + w[i] * ev.lon, 0) / tot;
    return { lat, lon, method: 'rssi' };
  }

  function classifyThreat(bandId, flags) {
    if (bandId === P.BandId.BAND_5800_MHZ)    return P.ThreatClass.THREAT_FPV_VIDEO;
    if (bandId === P.BandId.BAND_2400_MHZ)    return P.ThreatClass.THREAT_FPV_CONTROL;
    if (bandId === P.BandId.BAND_GNSS_L1)     return P.ThreatClass.THREAT_GNSS_JAM;
    if (bandId === P.BandId.BAND_30_88_MHZ)   return P.ThreatClass.THREAT_TACTICAL_JAM;
    if (bandId === P.BandId.BAND_433_915_MHZ) return P.ThreatClass.THREAT_FPV_CONTROL;
    return P.ThreatClass.THREAT_UNKNOWN;
  }

  // Pick the cue_id for an alert. Uses the fine-grained MP3 range so the
  // demo plays "<heading> degrees, <km> kilometres" via AudioClips/.
  function pickPrimaryCue(bearingDegByte) {
    return P.bearingDegToStep30Cue(bearingDegByte);
  }

  function makeMasterNode(opts) {
    // opts: {soldierLatLon, syncWindowMs, minPodsForTdoa, onEvent}
    const cfg = Object.assign({
      syncWindowMs: 250,
      minPodsForTdoa: 3,
      onEvent: () => {},
    }, opts);

    const buffer = [];           // recent detects awaiting solve
    const seenSeq = new Set();   // dedup (node_id, seq)
    let lastAlertMs = 0;

    function ingestDetect(ev) {
      const key = `${ev.node_id}:${ev.seq}`;
      if (seenSeq.has(key)) return;
      seenSeq.add(key);
      // keep memory bounded
      if (seenSeq.size > 1024) {
        const it = seenSeq.values();
        for (let i = 0; i < 256; ++i) seenSeq.delete(it.next().value);
      }
      cfg.onEvent(ev);
      buffer.push(ev);
    }

    function tick(nowMs) {
      // drop old
      while (buffer.length && nowMs - buffer[0].ts_unix_ms > cfg.syncWindowMs * 4) {
        buffer.shift();
      }
      // group by band, pods in same sync window
      const groups = new Map();
      for (const ev of buffer) {
        if (nowMs - ev.ts_unix_ms > cfg.syncWindowMs) continue;
        const arr = groups.get(ev.band_id) || [];
        arr.push(ev);
        groups.set(ev.band_id, arr);
      }
      for (const [bandId, evs] of groups) {
        // unique pods
        const byPod = new Map();
        for (const e of evs) if (!byPod.has(e.node_id)) byPod.set(e.node_id, e);
        const distinct = Array.from(byPod.values());
        if (distinct.length < cfg.minPodsForTdoa) continue;
        if (nowMs - lastAlertMs < 800) continue; // throttle
        const est = solveTdoa(distinct) || solveRssi(distinct);
        if (!est) continue;
        lastAlertMs = nowMs;
        emitAlert(nowMs, distinct, est);
        // consume detections from buffer once solved
        for (const e of distinct) {
          const i = buffer.indexOf(e);
          if (i >= 0) buffer.splice(i, 1);
        }
      }
    }

    function emitAlert(nowMs, detects, est) {
      const sol = detects[0];
      const soldier = cfg.soldierLatLon;
      const bearing = bearingDeg(soldier.lat, soldier.lon, est.lat, est.lon);
      const rangeM = haversineM(soldier.lat, soldier.lon, est.lat, est.lon);
      const bearingByte = P.bearing360ToByte(bearing);
      const distCode = P.distanceCodeFromMeters(rangeM);
      const threat = classifyThreat(sol.band_id, 0);
      const cueId = pickPrimaryCue(bearingByte);
      // residual: distance from each pod's measurement back-projected. For the
      // centroid stub we just use stdev of pod ranges to the estimate.
      const ranges = detects.map(d => haversineM(d.lat, d.lon, est.lat, est.lon));
      const meanR = ranges.reduce((a, b) => a + b, 0) / ranges.length;
      const residual = Math.sqrt(ranges.reduce((a, r) => a + (r - meanR) ** 2, 0) / ranges.length);

      const alert = {
        ts_unix_ms: nowMs,
        event: 'alert',
        target_node_id: 160,       // 0xA0 — first soldier
        bearing_deg: bearingByte,
        distance_code: distCode,
        distance_label: P.DistanceLabels[distCode],
        threat_class: threat,
        threat_label: P.ThreatLabel[threat],
        tti_sec: 0xFF,
        confidence: Math.max(40, Math.min(95, 100 - Math.round(residual / 5))),
        cue_id: cueId,
        cue_label: P.CueTable[cueId] ? P.CueTable[cueId].name : 'UNKNOWN',
        tx_freq_hz: 868300000,
        epoch: 7,
        on_air_ms: 41,
        solve_method: est.method,
        solve_residual_m: Number(residual.toFixed(1)),
        // demo-only — used by UI for map drawing, ignored by parse_log.py
        _emitter_lat: est.lat,
        _emitter_lon: est.lon,
        _range_m: Math.round(rangeM),
        _bearing_deg_real: Number(bearing.toFixed(1)),
        _pods_used: detects.map(d => d.node_id),
      };
      cfg.onEvent(alert);
    }

    return { ingestDetect, tick };
  }

  root.Sim = root.Sim || {};
  root.Sim.makeMasterNode = makeMasterNode;
})(window);
