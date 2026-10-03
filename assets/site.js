// Letsmed homepage choreography. All scroll-driven motion goes through ScrollTrigger
// (no window scroll listeners, no CSS animation-timeline: Firefox has none).
const { gsap, ScrollTrigger, Flip, SplitText, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, Flip, SplitText);
// Split text only once the real fonts are in: a split made on fallback metrics breaks lines in the wrong places.
await document.fonts.ready;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

// Hubs. Offices are from letsmed.de (Berlin, Shanghai, Buenos Aires, Poland).
// [CONFIRM] supplier/distributor countries are illustrative until the client names real ones.
const HUBS = [
  { id: "ber", name: "Germany", kind: "office", lat: 52.52, lon: 13.4 },
  { id: "sha", name: "China", kind: "office", lat: 31.23, lon: 121.47 },
  { id: "bue", name: "Argentina", kind: "office", lat: -34.52, lon: -58.47 },
  { id: "waw", name: "Poland", kind: "office", lat: 52.23, lon: 21.01 },
  { id: "kul", name: "Malaysia", kind: "supplier", lat: 3.14, lon: 101.69 },
  { id: "bom", name: "India", kind: "supplier", lat: 19.08, lon: 72.88 },
  { id: "ist", name: "Türkiye", kind: "supplier", lat: 41.01, lon: 28.98 },
  { id: "mad", name: "Spain", kind: "distributor", lat: 40.42, lon: -3.7 },
  { id: "sao", name: "Brazil", kind: "distributor", lat: -23.55, lon: -46.63 },
  { id: "lim", name: "Peru", kind: "distributor", lat: -12.05, lon: -77.04 },
  { id: "bog", name: "Colombia", kind: "distributor", lat: 4.71, lon: -74.07 },
  { id: "mex", name: "Mexico", kind: "distributor", lat: 19.43, lon: -99.13 },
  { id: "dxb", name: "UAE", kind: "distributor", lat: 25.2, lon: 55.27 },
  { id: "los", name: "Nigeria", kind: "distributor", lat: 6.52, lon: 3.38 },
];
const KIND = { office: "Letsmed office", supplier: "Supplier", distributor: "Distributor" };
// Supplier -> office -> distributor. Every pair stays well under 180 degrees apart.
const ARCS = [
  ["sha", "ber"], ["kul", "ber"], ["ist", "ber"], ["bom", "dxb"], ["ber", "mad"], ["ber", "los"],
  ["mad", "bue"], ["bue", "sao"], ["bue", "lim"], ["bue", "bog"], ["bog", "mex"], ["waw", "ber"],
];

const mm = gsap.matchMedia();
const splits = new Set();      // SplitText instances to re-split when the language changes
let lenisRef = null;           // the smooth scroller, only in full mode
const motionOK = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const EN = {};                 // the English strings, read from the page itself
$$("[data-i18n]").forEach((el) => { EN[el.dataset.i18n] = el.textContent; });
const FULL = "(min-width: 768px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const REDUCE = "(prefers-reduced-motion: reduce)";

/* ---------------- nav: hidden until the film ends, hides on scroll down ---------------- */
const nav = $("#nav");
const navState = { gate: 0 }; // scroll position before which the nav stays hidden (end of the film)
const setBar = gsap.quickSetter(".nav-progress i", "scaleX");
ScrollTrigger.create({
  start: 0, end: "max",
  onUpdate(self) {
    setBar(self.progress);
    const y = self.scroll();
    if (y < navState.gate - 2) return nav.classList.add("is-hidden");
    // Grace zone right after the film: the nav just arrived, do not yank it away.
    const grace = y < navState.gate + innerHeight * 0.6;
    nav.classList.toggle("is-hidden", self.direction === 1 && !grace && y > 120);
  },
});
$(".nav-toggle").addEventListener("click", (e) => {
  const open = nav.classList.toggle("is-open");
  e.currentTarget.setAttribute("aria-expanded", open);
});
$$("#nav-links a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("is-open")));

/* ---------------- hero headline: masked line reveal (all modes but reduced) ---------------- */
mm.add("(prefers-reduced-motion: no-preference)", () => {
  const split = SplitText.create(".hero h1", { type: "lines", mask: "lines", autoSplit: true,
    onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.09, delay: 0.15 }) });
  gsap.from(".hero-sub", { y: 18, opacity: 0, duration: 1, ease: "expo.out", delay: 0.3 });          // 150 ms after the headline
  gsap.from(".hero-ctas .btn", { y: 22, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.08, delay: 0.45 });
  splits.add(split);
  return () => { splits.delete(split); split.revert(); };
});

/* ---------------- full mode ---------------- */
mm.add(FULL, () => {
  const lenis = new Lenis({ lerp: 0.1, anchors: true });
  lenisRef = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  const raf = (t) => lenis.raf(t * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  root.classList.add("mode-full");
  nav.classList.add("is-hidden");
  const undo = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); undo.push(() => el.removeEventListener(ev, fn)); };

  magnetic($$(".magnetic"));
  const film = scrubFilm($(".hero-film"), $(".hero"));

  /* The globe: one full-viewport WebGL layer. Scroll tweens drive `gs` (centre, radius, unwrap),
     the module renders it. Slots are measured relative to their pinned section, so each target is
     a viewport rect at pin time. */
  const host = $("#globe");
  const gs = { x: 0, y: 0, r: 200, morph: 0, arcs: 1, dim: 1, draw: 0 };
  let globe = null;
  import("./globe.js").then(({ createGlobe }) => createGlobe(host, { hubs: HUBS, arcs: ARCS, state: gs })).then((g) => { globe = g; globe.render(); });
  const vw = () => innerWidth, vh = () => innerHeight;
  const rel = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; };
  const slot = (el, box) => () => { const r = rel(el, box); return { x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w * 0.36 }; };
  const atHero = slot($("#slot-hero"), $(".hero-stage"));
  const atAbout = slot($("#slot-about"), $("#about"));
  const atSmall = () => ({ x: vw() / 2, y: vh() * 0.52, r: Math.min(vw(), vh()) * 0.15 });
  // Flat map: 3.8 r wide, its visual centre sits 0.15 r above the projection centre.
  const atMap = () => { const r = Math.min(vw() * 0.92 / 3.8, vh() * 0.8 / 1.48); return { x: vw() / 2, y: vh() / 2 + 0.15 * r, r }; };
  // Each scroll segment owns one progress value in P (0..1); compose() derives the globe state from
  // all of them. Several tweens writing the same gs fields fought on refresh (the globe came back
  // part-unwrapped), so no tween touches gs directly.
  const P = { show: 0, intro: 0, draw: 0, flip: 0, recede: 0, map: 0, lift: 0, gone: 0 };
  let H = null, A = null;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixS = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), r: lerp(a.r, b.r, t) });
  function compose() {
    if (!H) { H = atHero(); A = atAbout(); }
    let s = mixS(H, A, P.flip);
    s = mixS(s, atSmall(), P.recede);
    s = mixS(s, atMap(), P.map);
    gs.x = s.x; gs.y = s.y - vh() * P.lift; gs.r = s.r * lerp(0.8, 1, P.intro);
    gs.morph = lerp(0.22 * P.recede, 1, P.map); gs.dim = lerp(1, 0.5, P.map); gs.draw = P.draw;
    gsap.set(host, { autoAlpha: P.show * (1 - P.gone) });
  }
  const seg = (key, vars = {}) => [{ [key]: 0 }, { [key]: 1, onUpdate: compose, ...vars }];
  const remeasure = () => { H = atHero(); A = atAbout(); compose(); };
  ScrollTrigger.addEventListener("refresh", remeasure);
  undo.push(() => ScrollTrigger.removeEventListener("refresh", remeasure));

  /* 1. HERO, pinned. Film scrubs, copy leaves, the globe fades in over the last frames, arcs draw,
     the film dissolves into the page and only the globe remains (T1). */
  const hero = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: ".hero", start: "top top", end: "+=180%", pin: true, scrub: 0.6, invalidateOnRefresh: true,
      onRefresh: (self) => { navState.gate = self.end; } },
  });
  hero
    .to(film.state, { t: 1, duration: 0.9, onUpdate: film.seek }, 0)
    .to(".hero-copy", { y: -60, opacity: 0, duration: 0.16 }, 0.03)
    .fromTo(P, ...seg("show", { duration: 0.16 }), 0.74)
    .fromTo(P, ...seg("intro", { duration: 0.28, ease: "power2.out" }), 0.7)
    .fromTo(P, ...seg("draw", { duration: 0.24 }), 0.76)
    .fromTo(".hero-media", { opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(6px)", duration: 0.12 }, 0.88)
    .to(".hero-veil", { opacity: 0, duration: 0.1 }, 0.9);
  // Above the film during the hero, under the content afterwards (the band tint must sit over it).
  const pastEnd = () => ScrollTrigger.maxScroll(window) + 100; // "max" turns a trigger off at the very last pixel
  ScrollTrigger.create({ start: () => hero.scrollTrigger.end, end: pastEnd, toggleClass: { targets: host, className: "is-under" } });

  /* T1 -> About: while About rises, the globe travels into the right column (a Flip-style fit to the
     slot's pinned position), so it lands exactly as the pin starts and never crosses the heading. */
  gsap.fromTo(P, ...seg("flip", { ease: "power2.inOut",
    scrollTrigger: { trigger: "#about", start: "top bottom", end: "top top", scrub: 0.6 } }));

  /* 2. ABOUT, pinned: words light up; the globe is live (drag with inertia, hub labels, arc pulses). */
  let live = false;
  const aboutPin = ScrollTrigger.create({ trigger: "#about", start: "top top", end: "+=110%", pin: true,
    onToggle: (s) => { live = s.isActive; if (!live) setHub(null); } });
  // The light-up lives in onSplit so a language switch (revert, new text, split) rebuilds it.
  const words = SplitText.create(".about-text", { type: "words", wordsClass: "w", autoSplit: true, // autoSplit re-reads new text
    onSplit: (self) => gsap.fromTo(self.words, { opacity: 0.16 }, { opacity: 1, ease: "none", stagger: 0.7 / self.words.length,
      scrollTrigger: { start: () => aboutPin.start + 0.04 * (aboutPin.end - aboutPin.start), end: () => aboutPin.start + 0.8 * (aboutPin.end - aboutPin.start), scrub: 0.6 } }) });
  splits.add(words);
  undo.push(() => { splits.delete(words); words.revert(); });

  const label = document.createElement("div");
  label.className = "hub-label";
  host.appendChild(label);
  let current = null, down = null;
  function setHub(p) {
    const id = p ? p.hub.id : null;
    if (id !== current && globe) { current = id; globe.pulse(id); globe.highlight(id ? [id] : []); }
    if (p) label.innerHTML = `<b>${p.hub.name}</b><span>${KIND[p.hub.kind]}</span>`;
    label.classList.toggle("is-on", !!p);
  }
  const follow = () => { // the label rides on its hub while the globe turns
    if (!current || !globe) return;
    const s = globe.screenOf(current);
    label.style.transform = `translate(${s.x}px, ${s.y}px)`;
    if (!s.front) setHub(null);
  };
  gsap.ticker.add(follow);
  undo.push(() => gsap.ticker.remove(follow));
  const slotA = $("#slot-about");
  on(slotA, "pointerdown", (e) => { if (!live || !globe) return; down = { x: e.clientX, y: e.clientY, moved: false }; slotA.setPointerCapture(e.pointerId); });
  on(slotA, "pointermove", (e) => {
    if (!live || !globe) return;
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { down.moved = true; setHub(null); }
      globe.drag(dx, dy); down.x = e.clientX; down.y = e.clientY;
      return;
    }
    setHub(globe.pick(e.clientX, e.clientY));
  });
  const up = (e) => { if (!down) return; globe.release(); if (!down.moved) setHub(globe.pick(e.clientX, e.clientY, 26)); down = null; };
  on(slotA, "pointerup", up);
  on(slotA, "pointercancel", up);
  on(slotA, "pointerleave", () => { if (!down) setHub(null); });

  /* T2 starts: About leaves, the globe recedes to the centre and begins to unwrap. */
  gsap.fromTo(P, ...seg("recede", { ease: "power1.inOut",
    scrollTrigger: { trigger: "#numbers", start: "top bottom", end: "top top", scrub: 0.6 } }));

  /* 3-4. One pinned stage. Units are scroll viewports (total 5 => +=500%).
     0-0.7    T2 ends: the band is born from the top while the globe flattens into the faint map
     0.75-1.6 counters roll; hovering one lights its hubs on the map
     1.6-2.4  T3 curtain: the band rolls up with the map and uncovers the How stage beneath
     2.45-4.0 How it works: the path draws, the parcel travels, nodes activate in turn
     4.2-5.0  T4 iris: the Letsmed node opens into a circle onto Why Letsmed */
  const stage = $("#numbers");
  const band = $(".band"), howL = $(".how"), iris = $(".iris"), ring = $(".iris-ring");
  const rolls = buildRolls($$(".num"));
  undo.push(() => rolls.revert());
  const strips = $$(".num .strip");
  const steps = $$(".step");
  const trackPath = $(".how-path path"), track = $(".how-track"), parcel = $(".parcel");
  steps.forEach((s) => s.querySelector(".node").insertAdjacentHTML("beforeend", '<span class="ring" aria-hidden="true"></span>'));
  undo.push(() => $$(".node .ring").forEach((r) => r.remove()));
  const brand = $(".node-brand"), ringStroke = ring.querySelector("circle");
  const irisAt = () => { const r = rel(brand, stage); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  const irisR = () => { const c = irisAt(); return Math.hypot(Math.max(c.x, vw() - c.x), Math.max(c.y, vh() - c.y)) + 24; };
  const parcelAt = { t: 0 };
  const moveParcel = () => {
    const L = trackPath.getTotalLength(), p = trackPath.getPointAtLength(parcelAt.t * L);
    gsap.set(parcel, { x: (p.x / 1200) * track.clientWidth, y: p.y });
  };
  const STEP_AT = [2.45, 3.2, 3.95];

  const tl = gsap.timeline({ defaults: { ease: "none" },
    scrollTrigger: { trigger: stage, start: "top top", end: "+=500%", pin: true, scrub: 0.6, invalidateOnRefresh: true } });
  tl
    // T2 ends
    .fromTo(band, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power2.inOut" }, 0)
    .fromTo(P, ...seg("map", { duration: 0.7, ease: "power2.inOut" }), 0)
    .fromTo(".counter", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: "power2.out" }, 0.4)
    // counters
    .fromTo(strips, { yPercent: 0 }, { yPercent: (i, el) => -((el.children.length - 1) / el.children.length) * 100, duration: 0.42, stagger: 0.022, ease: "power2.inOut" }, 0.72)
    // T3 curtain: band and map leave upward together, How is uncovered from below
    .fromTo(band, { yPercent: 0 }, { yPercent: -100, duration: 0.8, ease: "power2.inOut", immediateRender: false }, 1.6)
    .fromTo(howL, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "power2.inOut" }, 1.6)
    .fromTo(P, ...seg("lift", { duration: 0.8, ease: "power2.inOut" }), 1.6)
    .fromTo(P, ...seg("gone", { duration: 0.05 }), 2.36)
    // How it works
    .fromTo(".how-path.is-drawn", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.5 }, 2.45)
    .fromTo(parcelAt, { t: 0 }, { t: 1, duration: 1.5, onUpdate: moveParcel }, 2.45)
    .fromTo(parcel, { scale: 0 }, { scale: 1, duration: 0.12, ease: "back.out(2)" }, 2.42);
  steps.forEach((s, i) => {
    tl.fromTo(s.querySelector(".node > :first-child"), { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.18, ease: "back.out(1.8)" }, STEP_AT[i])
      .fromTo(s.querySelector(".ring"), { opacity: 0 }, { opacity: 1, duration: 0.1 }, STEP_AT[i])
      .fromTo(s.querySelector("p"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, STEP_AT[i] + 0.06);
  });
  tl
    .to(parcel, { scale: 0, duration: 0.1 }, 4.0)
    // T4 iris
    .to(brand, { scale: 1.18, duration: 0.15, ease: "power2.out" }, 4.1)
    .fromTo(iris, { clipPath: () => `circle(0px at ${irisAt().x}px ${irisAt().y}px)` },
      { clipPath: () => `circle(${irisR()}px at ${irisAt().x}px ${irisAt().y}px)`, duration: 0.8, ease: "power3.in" }, 4.2)
    .fromTo(ring, { x: () => irisAt().x - 50, y: () => irisAt().y - 50, scale: 0.8, opacity: 0 },
      { x: () => irisAt().x - 50, y: () => irisAt().y - 50, scale: () => irisR() / 50, duration: 0.8, ease: "power3.in",
        onUpdate: () => ringStroke.setAttribute("stroke-width", (2 / gsap.getProperty(ring, "scale")).toFixed(3)) }, 4.2)
    .to(ring, { opacity: 1, duration: 0.06 }, 4.2)
    .to(ring, { opacity: 0, duration: 0.12 }, 4.88)
    .fromTo(".iris-in > *", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.06, ease: "power2.out" }, 4.6);

  // Clicking a node jumps the scroll to that step.
  const stepY = (i) => { const st = tl.scrollTrigger; return st.start + ((STEP_AT[i] + 0.25) / tl.duration()) * (st.end - st.start); };
  $$(".node").forEach((n) => { n.disabled = false; on(n, "click", () => lenis.scrollTo(stepY(+n.dataset.step), { duration: 1.4 })); });
  undo.push(() => $$(".node").forEach((n) => { n.disabled = true; }));
  // "Services" in the nav lands on the How stage, not on the numbers band that shares its section.
  on($('a[href="#how"]'), "click", (e) => { e.preventDefault(); lenis.scrollTo(stepY(0) - vh() * 0.2, { duration: 1.6 }); });

  // Hover a counter: its hubs light up on the map behind it.
  $$(".counter").forEach((c) => {
    const ids = HUBS.filter((h) => c.dataset.hubs === "all" || h.kind === c.dataset.hubs).map((h) => h.id);
    on(c, "pointerenter", () => globe && globe.highlight(ids));
    on(c, "pointerleave", () => globe && globe.highlight([]));
  });

  // The globe renders from the end of the film until the map has left with the curtain.
  // Positions are explicit numbers: a trigger on the pinned hero itself gets shifted past its own pin.
  const at = (st, u) => st.start + u * (st.end - st.start);
  ScrollTrigger.create({ start: () => at(hero.scrollTrigger, 0.65), end: () => at(tl.scrollTrigger, 2.4 / 5),
    onToggle: (s) => globe && (s.isActive ? globe.start() : globe.stop()) });

  /* 5. WHY LETSMED: a real sticky stack. Each card pins at the top until the last one arrives;
     the one underneath scales to 0.92 and dims as the next slides over it. */
  const cards = $$(".pillar");
  cards.forEach((card, i) => {
    if (i === cards.length - 1) return;
    ScrollTrigger.create({ trigger: card, start: "top top", endTrigger: cards[cards.length - 1], end: "top top", pin: true, pinSpacing: false });
    // Dim with a shade layer's opacity: a scrubbed filter on a 1200 px card repainted every frame
    // (all of the page's slow frames were here), and card opacity let the cards beneath show through.
    const c = card.querySelector(".card");
    c.insertAdjacentHTML("beforeend", '<span class="shade" aria-hidden="true"></span>');
    gsap.timeline({ scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top top", scrub: true } })
      .fromTo(c, { scale: 1 }, { scale: 0.92, ease: "none" }, 0)
      .fromTo(c.querySelector(".shade"), { opacity: 0 }, { opacity: 1, ease: "none" }, 0);
  });
  undo.push(() => $$(".card .shade").forEach((s) => s.remove()));
  // Decode the stack's photos while the numbers stage plays: the first paint of a lazy card image
  // cost one ~250 ms frame in both browsers.
  const predecode = (sel) => () => $$(sel).forEach((img) => { img.loading = "eager"; img.decode().catch(() => {}); });
  ScrollTrigger.create({ trigger: stage, start: "top bottom", once: true, onEnter: predecode(".pillar img") });
  ScrollTrigger.create({ trigger: ".why", start: "top bottom", once: true, onEnter: predecode(".cutout, .wh") });
  // Spotlight on the card edge follows the cursor.
  $$(".card").forEach((c) => on(c, "pointermove", (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  }));

  /* T5 to T7: products and logistics share one pinned stage (scrub 1). Units are viewports:
     0-1        T5 peel: the last pillar card lifts and slides away while the products wait underneath
     1-1+PAN    horizontal pan; category names reveal as their tile enters
     T6 (1)     the last tile becomes a window onto the warehouse, then the window opens to full bleed
     LOG (1.6)  zoom parallax, text on three depths, the pull-quote wipes in line by line
     T7 (1)     the image darkens and blurs to depth 0 while Trust slides up over it */
  const pstage = $("#products"), ptrack = $(".ptrack"), tiles = $$(".tile");
  const logi = $(".logistics"), whFrame = $(".wh-frame"), wh = $(".wh"), scrim = $(".wh-scrim");
  const lastBtn = tiles[tiles.length - 1].querySelector(".tile-btn");
  const panDist = () => Math.max(0, ptrack.scrollWidth - pstage.clientWidth);
  const PAN = Math.max(1.2, panDist() / vh());
  const T6 = 1 + PAN, LOG = T6 + 1, T7 = LOG + 1.6, TOTAL = T7 + 1;
  const tileWindow = () => { // the last tile's rect at the end of the pan, as an inset() on the stage
    const x0 = gsap.getProperty(ptrack, "x");
    gsap.set(ptrack, { x: -panDist() });
    const r = rel(lastBtn, pstage);
    gsap.set(ptrack, { x: x0 });
    return `inset(${r.y}px ${pstage.clientWidth - r.x - r.w}px ${pstage.clientHeight - r.y - r.h}px ${r.x}px round 14px)`;
  };
  const pull = SplitText.create(".pull p", { type: "lines" });
  const lastCard = $$(".pillar .card").pop();
  gsap.set(logi, { autoAlpha: 0 });
  undo.push(() => { pull.revert(); gsap.set([logi, whFrame, wh, scrim, ptrack, lastCard, ".pintro > *", ".d-slow", ".d-mid", ".d-fast", ".log-text", ".pull cite", ".offices", ".tile-name > span", ".cutout"], { clearProps: "all" }); });
  const ptl = gsap.timeline({ defaults: { ease: "none" },
    scrollTrigger: { trigger: pstage, start: "top top", end: () => `+=${TOTAL * vh()}`, pin: true, scrub: 1, invalidateOnRefresh: true } });
  ptl
    .fromTo(lastCard, { rotation: 0, x: 0, y: 0 }, { rotation: -6, x: () => -vw() * 0.05, y: () => -vh() * 0.22, transformOrigin: "0% 100%", duration: 1, ease: "power1.in" }, 0)
    .fromTo(".pintro > *", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power2.out" }, 0.5)
    .fromTo(ptrack, { x: 0 }, { x: () => -panDist(), duration: PAN }, 1);
  tiles.forEach((t) => {
    const p = (t.offsetLeft - vw() * 0.86) / Math.max(1, panDist());
    ptl.fromTo(t.querySelector(".tile-name > span"), { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: "power3.out" }, p <= 0 ? 0.7 : 1 + p * PAN);
  });
  ptl
    .set(logi, { autoAlpha: 1 }, T6)
    .fromTo(whFrame, { clipPath: () => tileWindow(), opacity: 0 }, { opacity: 1, duration: 0.15 }, T6)
    .to(lastBtn.querySelector(".cutout"), { opacity: 0, duration: 0.15 }, T6)
    .to(whFrame, { clipPath: "inset(0px 0px 0px 0px round 0px)", duration: 0.85, ease: "power2.inOut" }, T6 + 0.15)
    .fromTo(wh, { scale: 1.45 }, { scale: 1.15, duration: 1, ease: "power2.inOut" }, T6)
    .fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.3 }, T6 + 0.8)
    .fromTo(wh, { scale: 1.15 }, { scale: 1.03, duration: 2.6, immediateRender: false }, LOG)
    .fromTo(".d-slow", { y: 60 }, { y: -40, duration: 2.6 }, LOG - 0.2)
    .fromTo(".d-mid", { y: 120 }, { y: -70, duration: 2.6 }, LOG - 0.2)
    .fromTo(".d-fast", { y: 180 }, { y: -100, duration: 2.6 }, LOG - 0.2)
    .fromTo([".d-slow", ".log-text", ".pull cite", ".offices"], { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: 0.1 }, LOG - 0.15)
    .fromTo(pull.lines, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, stagger: 0.15, ease: "power2.inOut" }, LOG + 0.3)
    .fromTo(wh, { filter: "brightness(1) blur(0px)" }, { filter: "brightness(0.62) blur(10px)", duration: 1 }, T7);

  // Tiles tilt toward the cursor; the warehouse drifts against it.
  tiles.forEach((t) => {
    const m = t.querySelector(".tile-media");
    gsap.set(m, { transformPerspective: 900 });
    const rx = gsap.quickTo(m, "rotationX", { duration: 0.6, ease: "power3.out" }), ry = gsap.quickTo(m, "rotationY", { duration: 0.6, ease: "power3.out" });
    on(t, "pointermove", (e) => { const r = t.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - 0.5) * 14); rx(((e.clientY - r.top) / r.height - 0.5) * -10); });
    on(t, "pointerleave", () => { rx(0); ry(0); });
  });
  const wx = gsap.quickTo(wh, "x", { duration: 0.9, ease: "power3.out" }), wy = gsap.quickTo(wh, "y", { duration: 0.9, ease: "power3.out" });
  on(logi, "pointermove", (e) => { wx((e.clientX / vw() - 0.5) * -24); wy((e.clientY / vh() - 0.5) * -16); });
  // "Products" lands after the peel, on the products themselves.
  $$('a[href="#products"]').forEach((a) => on(a, "click", (e) => { e.preventDefault(); lenis.scrollTo(ptl.scrollTrigger.start + 1.02 * vh(), { duration: 1.6 }); }));

  /* T8: a magenta circle grows from the Trust CTA until it fills the section, which hands over to Contact. */
  const trust = $("#trust"), cta = $(".iris-cta");
  const ctaAt = () => { const r = rel(cta, trust); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  const ctaR = () => { const c = ctaAt(); return Math.hypot(Math.max(c.x, trust.offsetWidth - c.x), Math.max(c.y, trust.offsetHeight - c.y)) + 24; };
  gsap.timeline({ scrollTrigger: { trigger: trust, start: "bottom bottom", end: "+=90%", pin: true, scrub: 0.6, invalidateOnRefresh: true } })
    .fromTo(".iris-fill", { clipPath: () => `circle(0px at ${ctaAt().x}px ${ctaAt().y}px)` },
      { clipPath: () => `circle(${ctaR()}px at ${ctaAt().x}px ${ctaAt().y}px)`, ease: "power2.in" });

  /* T9: the page lifts off a fixed footer. Main keeps a bottom margin the size of the footer. */
  const footer = $("#footer");
  const footH = () => root.style.setProperty("--foot-h", `${footer.offsetHeight}px`);
  footH();
  ScrollTrigger.addEventListener("refreshInit", footH);
  undo.push(() => { ScrollTrigger.removeEventListener("refreshInit", footH); root.style.removeProperty("--foot-h"); footer.style.visibility = ""; });
  ScrollTrigger.create({ trigger: "#contact", start: "bottom bottom", end: pastEnd, onToggle: (s) => { footer.style.visibility = s.isActive ? "visible" : ""; } });
  gsap.fromTo(".foot-in", { yPercent: -18, opacity: 0.3 }, { yPercent: 0, opacity: 1, ease: "none",
    scrollTrigger: { trigger: "#contact", start: "bottom bottom", end: () => `+=${footer.offsetHeight}`, scrub: true } });

  return () => {
    undo.forEach((f) => f());
    lenisRef = null;
    gsap.ticker.remove(raf); lenis.destroy(); film.destroy();
    root.classList.remove("mode-full");
    navState.gate = 0;
    if (globe) globe.stop();
    host.innerHTML = ""; gsap.set(host, { clearProps: "all" }); host.classList.remove("is-under");
  };
});

/* ---------------- still modes: mobile and reduced motion ---------------- */
mm.add("(max-width: 767px), (pointer: coarse), " + REDUCE, () => {
  root.classList.add("mode-still");
  nav.classList.remove("is-hidden");
  return () => root.classList.remove("mode-still");
});
// Mobile with motion allowed: sections reveal once as they enter. Reduced motion: shown as is.
mm.add("(max-width: 767px) and (prefers-reduced-motion: no-preference), (pointer: coarse) and (prefers-reduced-motion: no-preference)", () => {
  const els = $$(".counter, .step, .iris-in, .pillar .card");
  els.forEach((el) => el.classList.add("reveal"));
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    // Also catch elements already scrolled past: a jump to the bottom must not leave them hidden.
    if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -10% 0px" });
  els.forEach((el) => io.observe(el));
  return () => { io.disconnect(); els.forEach((el) => el.classList.remove("reveal", "in")); };
});

/* ---------------- marquee and quote (motion allowed) ---------------- */
mm.add("(prefers-reduced-motion: no-preference)", () => {
  // The page's only marquee: slows under the cursor, follows the scroll direction, speeds up with velocity.
  const mq = $(".mq-track"), original = mq.innerHTML;
  mq.insertAdjacentHTML("beforeend", original.replace(/<li /g, '<li aria-hidden="true" '));
  const loop = gsap.to(mq, { xPercent: -50, duration: 40, ease: "none", repeat: -1 });
  let dir = 1, hover = 1;
  const settle = () => gsap.to(loop, { timeScale: dir * hover, duration: 0.9, overwrite: true });
  const marquee = $(".marquee");
  const enter = () => { hover = 0.25; settle(); }, leave = () => { hover = 1; settle(); };
  marquee.addEventListener("pointerenter", enter);
  marquee.addEventListener("pointerleave", leave);
  const st = ScrollTrigger.create({ trigger: marquee, start: "top bottom", end: "bottom top", onUpdate: (s) => {
    dir = s.direction;
    const boost = 1 + Math.min(Math.abs(s.getVelocity()) / 1200, 2.5);
    gsap.to(loop, { timeScale: dir * hover * boost, duration: 0.25, overwrite: true, onComplete: settle });
  } });
  // The quote appears word by word, like it is being typed.
  const q = SplitText.create(".quote p", { type: "words" });
  const typing = gsap.from(q.words, { opacity: 0, duration: 0.01, stagger: 0.05, scrollTrigger: { trigger: ".quote", start: "top 78%", toggleActions: "play none none reverse" } });
  return () => {
    loop.kill(); st.kill(); typing.kill(); q.revert(); mq.innerHTML = original;
    marquee.removeEventListener("pointerenter", enter); marquee.removeEventListener("pointerleave", leave);
  };
});

/* ---------------- product sheet: a dialog the tile morphs into (Flip, full mode) ---------------- */
const sheet = $("#sheet"), sIn = $(".sheet-in"), sMedia = $(".sheet-media");
let openTile = null;
function openSheet(tile) {
  const btn = tile.querySelector(".tile-btn"), media = tile.querySelector(".tile-media");
  const flip = root.classList.contains("mode-full");
  btn.dataset.flipId = sIn.dataset.flipId = "sheet-panel";
  media.dataset.flipId = sMedia.dataset.flipId = "sheet-media";
  const state = flip && Flip.getState([btn, media]);
  $("#sheet-title").textContent = tile.querySelector(".tile-name").textContent.trim();
  $(".sheet-meta").textContent = tile.querySelector(".tile-meta").textContent;
  $(".sheet-items").innerHTML = tile.querySelector(".tile-items").innerHTML;
  sMedia.replaceChildren(tile.querySelector(".cutout").cloneNode());
  openTile = tile;
  sheet.showModal();
  if (lenisRef) lenisRef.stop();
  if (flip) {
    Flip.from(state, { targets: [sIn, sMedia], duration: 0.75, ease: "expo.inOut", scale: true });
    gsap.fromTo(".sheet-text > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, delay: 0.35, ease: "power2.out" });
  }
}
function closeSheet(after) {
  if (!openTile) return;
  const tile = openTile;
  openTile = null;
  const done = () => {
    sheet.close();
    gsap.set([sIn, sMedia, ".sheet-text > *"], { clearProps: "all" });
    if (lenisRef) lenisRef.start();
    if (after) after(); else tile.querySelector(".tile-btn").focus({ preventScroll: true });
  };
  if (!root.classList.contains("mode-full")) return done();
  gsap.to(".sheet-text > *", { opacity: 0, duration: 0.15 });
  Flip.fit(sIn, tile.querySelector(".tile-btn"), { duration: 0.5, ease: "expo.inOut", scale: true, onComplete: done });
}
$$(".tile-btn").forEach((b) => b.addEventListener("click", () => openSheet(b.closest(".tile"))));
$(".sheet-close").addEventListener("click", () => closeSheet());
sheet.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });          // Escape
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });       // backdrop
$(".sheet-quote").addEventListener("click", (e) => {
  e.preventDefault();
  const name = $("#sheet-title").textContent;
  closeSheet(() => goContact("distributor", `Quote request: ${name}. `));
});

/* ---------------- contact: the role toggle morphs the form (Flip), validation, mailto send ---------------- */
const form = $("#contact-form"), roleEl = $(".role"), pill = $(".role-pill"), roleBtns = $$(".role button");
const countryLabel = $(".f-country label"), messageBox = $("#f-message");
let role = "supplier";
function placePill(animate) {
  const b = roleBtns.find((x) => x.dataset.role === role);
  const clip = `inset(4px ${roleEl.clientWidth - b.offsetLeft - b.offsetWidth}px 4px ${b.offsetLeft}px round 999px)`;
  if (animate) gsap.to(pill, { clipPath: clip, duration: 0.55, ease: "expo.out" }); else gsap.set(pill, { clipPath: clip });
}
document.fonts.ready.then(() => placePill(false));
new ResizeObserver(() => placePill(false)).observe(roleEl);
function setRole(next) {
  if (next === role) return;
  role = next;
  const motion = motionOK();
  roleBtns.forEach((b) => b.setAttribute("aria-checked", b.dataset.role === role));
  placePill(motion);
  const state = motion && Flip.getState(".field, .form-end");
  form.classList.toggle("is-supplier", role === "supplier");
  form.classList.toggle("is-distributor", role === "distributor");
  countryLabel.textContent = countryLabel.dataset[role];
  messageBox.placeholder = messageBox.dataset[role];
  if (motion) {
    Flip.from(state, { duration: 0.65, ease: "expo.inOut" });
    gsap.fromTo(countryLabel, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, delay: 0.2 });
  }
}
roleBtns.forEach((b) => b.addEventListener("click", () => setRole(b.dataset.role)));
roleEl.addEventListener("keydown", (e) => { // radiogroup: arrows move the choice
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  setRole(role === "supplier" ? "distributor" : "supplier");
  roleBtns.find((x) => x.dataset.role === role).focus();
});
$$("a[data-role]:not(.sheet-quote)").forEach((a) => a.addEventListener("click", () => setRole(a.dataset.role)));
function goContact(next, msg) {
  if (next) setRole(next);
  if (msg && !messageBox.value.startsWith(msg)) messageBox.value = msg + messageBox.value;
  const focusFirst = () => (["#f-name", "#f-company", "#f-country"].map((x) => $(x)).find((x) => !x.value.trim()) || messageBox).focus({ preventScroll: true });
  if (lenisRef) lenisRef.scrollTo("#contact", { duration: 1.6, onComplete: focusFirst });
  else { $("#contact").scrollIntoView({ behavior: motionOK() ? "smooth" : "auto" }); setTimeout(focusFirst, 700); }
}
const RULES = {
  name: [(v) => v.length > 1, "Please enter your name."],
  company: [(v) => v.length > 1, "Please enter your company."],
  country: [(v) => v.length > 1, "Please enter a country."],
  message: [(v) => v.length >= 10, "Please add a few words about what you need."],
};
function check(el) {
  const [ok, msg] = RULES[el.name], good = ok(el.value.trim()), field = el.closest(".field");
  field.classList.toggle("invalid", !good);
  el.setAttribute("aria-invalid", !good);
  field.querySelector(".err span").textContent = good ? "" : msg;
  return good;
}
Object.keys(RULES).forEach((n) => form.elements[n].addEventListener("input", (e) => { if (e.target.closest(".invalid")) check(e.target); }));
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const bad = Object.keys(RULES).map((n) => form.elements[n]).filter((el) => !check(el));
  if (bad.length) return bad[0].focus();
  const btn = form.querySelector(".submit"), f = form.elements;
  btn.classList.add("is-loading");
  btn.disabled = true;
  const body = `Name: ${f.name.value}\nCompany: ${f.company.value}\n${countryLabel.textContent}: ${f.country.value}\n\n${f.message.value}`;
  const subject = `${role === "supplier" ? "Supplier" : "Distributor"} enquiry from ${f.company.value}`;
  setTimeout(() => {
    // A static site has no backend: the message opens in the visitor's own email app, addressed to Letsmed.
    location.href = `mailto:info@letsmed.de?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $(".thanks").textContent = "Thank you. Your message to info@letsmed.de is ready in your email app.";
    const inset = (btn.offsetWidth - 56) / 2;
    const tl = gsap.timeline({ defaults: { ease: "expo.inOut" } });
    tl.to(".s-dots", { opacity: 0, duration: 0.2 })
      .fromTo(btn, { clipPath: "inset(0px 0px 0px 0px round 28px)" }, { clipPath: `inset(0px ${inset}px 0px ${inset}px round 28px)`, duration: 0.55 }, 0)
      .fromTo(".s-check", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, 0.35)
      .to(".form-note", { opacity: 0, duration: 0.2 }, 0.35)
      .fromTo(".thanks", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.55);
    if (!motionOK()) tl.progress(1);
  }, motionOK() ? 900 : 0);
});

/* ---------------- language switcher: crossfades to the live site's own translations ---------------- */
async function setLang(l) {
  const dict = l === "en" ? EN : await fetch(`assets/i18n/${l}.json`).then((r) => r.json()).catch(() => null);
  if (!dict) return;
  const els = $$("[data-i18n]");
  const swap = () => {
    splits.forEach((x) => x.revert());
    els.forEach((el) => { el.textContent = dict[el.dataset.i18n] || EN[el.dataset.i18n]; });
    root.lang = l;
    splits.forEach((x) => x.split());
    ScrollTrigger.refresh();
  };
  $$(".langs button").forEach((b) => b.setAttribute("aria-pressed", b.lang === l));
  if (!motionOK()) return swap();
  await gsap.to(els, { opacity: 0, duration: 0.25 });
  swap();
  gsap.to(els, { opacity: 1, duration: 0.45, stagger: 0.01 });
}
$$(".langs button").forEach((b) => b.addEventListener("click", () => setLang(b.lang)));

// Every reveal above has set its start state: the hero copy can show now.
root.classList.remove("js");

/* ---------------- helpers ---------------- */

// The scrubbed film. Cobalt-proven recipe: download the whole file first (a seek that waits on
// the network stutters), keep one seek in flight and only the latest pending, all-intra encode.
function scrubFilm(video, hero) {
  const state = { t: 0 };
  let busy = false, pending = null, dead = false;
  const go = (t) => {
    if (!video.duration) return;
    if (busy) { pending = t; return; }
    busy = true;
    try { video.currentTime = t * (video.duration - 0.05); } catch { busy = false; }
  };
  video.addEventListener("seeked", () => { busy = false; if (pending !== null) { const t = pending; pending = null; go(t); } });
  const ctrl = new AbortController();
  fetch("assets/video/hero-scrub.mp4", { signal: ctrl.signal })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then((b) => {
      if (dead) return;
      video.src = URL.createObjectURL(b);
      video.addEventListener("loadeddata", () => { go(state.t); hero.classList.add("is-film"); }, { once: true });
      video.load();
    })
    .catch(() => {}); // the still stays: the page works without the film
  return {
    state,
    seek: () => go(state.t),
    destroy() { dead = true; ctrl.abort(); hero.classList.remove("is-film"); if (video.src) URL.revokeObjectURL(video.src); video.removeAttribute("src"); },
  };
}

// Digit roll: each digit becomes a masked column that rolls 0-9 (the right-hand digits spin more)
// and lands on its value. Screen readers get the plain number.
function buildRolls(els) {
  els.forEach((el) => {
    const v = el.dataset.value, suf = el.dataset.suffix || "";
    el.setAttribute("aria-label", v + suf);
    el.innerHTML = [...v].map((d, i) => {
      const seq = [];
      for (let c = 0; c <= i; c++) for (let k = 0; k < 10; k++) seq.push(k); // like an odometer: the rightmost spins most
      for (let k = 0; k <= +d; k++) seq.push(k);
      return `<span class="col" aria-hidden="true"><span class="strip">${seq.map((k) => `<span>${k}</span>`).join("")}</span></span>`;
    }).join("") + (suf ? `<span class="suffix" aria-hidden="true">${suf}</span>` : "");
  });
  return { revert: () => els.forEach((el) => { el.textContent = el.dataset.value + (el.dataset.suffix || ""); el.removeAttribute("aria-label"); }) };
}

// Magnetic buttons: pulled toward the pointer, spring back on leave.
function magnetic(els) {
  els.forEach((el) => {
    const x = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3.out" });
    const y = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.28);
      y((e.clientY - r.top - r.height / 2) * 0.4);
    });
    el.addEventListener("pointerleave", () => { gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.4)" }); });
  });
}
