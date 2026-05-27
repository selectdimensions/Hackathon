// InspectorUI — live state readout for ?debug=1. Helps an LLM (or human
// reviewer) see exactly what the demo thinks is happening at any instant:
// emitter ground truth, master estimate, error, bearing, range, audio queue
// depth, last cue. A [snapshot] button dumps full state + last 200 events
// to a downloadable JSON file.

(function (root) {
  function makeInspector(opts) {
    // opts: {scenarioGetter, mapUI, soldier, getElapsedSimMs, getScale}
    const div = document.createElement('div');
    div.id = 'inspector';
    div.innerHTML = `
      <header class="insp-h">inspector <span id="insp-toggle">[hide]</span></header>
      <div id="insp-body">
        <pre id="insp-text">loading…</pre>
        <button id="insp-snap" class="btn">⬇ snapshot</button>
      </div>
    `;
    document.body.appendChild(div);

    const text = div.querySelector('#insp-text');
    const body = div.querySelector('#insp-body');
    const toggle = div.querySelector('#insp-toggle');
    toggle.onclick = () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      toggle.textContent = hidden ? '[hide]' : '[show]';
    };

    const recent = [];   // last 200 events (canonical ndjson)
    let lastSolve = null; // most recent alert event
    let lastDetectCount = 0;

    function onEvent(ev) {
      const canonical = {};
      for (const k of Object.keys(ev)) if (!k.startsWith('_')) canonical[k] = ev[k];
      recent.push(canonical);
      if (recent.length > 200) recent.shift();
      if (ev.event === 'alert') lastSolve = ev;
      if (ev.event === 'detect') lastDetectCount++;
      // structured DEMO log line — greppable for headless capture
      try { console.log('[DEMO]', JSON.stringify(ev)); } catch (_) {}
    }

    function emitterTruth() {
      const sc = opts.scenarioGetter();
      if (!sc) return null;
      const tMs = opts.getElapsedSimMs();
      const out = [];
      for (const em of (sc.emitters || [])) {
        const state = window.Sim.emitterStateAt(em, tMs, 0);
        if (!state) continue;
        out.push({ id: em.id, label: em.label, lat: state.lat, lon: state.lon, band: em.band });
      }
      return out;
    }

    function bearingDeg(lat1, lon1, lat2, lon2) {
      const { bearingDeg: b } = window.Geo;
      return b(lat1, lon1, lat2, lon2);
    }
    function haversineM(lat1, lon1, lat2, lon2) {
      return window.Geo.haversineM(lat1, lon1, lat2, lon2);
    }

    function render() {
      const sc = opts.scenarioGetter();
      if (!sc) { text.textContent = 'no scenario'; return; }
      const scale = opts.getScale ? opts.getScale() : 1;
      const elapsedSim = opts.getElapsedSimMs();
      const elapsedReal = elapsedSim / scale;
      const truths = emitterTruth() || [];
      const soldierLL = { lat: sc.soldier.lat, lon: sc.soldier.lon };
      const lines = [];
      lines.push(`scenario  : ${sc.id}`);
      lines.push(`t_sim     : ${(elapsedSim/1000).toFixed(1)} s   t_real ${(elapsedReal/1000).toFixed(1)} s   x${scale}`);
      lines.push(`pods      : ${sc.pods.length}   c2: ${sc.c2 ? sc.c2.label : '-'}`);
      lines.push(`detects   : ${lastDetectCount}`);
      lines.push('');
      for (const t of truths) {
        const rng = haversineM(soldierLL.lat, soldierLL.lon, t.lat, t.lon);
        const brg = bearingDeg(soldierLL.lat, soldierLL.lon, t.lat, t.lon);
        lines.push(`truth.${t.id}`);
        lines.push(`  lat,lon = ${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`);
        lines.push(`  range   = ${rng.toFixed(0)} m   bearing ${brg.toFixed(1)}°`);
      }
      lines.push('');
      if (lastSolve) {
        const a = lastSolve;
        let err = '-';
        if (truths.length) {
          const t = truths[0];
          err = haversineM(a._emitter_lat, a._emitter_lon, t.lat, t.lon).toFixed(0) + ' m';
        }
        lines.push(`solve.last`);
        lines.push(`  method  = ${a.solve_method}   residual ${a.solve_residual_m} m   err_vs_truth ${err}`);
        lines.push(`  est     = ${a._emitter_lat.toFixed(5)}, ${a._emitter_lon.toFixed(5)}`);
        lines.push(`  range   = ${a._range_m} m   bearing_byte ${a.bearing_deg} (${a._bearing_deg_real}°)`);
        lines.push(`  km_cue  = 0x${a.cue_id.toString(16)} ${a.cue_label}`);
        lines.push(`  tti     = ${a.tti_sec === 255 ? 'unknown' : a.tti_sec + ' s'}   confidence ${a.confidence}`);
      } else {
        lines.push('solve.last = (no alerts yet)');
      }
      lines.push('');
      const q = opts.soldier && opts.soldier.queueDepth !== undefined ? opts.soldier.queueDepth : '-';
      lines.push(`audio.queue = ${q} / 12`);
      text.textContent = lines.join('\n');
    }

    function snapshot() {
      const sc = opts.scenarioGetter();
      const data = {
        scenario_id: sc ? sc.id : null,
        captured_at: new Date().toISOString(),
        elapsed_sim_ms: opts.getElapsedSimMs(),
        time_scale: opts.getScale ? opts.getScale() : 1,
        emitter_truth: emitterTruth(),
        last_alert: lastSolve,
        recent_events: recent.slice(),
        audio_queue_depth: opts.soldier && opts.soldier.queueDepth !== undefined ? opts.soldier.queueDepth : null,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `demo_snapshot_${sc ? sc.id : 'unknown'}_${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    div.querySelector('#insp-snap').onclick = snapshot;

    // ~5 Hz live refresh
    const handle = setInterval(render, 200);
    return { onEvent, render, snapshot, dispose: () => clearInterval(handle) };
  }

  root.UI = root.UI || {};
  root.UI.makeInspector = makeInspector;
})(window);
