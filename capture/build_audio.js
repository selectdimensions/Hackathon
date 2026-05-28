// build_audio.js — place each TTS clip on the timeline (aligned to the measured
// preroll), then mux the mixed voiceover onto the recorded video as one MP4.
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const nav = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(__dirname, 'preroll.json'), 'utf8'));
const GAP = 0.25;                                   // min silence between lines
const out = path.resolve(__dirname, '..', 'TENEBRIS_DEMO.mp4');

function dur(wav) {
  const s = execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${wav}"`).toString().trim();
  return parseFloat(s) || 0;
}

// Playwright trims some startup latency from the front of the recording, so the
// real video is shorter than the page lifetime. Assume that lost time is at the
// start and shift the play moment earlier by the same amount, so the voiceover
// lines up with the on-screen phases.
const webmDur = dur(pre.video);
const pageLife = pre.prerollMs / 1000 + pre.runSec + 4;
const lost = Math.max(0, pageLife - webmDur);
const base = Math.max(0, pre.prerollMs / 1000 - lost);   // play moment in video time
const audioLen = webmDur;

// schedule clips sequentially, never overlapping, anchored at preroll + t
const clips = [];
let prevEnd = 0;
nav.events.forEach((e, i) => {
  const wav = path.join(__dirname, `line_${String(i).padStart(2, '0')}.wav`);
  if (!fs.existsSync(wav)) return;
  const d = dur(wav);
  const start = Math.max(base + e.t, prevEnd + GAP);
  prevEnd = start + d;
  clips.push({ wav, delayMs: Math.round(start * 1000) });
});

// build ffmpeg: [0]=video, [1]=silent base, [2..]=clips
const args = ['-y', '-i', pre.video, '-f', 'lavfi', '-t', String(audioLen), '-i', 'anullsrc=r=44100:cl=mono'];
clips.forEach(c => { args.push('-i', c.wav); });

let fc = '';
clips.forEach((c, i) => { fc += `[${i + 2}]adelay=${c.delayMs}:all=1[a${i}];`; });
fc += '[1]' + clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${clips.length + 1}:normalize=0:dropout_transition=0[mix]`;

args.push(
  '-filter_complex', fc,
  '-map', '0:v:0', '-map', '[mix]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '25',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
  '-t', String(audioLen), out,
);

console.log(`muxing ${clips.length} clips -> ${out}`);
const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
if (r.status !== 0) { console.error('ffmpeg failed', r.status); process.exit(1); }
console.log('done: ' + out);
