// ui.js — the on-map data panels: threat card (bottom-right), transcript
// (bottom-left), status banner, phase + clock readouts. Text is kept minimal;
// the voice is the narrator, these panels are the glanceable backup.
window.UI = (function () {
  const C = window.CFG;
  const $ = id => document.getElementById(id);

  function fmtAcc(m) {
    if (m < 1) return Math.round(m * 100) + ' cm';
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(1) + ' km';
  }

  function setThreatCard(fix) {
    const card = $('threat-card');
    if (!fix) {
      card.classList.remove('active', 'degraded');
      card.innerHTML = '<div class="tc-head">NO CONTACT</div><div class="tc-sub">network passive &middot; listening</div>';
      return;
    }
    const degraded = fix.mode === 'DEGRADED';
    card.classList.toggle('active', !degraded);
    card.classList.toggle('degraded', degraded);
    const tti = fix.tti_sec != null ? fix.tti_sec + ' s' : '--';
    card.innerHTML =
      '<div class="tc-head">DRONE-001 <span class="tc-mode">' + fix.mode + '</span></div>' +
      row('CONFIDENCE', fix.confidence + '%') +
      row('RANGE', fix.rangeKm.toFixed(1) + ' km') +
      row('BEARING', String(fix.bearing).padStart(3, '0') + '°') +
      row('VELOCITY', fix.speedKmh ? Math.round(fix.speedKmh) + ' km/h' : '--') +
      row('ACCURACY', fmtAcc(fix.accuracyM)) +
      row('SOLVE', fix.solveMethod.toUpperCase()) +
      row('TTI', tti);
  }
  function row(k, v) {
    return '<div class="tc-row"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  let lines = [];
  function appendTranscript(text, kind) {
    const t = new Date();
    const ts = String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0');
    lines.push({ ts, text, kind: kind || 'status' });
    lines = lines.slice(-5);
    $('transcript').innerHTML = lines.map(l =>
      '<div class="tr-row ' + l.kind + '"><span class="tr-ts">' + l.ts + '</span>' + l.text + '</div>').join('');
  }
  function clearTranscript() { lines = []; $('transcript').innerHTML = ''; }

  function setBanner(text, kind) {
    const b = $('banner');
    if (!text) { b.className = 'banner'; b.textContent = ''; return; }
    b.className = 'banner show ' + (kind || '');
    b.textContent = text;
  }

  function setPhase(label, idx, total) {
    $('phase-label').textContent = label;
    $('phase-progress').textContent = idx + ' / ' + total;
  }
  function setClock(sec) {
    $('clock').textContent = sec.toFixed(0) + ' s';
  }

  return { setThreatCard, appendTranscript, clearTranscript, setBanner, setPhase, setClock };
})();
