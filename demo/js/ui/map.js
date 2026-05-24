// MapUI — Leaflet init, procedural tactical-grid basemap, pod/drone/
// triangulation markers, animated RSSI rings and "LoRa packet" arrows.
//
// The procedural basemap is a L.GridLayer that draws each tile to a
// <canvas> with a topographic grid + soft elevation noise. Works fully
// offline — no PNG basemap committed to the repo.

(function (root) {
  function tacticalGridLayer() {
    const layer = L.GridLayer.extend({
      createTile: function (coords) {
        const t = document.createElement('canvas');
        t.width = 256;
        t.height = 256;
        const g = t.getContext('2d');
        // base — gradient dark green / grey, modulated by tile coords for variety
        const seed = (coords.x * 73856093) ^ (coords.y * 19349663) ^ (coords.z * 83492791);
        const r = ((seed >>> 0) % 13) - 6;
        g.fillStyle = `rgb(${22 + r}, ${38 + r}, ${30 + r})`;
        g.fillRect(0, 0, 256, 256);
        // subtle blobby noise
        g.globalAlpha = 0.06;
        for (let i = 0; i < 12; ++i) {
          const x = ((seed + i * 17) >>> 0) % 256;
          const y = ((seed + i * 31) >>> 0) % 256;
          const radius = 30 + (((seed + i * 53) >>> 0) % 40);
          const grad = g.createRadialGradient(x, y, 0, x, y, radius);
          grad.addColorStop(0, '#3a7050');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(x, y, radius, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        // 32px grid
        g.strokeStyle = 'rgba(120, 200, 160, 0.18)';
        g.lineWidth = 1;
        for (let i = 0; i <= 256; i += 32) {
          g.beginPath(); g.moveTo(i, 0);   g.lineTo(i, 256); g.stroke();
          g.beginPath(); g.moveTo(0, i);   g.lineTo(256, i); g.stroke();
        }
        // tile coord label (faint)
        g.fillStyle = 'rgba(150, 210, 180, 0.35)';
        g.font = '10px monospace';
        g.fillText(`${coords.x},${coords.y} z${coords.z}`, 4, 12);
        return t;
      }
    });
    return new layer({ tileSize: 256, minZoom: 12, maxZoom: 19 });
  }

  function divIcon(html, klass, w, h) {
    return L.divIcon({ html, className: 'demo-icon ' + (klass || ''), iconSize: [w, h], iconAnchor: [w / 2, h / 2] });
  }

  function makeMapUI(containerId) {
    const map = L.map(containerId, {
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    });
    tacticalGridLayer().addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    const layers = {
      rangeRings: L.layerGroup().addTo(map),
      pods:    L.layerGroup().addTo(map),
      drone:   L.layerGroup().addTo(map),
      solve:   L.layerGroup().addTo(map),
      arrows:  L.layerGroup().addTo(map),
      soldier: L.layerGroup().addTo(map),
      rings:   L.layerGroup().addTo(map),
    };

    let podMarkers = {};
    let droneMarkers = {};
    let soldierMarker = null;
    let solveMarker = null;
    let solveRing = null;

    function setScenario(sc) {
      Object.values(layers).forEach(l => l.clearLayers());
      podMarkers = {};
      droneMarkers = {};
      solveMarker = null; solveRing = null;

      const pts = [];
      // range rings around soldier (early-warning visualisation)
      const rr = sc.range_rings_m || [];
      for (const radius of rr) {
        L.circle([sc.soldier.lat, sc.soldier.lon], {
          radius, color: '#3d6c5c', weight: 1, opacity: 0.55,
          fillOpacity: 0, dashArray: '2,4', interactive: false,
        }).addTo(layers.rangeRings);
        const lbl = L.marker([sc.soldier.lat + radius / 111132, sc.soldier.lon], {
          icon: divIcon(`<div class="range-label">${radius >= 1000 ? (radius/1000)+' km' : radius+' m'}</div>`, 'range', 1, 1),
          interactive: false,
        }).addTo(layers.rangeRings);
      }
      // pods
      for (const p of sc.pods) {
        const klass = p.is_live ? 'pod live' : 'pod helper';
        const html = `<div class="pod-dot ${p.is_live ? 'live' : ''}"></div><div class="pod-label">${p.label}</div>`;
        const m = L.marker([p.lat, p.lon], { icon: divIcon(html, klass, 16, 16), title: p.label });
        m.addTo(layers.pods);
        podMarkers[p.node_id] = m;
        pts.push([p.lat, p.lon]);
      }
      // soldier
      const sHtml = `<div class="soldier-glyph">★</div><div class="pod-label">${sc.soldier.label}</div>`;
      soldierMarker = L.marker([sc.soldier.lat, sc.soldier.lon], { icon: divIcon(sHtml, 'soldier', 22, 22) });
      soldierMarker.addTo(layers.soldier);
      pts.push([sc.soldier.lat, sc.soldier.lon]);
      // include the outermost range ring in the fit so the early-warning view shows the whole defended area
      if (rr.length) {
        const r = Math.max.apply(null, rr);
        pts.push([sc.soldier.lat + r / 111132, sc.soldier.lon]);
        pts.push([sc.soldier.lat - r / 111132, sc.soldier.lon]);
      }
      // include every emitter waypoint so the incursion path is visible from t=0
      for (const em of (sc.emitters || [])) {
        for (const wp of em.path) pts.push([wp.lat, wp.lon]);
      }
      // fit
      map.fitBounds(L.latLngBounds(pts).pad(0.15));
    }

    function updateEmitter(id, lat, lon, bearingDeg, label, threatHot) {
      let m = droneMarkers[id];
      const glyph = label && label.toLowerCase().includes('jammer') ? '▲' : '✈';
      const html = `<div class="drone-glyph ${threatHot ? 'hot' : ''}">${glyph}</div>`;
      if (!m) {
        m = L.marker([lat, lon], {
          icon: divIcon(html, 'drone', 28, 28),
          rotationAngle: bearingDeg || 0,
          rotationOrigin: 'center center',
          title: label || 'emitter',
        });
        m.addTo(layers.drone);
        droneMarkers[id] = m;
      } else {
        m.setLatLng([lat, lon]);
        if (m.setRotationAngle) m.setRotationAngle(bearingDeg || 0);
        // update glyph if state changed
        m.setIcon(divIcon(html, 'drone', 28, 28));
      }
    }

    function clearEmitters() {
      layers.drone.clearLayers();
      droneMarkers = {};
    }

    function pulseRing(lat, lon, color) {
      const c = L.circle([lat, lon], {
        radius: 5, color: color || '#5fa9ff', weight: 2, fillOpacity: 0,
      }).addTo(layers.rings);
      const start = performance.now();
      function step(now) {
        const t = (now - start) / 1500;
        if (t >= 1) { layers.rings.removeLayer(c); return; }
        c.setRadius(5 + t * 220);
        c.setStyle({ opacity: 1 - t });
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function loraArrow(from, to, color) {
      const line = L.polyline([from, to], {
        color: color || '#ffcc66', weight: 2, opacity: 0.0,
        dashArray: '6,8',
      }).addTo(layers.arrows);
      const start = performance.now();
      function step(now) {
        const t = (now - start) / 1200;
        if (t >= 1) { layers.arrows.removeLayer(line); return; }
        line.setStyle({ opacity: Math.sin(t * Math.PI), dashOffset: String(-Math.floor(t * 30)) });
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function showSolve(lat, lon, residualM, soldierLatLon) {
      layers.solve.clearLayers();
      solveMarker = L.circleMarker([lat, lon], {
        radius: 8, color: '#ff5050', fillColor: '#ff5050', fillOpacity: 0.55, weight: 2,
      }).addTo(layers.solve);
      solveRing = L.circle([lat, lon], {
        radius: Math.max(residualM, 20),
        color: '#ff5050', weight: 1, opacity: 0.7, fillOpacity: 0.08, dashArray: '3,4',
      }).addTo(layers.solve);
      if (soldierLatLon) {
        const line = L.polyline(
          [[soldierLatLon.lat, soldierLatLon.lon], [lat, lon]],
          { color: '#ff5050', weight: 2, opacity: 0.6, dashArray: '4,6' }
        ).addTo(layers.solve);
      }
    }

    function podMarker(nodeId) { return podMarkers[nodeId]; }
    function soldierLatLon() { return soldierMarker ? soldierMarker.getLatLng() : null; }

    return {
      map, setScenario, updateEmitter, clearEmitters,
      pulseRing, loraArrow, showSolve, podMarker, soldierLatLon,
    };
  }

  root.UI = root.UI || {};
  root.UI.makeMapUI = makeMapUI;
})(window);
