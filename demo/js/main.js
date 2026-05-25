// main.js — wires the simulators to the UI.
//
// Loop: each tick advances scenario time, moves emitters, polls each pod
// for a detection, feeds the master, lets the master decide whether to
// emit an alert, and routes alerts to both the soldier (audio) and the
// map (red triangulation marker + arrow to soldier).

(function () {
  const SCENARIOS = [
    { id: 'early_warning', url: 'data/scenarios/early_warning.json' },
    { id: 'fpv_incursion', url: 'data/scenarios/fpv_incursion.json' },
    { id: 'gnss_jammer',   url: 'data/scenarios/gnss_jammer.json' },
    { id: 'multi_threat',  url: 'data/scenarios/multi_threat.json' },
  ];
  const TICK_MS = 100;

  let mapUI, pipelineUI, eventLogUI, audioPanel;
  let inspector = null;
  let scenario = null;
  let pods = [];
  let master = null;
  let soldier = null;
  let running = false;
  let tStartMs = 0;
  let tElapsedMs = 0;
  let tickHandle = null;

  function init() {
    mapUI = window.UI.makeMapUI('map');
    pipelineUI = window.UI.makePipelineUI('pipeline');
    eventLogUI = window.UI.makeEventLogUI('event-log');
    soldier = window.Sim.makeSoldierNode({
      lang: 'en',
      onCueStart: (e) => audioPanel.onCueStart(e),
      onCueEnd:   (e) => audioPanel.onCueEnd(e),
    });
    audioPanel = window.UI.makeAudioPanelUI('audio-panel', soldier);

    // Inspector panel + structured DEMO console logging via ?debug=1
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug') && window.UI.makeInspector) {
      inspector = window.UI.makeInspector({
        scenarioGetter: () => scenario,
        soldier,
        getElapsedSimMs: () => tElapsedMs,
        getScale: () => (scenario && scenario.time_scale) || 1,
      });
    }

    // populate scenario picker
    const sel = document.getElementById('scenario-select');
    SCENARIOS.forEach(s => {
      const o = document.createElement('option');
      o.value = s.url;
      o.textContent = s.id;
      sel.appendChild(o);
    });
    sel.onchange = () => loadAndReset(sel.value);

    document.getElementById('btn-play').onclick = () => running ? pause() : play();
    document.getElementById('btn-reset').onclick = () => reset();
    document.getElementById('btn-download').onclick = () => eventLogUI.downloadNdjson();

    loadAndReset(SCENARIOS[0].url);
  }

  async function loadAndReset(url) {
    pause();
    scenario = await window.Sim.loadScenario(url);
    document.getElementById('scenario-desc').textContent = scenario.description || '';
    reset();
  }

  function buildSim() {
    pods = scenario.pods.map(p => window.Sim.makeSensorPod({
      nodeId: p.node_id, label: p.label, lat: p.lat, lon: p.lon,
      bands: p.bands, band: p.band,
      isLive: p.is_live, hasGpsPps: p.has_gps_pps !== false,
      detectThresholdDbm: p.detect_threshold_dbm,
    }));
    master = window.Sim.makeMasterNode({
      soldierLatLon: { lat: scenario.soldier.lat, lon: scenario.soldier.lon },
      onEvent: handleMasterEvent,
    });
  }

  const MESH_HOP_THROTTLE_MS = 350;
  const lastHopByPod = new Map();

  function handleMasterEvent(ev) {
    eventLogUI.append(ev);
    if (inspector) inspector.onEvent(ev);
    if (ev.event === 'detect') {
      pipelineUI.onDetect(ev);
      const pod = scenario.pods.find(p => p.node_id === ev.node_id);
      if (pod) {
        mapUI.pulseRing(pod.lat, pod.lon, '#5fa9ff');
        const now = Date.now();
        const last = lastHopByPod.get(ev.node_id) || 0;
        if (now - last >= MESH_HOP_THROTTLE_MS) {
          lastHopByPod.set(ev.node_id, now);
          if (scenario.c2) {
            // mesh-routed: packet hops to C&C via shortest path
            mapUI.animateMeshHop(ev.node_id);
          } else {
            // no C&C declared: direct sensor -> soldier arrow (legacy scenarios)
            const sLatLon = mapUI.soldierLatLon();
            if (sLatLon) mapUI.loraArrow([pod.lat, pod.lon], sLatLon, '#ffcc66');
          }
        }
      }
    } else if (ev.event === 'alert') {
      pipelineUI.onAlert(ev);
      mapUI.showSolve(ev._emitter_lat, ev._emitter_lon, ev.solve_residual_m, {
        lat: scenario.soldier.lat, lon: scenario.soldier.lon,
      });
      // alert path: C&C -> soldier (direct LoRa downlink on 868.3 MHz)
      const sLatLon = mapUI.soldierLatLon();
      const c2 = mapUI.c2NodeLatLon();
      if (sLatLon && c2) mapUI.loraArrow([c2.lat, c2.lon], sLatLon, '#ff5050');
      else if (sLatLon) mapUI.loraArrow([ev._emitter_lat, ev._emitter_lon], sLatLon, '#ff5050');
      soldier.handleAlert(ev);
    }
  }

  // Each pod transmits a DetectPacket at most once every POD_POLL_MS (200 ms),
  // matching a realistic LoRa duty cycle and avoiding visual smear on a 25-pod
  // mesh. Polls are staggered by node_id so they don't all fire on the same tick.
  const POD_POLL_MS = 200;
  const lastPolledByPod = new Map();
  let tickCounter = 0;

  function tick() {
    const nowMs = Date.now();
    const scale = scenario.time_scale || 1;
    tElapsedMs += TICK_MS * scale;
    tickCounter++;
    const simSec = (tElapsedMs / 1000).toFixed(1);
    const realSec = ((tElapsedMs / scale) / 1000).toFixed(1);
    document.getElementById('clock').textContent =
      scale > 1 ? `sim ${simSec}s (real ${realSec}s · ${scale}×)` : `${simSec} s`;

    // advance emitters, move markers
    const baseUnixUs = tStartMs * 1000;
    for (const em of scenario.emitters) {
      const state = window.Sim.emitterStateAt(em, tElapsedMs, baseUnixUs);
      if (!state) continue;
      const hot = (tElapsedMs >= (em.path[em.path.length - 1].t_ms - 5000));
      mapUI.updateEmitter(em.id, state.lat, state.lon, 0, em.label, hot);
      // each pod polls — throttled with per-pod stagger
      for (let i = 0; i < pods.length; ++i) {
        const pod = pods[i];
        if (!pod.state.bands.includes(state.bandId)) continue;
        const last = lastPolledByPod.get(pod.state.nodeId) || 0;
        const stagger = (pod.state.nodeId * 37) % POD_POLL_MS;
        if (nowMs - last < POD_POLL_MS - stagger / POD_POLL_MS * 50) continue;
        lastPolledByPod.set(pod.state.nodeId, nowMs);
        const ev = pod.poll(nowMs, state);
        if (ev) master.ingestDetect(ev);
      }
    }
    master.tick(nowMs);

    if (tElapsedMs >= scenario.duration_ms) pause();
  }

  function play() {
    if (!scenario) return;
    if (!master) buildSim();
    running = true;
    tStartMs = Date.now() - tElapsedMs;
    document.getElementById('btn-play').textContent = 'Pause';
    tickHandle = setInterval(tick, TICK_MS);
  }
  function pause() {
    running = false;
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    const btn = document.getElementById('btn-play');
    if (btn) btn.textContent = 'Play';
  }
  function reset() {
    pause();
    tElapsedMs = 0;
    lastPolledByPod.clear();
    lastHopByPod.clear();
    document.getElementById('clock').textContent = '0.0 s';
    eventLogUI.clear();
    pipelineUI.reset();
    mapUI.setScenario(scenario);
    mapUI.clearEmitters();
    if (soldier && soldier.flush) soldier.flush();
    buildSim();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
