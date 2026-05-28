// layout.js — deterministic placement of the sensor network across the AO.
// Real pods on a jittered grid (good triangulation geometry), decoys scattered,
// one master node to the rear. Seeded RNG => identical layout every run.
window.LAYOUT = (function () {
  const C = window.CFG;

  // small deterministic PRNG (mulberry32)
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function build() {
    const rand = rng(20260528);
    const half = (C.areaKm * 1000) / 2;            // +/- metres from centre
    const pods = [];

    // --- real pods: jittered grid sized to hit ~realPods count ----------
    const cols = Math.ceil(Math.sqrt(C.realPods));  // 7 for 46
    const step = (2 * half) / cols;
    let id = 1;
    const reals = [];
    for (let r = 0; r < cols && reals.length < C.realPods; r++) {
      for (let c = 0; c < cols && reals.length < C.realPods; c++) {
        const jx = (rand() - 0.5) * step * 0.45;
        const jy = (rand() - 0.5) * step * 0.45;
        reals.push({
          id: id++, kind: 'real', label: 'POD-' + String(id - 1).padStart(3, '0'),
          en: {
            eastM: -half + step * (c + 0.5) + jx,
            northM: -half + step * (r + 0.5) + jy,
          },
          synced: true,
        });
      }
    }
    pods.push(...reals);

    // --- decoys: scattered, clustered enough to look like targets -------
    for (let i = 0; i < C.decoyPods; i++) {
      pods.push({
        id: 500 + i, kind: 'decoy', label: 'DECOY-' + String(i + 1).padStart(3, '0'),
        en: { eastM: (rand() * 2 - 1) * half * 0.96, northM: (rand() * 2 - 1) * half * 0.96 },
      });
    }

    // --- master node: rear-centre, fiber-linked -------------------------
    const master = { id: 0x80, kind: 'master', label: 'MASTER', en: { eastM: 0, northM: -half * 0.7 } };

    const soldier = { id: 0xA0, kind: 'soldier', label: 'C2 / OPERATOR', en: { eastM: 0, northM: -half * 0.55 } };

    return { reals, decoys: pods.filter(p => p.kind === 'decoy'), master, soldier, all: pods };
  }

  return { build };
})();
