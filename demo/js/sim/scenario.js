// Scenario — canned drone incursion timeline. Each scenario JSON declares
// an anchor lat/lon, pod + soldier ENU positions, and one or more emitters
// whose positions follow piecewise-linear paths over time.

(function (root) {
  const { offsetToLatLon } = window.Geo;

  async function loadScenario(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('scenario fetch ' + url + ' -> ' + r.status);
    const raw = await r.json();
    return resolve(raw);
  }

  function resolve(raw) {
    const anchor = raw.anchor;
    const pods = raw.pods.map(p => ({
      ...p,
      ...offsetToLatLon(anchor, p.eastM, p.northM),
    }));
    const soldier = {
      ...raw.soldier,
      ...offsetToLatLon(anchor, raw.soldier.eastM, raw.soldier.northM),
    };
    const emitters = raw.emitters.map(e => ({
      ...e,
      path: e.path.map(wp => ({
        t_ms: wp.t_ms,
        ...offsetToLatLon(anchor, wp.eastM, wp.northM),
      })),
    }));
    return { ...raw, anchor, pods, soldier, emitters };
  }

  // Interpolate an emitter's position at scenario time t_ms.
  function emitterStateAt(emitter, tMs, baseUnixUs) {
    const path = emitter.path;
    if (!path.length) return null;
    if (tMs <= path[0].t_ms) return Object.assign({}, path[0], _emitterFields(emitter, baseUnixUs, tMs));
    if (tMs >= path[path.length - 1].t_ms) return Object.assign({}, path[path.length - 1], _emitterFields(emitter, baseUnixUs, tMs));
    for (let i = 1; i < path.length; ++i) {
      if (tMs <= path[i].t_ms) {
        const a = path[i - 1], b = path[i];
        const u = (tMs - a.t_ms) / (b.t_ms - a.t_ms);
        return {
          lat: a.lat + (b.lat - a.lat) * u,
          lon: a.lon + (b.lon - a.lon) * u,
          ..._emitterFields(emitter, baseUnixUs, tMs),
        };
      }
    }
    return null;
  }

  function _emitterFields(emitter, baseUnixUs, tMs) {
    return {
      id: emitter.id,
      label: emitter.label,
      bandId: emitter.band,
      threatClass: emitter.threat_class,
      txPowerDbm: emitter.tx_power_dbm,
      pathLossN: emitter.path_loss_n,
      freqHopper: !!emitter.freq_hopper,
      emitUnixUs: Math.floor(baseUnixUs + tMs * 1000),
    };
  }

  root.Sim = root.Sim || {};
  root.Sim.loadScenario = loadScenario;
  root.Sim.emitterStateAt = emitterStateAt;
})(window);
