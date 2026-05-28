// app.js — orchestrates the 3-minute demo: phase engine, tick loop, controls.
// Reveals information slowly and lets the voice narrate; the operator can pause,
// step phases, toggle layers, mute, and change speed.
(function () {
  const C = window.CFG, G = window.GEO, S = window.SCENARIO, V = window.VOICE;
  const TICK = 100;                       // ms

  const PHASES = [
    { key: 'setup',    label: 'SETUP — coverage established' },
    { key: 'launch',   label: 'LAUNCH — threat detected' },
    { key: 'track',    label: 'TRACK — tracking target' },
    { key: 'jam',      label: 'JAM — under attack' },
    { key: 'recovery', label: 'RECOVERY — lock restored' },
  ];

  let map, layout;
  let idx = 0, elapsed = 0, running = false, speed = 1, muted = false, timer = null;
  let prevEN = null, lastCallout = 0, totalClock = 0, voiceReady = false;

  function phase() { return PHASES[idx]; }
  function dur() { return C.phases[phase().key]; }

  function droneState() {
    const k = phase().key;
    if (k === 'setup') return { en: S.launch, airborne: false };
    if (k === 'launch') return { en: S.launch, airborne: true };
    if (k === 'track') return { en: S.posAt(elapsed / dur()), airborne: true };
    // jam + recovery: hold at end of path (bearing down on the operator)
    return { en: S.posAt(1), airborne: true };
  }

  function kindFor(key) { return key === 'jam' ? 'warn' : (key === 'launch' ? 'alert' : 'status'); }

  function narrate() {
    const key = phase().key;
    V.cancel();
    S.narration[key].forEach(line => V.say(line, kindFor(key)));
  }

  // Set up a phase's visuals only (no audio) — safe to call before any gesture.
  function setupPhase(i) {
    idx = i; elapsed = 0; lastCallout = 0; prevEN = null;
    const ph = phase();
    UI.setPhase(ph.label, i + 1, PHASES.length);
    if (ph.key === 'setup') { UI.setBanner(''); UI.setThreatCard(null); map.clearTrail(); map.clearCone(); map.clearTriangulation(); }
    if (ph.key === 'launch' || ph.key === 'track') UI.setBanner('');
    if (ph.key === 'jam') UI.setBanner('JAM ACTIVE — MESH OFFLINE', 'warn');
    if (ph.key === 'recovery') UI.setBanner('RE-SYNC — LOCK RESTORED', 'ok');
    safeRender(true);
  }

  // Enter a phase: visuals + narration (used by auto-advance and Next).
  function enterPhase(i) { setupPhase(i); voiceReady = true; narrate(); }

  function render(force) {
    const ds = droneState();
    const jammed = phase().key === 'jam';

    // velocity from position delta
    let speedKmh = 0;
    if (prevEN && ds.airborne) {
      const d = G.distM(prevEN, ds.en);
      speedKmh = (d / (TICK / 1000 * speed)) * 3.6;
    }
    prevEN = ds.airborne ? ds.en : null;

    if (!ds.airborne) {
      map.updateDrone(ds.en, false, false);
      map.clearCone(); map.clearTriangulation();
      UI.setThreatCard(null);
      return;
    }

    const fix = SIM.evaluate(ds.en, layout, { jammed, speedKmh });
    const hot = fix.rangeM < 3000 || jammed;   // flare red as it bears down / under jam
    map.updateDrone(ds.en, hot, true);
    if (phase().key === 'track') map.pushTrail(ds.en);

    if (jammed) {
      map.showBearingWedge(layout.soldier.en, fix.bearing, 18, 3500, C.color.caution);
      map.clearTriangulation();
    } else {
      const coneColor = fix.accuracyM < 5 ? C.color.real : C.color.accent;
      map.showCone(fix.fixEN, fix.accuracyM, coneColor);
      map.showTriangulation(fix.active, fix.fixEN);
    }

    fix.tti_sec = SIM.alertEvent(fix, Date.now()).tti_sec;
    UI.setThreatCard(fix);

    // periodic spoken callout during track
    if (phase().key === 'track' && (elapsed - lastCallout) >= 22) {
      lastCallout = elapsed;
      V.say('Bearing ' + String(fix.bearing).padStart(3, '0') + ', range ' + fix.rangeKm.toFixed(1) +
            ' kilometres, accuracy ' + (fix.accuracyM < 1 ? Math.round(fix.accuracyM * 100) + ' centimetres' : Math.round(fix.accuracyM) + ' metres') + '.', 'status');
    }
  }

  // Render guarded so a draw hiccup can never freeze the phase engine.
  function safeRender(force) { try { render(force); } catch (e) { console.error('render', e); } }

  function tick() {
    elapsed += (TICK / 1000) * speed;
    totalClock += (TICK / 1000) * speed;
    UI.setClock(totalClock);
    // advance BEFORE render so progression is independent of draw success
    if (elapsed >= dur()) {
      if (idx < PHASES.length - 1) { enterPhase(idx + 1); return; }
      stopTimer(); V.say('End of demonstration.', 'status'); return;
    }
    safeRender(false);
  }

  function btn() { return document.getElementById('btn-play'); }
  function startTimer() {
    if (timer) return;
    running = true; btn().textContent = 'Pause';
    timer = setInterval(tick, TICK);
  }
  function stopTimer() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    const b = btn(); if (b) b.textContent = 'Play';
  }

  function play() {
    if (timer) return;                                   // idempotent while running
    V.unlock();
    if (!voiceReady) { voiceReady = true; narrate(); }  // first audio rides this user gesture
    startTimer();
  }
  function pause() { stopTimer(); V.cancel(); }
  function togglePlay() { running ? pause() : play(); }
  // Always advance AND keep playing — a presenter clicking Next expects the
  // next section to start, whether or not it was paused.
  function next() {
    V.unlock();
    if (idx >= PHASES.length - 1) return;
    enterPhase(idx + 1);
    startTimer();
  }
  function restart() {
    V.unlock();
    stopTimer(); V.cancel();
    totalClock = 0; UI.setClock(0); UI.clearTranscript();
    voiceReady = false; setupPhase(0);   // silent until the next Play
  }

  function wireControls() {
    document.getElementById('btn-play').onclick = togglePlay;
    document.getElementById('btn-next').onclick = next;
    document.getElementById('btn-restart').onclick = restart;
    const mute = document.getElementById('btn-mute');
    mute.onclick = () => { muted = !muted; V.setMuted(muted); mute.classList.toggle('on', muted); mute.textContent = muted ? 'Unmute' : 'Mute'; };
    const sp = document.getElementById('speed');
    sp.oninput = () => { speed = parseFloat(sp.value); V.setRate(Math.min(1.4, speed)); document.getElementById('speed-val').textContent = speed.toFixed(1) + 'x'; };
    document.querySelectorAll('.layer-toggle').forEach(cb => {
      cb.onchange = () => {
        if (cb.dataset.layer === 'transcript') document.getElementById('transcript').style.display = cb.checked ? '' : 'none';
        else map.setLayer(cb.dataset.layer, cb.checked);
      };
      // apply initial state
      if (cb.dataset.layer && cb.dataset.layer !== 'transcript') map.setLayer(cb.dataset.layer, cb.checked);
    });
  }

  function init() {
    layout = LAYOUT.build();
    map = MAP.create('map');
    map.setNetwork(layout);
    V.setOnLine(UI.appendTranscript);
    if (!V.available()) UI.appendTranscript('Voice unavailable in this browser; transcript only.', 'warn');
    // unlock the speech engine on the first user gesture (Chrome autoplay policy)
    document.addEventListener('pointerdown', () => V.unlock(), { once: true });
    wireControls();
    setupPhase(0);   // visuals only; narration begins on first Play

    // Capture hook: lets the recorder start the run at a precise, measured moment.
    window.__startDemo = play;
    window.__phaseDurations = C.phases;

    // Capture mode: ?auto=1[&speed=N] self-runs the whole demo (for recording).
    const params = new URLSearchParams(location.search);
    if (params.get('auto') === '1') {
      const sp = parseFloat(params.get('speed'));
      if (sp > 0) {
        speed = sp;
        const el = document.getElementById('speed'); if (el) el.value = String(sp);
        document.getElementById('speed-val').textContent = sp.toFixed(1) + 'x';
        V.setRate(Math.min(1.4, sp));
      }
      setTimeout(play, 1800);   // let map tiles settle, then auto-run
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
