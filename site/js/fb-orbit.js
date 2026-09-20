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
  const TURN = (Math.PI * 2) / 34000;          // one lap every 34 seconds
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
  const GLOSS = 0.80;

  const net = navigator.connection;
  const metered = !!(net && (net.saveData || /(^|-)[23]g$/.test(net.effectiveType || '')));

  let angle = 0;
  let focused = -1;
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

  const nameBoard = (i) => {
    if (i === named) return;
    named = i;
    const d = items[i].dataset;
    if (plate.name) plate.name.textContent = d.name;
    if (plate.mcu) scramble(plate.mcu, d.mcu);
    if (plate.clock) countUp(plate.clock, d.clock);
    if (plate.gpio) countUp(plate.gpio, d.gpio);
    if (plate.radio) scramble(plate.radio, d.radio);
    // The way to buy follows the board you are looking at, so the button is
    // never one board behind what is on the stage.
    if (plate.order) plate.order.textContent = 'Order ' + d.name;
    if (plate.specs) plate.specs.setAttribute('href', 'boards/' + d.board + '/');
  };

  // Where the pointer was when the focus last changed. A board travelling to
  // the front sweeps out from under a still cursor and another slides in
  // behind it — which fires pointerenter and hands focus away, and the two
  // boards then trade it back and forth. A focus change has to be caused by
  // the pointer moving, not by the scene moving underneath it.
  let px = -1e4, py = -1e4, fx = -1e4, fy = -1e4;
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
  const pointerMoved = () => Math.hypot(px - fx, py - fy) > 10;

  items.forEach((li, i) => {
    li.addEventListener('pointerenter', () => {
      if (focused >= 0 && !pointerMoved()) return;
      fx = px; fy = py;
      setFocus(i);
    });
    const link = li.querySelector('a');
    if (!link) return;
    link.addEventListener('focus', () => setFocus(i));
    // Touch has no pointer to rest: first tap brings a board forward, the
    // second follows the link to its page.
    link.addEventListener('click', (e) => {
      if (matchMedia('(hover:hover)').matches || focused === i) return;
      e.preventDefault();
      setFocus(i);
    });
  });
  host.addEventListener('pointerleave', () => setFocus(-1));

  /** Ease every board's pop toward where it should be, and turn the ring
   *  unless a board is being held. Returns the frame delta in ms. */
  const step = (now) => {
    const dt = Math.min(now - last, 64);       // a backgrounded tab must not lurch
    last = now;
    if (focused < 0) {
      if (!reduced) angle += TURN * dt;
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
      angle += d * (1 - Math.pow(0.004, dt / 1000));
    }
    const k = 1 - Math.pow(0.002, dt / 1000);
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
    const frame = (now) => {
      step(now);
      const w = host.clientWidth, h = host.clientHeight;
      const rx = Math.min(w * 0.3, 430);
      const ry = Math.min(h * 0.1, 76);
      const bw = Math.min(Math.max(w * 0.22, 118), 300), bh = bw * 1.25;
      const cy = h * 0.43;      // above centre, clear of the name plate
      let bestD = -2, bestI = 0;
      items.forEach((li, i) => {
        const th = angle + i * STEP;
        const od = Math.cos(th);
        const p = pop[i];
        const x = Math.sin(th) * rx * (1 - p);
        const y = od * ry * (1 - p) + ry * p;
        const d = od * (1 - p) + p;
        const t = (d + 1) / 2;
        let s = (0.55 + 0.45 * t) * (1 + 0.5 * p);
        let o = 0.3 + 0.7 * t;
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
      requestAnimationFrame(frame);
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
    (navigator.deviceMemory === undefined || navigator.deviceMemory >= 4) &&
    (navigator.hardwareConcurrency === undefined || navigator.hardwareConcurrency >= 4);

  // Framing. The camera sits far enough back that the nearest board reads
  // about a third of the screen and the far one about half that — real
  // perspective doing the work. The ring rides above centre so no board ever
  // swings down into the name plate.
  const R = 3.1;             // orbit radius, world units — a wide sweep
  const FOV = 34;
  const FRONT = R * 1.1;     // how far forward a held board comes
  const UNIT = 2.4;          // every board reads this tall, whatever its mm
  const POP_SCALE = 0.15;    // extra size on the board that has come forward
  const REF = 200;           // px per world unit the hit boxes are sized at

  async function run3d() {
    const [THREE, loaderMod] = await Promise.all([import('three'), import(LOADER_URL)]);
    const { GLTFLoader } = loaderMod;

    const canvas = document.createElement('canvas');
    canvas.className = 'hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, list);
    // From here until every model is up, the stage is the counter alone. The
    // links have no position until the first frame places them, so they must
    // not be on screen before it.
    host.classList.add('is-loading');

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
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
      const heldPer = (UNIT * (1 + POP_SCALE) * h) / (2 * heldDist * tan);
      const liftPer = (0.92 * h) / (2 * camera.position.z * tan);

      // 1.12 and 1.14 for what the bounding box does not cover: the boards sit
      // tilted, and headers and modules stand proud of the board's outline.
      const usableTop = h * (camera.aspect < 1 ? 0.17 : 0.13);   // clear the meta row
      const showBottom = (plateEl ? plateEl.offsetTop : h) - 16;
      const showUsable = Math.max(140, showBottom - usableTop);
      const restUsable = Math.max(140, h * 0.94 - usableTop);

      const ringWants = ringPer * 1.12 + liftPer * 0.5;
      fitShow = Math.min(cap, showUsable / Math.max(ringWants, heldPer * 1.14));
      fitRest = Math.min(cap, restUsable / ringWants);
      if (fitShow > fitRest) fitShow = fitRest;   // never larger than at rest

      // Tighten the ring until the two boards at the sides fit the frame with
      // their own width — measured at the larger of the two sizes.
      const boardHalfW = UNIT * fitRest * 0.34;
      fitR = Math.min(fitR, Math.max(0.1, (halfW * 0.95 - boardHalfW) / R));

      // The lift bias centres the ring nicely, but a held board is taller than
      // the ones in the ring, so the bias gives way to keeping its own edges
      // inside the band.
      const heldHalf = heldPer * fitShow * 0.56;
      bandShow = Math.max(
        usableTop + heldHalf,
        Math.min((usableTop + showBottom) / 2 + liftPer * fitShow * 0.4, showBottom - heldHalf)
      );
      const restHalf = ringPer * fitRest * 0.56 + liftPer * fitRest * 0.4;
      bandRest = Math.min(Math.max(h / 2, usableTop + restHalf), h - restHalf - h * 0.06);
      perWorld = (2 * camera.position.z * tan) / h;
    };
    resize();
    new ResizeObserver(resize).observe(host);

    const loader = new GLTFLoader();
    const nodes = [];
    const meter = document.querySelector('[data-hero="load"]');
    const meterNum = document.querySelector('[data-hero="num"]');
    const meterBar = document.querySelector('[data-hero="bar"]');
    const showLoad = (raw) => {
      // Clamped: hosts gzip the models, and the progress event then reports
      // inflated bytes against the compressed length, which counts past 100.
      const frac = Math.max(0, Math.min(1, raw));
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
      });
      items[i].classList.add('has-model');   // its flat render steps aside
      if (nodes.length === 1) list.classList.add('is-3d');
    }

    host.classList.remove('is-loading');
    host.classList.add('is-3d');
    if (meter) meter.classList.add('is-done');

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
      const spread = 1 + held * 0.34;

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
        const tuck = held * behind * behind;
        const away = held * 1.5 + tuck * 4.4;
        const lift = (1 - Math.cos(th)) * 0.46 + tuck * 2.9;
        n.slot.position.set(
          Math.sin(th) * R * fitR * spread * (1 - p),
          lift * fitS * (1 - p),
          (Math.cos(th) * R * fitR - away) * (1 - p) + FRONT * fitR * p
        );
        // The board being held turns right round — a full revolution in about
        // seven seconds — so you see its face, its edge and its back. The
        // three in the ring instead settle facing you and sway, because a
        // board showing its blank underside is just a black rectangle.
        if (!reduced) {
          if (p > 0.02) {
            n.spin += 0.00095 * dt;
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
        n.holder.scale.setScalar(n.unit * fitS * (1 + POP_SCALE * p));

        // Keep this board's link exactly over it, at its apparent size, so
        // the pointer and the keyboard land on the thing they can see.
        n.slot.getWorldPosition(v);
        const dist = camera.position.distanceTo(v);
        v.project(camera);
        const sx = (v.x * 0.5 + 0.5) * w;
        const sy = (-v.y * 0.5 + 0.5) * h;
        n.sx = sx; n.sy = sy;
        const perPx = (fitS * (1 + POP_SCALE * p) * h) / (2 * dist * tanHalf);
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
        const want = focused < 0 ? 1 : (focused === i ? 1.25 : 0.38);
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
