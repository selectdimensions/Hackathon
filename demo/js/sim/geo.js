// Flat-earth ENU helpers. Scenarios are anchored at a centre lat/lon and
// describe positions in metres east/north of that anchor. Good enough for
// the ~1 km playground the demo uses.

(function (root) {
  const R_LAT_M = 111132.0;

  function metresPerDegLon(latDeg) {
    return 111320.0 * Math.cos(latDeg * Math.PI / 180);
  }

  function offsetToLatLon(anchor, eastM, northM) {
    return {
      lat: anchor.lat + northM / R_LAT_M,
      lon: anchor.lon + eastM / metresPerDegLon(anchor.lat),
    };
  }

  function latLonToOffset(anchor, p) {
    return {
      eastM:  (p.lon - anchor.lon) * metresPerDegLon(anchor.lat),
      northM: (p.lat - anchor.lat) * R_LAT_M,
    };
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000.0;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // bearing FROM (lat1,lon1) TO (lat2,lon2), degrees clockwise from true north.
  function bearingDeg(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  root.Geo = { offsetToLatLon, latLonToOffset, haversineM, bearingDeg };
})(window);
