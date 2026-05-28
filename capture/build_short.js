// build_short.js — make a 30s teaser: speed the 1x recording to TARGET seconds
// (smoother than re-recording fast) and mux the short voiceover over it.
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const TARGET = 30;                 // final length, seconds
const GAP = 0.2;
const PREFIX = process.env.PREFIX || 's_';
const nav = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration_short.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(__dirname, 'preroll.json'), 'utf8'));
const out = path.resolve(__dirname, '..', 'TENEBRIS_DEMO_30s.mp4');

const dur = f => parseFloat(execSync(
  `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${f}"`).toString().trim()) || 0;

const webmDur = dur(pre.video);
const factor = webmDur / TARGET;   // setpts divisor

// place clips sequentially (no overlap) at their authored wall times
const clips = [];
let prevEnd = 0;
nav.events.forEach((e, i) => {
  const wav = path.join(__dirname, `${PREFIX}${String(i).padStart(2, '0')}.wav`);
  if (!fs.existsSync(wav)) return;
  const d = dur(wav);
  const start = Math.max(e.t, prevEnd + GAP);
  prevEnd = start + d;
  clips.push({ wav, delayMs: Math.round(start * 1000) });
});

const args = ['-y', '-i', pre.video, '-f', 'lavfi', '-t', String(TARGET), '-i', 'anullsrc=r=44100:cl=mono'];
clips.forEach(c => args.push('-i', c.wav));

let fc = `[0:v]setpts=PTS/${factor.toFixed(5)},fps=25,format=yuv420p[v];`;
clips.forEach((c, i) => { fc += `[${i + 2}]adelay=${c.delayMs}:all=1[a${i}];`; });
fc += '[1]' + clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${clips.length + 1}:normalize=0:dropout_transition=0[mix]`;

args.push('-filter_complex', fc, '-map', '[v]', '-map', '[mix]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '25',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', String(TARGET), out);

console.log(`speed x${factor.toFixed(2)} -> ${TARGET}s, ${clips.length} voice clips -> ${out}`);
const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
process.exit(r.status === 0 ? (console.log('done: ' + out), 0) : (console.error('ffmpeg failed'), 1));
