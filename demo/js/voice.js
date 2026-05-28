// voice.js — narration via the browser's built-in speechSynthesis (offline,
// no audio assets). Every spoken line is mirrored to the transcript panel.
window.VOICE = (function () {
  const C = window.CFG;
  const synth = window.speechSynthesis || null;
  let muted = false;
  let rate = 1.0;
  let voice = null;
  let onLine = function () {};

  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    // Prefer an English voice; fall back to whatever exists.
    voice = vs.find(v => /en[-_]GB/i.test(v.lang)) ||
            vs.find(v => /^en/i.test(v.lang)) || vs[0] || null;
  }
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  // Unlock the synthesis engine — must run inside a user gesture (Chrome blocks
  // speech until then). Speaking a silent utterance primes it.
  let unlocked = false;
  function unlock() {
    if (!synth || unlocked) return;
    unlocked = true;
    try {
      synth.resume();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch (e) { /* no-op */ }
  }

  // Speak a line. `kind` tags the transcript row (status | alert | warn).
  function say(text, kind) {
    onLine(text, kind || 'status');
    if (!synth || muted) return;
    try {
      // recover from the Chrome "stuck after cancel()" state
      if (synth.paused) synth.resume();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1.0;
      u.volume = 1.0;
      synth.speak(u);
    } catch (e) { /* no-op */ }
  }

  function cancel() { if (synth) { try { synth.cancel(); } catch (e) { /* no-op */ } } }

  function setMuted(m) {
    muted = !!m;
    if (muted) cancel();
  }
  function setRate(r) { rate = r; }
  function setOnLine(fn) { onLine = fn || function () {}; }
  function available() { return !!synth; }

  return { say, cancel, unlock, setMuted, setRate, setOnLine, available };
})();
