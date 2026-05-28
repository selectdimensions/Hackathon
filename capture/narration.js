// narration.js — compute the spoken-line timeline (sim seconds from phase-0
// start) by reusing the demo's own modules, so the voiceover matches the
// on-screen transcript exactly. Output: narration.json.
const fs = require('fs');
const path = require('path');

global.window = global;
const demo = path.resolve(__dirname, '..', 'demo');
['js/config.js', 'js/geo.js', 'js/layout.js', 'js/scenario.js', 'js/sim.js']
  .forEach(f => { eval(fs.readFileSync(path.join(demo, f), 'utf8')); });

const C = window.CFG, S = window.SCENARIO, SIM = window.SIM, L = window.LAYOUT.build();
const order = ['setup', 'launch', 'track', 'jam', 'recovery'];
const kindFor = k => (k === 'jam' ? 'warn' : (k === 'launch' ? 'alert' : 'status'));

const events = [];
let t = 0;
for (const key of order) {
  const dur = C.phases[key];
  S.narration[key].forEach(line => events.push({ t, text: line, kind: kindFor(key) }));
  if (key === 'track') {
    for (let e = 22; e < dur; e += 22) {
      const fix = SIM.evaluate(S.posAt(e / dur), L, { jammed: false, speedKmh: 60 });
      const acc = fix.accuracyM < 1
        ? Math.round(fix.accuracyM * 100) + ' centimetres'
        : Math.round(fix.accuracyM) + ' metres';
      events.push({
        t: t + e, kind: 'status',
        text: 'Bearing ' + String(fix.bearing).padStart(3, '0') +
              ', range ' + fix.rangeKm.toFixed(1) + ' kilometres, accuracy ' + acc + '.',
      });
    }
  }
  t += dur;
}
events.push({ t, text: 'End of demonstration.', kind: 'status' });

fs.writeFileSync(path.join(__dirname, 'narration.json'),
  JSON.stringify({ total: t, events }, null, 2));
console.log('narration: ' + events.length + ' lines, timeline ' + t + ' s');
