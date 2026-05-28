// geo.js — flat-earth ENU <-> lat/lon helpers around the configured anchor.
// Good to a few metres over the 10 km playground, which is all the demo needs.
window.GEO = (function () {
  const C = window.CFG;

  // metres east/north of anchor -> {lat, lon}
  function toLatLon(eastM, northM) {
    return {
      lat: C.anchor.lat + northM / C.mPerDegLat,
      lon: C.anchor.lon + eastM / C.mPerDegLon,
    };
  }

  // {lat, lon} -> metres east/north of anchor
  function toEN(lat, lon) {
    return {
      eastM: (lon - C.anchor.lon) * C.mPerDegLon,
      northM: (lat - C.anchor.lat) * C.mPerDegLat,
    };
  }

  // straight-line ground distance between two ENU points, metres
  function distM(a, b) {
    return Math.hypot(a.eastM - b.eastM, a.northM - b.northM);
  }

  // compass bearing FROM a TO b, degrees clockwise from north (0..359)
  function bearingDeg(a, b) {
    const deg = Math.atan2(b.eastM - a.eastM, b.northM - a.northM) * 180 / Math.PI;
    return (deg + 360) % 360;
  }

  // [lat, lon] pair for Leaflet, from ENU
  function latLngOf(en) {
    const p = toLatLon(en.eastM, en.northM);
    return [p.lat, p.lon];
  }

  return { toLatLon, toEN, distM, bearingDeg, latLngOf };
})();
