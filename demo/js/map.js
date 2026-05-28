// map.js — real Leaflet map with layered, individually-toggleable overlays.
// Base layers: Esri satellite (default), OSM streets, and a procedural
// "Tactical grid" that renders fully offline so the map is never blank.
window.MAP = (function () {
  const C = window.CFG;
  const G = window.GEO;
  const Z = 2200;            // displayed coverage-ring radius (visual, not logic)

  function icon(html, cls, w, h) {
    return L.divIcon({ html, className: 'mk ' + (cls || ''), iconSize: [w, h], iconAnchor: [w / 2, h / 2] });
  }

  // Offline procedural basemap (dark terrain + grid).
  function tacticalGrid() {
    const Layer = L.GridLayer.extend({
      createTile: function (coords) {
        const t = document.createElement('canvas');
        t.width = t.height = 256;
        const g = t.getContext('2d');
        const seed = (coords.x * 73856093) ^ (coords.y * 19349663) ^ (coords.z * 83492791);
        const n = ((seed >>> 0) % 11) - 5;
        g.fillStyle = `rgb(${10 + n},${17 + n},${24 + n})`;
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(0,169,226,0.12)';
        g.lineWidth = 1;
        for (let i = 0; i <= 256; i += 32) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
          g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
        }
        return t;
      },
    });
    return new Layer({ minZoom: 9, maxZoom: 18 });
  }

  function create(containerId) {
    const map = L.map(containerId, { zoomControl: true, attributionControl: false, preferCanvas: true });
    map.setView([C.anchor.lat, C.anchor.lon], 12);

    const sat = L.tileLayer(C.tiles.satelliteUrl, { maxZoom: 18 });
    const streets = L.tileLayer(C.tiles.streetUrl, { maxZoom: 19, subdomains: 'abc' });
    const grid = tacticalGrid();
    const bases = { 'Satellite': sat, 'Streets': streets, 'Tactical grid': grid };
    (bases[C.tiles.defaultLayer] || sat).addTo(map);

    // If imagery can't load (offline venue), fall back to the grid once.
    let switched = false, errors = 0;
    sat.on('tileerror', () => {
      if (switched) return;
      if (++errors >= 3) { switched = true; map.removeLayer(sat); grid.addTo(map); }
    });

    // overlay groups
    const groups = {
      zones: L.layerGroup(), decoys: L.layerGroup(), pods: L.layerGroup(),
      net: L.layerGroup().addTo(map),       // master + operator (always on)
      tri: L.layerGroup(), trail: L.layerGroup().addTo(map),
      cone: L.layerGroup().addTo(map), drone: L.layerGroup().addTo(map),
    };
    groups.pods.addTo(map); groups.decoys.addTo(map);

    L.control.layers(bases, null, { position: 'topright', collapsed: true }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    let droneMarker = null, coneCircle = null, wedge = null, trailLine = null;
    const trailPts = [];

    function setNetwork(layout) {
      // decoys (drawn first, faded)
      layout.decoys.forEach(p => {
        L.marker(G.latLngOf(p.en), { icon: icon('<i class="dot decoy"></i>', 'decoy', 10, 10), title: p.label, interactive: false })
          .addTo(groups.decoys);
      });
      // real pods + coverage rings
      layout.reals.forEach(p => {
        L.marker(G.latLngOf(p.en), { icon: icon('<i class="dot real"></i>', 'real', 12, 12), title: p.label })
          .addTo(groups.pods);
        L.circle(G.latLngOf(p.en), { radius: Z, color: C.color.real, weight: 1, opacity: 0.25, fillColor: C.color.real, fillOpacity: 0.05 })
          .addTo(groups.zones);
      });
      // master + operator
      L.marker(G.latLngOf(layout.master.en), { icon: icon('<i class="glyph master">&#9670;</i><b>MASTER</b>', 'master', 18, 18), title: 'Master node (fiber)' }).addTo(groups.net);
      L.marker(G.latLngOf(layout.soldier.en), { icon: icon('<i class="glyph op">&#9678;</i><b>C2</b>', 'op', 18, 18), title: 'C2 / operator' }).addTo(groups.net);
      fit(layout);
    }

    function fit(layout) {
      const pts = layout.all.map(p => G.latLngOf(p.en));
      pts.push(G.latLngOf(SCENARIO.launch));
      map.fitBounds(L.latLngBounds(pts).pad(0.08));
    }

    function updateDrone(en, hot, airborne) {
      const ll = G.latLngOf(en);
      const cls = 'drone' + (hot ? ' hot' : '');
      const html = `<i class="drone-glyph ${hot ? 'hot' : ''}"></i>`;
      if (!airborne) { if (droneMarker) { groups.drone.removeLayer(droneMarker); droneMarker = null; } return; }
      if (!droneMarker) {
        droneMarker = L.marker(ll, { icon: icon(html, cls, 22, 22), title: 'DRONE-001', zIndexOffset: 1000 }).addTo(groups.drone);
      } else {
        droneMarker.setLatLng(ll); droneMarker.setIcon(icon(html, cls, 22, 22));
      }
    }

    function pushTrail(en) {
      trailPts.push(G.latLngOf(en));
      if (!trailLine) trailLine = L.polyline(trailPts, { color: C.color.trail, weight: 2, opacity: 0.7, dashArray: '1,5' }).addTo(groups.trail);
      else trailLine.setLatLngs(trailPts);
    }
    function clearTrail() { trailPts.length = 0; if (trailLine) { groups.trail.removeLayer(trailLine); trailLine = null; } }

    function showCone(en, radiusM, color) {
      const ll = G.latLngOf(en);
      groups.cone.clearLayers();
      coneCircle = L.circle(ll, { radius: Math.max(radiusM, 12), color, weight: 1.5, opacity: 0.8, fillColor: color, fillOpacity: 0.12 }).addTo(groups.cone);
    }
    function clearCone() { groups.cone.clearLayers(); coneCircle = null; }

    function showBearingWedge(fromEN, bearing, spread, lengthM, color) {
      groups.cone.clearLayers();
      const pts = [G.latLngOf(fromEN)];
      for (let a = bearing - spread; a <= bearing + spread; a += 4) {
        const rad = a * Math.PI / 180;
        pts.push(G.latLngOf({ eastM: fromEN.eastM + Math.sin(rad) * lengthM, northM: fromEN.northM + Math.cos(rad) * lengthM }));
      }
      wedge = L.polygon(pts, { color, weight: 1, opacity: 0.7, fillColor: color, fillOpacity: 0.10 }).addTo(groups.cone);
    }

    function showTriangulation(activePods, en) {
      groups.tri.clearLayers();
      const ll = G.latLngOf(en);
      activePods.forEach(p => L.polyline([G.latLngOf(p.en), ll], { color: C.color.accent, weight: 1, opacity: 0.6, dashArray: '4,4' }).addTo(groups.tri));
    }
    function clearTriangulation() { groups.tri.clearLayers(); }

    // show/hide a named overlay group
    function setLayer(name, on) {
      const g = groups[name]; if (!g) return;
      if (on && !map.hasLayer(g)) map.addLayer(g);
      if (!on && map.hasLayer(g)) map.removeLayer(g);
    }

    return {
      map, setNetwork, updateDrone, pushTrail, clearTrail,
      showCone, clearCone, showBearingWedge, showTriangulation, clearTriangulation, setLayer,
    };
  }

  return { create };
})();
