// MapUI — Leaflet init, procedural tactical-grid basemap, pod/drone/
// triangulation markers, animated RSSI rings and "LoRa packet" arrows.
//
// The procedural basemap is a L.GridLayer that draws each tile to a
// <canvas> with a topographic grid + soft elevation noise. Works fully
// offline — no PNG basemap committed to the repo.

(function (root) {
  // Procedural Night Shadow basemap. Two greys + a 32-px brand grid.
  // No tile-coord debug labels — this is a product surface now.
  // Colors read live from CSS custom properties so brand updates flow through.
  function tacticalGridLayer() {
    const cs = getComputedStyle(document.documentElement);
    const baseHex = (cs.getPropertyValue('--bg-sunken') || '#02050A').trim();
    const lineRgb = (cs.getPropertyValue('--tb-gray-700') || '#374151').trim();

    function hexToRgb(hex) {
      const m = hex.replace('#','').match(/^([0-9a-f]{6})$/i);
      if (!m) return { r: 2, g: 5, b: 10 };
      const n = parseInt(m[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const base = hexToRgb(baseHex);
    const grid = hexToRgb(lineRgb);

    const layer = L.GridLayer.extend({
      createTile: function (coords) {
        const t = document.createElement('canvas');
        t.width = 256; t.height = 256;
        const g = t.getContext('2d');
        // very subtle per-tile luminance variation so flat areas don't stripe at zoom edges
        const seed = ((coords.x * 73856093) ^ (coords.y * 19349663) ^ (coords.z * 83492791)) >>> 0;
        const j = (seed % 7) - 3;
        g.fillStyle = `rgb(${base.r + j}, ${base.g + j}, ${base.b + j})`;
        g.fillRect(0, 0, 256, 256);
        // 32-px brand grid, faint
        g.strokeStyle = `rgba(${grid.r}, ${grid.g}, ${grid.b}, 0.28)`;
        g.lineWidth = 1;
        for (let i = 0; i <= 256; i += 32) {
          g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, 256); g.stroke();
          g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(256, i + 0.5); g.stroke();
        }
        return t;
      }
    });
    return new layer({ tileSize: 256, minZoom: 12, maxZoom: 19 });
  }

  function divIcon(html, klass, w, h) {
    return L.divIcon({ html, className: 'demo-icon ' + (klass || ''), iconSize: [w, h], iconAnchor: [w / 2, h / 2] });
  }

  // Read brand colors live from CSS custom properties — anywhere we'd
  // otherwise hard-code a hex, go through this so token updates propagate.
  // Caches once per Leaflet init (basemap reads the same vars at construction).
  const BRAND = (function () {
    const cs = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      const x = cs.getPropertyValue(name).trim();
      return x || fallback;
    }
    return {
      accent:     v('--tb-accent',         '#00A9E2'),
      threat:     v('--tb-warn',           '#DC2626'),
      success:    v('--tb-success-bright', '#10B981'),
      meshMuted:  v('--tb-gray-700',       '#374151'),
      meshC2:     v('--tb-gray-500',       '#6B7280'),
      hopHigh:    '#FCD34D',                 // brand-aligned amber for hop pulse
      ring:       v('--tb-gray-600',       '#4B5563'),
      arrowDim:   v('--tb-gray-500',       '#6B7280'),
    };
  })();

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
      mesh:    L.layerGroup().addTo(map),
      meshHop: L.layerGroup().addTo(map),
      pods:    L.layerGroup().addTo(map),
      c2:      L.layerGroup().addTo(map),
      drone:   L.layerGroup().addTo(map),
      solve:   L.layerGroup().addTo(map),
      arrows:  L.layerGroup().addTo(map),
      soldier: L.layerGroup().addTo(map),
      rings:   L.layerGroup().addTo(map),
    };

    let podMarkers = {};
    let droneMarkers = {};
    let soldierMarker = null;
    let c2Marker = null;
    let c2LatLon = null;
    let solveMarker = null;
    let solveRing = null;
    let meshGraph = null;  // {nodes: [{id, lat, lon}], adj: Map<id, Map<id, edgeLine>>}

    function setScenario(sc) {
      Object.values(layers).forEach(l => l.clearLayers());
      podMarkers = {};
      droneMarkers = {};
      c2Marker = null; c2LatLon = null;
      solveMarker = null; solveRing = null;
      meshGraph = null;

      const pts = [];
      // range rings around soldier (early-warning visualisation)
      const rr = sc.range_rings_m || [];
      for (const radius of rr) {
        L.circle([sc.soldier.lat, sc.soldier.lon], {
          radius, color: BRAND.ring, weight: 1, opacity: 0.55,
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
      // C&C node (rear command-and-control)
      if (sc.c2) {
        c2LatLon = { lat: sc.c2.lat, lon: sc.c2.lon };
        const c2Html = `<div class="c2-glyph">▣</div><div class="pod-label">${sc.c2.label}</div>`;
        c2Marker = L.marker([c2LatLon.lat, c2LatLon.lon], { icon: divIcon(c2Html, 'c2', 26, 26) });
        c2Marker.addTo(layers.c2);
        pts.push([c2LatLon.lat, c2LatLon.lon]);
      }
      // soldier
      const sHtml = `<div class="soldier-glyph">★</div><div class="pod-label">${sc.soldier.label}</div>`;
      soldierMarker = L.marker([sc.soldier.lat, sc.soldier.lon], { icon: divIcon(sHtml, 'soldier', 22, 22) });
      soldierMarker.addTo(layers.soldier);
      pts.push([sc.soldier.lat, sc.soldier.lon]);
      // mesh edges — connect every pair within mesh_radius_m (default 3.5 km).
      // C&C joins its 4 nearest pods. Edges are thin gray polylines drawn under
      // the pod markers so the topology stays visible without overpowering.
      meshGraph = buildMeshGraph(sc.pods, sc.c2 ? { ...sc.c2, lat: c2LatLon.lat, lon: c2LatLon.lon } : null, sc.mesh_radius_m || 3500);
      for (const [u, v, line] of meshGraph.edges) line.addTo(layers.mesh);
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

    function buildMeshGraph(pods, c2, radiusM) {
      // nodes: pods + optional c2 (c2 uses node_id from JSON, typically 128)
      const nodes = pods.map(p => ({ id: p.node_id, lat: p.lat, lon: p.lon }));
      if (c2) nodes.push({ id: c2.node_id, lat: c2.lat, lon: c2.lon, isC2: true });
      const adj = new Map();
      for (const n of nodes) adj.set(n.id, new Map());
      const edges = [];
      // radius-based connectivity among pods
      for (let i = 0; i < nodes.length; ++i) {
        for (let j = i + 1; j < nodes.length; ++j) {
          const a = nodes[i], b = nodes[j];
          // C&C handled separately below
          if (a.isC2 || b.isC2) continue;
          const d = approxMetres(a.lat, a.lon, b.lat, b.lon);
          if (d <= radiusM) {
            const line = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
              color: BRAND.meshMuted, weight: 1, opacity: 0.45, interactive: false,
            });
            edges.push([a.id, b.id, line]);
            adj.get(a.id).set(b.id, { d, line });
            adj.get(b.id).set(a.id, { d, line });
          }
        }
      }
      // C&C: connect to its 4 nearest pods (always link the rear node so packets
      // can drain even if it's outside the regular mesh radius)
      if (c2) {
        const ranked = pods.map(p => ({ id: p.node_id, lat: p.lat, lon: p.lon,
          d: approxMetres(c2.lat, c2.lon, p.lat, p.lon) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 4);
        for (const p of ranked) {
          const line = L.polyline([[c2.lat, c2.lon], [p.lat, p.lon]], {
            color: BRAND.meshC2, weight: 1.3, opacity: 0.6, interactive: false,
          });
          edges.push([c2.node_id, p.id, line]);
          adj.get(c2.node_id).set(p.id, { d: p.d, line });
          adj.get(p.id).set(c2.node_id, { d: p.d, line });
        }
      }
      return { nodes, adj, edges, c2Id: c2 ? c2.node_id : null };
    }

    function approxMetres(lat1, lon1, lat2, lon2) {
      const dlat = (lat2 - lat1) * 111132;
      const dlon = (lon2 - lon1) * 111320 * Math.cos((lat1 + lat2) * Math.PI / 360);
      return Math.hypot(dlat, dlon);
    }

    // Dijkstra: shortest path through mesh edges from podId to C&C.
    function shortestPathToC2(podId) {
      if (!meshGraph || meshGraph.c2Id === null) return null;
      const dest = meshGraph.c2Id;
      if (podId === dest) return [dest];
      const dist = new Map();
      const prev = new Map();
      const visited = new Set();
      for (const n of meshGraph.nodes) dist.set(n.id, Infinity);
      dist.set(podId, 0);
      while (visited.size < meshGraph.nodes.length) {
        let u = null;
        let best = Infinity;
        for (const [id, d] of dist) {
          if (!visited.has(id) && d < best) { best = d; u = id; }
        }
        if (u === null) break;
        if (u === dest) break;
        visited.add(u);
        const nbrs = meshGraph.adj.get(u);
        if (!nbrs) continue;
        for (const [v, edge] of nbrs) {
          if (visited.has(v)) continue;
          const alt = dist.get(u) + edge.d;
          if (alt < dist.get(v)) { dist.set(v, alt); prev.set(v, u); }
        }
      }
      if (!isFinite(dist.get(dest))) return null;
      const path = [dest];
      let u = dest;
      while (prev.has(u)) { u = prev.get(u); path.unshift(u); }
      return path;
    }

    // Animate a packet hopping through a mesh path. Single in-flight slot —
    // additional requests during an animation are dropped (not queued) so 25
    // pods firing detections at 5 Hz don't spawn hundreds of pending timers.
    let hopAnimInFlight = false;
    function animateMeshHop(podId) {
      if (hopAnimInFlight) return;
      const path = shortestPathToC2(podId);
      if (!path || path.length < 2) return;
      hopAnimInFlight = true;
      const HOP_MS = 110;
      let i = 0;
      function nextHop() {
        if (i >= path.length - 1) { hopAnimInFlight = false; return; }
        const u = path[i], v = path[i + 1];
        i++;
        const ua = meshGraph.adj.get(u);
        const edge = ua && ua.get(v);
        if (!edge) { setTimeout(nextHop, HOP_MS); return; }
        const hop = L.polyline(edge.line.getLatLngs(), {
          color: BRAND.hopHigh, weight: 3, opacity: 0.95, interactive: false,
        }).addTo(layers.meshHop);
        const start = performance.now();
        const dur = HOP_MS * 1.4;
        function fade(now) {
          const t = (now - start) / dur;
          if (t >= 1) { layers.meshHop.removeLayer(hop); return; }
          hop.setStyle({ opacity: 0.95 * (1 - t) });
          requestAnimationFrame(fade);
        }
        requestAnimationFrame(fade);
        setTimeout(nextHop, HOP_MS);
      }
      nextHop();
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
        radius: 5, color: color || BRAND.accent, weight: 2, fillOpacity: 0,
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
        color: color || BRAND.accent, weight: 2, opacity: 0.0,
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
        radius: 7, color: BRAND.threat, fillColor: BRAND.threat,
        fillOpacity: 0.5, weight: 2,
      }).addTo(layers.solve);
      solveRing = L.circle([lat, lon], {
        radius: Math.max(residualM, 20),
        color: BRAND.threat, weight: 1, opacity: 0.6,
        fillOpacity: 0.05, dashArray: '3,4',
      }).addTo(layers.solve);
      if (soldierLatLon) {
        L.polyline(
          [[soldierLatLon.lat, soldierLatLon.lon], [lat, lon]],
          { color: BRAND.threat, weight: 2, opacity: 0.55, dashArray: '4,6' }
        ).addTo(layers.solve);
      }
    }

    function podMarker(nodeId) { return podMarkers[nodeId]; }
    function soldierLatLon() { return soldierMarker ? soldierMarker.getLatLng() : null; }
    function c2NodeLatLon() { return c2LatLon; }

    return {
      map, setScenario, updateEmitter, clearEmitters,
      pulseRing, loraArrow, showSolve, podMarker, soldierLatLon,
      c2NodeLatLon, animateMeshHop,
    };
  }

  root.UI = root.UI || {};
  root.UI.makeMapUI = makeMapUI;
})(window);
