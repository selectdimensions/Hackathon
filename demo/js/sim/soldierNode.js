// SoldierNode — receives AlertPacket-shaped events from master, picks
// cue_ids per the fine-grained MP3 range, and plays the corresponding
// AudioClips/<lang>/*.mp3 sequence via the Web Audio API.
//
// Alerts are queued FIFO so every km callout plays to completion, even
// when the master fires alerts faster than each cue's duration. Queue
// is capped to avoid unbounded growth on pause/replay.

(function (root) {
  const P = window.Proto;
  const QUEUE_CAP = 12;

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
    const queue = [];
    let playing = false;

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
      const headingCue = alert.cue_id;
      const km = Math.max(1, Math.min(10, Math.round((alert._range_m || 0) / 1000) || 1));
      const kmCue = P.CueId.CUE_KM_01 + (km - 1);
      return [headingCue, kmCue];
    }

    function handleAlert(alert) {
      lastAlert = alert;
      if (muted) {
        cfg.onCueStart({ alert, cues: [], muted: true });
        return;
      }
      const cues = pickCueSequence(alert);
      const urls = cues.map(c => P.cueAssetUrl(c, cfg.lang)).filter(Boolean);
      if (!urls.length) return;
      queue.push({ alert, cues, urls });
      while (queue.length > QUEUE_CAP) queue.shift();
      drain();
    }

    async function drain() {
      if (playing) return;
      const item = queue.shift();
      if (!item) return;
      playing = true;
      ensureCtx();
      cfg.onCueStart({ alert: item.alert, cues: item.cues });
      try {
        const buffers = await Promise.all(item.urls.map(loadBuffer));
        let t = ctx.currentTime + 0.04;
        let lastSrc = null;
        for (const buf of buffers) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(t);
          t += buf.duration;
          lastSrc = src;
        }
        await new Promise(resolve => {
          if (!lastSrc) return resolve();
          lastSrc.onended = resolve;
        });
      } catch (e) {
        console.error('soldier audio:', e);
      } finally {
        cfg.onCueEnd({ alert: item.alert, cues: item.cues });
        playing = false;
        drain();
      }
    }

    function setLang(l) { cfg.lang = l; bufferCache.clear(); }
    function setMuted(m) {
      muted = !!m;
      if (muted) { queue.length = 0; }
    }
    function replayLast() { if (lastAlert) handleAlert(lastAlert); }

    return { handleAlert, setLang, setMuted, replayLast,
             get ctx() { return ctx; },
             get queueDepth() { return queue.length + (playing ? 1 : 0); } };
  }

  root.Sim = root.Sim || {};
  root.Sim.makeSoldierNode = makeSoldierNode;
})(window);
