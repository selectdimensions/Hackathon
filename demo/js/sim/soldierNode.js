// SoldierNode — receives AlertPacket-shaped events from master, picks
// cue_ids per the fine-grained MP3 range, and plays the corresponding
// AudioClips/<lang>/*.mp3 sequence via the Web Audio API.
//
// Concatenation strategy: schedule each clip as an AudioBufferSourceNode
// back-to-back. No MP3 stream stitching needed — the AudioContext clock
// gives gapless playback.

(function (root) {
  const P = window.Proto;

  function makeSoldierNode(opts) {
    const cfg = Object.assign({
      lang: 'en',
      onCueStart: () => {},
      onCueEnd: () => {},
    }, opts);

    let ctx = null;
    const bufferCache = new Map(); // url -> AudioBuffer
    let muted = false;
    let lastAlert = null;
    let activeSources = []; // in-flight AudioBufferSourceNodes — cancelled on next alert

    function ensureCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    async function loadBuffer(url) {
      if (bufferCache.has(url)) return bufferCache.get(url);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('fetch ' + url + ' -> ' + resp.status);
      const data = await resp.arrayBuffer();
      const buf = await ensureCtx().decodeAudioData(data);
      bufferCache.set(url, buf);
      return buf;
    }

    function pickCueSequence(alert) {
      // Speak heading + km using the fine-grained MP3 range.
      const headingCue = alert.cue_id;  // master already picked the heading
      const km = Math.max(1, Math.min(10, Math.round((alert._range_m || 0) / 1000) || 1));
      const kmCue = P.CueId.CUE_KM_01 + (km - 1);
      return [headingCue, kmCue];
    }

    function cancelActive() {
      for (const s of activeSources) { try { s.stop(); } catch (_) {} }
      activeSources = [];
    }

    async function handleAlert(alert) {
      lastAlert = alert;
      if (muted) {
        cfg.onCueStart({ alert, cues: [], muted: true });
        return;
      }
      ensureCtx();
      cancelActive();
      const cues = pickCueSequence(alert);
      const urls = cues.map(c => P.cueAssetUrl(c, cfg.lang)).filter(Boolean);
      if (!urls.length) return;
      cfg.onCueStart({ alert, cues });
      try {
        const buffers = await Promise.all(urls.map(loadBuffer));
        // alert may have been superseded while we were decoding; stale handler
        // would still cancel us via cancelActive on the next call, but bail
        // early to avoid scheduling sources we'll immediately stop.
        if (alert !== lastAlert) return;
        let t = ctx.currentTime + 0.05;
        const mine = [];
        for (let i = 0; i < buffers.length; ++i) {
          const src = ctx.createBufferSource();
          src.buffer = buffers[i];
          src.connect(ctx.destination);
          src.start(t);
          t += buffers[i].duration;
          if (i === buffers.length - 1) {
            src.onended = () => {
              activeSources = activeSources.filter(s => s !== src && !mine.includes(s));
              if (alert === lastAlert) cfg.onCueEnd({ alert, cues });
            };
          }
          mine.push(src);
        }
        activeSources = mine;
      } catch (e) {
        console.error('soldier audio:', e);
        cfg.onCueEnd({ alert, cues, error: String(e) });
      }
    }

    function setLang(l) { cfg.lang = l; bufferCache.clear(); }
    function setMuted(m) { muted = !!m; }
    function replayLast() { if (lastAlert) handleAlert(lastAlert); }

    return { handleAlert, setLang, setMuted, replayLast,
             get ctx() { return ctx; } };
  }

  root.Sim = root.Sim || {};
  root.Sim.makeSoldierNode = makeSoldierNode;
})(window);
