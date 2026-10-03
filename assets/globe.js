// The coded globe, drawn on one full-viewport canvas shared by hero, about and the numbers band.
// Scroll code tweens `state` (centre x/y and radius in viewport px, morph 0 globe -> 1 flat map,
// arcs, dim); this module only renders it. Land dots come from assets/land.json and carry a
// flat-map position, so the same dots unwrap into the dotted world map.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const TEAL = new THREE.Color("#0F7C80");
const ACCENT = new THREE.Color("#C2185B");
const PULSE = new THREE.Color("#F48FB1");
const glsl = (c) => `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;

function ll2v(lat, lon) {
  const a = THREE.MathUtils.degToRad(lat), b = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
}
// Flat map in globe units: 3.8 wide, lat 84..-56 spans +0.89..-0.59.
const flatOf = (lat, lon) => [(lon / 180) * 1.9, (lat / 90) * 0.95, 0];

export async function createGlobe(host, { hubs, arcs, state = { x: 0, y: 0, r: 200, morph: 0, arcs: 1, dim: 1, draw: 0 } }) {
  const land = await fetch("assets/land.json").then((r) => r.json());
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000); // 1 unit = 1 css px, y up
  const root = new THREE.Group();   // position = centre, scale = radius
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  tilt.rotation.x = 0.26;
  spin.rotation.y = THREE.MathUtils.degToRad(-12); // lon 12 faces the viewer: Europe and Africa
  root.add(tilt); tilt.add(spin); scene.add(root);
  const rot = new THREE.Matrix3(), m4 = new THREE.Matrix4(), m4b = new THREE.Matrix4();

  // Depth-only occluder hides the back hemisphere. Off as soon as the globe starts to unwrap.
  const occ = new THREE.Mesh(new THREE.SphereGeometry(0.985, 48, 32), new THREE.MeshBasicMaterial({ colorWrite: false }));
  occ.renderOrder = -1;
  spin.add(occ);

  // Dots: rotation and unwrap happen in the shader (uRot), so the flat map is never rotated.
  const n = land.length / 2;
  const pos = new Float32Array(n * 3), flat = new Float32Array(n * 3), lat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const la = land[i * 2] / 10, lo = land[i * 2 + 1] / 10;
    ll2v(la, lo).toArray(pos, i * 3);
    flat.set(flatOf(la, lo), i * 3);
    lat[i] = la;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aFlat", new THREE.BufferAttribute(flat, 3));
  g.setAttribute("aLat", new THREE.BufferAttribute(lat, 1));
  const place = /* glsl */ `
    uniform mat3 uRot; uniform float uMorph;
    vec3 place(vec3 sphere, vec3 plane, out float face) { // not "flat": reserved in GLSL 3
      vec3 s = uRot * sphere;
      face = mix(s.z, 1.0, uMorph);
      return mix(s, plane, uMorph);
    }`;
  const dotMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uRot: { value: rot }, uMorph: { value: 0 }, uSize: { value: 3.1 * dpr }, uOpacity: { value: 1 } },
    vertexShader: place + /* glsl */ `
      attribute vec3 aFlat; attribute float aLat; uniform float uSize; varying float vFace;
      void main() {
        vec3 p = place(position, aFlat, vFace);
        // The lat/lon grid bunches toward the poles on the sphere: shrink by cos(lat) there only.
        gl_PointSize = uSize * mix(0.45 + 0.55 * cos(radians(aLat)), 0.85, uMorph);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying float vFace;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.36, 0.5, d)) * mix(0.18, 0.9, smoothstep(0.0, 0.55, vFace));
        gl_FragColor = vec4(${glsl(TEAL)}, a * uOpacity);
      }`,
  });
  root.add(new THREE.Points(g, dotMat));

  // Arcs: great-circle tubes lifted with distance. uv.x runs along the tube: the draw range
  // reveals them, and a pulse travels along them away from a hovered hub.
  const SEG = 72, RAD = 6;
  const byId = Object.fromEntries(hubs.map((h, i) => [h.id, { ...h, i }]));
  const arcMeshes = arcs.map(([a, b]) => {
    const va = ll2v(byId[a].lat, byId[a].lon), vb = ll2v(byId[b].lat, byId[b].lon);
    const lift = 0.06 + 0.32 * (va.angleTo(vb) / Math.PI);
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32; // lerp + normalise: keep every arc well under 180 degrees
      pts.push(new THREE.Vector3().copy(va).lerp(vb, t).normalize().multiplyScalar(1 + lift * Math.sin(Math.PI * t)));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, 0.0042, RAD, false);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uAlpha: { value: 1 }, uDim: { value: 1 }, uPulse: { value: -1 } },
      vertexShader: `varying float vU; void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uAlpha, uDim, uPulse; varying float vU;
        void main() { float glow = 1.0 - smoothstep(0.0, 0.07, abs(vU - uPulse));
          gl_FragColor = vec4(mix(${glsl(ACCENT)}, ${glsl(PULSE)}, glow), uAlpha * max(uDim * 0.95, glow)); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { a, b };
    spin.add(mesh);
    return mesh;
  });

  // Hubs unwrap with the dots. aHi lights a hub (hover in about, a counter on the map).
  const hubPos = new Float32Array(hubs.length * 3), hubFlat = new Float32Array(hubs.length * 3);
  hubs.forEach((h, i) => { ll2v(h.lat, h.lon).multiplyScalar(1.004).toArray(hubPos, i * 3); hubFlat.set(flatOf(h.lat, h.lon), i * 3); });
  const hubGeo = new THREE.BufferGeometry();
  hubGeo.setAttribute("position", new THREE.BufferAttribute(hubPos, 3));
  hubGeo.setAttribute("aFlat", new THREE.BufferAttribute(hubFlat, 3));
  hubGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(hubs.map((h) => (h.kind === "office" ? 11 : 8))), 1));
  const hi = new THREE.BufferAttribute(new Float32Array(hubs.length), 1);
  hubGeo.setAttribute("aHi", hi);
  const hubMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uRot: { value: rot }, uMorph: { value: 0 }, uDpr: { value: dpr }, uTime: { value: 0 }, uLit: { value: 0 } },
    vertexShader: place + /* glsl */ `
      attribute vec3 aFlat; attribute float aSize, aHi; uniform float uDpr; varying float vFace, vHi;
      void main() {
        vec3 p = place(position, aFlat, vFace);
        vHi = aHi;
        gl_PointSize = aSize * uDpr * (1.0 + 1.8 * aHi);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uMorph, uLit; varying float vFace, vHi;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = 1.0 - smoothstep(mix(0.13, 0.09, vHi), mix(0.19, 0.13, vHi), d);
        float k = fract(uTime * 0.7);
        float ring = (1.0 - smoothstep(0.015, 0.045, abs(d - (0.14 + 0.32 * k)))) * (1.0 - k) * vHi; // expanding ring
        float still = (smoothstep(0.26, 0.31, d) - smoothstep(0.42, 0.48, d)) * 0.5 * (1.0 - vHi);
        // While some hubs are lit, the others step back.
        float a = (core + still + ring) * mix(1.0, 0.3, uLit * (1.0 - vHi));
        gl_FragColor = vec4(${glsl(ACCENT)}, a * step(0.0, vFace));
      }`,
  });
  root.add(new THREE.Points(hubGeo, hubMat));

  /* ---- state, render ---- */
  let running = false, dragging = false, vx = 0, vy = 0, last = "", pulsing = false, pulseTween = null;
  const AUTO = 0.0009;
  const clock = new THREE.Clock();

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.right = innerWidth; camera.bottom = -innerHeight;
    camera.updateProjectionMatrix();
    last = "";
  }
  addEventListener("resize", resize);
  resize();

  function sync() {
    root.position.set(state.x, -state.y, 0);
    root.scale.setScalar(Math.max(1, state.r));
    m4.makeRotationFromEuler(tilt.rotation).multiply(m4b.makeRotationFromEuler(spin.rotation));
    rot.setFromMatrix4(m4);
    dotMat.uniforms.uMorph.value = hubMat.uniforms.uMorph.value = state.morph;
    dotMat.uniforms.uOpacity.value = state.dim;
    occ.visible = state.morph < 0.001;
    const arcA = state.arcs * (1 - THREE.MathUtils.smoothstep(state.morph, 0, 0.25));
    arcMeshes.forEach((m, i) => {
      m.visible = arcA > 0.001;
      m.material.uniforms.uAlpha.value = arcA;
      const local = THREE.MathUtils.clamp(state.draw * (arcMeshes.length * 0.5 + 1) - i * 0.5, 0, 1);
      m.geometry.setDrawRange(0, Math.round(local * SEG) * RAD * 6);
    });
  }
  function render() { sync(); hubMat.uniforms.uTime.value = clock.getElapsedTime(); renderer.render(scene, camera); }

  // One loop: spin while it is a globe, render only when something changed (or a hub pulses).
  function tick() {
    if (state.morph < 0.999 && !dragging) {
      spin.rotation.y += AUTO + vx;
      tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + vy, -0.15, 0.75);
      vx *= 0.94; vy *= 0.9;
    }
    const key = `${state.x}|${state.y}|${state.r}|${state.morph}|${state.arcs}|${state.dim}|${state.draw}|${spin.rotation.y}|${tilt.rotation.x}`;
    if (key !== last || hubMat.uniforms.uLit.value || pulsing) { last = key; render(); }
  }

  const tmp = new THREE.Vector3();
  function screenOf(i) { // viewport px of hub i, and whether it faces the viewer
    tmp.fromArray(hubPos, i * 3).applyMatrix3(rot);
    const m = state.morph, x = tmp.x * (1 - m) + hubFlat[i * 3] * m, y = tmp.y * (1 - m) + hubFlat[i * 3 + 1] * m;
    return { x: state.x + x * state.r, y: state.y - y * state.r, front: tmp.z > 0.08 || m > 0.99 };
  }

  return {
    state,
    start() { if (!running) { running = true; gsap.ticker.add(tick); } },
    stop() { if (running) { running = false; gsap.ticker.remove(tick); } },
    // drag by the pixels moved since the last call; release keeps that velocity as inertia
    drag(dx, dy) {
      dragging = true;
      vx = dx * 0.006; vy = dy * 0.004;
      spin.rotation.y += vx;
      tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + vy, -0.15, 0.75);
    },
    release() { dragging = false; },
    // nearest front-facing hub within `radius` px of a viewport point
    pick(px, py, radius = 18) {
      sync();
      let best = null, bd = radius;
      hubs.forEach((h, i) => { const s = screenOf(i), d = Math.hypot(s.x - px, s.y - py); if (s.front && d < bd) { bd = d; best = { hub: h, ...s }; } });
      return best;
    },
    screenOf: (id) => screenOf(byId[id].i),
    // light hubs by id ([] clears)
    highlight(ids) {
      hubs.forEach((h, i) => { hi.array[i] = ids.includes(h.id) ? 1 : 0; });
      hi.needsUpdate = true;
      hubMat.uniforms.uLit.value = ids.length ? 1 : 0;
      render();
    },
    // pulse the arcs of one hub outward, dim the rest (null clears)
    pulse(id) {
      if (pulseTween) pulseTween.kill();
      pulsing = !!id;
      arcMeshes.forEach((m) => {
        const mine = id && (m.userData.a === id || m.userData.b === id);
        m.material.uniforms.uDim.value = !id || mine ? 1 : 0.3;
        m.material.uniforms.uPulse.value = -1;
      });
      if (id) {
        const mine = arcMeshes.filter((m) => m.userData.a === id || m.userData.b === id);
        const p = { t: 0 };
        pulseTween = gsap.to(p, { t: 1, duration: 1.3, ease: "none", repeat: -1,
          onUpdate: () => mine.forEach((m) => { m.material.uniforms.uPulse.value = m.userData.a === id ? p.t : 1 - p.t; }) });
      }
      render();
    },
    render,
  };
}
