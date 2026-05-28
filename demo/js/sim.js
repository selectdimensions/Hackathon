// sim.js — turns a drone position into a fix: which pods hear it, how tight the
// localization is, confidence, bearing and range. Pure function of inputs, so
// the phase engine stays simple and the numbers are reproducible.
window.SIM = (function () {
  const C = window.CFG;
  const G = window.GEO;

  function nearest(pods, en, n) {
    return pods
      .map(p => ({ p, d: G.distM(p.en, en) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map(x => x.p);
  }

  // Evaluate the network's picture of the drone.
  //   droneEN : {eastM, northM} true position
  //   layout  : from LAYOUT.build()
  //   opts    : { jammed:bool, speedKmh:number }
  function evaluate(droneEN, layout, opts) {
    opts = opts || {};
    const reals = layout.reals;
    const detecting = reals.filter(p => G.distM(p.en, droneEN) <= C.detectRangeM);
    const nDetect = detecting.length;
    const ref = layout.soldier.en;                 // operator we protect
    const rangeM = G.distM(ref, droneEN);
    const bearing = Math.round(G.bearingDeg(ref, droneEN));

    let accuracyM, confidence, mode, solveMethod;
    if (opts.jammed) {
      accuracyM = C.accJamM;
      confidence = 35;
      mode = 'DEGRADED';
      solveMethod = 'offline';
    } else if (nDetect < 3) {
      // too few pods for a fix — coarse RSSI bearing only
      accuracyM = C.accCoarseM;
      confidence = Math.max(40, 40 + nDetect * 6);
      mode = 'ACTIVE';
      solveMethod = 'rssi_lsq';
    } else {
      // Geometry-driven lock: the fix tightens as the drone is surrounded by
      // close pods. Use distance to the 4th-nearest pod as the dilution proxy.
      const dists = detecting.map(p => G.distM(p.en, droneEN)).sort((a, b) => a - b);
      const d4 = dists[3];
      // d4 ~= grid spacing when the drone is inside the dense mesh -> full lock.
      const lock = Math.max(0, Math.min(1, (3200 - d4) / (3200 - 1200)));
      accuracyM = C.accCoarseM * Math.pow(C.accFineM / C.accCoarseM, lock);
      confidence = Math.min(98, 40 + nDetect * 6);
      mode = 'ACTIVE';
      solveMethod = 'tdoa';
    }

    return {
      detecting,
      active: nearest(detecting, droneEN, 4),       // 4 pods doing the geometry
      nDetect,
      bearing,
      rangeM,
      rangeKm: rangeM / 1000,
      accuracyM,
      confidence,
      mode,
      solveMethod,
      speedKmh: opts.speedKmh || 0,
      fixEN: { ...droneEN },                         // cone conveys uncertainty
    };
  }

  // Build a log_format.md-compatible alert event for export / the threat card.
  function alertEvent(fix, nowMs) {
    const distCode = fix.rangeM < 1000 ? 5 : 6;
    return {
      ts_unix_ms: nowMs,
      event: 'alert',
      target_node_id: 0xA0,
      bearing_deg: fix.bearing,
      distance_code: distCode,
      distance_label: fix.rangeKm.toFixed(1) + ' km',
      threat_class: 1,
      threat_label: 'FPV DRONE',
      tti_sec: fix.speedKmh > 0 ? Math.round(fix.rangeM / (fix.speedKmh / 3.6)) : null,
      confidence: fix.confidence,
      solve_method: fix.solveMethod,
      solve_residual_m: Number(fix.accuracyM.toFixed(2)),
      on_air_ms: 41,
      epoch: 7,
    };
  }

  return { evaluate, alertEvent };
})();
