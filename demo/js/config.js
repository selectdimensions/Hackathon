// config.js — single source of truth for every tunable in the demo.
// Adjust layout, colours, timings, and map here; no other file hard-codes them.
window.CFG = (function () {
  // --- Area of operations (real Belgian coordinates) ---------------------
  // Centre of a 10 km x 10 km screen south-west of Brussels.
  const anchor = { lat: 50.80, lon: 4.40 };
  const areaKm = 10;                 // square side, kilometres

  // --- Network composition ----------------------------------------------
  const realPods = 46;               // active single-sensor pods
  const decoyPods = 50;              // battery+resistor decoys
  const podSpacingM = 1400;          // nominal grid spacing for real pods
  const detectRangeM = 3500;         // a pod "hears" the drone within this range

  // --- Phase timing (seconds, at 1x speed) ------------------------------
  // The demo auto-advances, but every phase can also be stepped manually.
  const phases = {
    setup:    20,
    launch:   25,
    track:    95,
    jam:      25,
    recovery: 20,
  };

  // --- Accuracy model ----------------------------------------------------
  // Cone radius (metres) interpolates from coarse -> fine as more pods lock.
  const accCoarseM = 220;            // single-pod / just-acquired
  const accFineM = 0.5;              // full lock (50 cm goal)
  const accJamM = 250;               // degraded / offline bearing-only
  const podsForFullLock = 6;         // pods in range that yield the fine fix

  // --- Brand palette (TENEBRIS) -----------------------------------------
  const color = {
    night: '#030712', panel: '#0b1220', panelEdge: '#1f2937',
    ink: '#e5e7eb', dim: '#94a3b8', mute: '#64748b',
    accent: '#00a9e2',     // Aether Blue — master / friendly precision
    real: '#22c55e',       // active pod
    decoy: '#9fb4cc',      // decoy (brighter hollow ring; see .dot.decoy)
    threat: '#dc2626',     // drone / alert
    caution: '#f59e0b',    // degraded / jam
    trail: '#f87171',      // breadcrumb
  };

  // --- Map tiles ---------------------------------------------------------
  // Default to real imagery; OSM streets + an offline dark grid are alternates
  // so the map never renders blank if the venue has no internet.
  const tiles = {
    satelliteUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    streetUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    defaultLayer: 'Satellite',       // 'Satellite' | 'Streets' | 'Tactical grid'
  };

  // metres -> degrees helpers depend on latitude; exposed for layout.js
  const mPerDegLat = 111132.0;
  const mPerDegLon = 111320.0 * Math.cos(anchor.lat * Math.PI / 180);

  return {
    anchor, areaKm, realPods, decoyPods, podSpacingM, detectRangeM,
    phases, accCoarseM, accFineM, accJamM, podsForFullLock,
    color, tiles, mPerDegLat, mPerDegLon,
  };
})();
