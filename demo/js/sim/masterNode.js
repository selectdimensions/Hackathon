// MasterNode — collects DetectPacket-shaped events from sensor pods,
// localises emitters via weighted RSSI least-squares (Gauss-Newton), and
// emits AlertPacket-shaped events. JSON shape matches DataAnalysisLog/
// log_format.md v1 exactly.
//
// solveRssiMultilat is the primary solver — proper multilateration. The
// centroid stubs (solveTdoa, solveRssi) mirror triangulate.py and remain
// as fallbacks for parity with the Python harness.

(function (root) {
  const P = window.Proto;
  const { haversineM, bearingDeg } = window.Geo;

  // Per-band path-loss constants used to invert RSSI -> range_m.
  // Forward model lives in demo/js/sim/sensorPod.js:rssiAtRangeDbm.
  // L0 = 40 in both directions.
  const BAND_PATHLOSS = {
    [P.BandId.BAND_5800_MHZ]:    { txPower: 27, n: 2.2 },
    [P.BandId.BAND_2400_MHZ]:    { txPower: 27, n: 2.3 },
    [P.BandId.BAND_GNSS_L1]:     { txPower: 30, n: 2.5 },
    [P.BandId.BAND_433_915_MHZ]: { txPower: 23, n: 2.6 },
    [P.BandId.BAND_30_88_MHZ]:   { txPower: 25, n: 2.5 },
  };

  // Primary solver. Hyperbolic-linearisation least squares on inverse-path-loss
  // ranges: subtract the closest pod's range-equation from each other pod to
  // get a linear system in (x, y), then solve the 2x2 normal equations.
  // Robust at long range (where geometric dilution makes plain Gauss-Newton
  // stall in the initial-guess basin).
  function solveRssiMultilat(events, bandId) {
    if (events.length < 3) return null;
    const p = BAND_PATHLOSS[bandId] || { txPower: 23, n: 2.5 };
    // Project to flat-earth ENU around the events' mean lat/lon.
    const lat0 = events.reduce((a, e) => a + e.lat, 0) / events.length;
    const lon0 = events.reduce((a, e) => a + e.lon, 0) / events.length;
    const cosLat = Math.cos(lat0 * Math.PI / 180);
    const pods = events.map(ev => ({
      e: (ev.lon - lon0) * 111320 * cosLat,
      n: (ev.lat - lat0) * 111132,
      r: Math.pow(10, (p.txPower - 40 - ev.rssi_dbm) / (10 * p.n)),
    }));
    // Use the strongest-RSSI pod (smallest estimated range) as reference.
    pods.sort((a, b) => a.r - b.r);
    const p0 = pods[0];
    const k0 = p0.e * p0.e + p0.n * p0.n;
    let A = 0, B = 0, C = 0, bx = 0, by = 0;  // [A B; B C] = M^T M
    for (let i = 1; i < pods.length; ++i) {
      const pi = pods[i];
      const ae = 2 * (pi.e - p0.e);
      const an = 2 * (pi.n - p0.n);
      const rhs = p0.r * p0.r - pi.r * pi.r + (pi.e * pi.e + pi.n * pi.n) - k0;
      A += ae * ae;
      B += ae * an;
      C += an * an;
      bx += ae * rhs;
      by += an * rhs;
    }
    const det = A * C - B * B;
    if (!isFinite(det) || Math.abs(det) < 1e-9) return null;
    let e = (C * bx - B * by) / det;
    let n = (-B * bx + A * by) / det;
    if (!isFinite(e) || !isFinite(n)) return null;
    // Refine with up to 5 Gauss-Newton iterations on the original (non-linearised)
    // range residuals. The linear LS initial guess puts us well inside the basin.
    for (let iter = 0; iter < 5; ++iter) {
      let GA = 0, GB = 0, GC = 0, gx = 0, gy = 0;
      for (const pod of pods) {
        const de = e - pod.e;
        const dn = n - pod.n;
        const d = Math.hypot(de, dn) || 1e-6;
        const Je = de / d;
        const Jn = dn / d;
        const f = d - pod.r;
        GA += Je * Je;
        GB += Je * Jn;
        GC += Jn * Jn;
        gx += Je * f;
        gy += Jn * f;
      }
      const gdet = GA * GC - GB * GB;
      if (!isFinite(gdet) || Math.abs(gdet) < 1e-12) break;
      const se = -( GC * gx - GB * gy) / gdet;
      const sn = -(-GB * gx + GA * gy) / gdet;
      e += se;
      n += sn;
      if (Math.abs(se) + Math.abs(sn) < 0.01) break;
    }
    return {
      lat: lat0 + n / 111132,
      lon: lon0 + e / (111320 * cosLat),
      method: 'rssi_lsq',
    };
  }

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
    // per-band state for "alert when km bucket changes" rule
    const lastAlertedByBand = new Map();  // band_id -> { km, bearingByte, ms }
    // per-band recent solve history for closing-speed (tti_sec) estimation
    const solveHistoryByBand = new Map(); // band_id -> [{ lat, lon, rangeM, ms }]

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
        const est = solveRssiMultilat(distinct, bandId) || solveTdoa(distinct) || solveRssi(distinct);
        if (!est) continue;
        maybeEmitAlert(nowMs, bandId, distinct, est);
        // consume detections from buffer once solved
        for (const e of distinct) {
          const i = buffer.indexOf(e);
          if (i >= 0) buffer.splice(i, 1);
        }
      }
    }

    // Fire an alert only when the situation has materially changed: km bucket
    // crossed, bearing shifted > ~15°, or a fallback heartbeat after 4 s.
    function maybeEmitAlert(nowMs, bandId, detects, est) {
      const soldier = cfg.soldierLatLon;
      const bearing = bearingDeg(soldier.lat, soldier.lon, est.lat, est.lon);
      const rangeM = haversineM(soldier.lat, soldier.lon, est.lat, est.lon);
      const bearingByte = P.bearing360ToByte(bearing);
      const km = Math.max(1, Math.min(10, Math.round(rangeM / 1000)));
      const last = lastAlertedByBand.get(bandId);
      const kmChanged = !last || last.km !== km;
      const bearingDelta = last ? Math.abs(((bearingByte - last.bearingByte + 128) & 0xFF) - 128) : 999;
      const heartbeat = !last || (nowMs - last.ms) > 4000;
      const debounceOk = !last || (nowMs - last.ms) > 400;
      if (!debounceOk) return;
      if (!(kmChanged || bearingDelta > 11 || heartbeat)) return;
      lastAlertedByBand.set(bandId, { km, bearingByte, ms: nowMs });
      lastAlertMs = nowMs;
      emitAlert(nowMs, detects, est, bearing, rangeM, bearingByte);
    }

    function emitAlert(nowMs, detects, est, bearing, rangeM, bearingByte) {
      const sol = detects[0];
      const distCode = P.distanceCodeFromMeters(rangeM);
      // Closing-speed estimate from recent solve history (per band).
      // Positive closing means range is decreasing; tti_sec = range / max(closing, 1).
      // If too little history or emitter is stationary/receding, return 0xFF (unknown).
      const hist = solveHistoryByBand.get(sol.band_id) || [];
      hist.push({ rangeM, ms: nowMs });
      while (hist.length > 5) hist.shift();
      solveHistoryByBand.set(sol.band_id, hist);
      let ttiSec = 0xFF;
      if (hist.length >= 2) {
        const oldest = hist[0];
        const dtSec = (nowMs - oldest.ms) / 1000;
        const closingMs = (oldest.rangeM - rangeM) / Math.max(dtSec, 0.1);
        if (closingMs > 0.5 && rangeM > 0) {
          ttiSec = Math.min(254, Math.max(0, Math.round(rangeM / closingMs)));
        }
      }
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
        tti_sec: ttiSec,
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
