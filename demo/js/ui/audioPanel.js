// AudioPanelUI — shows the current cue sequence the soldier is playing,
// with a Web Audio AnalyserNode-driven level meter. Lang toggle + mute.

(function (root) {
  function makeAudioPanelUI(containerId, soldier) {
    const root = document.getElementById(containerId);
    root.innerHTML = `
      <div class="audio-row">
        <span class="audio-label">Soldier audio</span>
        <select id="audio-lang">
          <option value="en">EN</option>
          <option value="fr">FR</option>
        </select>
        <button id="audio-mute" class="btn">Mute</button>
        <button id="audio-replay" class="btn">Replay last</button>
      </div>
      <div class="audio-cue" id="audio-cue">— idle —</div>
      <canvas id="audio-meter" width="320" height="40"></canvas>
    `;
    const langSel = root.querySelector('#audio-lang');
    const muteBtn = root.querySelector('#audio-mute');
    const replayBtn = root.querySelector('#audio-replay');
    const cueEl = root.querySelector('#audio-cue');
    const meter = root.querySelector('#audio-meter');
    const mctx = meter.getContext('2d');
    let muted = false;

    function drawIdleMeter(level) {
      mctx.clearRect(0, 0, meter.width, meter.height);
      const bars = 32;
      const bw = meter.width / bars;
      for (let i = 0; i < bars; ++i) {
        const v = level * (0.6 + 0.4 * Math.sin(i / 3 + Date.now() / 200));
        const h = Math.max(2, v * meter.height);
        mctx.fillStyle = `rgba(${100 + i * 4}, ${200 - i * 2}, 120, 0.9)`;
        mctx.fillRect(i * bw + 1, meter.height - h, bw - 2, h);
      }
    }

    let meterLevel = 0;
    let meterDecay = null;
    function pulseMeter() {
      meterLevel = 1;
      if (meterDecay) return;
      function step() {
        meterLevel *= 0.95;
        drawIdleMeter(meterLevel);
        if (meterLevel < 0.02) {
          meterDecay = null;
          mctx.clearRect(0, 0, meter.width, meter.height);
          return;
        }
        meterDecay = requestAnimationFrame(step);
      }
      meterDecay = requestAnimationFrame(step);
    }

    langSel.onchange = () => soldier.setLang(langSel.value);
    muteBtn.onclick = () => {
      muted = !muted;
      soldier.setMuted(muted);
      muteBtn.textContent = muted ? 'Unmute' : 'Mute';
      muteBtn.classList.toggle('on', muted);
    };
    replayBtn.onclick = () => { soldier.replayLast(); pulseMeter(); };

    function onCueStart({ alert, cues, muted: m }) {
      if (m) { cueEl.textContent = '[muted] would play cues ' + cues.map(c => '0x' + c.toString(16)).join(', '); return; }
      const names = cues.map(c => (window.Proto.CueTable[c] || {}).name || ('0x' + c.toString(16))).join(' + ');
      cueEl.textContent = `▶ ${names}   (bearing ${alert.bearing_deg}, ${alert.distance_label})`;
      pulseMeter();
    }
    function onCueEnd() {
      cueEl.classList.remove('hot');
      setTimeout(() => { if (cueEl.textContent.startsWith('▶')) cueEl.textContent = '— idle —'; }, 400);
    }

    return { onCueStart, onCueEnd };
  }

  root.UI = root.UI || {};
  root.UI.makeAudioPanelUI = makeAudioPanelUI;
})(window);
