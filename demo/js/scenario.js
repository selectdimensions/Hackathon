// scenario.js — the drone's deliberate zig-zag and the per-phase narration.
// The path is authored in ENU metres and sweeps wide bearing changes so the
// voice callouts ("bearing 045 ... bearing 300 ...") visibly change as it flies.
window.SCENARIO = (function () {
  // Launch point: outside the pod field to the north-east, so the fix starts
  // coarse (few distant pods) and tightens as the drone enters the mesh.
  const launch = { eastM: 7000, northM: 7000 };

  // Waypoints as fraction u of the TRACK phase (0 -> 1). Big S across the AO,
  // closing on the protected centre.
  const path = [
    { u: 0.00, en: { eastM: 7000, northM: 7000 } },  // outside NE (acquiring)
    { u: 0.20, en: { eastM: -4200, northM: 3800 } }, // sweep W into the field
    { u: 0.40, en: { eastM: 3900, northM: 1700 } },  // back E
    { u: 0.60, en: { eastM: -3200, northM: 300 } },  // back W, closer
    { u: 0.80, en: { eastM: 1600, northM: -900 } },  // cut SE toward centre
    { u: 1.00, en: { eastM: 0, northM: -300 } },     // bear down on operator
  ];

  function posAt(u) {
    u = Math.max(0, Math.min(1, u));
    for (let i = 1; i < path.length; i++) {
      if (u <= path[i].u) {
        const a = path[i - 1], b = path[i];
        const f = (u - a.u) / (b.u - a.u);
        return {
          eastM: a.en.eastM + (b.en.eastM - a.en.eastM) * f,
          northM: a.en.northM + (b.en.northM - a.en.northM) * f,
        };
      }
    }
    return { ...path[path.length - 1].en };
  }

  // Scripted story lines, spoken at the start of each phase.
  const narration = {
    setup: [
      'Area of operations: ten kilometres by ten kilometres, south-west of Brussels.',
      'Forty-six passive sensor pods are deployed and synchronized. Green markers are live sensors; grey markers are decoys.',
      'The network is silent. It listens. It does not transmit.',
    ],
    launch: [
      'A drone is now airborne in the north-east.',
      'Detection in three, two, one. Contact.',
      'Signal first acquired by the northern pods. We have a fix.',
    ],
    track: [
      'Tracking a moving target. The fix is tightening as more pods lock on.',
      'Accuracy is now fifty centimetres. Watch the bearing change as it weaves.',
    ],
    jam: [
      'Adversary has activated broadband jamming. The mesh is offline.',
      'Falling back to autonomous pod detection. We are losing the high-precision lock.',
      'We still hold a bearing. The threat is in this sector.',
    ],
    recovery: [
      'Jamming has ceased. The network is re-syncing.',
      'Re-acquiring the target. Lock achieved. Maintain vigilance.',
    ],
  };

  return { launch, path, posAt, narration };
})();
