/* ForgeBoard — the hero orbit.
 *
 * The four boards as real models, turning around each other across the whole
 * page. One WebGL scene, one camera, four meshes: depth is genuine
 * perspective, so a board on the far side is smaller because it is further
 * away, not because something scaled it down.
 *
 * Point at a board and it leaves the ring and comes to the front, turning on
 * its own axis; the other three hold back and dim. Look away and it returns.
 *
 * The markup underneath is four links with the flat renders in them. Those
 * links stay: they are the hit targets, kept over each board at its projected
 * position, so hover, focus, click and screen readers all work on real
 * elements instead of a canvas. If WebGL is missing, the connection is
 * metered, or a model will not load, the same links run the whole thing in
 * CSS with the renders and nothing is lost but the third dimension.
 */
(() => {
  const host = document.querySelector('.hero-scene');
  if (!host) return;
  const list = host.querySelector('.orbit');
  const items = list ? [...list.querySelectorAll('.orbit-item')] : [];
  if (!items.length) return;

  const VENDOR = new URL('./vendor/', document.currentScript.src);
  const LOADER_URL = new URL('loaders/GLTFLoader.js', VENDOR).href;

  const plate = {};
  document.querySelectorAll('[data-hero]').forEach((el) => { plate[el.dataset.hero] = el; });
  const heroEl = document.querySelector('.hero');
  const cursorEl = document.querySelector('[data-hero="cursor"]');
  const cursorName = document.querySelector('[data-hero="cursor-name"]');
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  const N = items.length;
  const STEP = (Math.PI * 2) / N;
  const TURN = (Math.PI * 2) / 45000;          // one lap every 45 seconds
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // How much the boards reflect, as a fraction of the lighting the models
  // were authored for. 1.0 is that original rig; this is a fifth of it.
  //
  // It scales the two things that make a specular highlight and nothing
  // else: the three directional lights, which are what put a hard point of
  // light on a metal shell or a clearcoated package, and the clearcoat layer
  // itself. The hemisphere light is deliberately outside it — that one is
  // diffuse only, it puts a highlight nowhere, and it is what keeps the
  // board visible as the rest comes down.
  const GLOSS = 0.60;

  const net = navigator.connection;
  const metered = !!(net && (net.saveData || /(^|-)[23]g$/.test(net.effectiveType || '')));

  let angle = 0;
  let focused = -1;
  // The flat renders run the orbit from the first paint. This goes false
  // the moment the 3D scene is ready to place the boards itself.
  let twoD = true;
  let swipeLock = false;   // set for a beat after a swipe on the phone ring
  let spinV = 0;           // rad/ms the 3D ring is still turning from a swipe
  let named = -1;
  const pop = items.map(() => 0);               // 0 in the ring, 1 at the front
  let last = performance.now();

  /* ------------------------------------------------------------------ *
   * Shared: what "looking at a board" means
   * ------------------------------------------------------------------ */
  const setFocus = (i) => {
    if (i === focused) return;
    const was = focused;
    if (focused >= 0) items[focused].classList.remove('is-focus');
    focused = i;
    list.classList.toggle('has-focus', i >= 0);
    if (i >= 0) items[i].classList.add('is-focus');
    // The plate — name, specs, the way to order — belongs to the board being
    // looked at, so it arrives with it and leaves with it.
    if (heroEl) {
      // Going straight from one board to another, the class never changed, so
      // the reveal never replayed and the new figures just swapped in behind a
      // finished animation. Drop it and force a reflow first: every board gets
      // its own power-up, not the one before it.
      if (i >= 0 && was >= 0) {
        heroEl.classList.remove('is-showing');
        void heroEl.offsetWidth;
      }
      heroEl.classList.toggle('is-showing', i >= 0);
    }
    // The label rides with the pointer and names what it is over, so the
    // boards announce themselves without a line of instructions in the fold.
    if (cursorEl && fine) {
      if (i >= 0 && cursorName) cursorName.textContent = items[i].dataset.name;
      cursorEl.classList.toggle('is-on', i >= 0);
    }
  };

  /* ---------------------------------------------------------------- *
   * The readout comes up the way an instrument does
   *
   * Figures count from zero and the part numbers resolve out of noise. It
   * takes a beat, which is the point: the specs arrive as a measurement
   * being taken rather than text being swapped.
   * ---------------------------------------------------------------- */
  // Each element carries a generation number. Starting an animation bumps it,
  // and a frame belonging to an older generation returns without writing.
  // Cancelling by frame id alone is not enough here — focus can change several
  // times inside one frame, and two runs writing to the same element is how
  // you end up with a line of noise instead of a part number.
  const gen = new WeakMap();
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  const animate = (el, ms, draw) => {
    const g = (gen.get(el) || 0) + 1;
    gen.set(el, g);
    if (reduced) { draw(1); return; }
    const t0 = performance.now();
    const tick = (now) => {
      if (gen.get(el) !== g) return;          // superseded by a newer run
      // Clamped at both ends. A frame timestamp can land before the start
      // time, and an unfloored t runs the easing away to nonsense — a clock
      // counting up through minus twenty-three million.
      const t = Math.max(0, Math.min((now - t0) / ms, 1));
      draw(ease(t));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /** Count every number in the string up from zero, keeping the units. */
  const countUp = (el, text) => {
    const parts = String(text).split(/(\d+)/);
    animate(el, 620, (k) => {
      el.textContent = parts
        .map((part) => (/^\d+$/.test(part)
          ? String(Math.max(0, Math.round(+part * k)))
          : part))
        .join('');
    });
  };

  /** Resolve the text left to right out of a run of noise. */
  const NOISE = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const scramble = (el, text) => {
    const str = String(text);
    animate(el, 560, (k) => {
      if (k >= 1) { el.textContent = str; return; }
      const shown = Math.floor(k * str.length);
      let out = '';
      for (let c = 0; c < str.length; c++) {
        out += c < shown || str[c] === ' '
          ? str[c]
          : NOISE.charAt((Math.random() * NOISE.length) | 0);
      }
      el.textContent = out.slice(0, str.length);   // never longer than the target
    });
  };

  const plateEl = document.querySelector('.hero-plate');
  let swapTimer = 0;
  const nameBoard = (i) => {
    if (i === named) return;
    named = i;
    const d = items[i].dataset;
    const setAll = () => {
      if (plate.name) plate.name.textContent = d.name;
      if (plate.mcu) plate.mcu.textContent = d.mcu;
      if (plate.clock) plate.clock.textContent = d.clock;
      if (plate.gpio) plate.gpio.textContent = d.gpio;
      if (plate.radio) plate.radio.textContent = d.radio;
      // The way to buy follows the board you are looking at, so the button is
      // never one board behind what is on the stage.
      if (plate.order) plate.order.textContent = 'Order ' + d.name;
      if (plate.specs) plate.specs.setAttribute('href', 'boards/' + d.board + '/');
    };
    if (fine) {
      // Desktop: the readout powers up — a scramble on the words, a count on
      // the numbers — as the board you clicked comes forward.
      setAll();
      if (plate.mcu) scramble(plate.mcu, d.mcu);
      if (plate.clock) countUp(plate.clock, d.clock);
      if (plate.gpio) countUp(plate.gpio, d.gpio);
      if (plate.radio) scramble(plate.radio, d.radio);
      return;
    }
    // Touch: the ring turns on its own every few seconds, and a scramble on
    // every turn is noise — random glyphs of random widths, the figures
    // jumping between one line and two. So the plate dips out, the words
    // change while nothing can be seen, and it comes back: one clean swap.
    clearTimeout(swapTimer);
    if (plateEl) { plateEl.classList.remove('is-in'); plateEl.classList.add('is-swapping'); }
    swapTimer = setTimeout(() => {
      setAll();
      if (!plateEl) return;
      plateEl.classList.remove('is-swapping');
      // Then it powers up for this board: name, figures and button rise in
      // one after another, the light crosses the strip, the rules redraw.
      // The class is taken off and put back with a reflow between, so the
      // animation restarts for every board and not just the first.
      void plateEl.offsetWidth;
      plateEl.classList.add('is-in');
    }, 190);
  };

  // The pointer's place, for the held board to lean toward.
  let px = -1e4, py = -1e4;
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { passive: true });

  // Hovering names a board; it does not move it. A board only comes to the
  // front when it is clicked — the same two steps a phone has always had:
  // one to bring it forward, one more on the board that is forward to open
  // its page. Bringing boards forward on hover meant every pass of the mouse
  // across the stage rearranged it, and nothing could be settled on.
  items.forEach((li, i) => {
    li.addEventListener('pointerenter', () => {
      if (focused < 0 && cursorName) cursorName.textContent = li.dataset.name;
    });
    const link = li.querySelector('a');
    if (!link) return;
    // Keyboard only: a mouse-down also focuses the link, and treating that
    // as a pick made the very first click open the page.
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) setFocus(i); });
    link.addEventListener('click', (e) => {
      if (swipeLock) { e.preventDefault(); return; }        // the end of a swipe is not a tap
      if (focused === i) return;                            // second click: follow the link
      e.preventDefault();
      setFocus(i);
    });
  });
  // Mouse only: a lifted finger also 'leaves', a beat before its tap's
  // click arrives, and that let go of the board the tap was about to open.
  host.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') setFocus(-1); });
  // Touch has no leave: a tap on the stage away from any board is the release.
  host.addEventListener('click', (e) => {
    if (focused >= 0 && !e.target.closest('.orbit-item')) setFocus(-1);
  });
  // A finger turns the 3D ring. Only a finger: the mouse has hover and click
  // for that. A swipe with a board held lets it go and spins from there; a
  // vertical drag is still the page scrolling.
  let spin = null;
  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !host.classList.contains('is-3d')) return;
    // Not let go here. A tap lets go on its click, where the target is
    // judged: released on the touch itself, the boards were already on
    // their way back when the click landed a beat later, and whichever one
    // had swung under the finger was taken as the thing tapped. A swipe
    // lets go the moment it has moved, below.
    spin = { x0: e.clientX, a0: angle, x: e.clientX, t: performance.now(), v: 0, moved: false };
  }, { passive: true });
  host.addEventListener('pointermove', (e) => {
    if (!spin || e.pointerType !== 'touch') return;
    const now = performance.now();
    spin.v = (e.clientX - spin.x) / Math.max(1, now - spin.t);
    spin.x = e.clientX; spin.t = now;
    if (Math.abs(e.clientX - spin.x0) > 8 && !spin.moved) {
      spin.moved = true;
      if (focused >= 0) { setFocus(-1); spin.a0 = angle; }   // a swipe with a board held lets it go and spins from there
    }
    angle = spin.a0 + ((e.clientX - spin.x0) / (host.clientWidth * 0.8)) * STEP;
  }, { passive: true });
  const spinEnd = (e) => {
    if (!spin || e.pointerType !== 'touch') return;
    if (spin.moved) {
      swipeLock = true;
      setTimeout(() => { swipeLock = false; }, 350);
      spinV = (spin.v / (host.clientWidth * 0.8)) * STEP;   // px/ms -> rad/ms
    }
    spin = null;
  };
  host.addEventListener('pointerup', spinEnd);
  host.addEventListener('pointercancel', spinEnd);


  /** Ease every board's pop toward where it should be, and turn the ring
   *  unless a board is being held. Returns the frame delta in ms. */
  const step = (now) => {
    const dt = Math.min(now - last, 64);       // a backgrounded tab must not lurch
    last = now;
    if (focused < 0) {
      if (!reduced) angle += TURN * dt;
      angle += spinV * dt;                       // a swipe's momentum, dying away
      spinV *= Math.pow(0.12, dt / 1000);
    } else {
      // Keep turning the ring until the held board's own slot is the one at
      // the front of it. The three left behind then always come to rest in
      // the same three places — one either side, one across the back —
      // whichever board you point at and wherever the lap had got to.
      //
      // This is the whole fix. The ring stops the moment you point at a
      // board, so before this the other three froze at arbitrary angles:
      // whichever one happened to be coming round the front stayed there,
      // directly behind the board you had just pulled forward, and the
      // composition was different every time.
      const want = -focused * STEP;
      let d = (want - angle) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      // Eased to settle in a little over a second. It was ~0.4 s, which
      // read as the ring snapping round rather than turning to meet you.
      angle += d * (1 - Math.pow(0.03, dt / 1000));
    }
    // The held board's trip to the front, at the same unhurried pace.
    const k = 1 - Math.pow(0.02, dt / 1000);
    for (let i = 0; i < N; i++) {
      const want = i === focused ? 1 : 0;
      pop[i] += (want - pop[i]) * k;
      if (Math.abs(want - pop[i]) < 0.002) pop[i] = want;
    }
    return dt;
  };

  /* ------------------------------------------------------------------ *
   * Fallback: the same orbit in CSS, with the flat renders
   * ------------------------------------------------------------------ */
  const run2d = () => {
    host.classList.remove('is-loading');   // nothing to count: the sheet goes at once
    // The phone ring turns under your finger. A swipe spins it, with a
    // little momentum, and it settles on the nearest board; a tap holds a
    // board and opens its plate; left alone it drifts on to the next board
    // every few seconds. The angle here is the phone's own — the shared
    // `angle` keeps turning for the desktop fallback.
    const HOLD = 2600;   // left alone, on to the next board every 2.6 s
    let pa = 0, target = 0, lastMove = performance.now(), held = -1, drag = null;
    if (matchMedia('(max-width:860px)').matches) {
      host.style.touchAction = 'pan-y';      // vertical swipes still scroll the page
      const span = () => host.clientWidth * 0.8;    // most of a screen's swipe is one board
      host.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { x0: e.clientX, a0: pa, x: e.clientX, t: performance.now(), v: 0, moved: false };
      });
      host.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const now = performance.now();
        drag.v = (e.clientX - drag.x) / Math.max(1, now - drag.t);
        drag.x = e.clientX; drag.t = now;
        if (Math.abs(e.clientX - drag.x0) > 8) drag.moved = true;
        pa = drag.a0 + ((e.clientX - drag.x0) / span()) * STEP;
        target = pa;
        lastMove = now;
      });
      const end = () => {
        if (!drag) return;
        if (drag.moved) {
          swipeLock = true;
          setTimeout(() => { swipeLock = false; }, 350);
          const fling = (drag.v * 110 / span()) * STEP;          // a little momentum, then settle
          target = Math.round((pa + fling) / STEP) * STEP;
        } else {
          target = Math.round(pa / STEP) * STEP;
        }
        drag = null;
        lastMove = performance.now();
      };
      host.addEventListener('pointerup', end);
      host.addEventListener('pointercancel', end);
    }
    const frame = (now) => {
      const dt = step(now);
      if (focused !== held) { held = focused; lastMove = now; }
      if (focused >= 0) {
        // the held board's slot comes to the front, the short way round
        let d = (-focused * STEP - pa) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        target = pa + d;
      } else if (!drag && now - lastMove > HOLD) {
        target -= STEP; lastMove = now;
      }
      if (!drag) pa += (target - pa) * (1 - Math.pow(0.004, dt / 1000));   // and a brisk turn
      const w = host.clientWidth, h = host.clientHeight;
      // A phone is the main reader of this path. Its plate is off until a
      // board is tapped, so the boards have the whole band between the
      // eyebrow lines and where the plate will come up — read off the page
      // each frame — and they use it: the front board at nearly two thirds
      // of the width, the ring flat enough that none of the four is ever
      // small. The band is measured, not guessed, so the board a tap brings
      // forward never lands on the plate that lights up under it.
      const narrow = w < 861;
      let bandTop = 0, bandBot = h;
      if (narrow) {
        const meta = host.parentElement.querySelector('.hero-meta');
        const plate = host.parentElement.querySelector('.hero-plate');
        if (meta) bandTop = meta.offsetTop + meta.offsetHeight + 6;
        if (plate) bandBot = plate.offsetTop - 6;
      }
      const band = bandBot - bandTop;
      const rx = narrow ? w * 0.42 : Math.min(w * 0.3, 430);
      const ry = narrow ? band * 0.06 : Math.min(h * 0.1, 76);
      const bw = narrow ? Math.min(w * 0.62, band / (1.25 * 1.1) - ry, 300)
                        : Math.min(Math.max(w * 0.22, 118), 300);
      const bh = bw * 1.25;
      const cy = narrow ? (bandTop + bandBot) / 2 : h * 0.43;   // above centre, clear of the name plate
      let bestD = -2, bestI = 0;
      items.forEach((li, i) => {
        const th = (narrow ? pa : angle) + i * STEP;
        const od = Math.cos(th);
        const p = pop[i];
        const x = Math.sin(th) * rx * (1 - p);
        const y = od * ry * (1 - p) + ry * p;
        const d = od * (1 - p) + p;
        const t = (d + 1) / 2;
        // On a phone the far boards keep more of their size and the pop is
        // modest: the front board is already most of the screen wide.
        // Phone: the front board full size, the two beside it at half and
        // dimmed, the one at the back gone — three on screen reads as a ring
        // without being a crowd. The tap grows the front board only a touch.
        let s = narrow ? (0.55 + 0.45 * t) * (1 + 0.1 * p) : (0.55 + 0.45 * t) * (1 + 0.5 * p);
        let o = narrow ? Math.max(0, Math.min(1, (od + 0.3) / 0.9)) : 0.3 + 0.7 * t;
        if (focused >= 0 && focused !== i) { s *= 0.86; o *= 0.45; }
        li.style.width = bw + 'px';
        li.style.height = bh + 'px';
        li.style.transform =
          'translate3d(' + (w / 2 + x - bw / 2).toFixed(1) + 'px,' +
          (cy + y - bh / 2).toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
        li.style.opacity = Math.min(o, 1).toFixed(3);
        li.style.zIndex = p > 0.02 ? 200 : Math.round(t * 100);
        if (od > bestD) { bestD = od; bestI = i; }
      });
      nameBoard(focused >= 0 ? focused : bestI);
      if (twoD) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  /* ------------------------------------------------------------------ *
   * The real thing
   * ------------------------------------------------------------------ */
  const hasWebGL = () => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  };

  const capable = () =>
    !metered && hasWebGL() &&
    // The same bar the product pages set. It used to be 4 and 4 here, so a
    // machine that ran the model on every board page was handed the flat
    // renders on the home page — every visit, with no way to ask for more.
    (navigator.deviceMemory === undefined || navigator.deviceMemory >= 2) &&
    (navigator.hardwareConcurrency === undefined || navigator.hardwareConcurrency >= 2);

  // Framing. The camera sits far enough back that the nearest board reads
  // about a third of the screen and the far one about half that — real
  // perspective doing the work. The ring rides above centre so no board ever
  // swings down into the name plate.
  const R = 3.1;             // orbit radius, world units — a wide sweep
  const FOV = 34;
  const HELD_TURN = (Math.PI * 2) / 11000;   // a held board: one turn per 11 s
  const FRONT = R * 1.1;     // how far forward a held board comes
  const UNIT = 2.4;          // every board reads this tall, whatever its mm
  const POP_SCALE = 0.15;    // extra size on the board that has come forward
  const POP_PHONE = 0.12;    // on a phone a tapped board comes forward and grows a little more
  const LIFT_DESK = 0.46;    // how far the far side of the ring rides up (turntable from above)
  const LIFT_PHONE = 0.95;   // portrait has height to spend and no width: a steeper table
  // Phone, one board held: the other three wait in a row across the back.
  const SHELF_BACK = 1.25;   // how far back the row is, in ring radii
  const SHELF_SIZE = 0.36;   // a board on the row, as a share of the held board's apparent size
  const SHELF_SPREAD = 0.31; // the outer two this far either side of the middle, as a share of the width
  const SHELF_DIM = 0.72;    // lit to here: behind, not in the dark
  const SHELF_W = 11, SHELF_Z = 0.82;   // the spring that carries a board there and back: rad/s, damping ratio
  const REF = 200;           // px per world unit the hit boxes are sized at

  async function run3d() {
    const [THREE, loaderMod] = await Promise.all([import('three'), import(LOADER_URL)]);
    const { GLTFLoader } = loaderMod;

    const canvas = document.createElement('canvas');
    canvas.className = 'hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, list);
    // Until every model is up the stage is the counter alone. The flat
    // renders are for devices that will never get the models; nobody wants
    // to watch them turn for a few seconds and then be swapped out.
    host.classList.add('is-loading');

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    // 1.5, not 2: four boards at over a million vertices between them, with
    // clearcoat, is the most expensive thing on the site, and at DPR 2 the
    // fragment work is 78% higher again. Nobody can see the difference on a
    // board a third of the screen tall; everybody can feel a dropped frame.
    // 2 on a phone: its screen is dense and the boards are what the page is —
    // at 1 they were soft. 1.5 on a desktop, where a board a third of the
    // screen tall does not need more and the four models share one GPU.
    renderer.setPixelRatio(Math.min(devicePixelRatio, fine ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = fine ? 1.0 : 1.15;   // a phone screen in daylight wants a little more
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    const plateEl = document.querySelector('.hero-plate');

    // A black solder mask swallows light, so this rig is generous — the same
    // one the product pages use, and softened the same way. The brightness
    // sits in the hemisphere light, which is diffuse only and puts no
    // highlight anywhere; the directionals, which are what make a metal
    // shell or a clearcoated package glare, are held down.
    scene.add(new THREE.HemisphereLight(0xfff3dc, 0x4a3c26, 3.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.0 * GLOSS);
    key.position.set(2, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe9c4, 1.6 * GLOSS);
    fill.position.set(-3, 1, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xf39a00, 1.5 * GLOSS);
    rim.position.set(-4, 2, -3); scene.add(rim);

    const ring = new THREE.Group();
    scene.add(ring);

    // A field of points well behind the ring. It gives the dark somewhere to
    // be — the boards read as floating in a space rather than on a flat panel
    // — and parallaxes as the ring turns, for about 12 KB of geometry.
    const STARS = 620;
    const pos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const r = 26 + Math.random() * 30;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.55;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 8;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xefe6d3, size: 0.13, sizeAttenuation: true,
      transparent: true, opacity: 0.5, depthWrite: false,
    }));
    scene.add(stars);

    // How the composition meets the screen. The ring and the boards scale
    // separately on purpose: a phone tightens the ring hard so all four stay
    // in frame, but keeps the boards big, so they overlap like a dealt hand
    // instead of shrinking to crumbs.
    // Two sizes, not one. At rest the plate is not on screen, so the boards
    // have the whole height and can be large. Hovering brings the plate in and
    // takes about half that height away, so they settle to a size that clears
    // it. The frame eases between the two, which reads as the stage pulling
    // back to make room for the readout rather than as a resize.
    let fitR = 1, fitRest = 1, fitShow = 1;
    let bandRest = 0, bandShow = 0, perWorld = 0;
    let shelfTop = 0, heldK = 1, heldDrop = 0;   // phone, one held: the row's ceiling; the held board's size and drop
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Portrait sits closer in; there is no width to stand back for.
      camera.position.z = camera.aspect < 1 ? 7.6 : 9.6;
      camera.updateProjectionMatrix();

      const tan = Math.tan((FOV * Math.PI) / 360);
      const halfW = camera.position.z * tan * camera.aspect;
      const room = halfW / 4.7;
      fitR = Math.max(0.28, Math.min(1, room));
      const cap = Math.max(0.7, Math.min(1, room));   // what the width allows

      // Pixels per unit of fit, so each framing can solve for its own size.
      const ringDist = camera.position.z - R * fitR;
      const heldDist = camera.position.z - FRONT * fitR;
      const ringPer = (UNIT * h) / (2 * ringDist * tan);
      const portrait = camera.aspect < 1;
      const heldPer = (UNIT * (1 + (portrait ? POP_PHONE : POP_SCALE)) * h) / (2 * heldDist * tan);
      const liftPer = ((portrait ? 2 * LIFT_PHONE : 2 * LIFT_DESK) * h) / (2 * camera.position.z * tan);

      // 1.12 and 1.14 for what the bounding box does not cover: the boards sit
      // tilted, and headers and modules stand proud of the board's outline.
      const usableTop = h * (camera.aspect < 1 ? 0.14 : 0.13);   // clear the meta row
      const showBottom = (plateEl ? plateEl.offsetTop : h) - 16;
      const showUsable = Math.max(140, showBottom - usableTop);
      const restUsable = Math.max(140, h * 0.94 - usableTop);

      const ringWants = ringPer * 1.12 + liftPer * 0.5;
      fitShow = Math.min(cap, showUsable / Math.max(ringWants, heldPer * 1.14));
      fitRest = Math.min(cap, restUsable / ringWants);
      if (fitShow > fitRest) fitShow = fitRest;   // never larger than at rest

      if (portrait) {
        // A phone is solved for directly, not scaled down from the desktop.
        // The composition is a diamond seen from above: the front board a
        // set share of the width at the foot of the band, the two beside it
        // a step up at the edges (a little off the edge is fine — it reads
        // as the ring continuing), the one across the back at the top. The
        // ring's radius comes from the front board's own width, so the
        // sides can never sit on it; only the band's height can shrink it.
        const WIDTH_FRAC = 0.56;   // the front board's share of the screen width
        const RING_K = 1.9;        // ring radius, in front-board half-widths
        let fr = 0.4, fs = 1;
        for (let k = 0; k < 3; k++) {          // radius and size depend on each other
          const px = h / (2 * (camera.position.z - R * fr) * tan);   // px per unit, front of ring
          fs = (WIDTH_FRAC * w) / (UNIT * 0.62 * px);
          fr = (RING_K * UNIT * fs * 0.31) / R;
        }
        const px = h / (2 * (camera.position.z - R * fr) * tan);
        const needs = (2 * LIFT_PHONE * fs + UNIT * fs * (0.56 + 0.5 * 0.42)) * px;   // rise + front half + back half (at its 42%)
        if (needs > showUsable) { const k = showUsable / needs; fs *= k; fr *= k; }
        fitShow = fitRest = fs;
        fitR = fr;
      } else {
        // Tighten the ring until the two boards at the sides fit the frame with
        // their own width — measured at the larger of the two sizes.
        const boardHalfW = UNIT * fitRest * 0.34;
        fitR = Math.min(fitR, Math.max(0.1, (halfW * 0.95 - boardHalfW) / R));
      }

      // The lift bias centres the ring nicely, but a held board is taller than
      // the ones in the ring, so the bias gives way to keeping its own edges
      // inside the band.
      const heldHalf = heldPer * fitShow * 0.56;
      bandShow = Math.max(
        usableTop + heldHalf,
        // the lift bias sits the ring lower to make room for the back board's
        // rise; on portrait that board is half size, so less room is needed
        Math.min((usableTop + showBottom) / 2 + liftPer * fitShow * (portrait ? 0.12 : 0.4), showBottom - heldHalf)
      );
      const restHalf = ringPer * fitRest * 0.56 + liftPer * fitRest * 0.4;
      bandRest = Math.min(Math.max(h / 2, usableTop + restHalf), h - restHalf - h * 0.06);
      // Phone, one held: the row across the back takes the top of the band
      // and the held board the foot of it. Dropped from the ring's line by
      // the room under it, and — on a short screen — sized so the two fit:
      // its own height, the row's (a set fraction of it) and a gap.
      shelfTop = usableTop;
      if (portrait) {
        const roomH = showUsable - h * 0.035;
        heldK = Math.min(1, roomH / (2 * heldHalf * (1 + SHELF_SIZE)));
        heldDrop = -Math.max(0, showBottom - heldHalf * heldK - bandShow) * (2 * heldDist * tan) / h;
      } else { heldK = 1; heldDrop = 0; }
      perWorld = (2 * camera.position.z * tan) / h;
    };
    resize();
    new ResizeObserver(resize).observe(host);

    const loader = new GLTFLoader();
    const nodes = [];
    const meter = document.querySelector('[data-hero="load"]');
    const meterNum = document.querySelector('[data-hero="num"]');
    const meterBar = document.querySelector('[data-hero="bar"]');
    let shown = 0;
    const showLoad = (raw) => {
      // Clamped: hosts gzip the models, and the progress event then reports
      // inflated bytes against the compressed length, which counts past 100.
      // And never backwards: one model's over-count can otherwise put the
      // number above where the next one starts, and a count that dips reads
      // as something going wrong.
      const frac = Math.max(shown, Math.max(0, Math.min(1, raw)));
      shown = frac;
      if (meterNum) meterNum.textContent = String(Math.round(frac * 100)).padStart(3, '0');
      if (meterBar) meterBar.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
    };
    showLoad(0);

    // One at a time: four models at once would fight for bandwidth and the
    // first board would arrive no sooner than the last.
    for (let i = 0; i < N; i++) {
      const gltf = await loader.loadAsync(items[i].dataset.model, (ev) => {
        if (ev.lengthComputable) showLoad((i + ev.loaded / ev.total) / N);
      });
      showLoad((i + 1) / N);
      const obj = gltf.scene;
      // Turned in its own plane, as the page asks (data-roll, degrees). The
      // models lie flat with Y through the board, so a Y rotation is the
      // turn you would give it on a desk.
      const roll = parseFloat(items[i].dataset.roll);
      if (roll) obj.rotation.y = (roll * Math.PI) / 180;

      const pivot = new THREE.Group();
      pivot.add(obj);
      let box = new THREE.Box3().setFromObject(obj);
      let size = box.getSize(new THREE.Vector3());
      obj.position.sub(box.getCenter(new THREE.Vector3()));

      // These boards are exported lying flat; turn the thinnest axis — the
      // board's thickness — to face the camera.
      const dims = [size.x, size.y, size.z];
      const thin = dims.indexOf(Math.min(...dims));
      if (thin === 1) pivot.rotation.x = Math.PI / 2;
      else if (thin === 0) pivot.rotation.y = -Math.PI / 2;
      pivot.updateMatrixWorld(true);

      box = new THREE.Box3().setFromObject(pivot);
      size = box.getSize(new THREE.Vector3());
      pivot.position.sub(box.getCenter(new THREE.Vector3()));

      // Normalise: the boards are different sizes in millimetres, and a hero
      // is not the place to argue about it. Every board reads the same size.
      const holder = new THREE.Group();
      holder.add(pivot);
      const unit = UNIT / Math.max(size.x, size.y);
      holder.scale.setScalar(unit);

      const slot = new THREE.Group();
      slot.add(holder);
      ring.add(slot);

      const mats = [];
      holder.traverse((o) => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (!m || !m.color || mats.indexOf(m) !== -1) return;
          m.__tint = m.color.clone();
          // Same pass, no second traverse: clearcoat is the second specular
          // layer that makes the solder mask and the lenses read as wet, and
          // it is the one dial that takes the gloss off without touching the
          // colour or the material under it.
          // Anisotropy is a second, costly specular lobe for brushed metal.
          // On the product page a board fills the stage and earns it; here
          // four boards share the screen at a third of the size and do not.
          if (typeof m.anisotropy === 'number') m.anisotropy = 0;
          if (typeof m.clearcoat === 'number' && m.clearcoat > 0) {
            m.clearcoat *= GLOSS;
            m.clearcoatRoughness = Math.min(1, (m.clearcoatRoughness || 0) + 0.25);
          }
          // KHR_materials_specular, new in the re-exported models: the
          // copper is authored brighter than full at 1.2. Same dial.
          if (typeof m.specularIntensity === 'number') m.specularIntensity *= GLOSS;
          if (m.specularColor && m.specularColor.multiplyScalar) {
            m.specularColor.multiplyScalar(GLOSS);
          }
          m.needsUpdate = true;
          mats.push(m);
        });
      });

      nodes.push({
        slot, holder, mats, unit,
        // Each board's own extents, not its largest side: a tall board should
        // not claim a wide hit area it does not fill.
        halfX: (size.x * unit) / 2,
        halfY: (size.y * unit) / 2,
        spin: 0,
        sway: i * 1.7,
        tiltX: 0, tiltY: 0, sx: 0, sy: 0,
        dim: 1, lastDim: 1,
        sk: 0, sv: 0, per: 0, shelfAt: null,   // the row: how far there, its speed, px per unit last frame, where it was
      });
      // Its render stays until the handoff below: hiding it here, with the
      // 3D loop not yet running, left an empty slot on the ring for every
      // board that had loaded while the last one was still on its way.
    }

    host.classList.remove('is-loading');
    host.classList.add('is-3d');
    list.classList.add('is-3d');
    host.style.touchAction = 'pan-y';   // sideways is ours, up and down is the page
    if (meter) {
      meter.classList.add('is-done');                       // lifts off the page
      setTimeout(() => meter.classList.add('is-gone'), 1000); // then out of the layout
    }
    items.forEach((li) => li.classList.add('has-model'));   // renders step aside, all at once
    // Take the links over from the 2D orbit: it stops on its next frame, and
    // the opacity it was fading the renders with must not linger on the
    // hit areas the 3D frame is about to place.
    twoD = false;
    items.forEach((li) => { li.style.opacity = ''; });

    let visible = true;
    new IntersectionObserver(
      (es) => { visible = es.some((e) => e.isIntersecting); },
      { rootMargin: '120px' }
    ).observe(host);

    const v = new THREE.Vector3();
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = step(now);
      const h = host.clientHeight, w = host.clientWidth;
      const tanHalf = Math.tan((FOV * Math.PI) / 360);

      let bestZ = -Infinity, bestI = 0;
      // How far into "one board is held" we are. Taken from the pops, so it
      // is already eased. While a board is coming forward the other three
      // clear out of its way — without this they stay on the ring and the
      // held board arrives inside whichever one was at the front, two solid
      // objects in the same place.
      const held = Math.max.apply(null, pop);
      // Centre the boards on the whole screen until a plate is called for.
      // Without a pointer there is no hover, so the plate is always up and
      // the boards stay in the framing that clears it.
      const room = fine ? held : 1;
      const fitS = fitRest + (fitShow - fitRest) * room;
      const aimY = -(h / 2 - (bandRest + (bandShow - bandRest) * room)) * perWorld;
      camera.position.y = aimY + 0.75;      // a little above, looking down
      camera.lookAt(0, aimY, 0);
      // The ring opens out of the held board's way. How far each of the three
      // then has to go is decided per board below, by where on the ring it is.
      const phone = w < h;
      const popEff = phone ? (1 + POP_PHONE) * heldK - 1 : POP_SCALE;
      // Phone, one board held: the other three do not stay on the ring. At
      // this width the ring's sides sit half off the screen and its back
      // board is hidden behind the held one, so they go to a row across the
      // back instead — level, evenly spaced, whole, above the held board
      // and a set fraction of its size: the boards waiting their turn, all
      // in view. The row is solved on the screen and put into the world at
      // its own depth, so it lands where it was drawn whatever the phone.
      let shelf = null;
      if (phone && focused >= 0) {
        const hn = nodes[focused];
        const z = -R * fitR * SHELF_BACK;
        const dS = camera.position.z - z;                 // the row's depth
        const dF = camera.position.z - FRONT * fitR;      // the held board's
        const sf = SHELF_SIZE * fitS * (1 + popEff) * (dS / dF);   // the same share of the held board's apparent size
        const per = (sf * h) / (2 * dS * tanHalf);        // px per unit on the row
        const wpp = (2 * dS * tanHalf) / h;               // world per px there
        let half = 0;
        nodes.forEach((n, j) => { if (j !== focused) half = Math.max(half, n.halfY * per); });
        const heldTop = hn.sy - hn.halfY * hn.per;        // last frame's, a frame behind
        const sy = Math.max(shelfTop + half, heldTop - h * 0.035 - half);
        shelf = {
          z, sf,
          x: SHELF_SPREAD * w * wpp,
          // the camera looks down a little: its axis is lower back there
          y: aimY - 0.75 * (dS / camera.position.z - 1) + (h / 2 - sy) * wpp,
        };
      }
      const spread = 1 + (phone ? 0 : held * 0.34);

      nodes.forEach((n, i) => {
        const th = angle + i * STEP;
        const p = pop[i];
        // Its place on the ring, blended toward the front of the stage.
        // The far side of the circle rides higher — a turntable seen from
        // above. Without it the front and back boards sit at the same point
        // on screen and pile up on each other, four boards reading as two.
        // How far round the back this board is: 0 at the front of the ring,
        // 1 straight across from it. The two that end up at the sides only
        // have to step aside and they are clear. The one across the back is
        // the problem — it is on the same line as the held board, so no
        // amount of stepping back hides it, it only makes it a smaller board
        // in the same place. That one rides up instead, far enough that its
        // bottom edge clears the held board's top: over the shoulder rather
        // than behind the head. Squared, so the sides barely feel it.
        const behind = (1 - Math.cos(th)) / 2;
        // On a phone the row across the back does this job instead.
        const tuck = phone ? 0 : held * behind * behind;
        const away = phone ? 0 : held * 1.5 + tuck * 4.4;
        // portrait: the board across the back is small and the band has no
        // headroom, so it rises less when a held board needs it out of the way
        const lift = (1 - Math.cos(th)) * (phone ? LIFT_PHONE : LIFT_DESK) + tuck * (phone ? 1.4 : 2.9);
        n.slot.position.set(
          Math.sin(th) * R * fitR * spread * (1 - p),
          lift * fitS * (1 - p) + (phone ? heldDrop * p : 0),
          (Math.cos(th) * R * fitR - away) * (1 - p) + FRONT * fitR * p
        );
        // To the row and back, on a spring: a little under-damped, so a
        // board arrives and settles rather than slides to a stop — the
        // difference between a thing put down and a thing faded in. The
        // row's place is kept from the last frame it was solved, so a board
        // on its way back has somewhere to come from.
        const toRow = shelf && i !== focused ? 1 : 0;
        if (reduced) { n.sk = toRow; n.sv = 0; }
        else {
          const dts = Math.min(dt, 50) / 1000;
          n.sv += ((toRow - n.sk) * SHELF_W * SHELF_W - n.sv * 2 * SHELF_Z * SHELF_W) * dts;
          n.sk += n.sv * dts;
        }
        if (shelf && i !== focused) n.shelfAt = shelf;
        const onRow = n.shelfAt && n.sk > 0.0005 ? n.sk : 0;
        if (onRow) {
          const q = n.slot.position, s = n.shelfAt;
          q.x += (Math.sin(th) * s.x - q.x) * onRow;
          q.y += (s.y - q.y) * onRow;
          q.z += (s.z - q.z) * onRow;
        }
        // The board being held turns right round — a full revolution in about
        // eleven seconds — so you see its face, its edge and its back. It
        // is deliberately slow: this is the board you are being invited to
        // click, and a face that comes and goes every couple of seconds
        // reads as a thing being taken away from you rather than offered.
        // The three in the ring instead settle facing you and sway, because
        // a board showing its blank underside is just a black rectangle.
        if (!reduced) {
          if (p > 0.02) {
            n.spin += HELD_TURN * dt;
          } else {
            const front = Math.round(n.spin / (Math.PI * 2)) * (Math.PI * 2);
            n.spin += (front - n.spin) * (1 - Math.pow(0.12, dt / 1000));
            n.sway += 0.00019 * dt;
          }
        }
        // A held board leans toward the pointer. You are not spinning it — it
        // is turning to face you — which is what makes the thing feel picked
        // up rather than played back. Uses last frame's screen position, one
        // frame behind and not noticeable.
        const lean = fine ? p : 0;
        const wantY = lean * Math.max(-0.5, Math.min(0.5, (px - n.sx) / (w * 0.45)));
        const wantX = lean * Math.max(-0.35, Math.min(0.35, (py - n.sy) / (h * 0.55)));
        const g = 1 - Math.pow(0.004, dt / 1000);
        n.tiltY += (wantY - n.tiltY) * g;
        n.tiltX += (wantX - n.tiltX) * g;

        n.slot.rotation.y = n.spin + Math.sin(n.sway) * 0.3 * (1 - p) + n.tiltY;
        n.slot.rotation.x = -0.22 + 0.1 * p + n.tiltX;
        const popK = popEff;
        // Portrait: depth is drawn, not just implied. The board across the
        // back is smaller and the sides between, so the ring reads as a ring
        // and not as four boards laid on one another; a held board is full.
        const tDepth = (Math.cos(th) + 1) / 2;
        const depthK = w < h ? (0.42 + 0.58 * tDepth) * (1 - p) + p : 1;   // small at the back, full in front
        // Phone, on the row: the size the row was solved for.
        let sf = fitS * (1 + popK * p) * depthK;
        if (onRow) sf += (n.shelfAt.sf - sf) * onRow;
        n.holder.scale.setScalar(n.unit * sf);

        // Keep this board's link exactly over it, at its apparent size, so
        // the pointer and the keyboard land on the thing they can see.
        n.slot.getWorldPosition(v);
        const dist = camera.position.distanceTo(v);
        v.project(camera);
        const sx = (v.x * 0.5 + 0.5) * w;
        const sy = (-v.y * 0.5 + 0.5) * h;
        n.sx = sx; n.sy = sy;
        const perPx = (sf * h) / (2 * dist * tanHalf);
        n.per = perPx;
        const li = items[i];
        if (!n.sized) {
          // Once: the box at a reference scale. Everything after is transform.
          n.sized = true;
          li.style.width = (n.halfX * 2 * REF).toFixed(1) + 'px';
          li.style.height = (n.halfY * 2 * REF).toFixed(1) + 'px';
        }
        const k = perPx / REF;
        li.style.transform =
          'translate3d(' + (sx - n.halfX * perPx).toFixed(1) + 'px,' +
          (sy - n.halfY * perPx).toFixed(1) + 'px,0) scale(' + k.toFixed(4) + ')';
        const z = Math.round(1000 - dist * 50);
        if (z !== n.z) { n.z = z; li.style.zIndex = z; }

        // Everything but the board being looked at sits back in the dark.
        // Eased, and only written when it actually moves — walking four
        // meshes' materials every frame for an unchanged value is waste.
        // Held: lifted out of the dark. Not held, while another is: sat back
        // into it. Nothing held: as lit as it was.
        const depthDim = phone ? 0.62 + 0.38 * tDepth : 1;   // portrait: the back sits back a little, no darker
        // Phone, one held: the row is behind, not in the dark — lit enough
        // to be read as the three boards it is.
        const want = focused < 0 ? depthDim
          : focused === i ? 1.25
          : phone ? SHELF_DIM : 0.38 * depthDim;
        n.dim += (want - n.dim) * (1 - Math.pow(0.004, dt / 1000));
        if (Math.abs(n.dim - n.lastDim) > 0.004) {
          n.lastDim = n.dim;
          n.mats.forEach((m) => m.color.copy(m.__tint).multiplyScalar(n.dim));
        }

        const zc = Math.cos(th) * (1 - p) + p;
        if (zc > bestZ) { bestZ = zc; bestI = i; }
      });

      nameBoard(focused >= 0 ? focused : bestI);
      if (cursorEl && fine) {
        cursorEl.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
      }
      if (!reduced) stars.rotation.y += 0.000012 * dt;
      if (visible) renderer.render(scene, camera);
    };
    requestAnimationFrame(frame);
  }

  if (capable()) {
    run3d().catch((err) => {
      console.warn('fb-orbit: falling back to the renders —', err && err.message);
      host.classList.remove('is-loading');
      host.classList.remove('is-3d');
      list.classList.remove('is-3d');
      items.forEach((li) => li.classList.remove('has-model'));
      run2d();
    });
  } else {
    run2d();
  }
})();
