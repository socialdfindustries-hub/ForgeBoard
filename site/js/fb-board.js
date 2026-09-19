/* <fb-board fallback="render.webp" fallback-sm="render-sm.webp" src="model.glb" alt="…">
 *
 * Paints the flat render first, then upgrades to a real WebGL model when the
 * element is on screen and the device can take it. Any failure leaves the
 * render in place.
 *
 * Interaction once the model is up: it turns slowly on its own, and you can
 * grab it and spin it. Vertical swipes still scroll the page on a phone, so
 * the board never traps the scroll.
 */
(() => {
  if (customElements.get('fb-board')) return;

  // three.js is vendored under js/vendor/ and named 'three' in each page's
  // import map. The loader is resolved from this script's own location so it
  // works from any page depth.
  const VENDOR = new URL('./vendor/', document.currentScript.src);
  const LOADER_URL = new URL('loaders/GLTFLoader.js', VENDOR).href;

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hasWebGL = () => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  };

  // Auto-load unless the device or connection clearly can't take it. The 3D
  // button still forces a load anywhere WebGL exists.
  const autoCapable = () => {
    const net = navigator.connection;
    if (net && (net.saveData || /(^|-)[23]g$/.test(net.effectiveType || ''))) return false;
    return (
      (navigator.deviceMemory === undefined || navigator.deviceMemory >= 2) &&
      (navigator.hardwareConcurrency === undefined || navigator.hardwareConcurrency >= 2) &&
      hasWebGL()
    );
  };

  let threeMod = null;
  const loadThree = async () => {
    if (!threeMod) {
      const [THREE, loader] = await Promise.all([import('three'), import(LOADER_URL)]);
      threeMod = { THREE, GLTFLoader: loader.GLTFLoader };
    }
    return threeMod;
  };

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /** Take the shine down without flattening the board.
   *
   *  Every material in these exports carries a metallic-roughness texture
   *  and no factors, so metalness and roughness are the baked values and are
   *  best left alone. The sheen on top of them is clearcoat — a second
   *  specular layer, and the reason the solder mask, the LED lenses and the
   *  sensor faces read as wet. Clearcoat is the one dial that takes the
   *  gloss off without touching the colour or the material underneath, so
   *  that is the one this turns, and it roughens what is left so the
   *  highlight that remains is a sheen rather than a point.
   */
  const soften = (root, k) => {
    const seen = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (!m || seen.has(m)) return;
        seen.add(m);
        if (typeof m.clearcoat === 'number' && m.clearcoat > 0) {
          m.clearcoat *= k;
          m.clearcoatRoughness = Math.min(1, (m.clearcoatRoughness || 0) + 0.18);
          m.needsUpdate = true;
        }
      });
    });
  };


  // The shelf every leader lands on before it reaches its text. Fixed, so
  // the landings match across the sheet; short, so no leader has a long
  // horizontal run that could be mistaken for part of the drawing or cut
  // across another label's line.
  const LANDING = 22;

  const IDLE_AFTER = 1400;    // ms of stillness before it resumes turning
  const MAX_PITCH = 1.0;      // ~57°, so it never tumbles over

  class FBBoard extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'fallback', 'srcset', 'sizes', 'tilt', 'motion', 'alt', 'roll'];
    }

    connectedCallback() {
      if (this._init) return;
      this._init = true;

      this.style.perspective = '1400px';
      // pan-y keeps vertical page scrolling working; horizontal drags spin.
      this.style.touchAction = 'pan-y';

      this.inner = document.createElement('div');
      this.inner.style.cssText =
        'width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
        'transform-style:preserve-3d;will-change:transform;min-height:0;min-width:0';
      this.appendChild(this.inner);

      this.yaw = 0; this.pitch = 0;
      this.yawV = 0; this.pitchV = 0;
      this.baseTilt = -0.20;
      this.lastInput = 0;
      this.rx = this.ry = this.tx = this.ty = 0;

      // A page that will show the real model shows only the loading pill
      // until it arrives. The flat render is the fallback for devices that
      // can't do 3D at all, and for the Top / Bottom views, which are renders.
      // The callout list is markup, so it is on the page before anything
      // here runs. While a model is on its way it would sit under an empty
      // stage and then vanish the moment the labels take over, so it is held
      // back until we know which of the two this page is getting.
      this.hsLayer = this.parentElement
        && this.parentElement.querySelector('[data-hs-layer]');
      if (this.getAttribute('src') && autoCapable() && !this.hasAttribute('hold-fallback')) {
        if (this.hsLayer) this.hsLayer.classList.add('is-pending');
        this.mountEmpty();
      } else {
        this.mount2d();
      }

      // Flat-render tilt, driven by the cursor. Only used before the upgrade.
      this.onMove = (e) => {
        if (this.group || this.motionOff()) return;
        const r = this.getBoundingClientRect();
        const max = +(this.getAttribute('tilt') || 14);
        this.tx = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1) * max;
        this.ty = clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1) * max;
      };
      addEventListener('pointermove', this.onMove, { passive: true });

      this.bindDrag();
      // Belt and braces for phones: while the real model is up, no touch on
      // it may become a page scroll, whatever the browser thinks of touch-action.
      this.addEventListener('touchmove', (e) => { if (this.group) e.preventDefault(); }, { passive: false });
      this.raf = requestAnimationFrame(this.tick);

      if (this.getAttribute('src') && autoCapable()) {
        this.seen = new IntersectionObserver((entries) => {
          if (entries.some((en) => en.isIntersecting)) {
            this.seen.disconnect();
            this.seen = null;
            this.upgrade();
          }
        }, { rootMargin: '200px' });
        this.seen.observe(this);
      }
    }

    disconnectedCallback() {
      removeEventListener('pointermove', this.onMove);
      cancelAnimationFrame(this.raf);
      if (this.seen) this.seen.disconnect();
      this.teardown3d();
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._init || oldVal === newVal) return;
      if (name === 'alt' && this.img) this.img.alt = newVal || '';
      if ((name === 'fallback' || name === 'srcset' || name === 'sizes') && this.img) this.applyImgSources();
      if (name === 'src') {
        this.gen = (this.gen || 0) + 1;
        this.teardown3d();
        // Show the incoming board at once — its own flat render if it has
        // one — then bring the model up over it. The stage never goes blank
        // between two boards, and a failed model just leaves the render.
        if (this.getAttribute('fallback')) this.mount2d();
        else if (newVal) this.mountEmpty();
        else this.mount2d();
        if (newVal && autoCapable()) this.upgrade();
      }
    }

    motionOff() {
      return (this.getAttribute('motion') || 'tilt') === 'none' || reduced();
    }

    /* ---------------- drag to spin ---------------- */

    bindDrag() {
      let id = null, lx = 0, ly = 0;

      this.addEventListener('pointerdown', (e) => {
        if (!this.group) return;               // only the real model spins
        id = e.pointerId; lx = e.clientX; ly = e.clientY;
        this.dragging = true;
        this.yawV = this.pitchV = 0;
        this.setPointerCapture(id);
        this.style.cursor = 'grabbing';
      });

      this.addEventListener('pointermove', (e) => {
        if (!this.dragging || e.pointerId !== id) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;

        this.yaw += dx * 0.008;
        this.pitch = clamp(this.pitch + dy * 0.006, -MAX_PITCH, MAX_PITCH);
        this.yawV = dx * 0.008;
        this.pitchV = dy * 0.006;
        this.lastInput = performance.now();
      });

      const end = (e) => {
        if (e.pointerId !== id) return;
        this.dragging = false;
        id = null;
        this.lastInput = performance.now();
        this.style.cursor = 'grab';
      };
      this.addEventListener('pointerup', end);
      this.addEventListener('pointercancel', end);
    }

    /* ---------------- frame loop ---------------- */

    tick = () => {
      this.raf = requestAnimationFrame(this.tick);

      if (this.group) {
        if (this.paused && !this.dragging) return;
        if (!this.dragging) {
          // carry the throw, then settle back into the idle turn
          this.yaw += this.yawV;
          this.pitch = clamp(this.pitch + this.pitchV, -MAX_PITCH, MAX_PITCH);
          this.yawV *= 0.94;
          this.pitchV *= 0.94;
          if (Math.abs(this.yawV) < 1e-4) this.yawV = 0;
          if (Math.abs(this.pitchV) < 1e-4) this.pitchV = 0;

          // Left alone, the board settles back to the pose it is labelled
          // in rather than turning. A board that drifts while you are
          // reading a callout moves the callout, and the labels are the
          // point of this page. Dragging still turns it, and letting go
          // still brings it home.
          const idle = performance.now() - this.lastInput > IDLE_AFTER;
          if (idle && !this.yawV) this.yaw += (0 - this.yaw) * 0.04;
          if (idle && !this.pitchV) this.pitch += (0 - this.pitch) * 0.02;   // ease level
        }
        this.group.rotation.y = this.yaw;
        this.group.rotation.x = this.pitch + this.baseTilt;
        // Coming forward is a camera move, not a scaled-up canvas: the board
        // gains real perspective instead of losing pixels.
        const want = this.frameDist(this.camera.aspect) * (this.zoom || 1);
        if (Math.abs(this.camera.position.z - want) > 1e-4) {
          this.camera.position.z += (want - this.camera.position.z) * 0.09;
        }
        // After the camera has moved, so the labels are placed against the
        // frame that is about to be drawn rather than the one before it.
        if (this.hs) this.placeHotspots();
        if (this.visible !== false) this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.img) {
        const float = this.motionOff() ? 0 : Math.sin(performance.now() / 1400) * 1.5;
        this.rx += (-this.ty + float - this.rx) * 0.08;
        this.ry += (this.tx - this.ry) * 0.08;
        this.img.style.transform = `rotateX(${this.rx}deg) rotateY(${this.ry}deg) translateZ(0)`;
      }
    };

    /* ---------------- flat render ---------------- */

    applyImgSources() {
      if (!this.img) return;
      this.img.src = this.getAttribute('fallback') || '';
      const set = this.getAttribute('srcset');
      const sizes = this.getAttribute('sizes');
      if (set) {
        this.img.srcset = set;
        this.img.sizes = sizes || '100vw';
      } else {
        this.img.removeAttribute('srcset');
        this.img.removeAttribute('sizes');
      }
    }

    mountEmpty() {
      this.inner.innerHTML = '';
      this.group = null;
      this.img = null;
      this.style.cursor = '';
      this.style.touchAction = 'pan-y';
      this.classList.remove('is-3d');
      this.showLoading(0);
    }

    mount2d() {
      this.inner.innerHTML = '';
      this.group = null;
      if (this.hsLayer) this.hsLayer.classList.remove('is-pending');
      this.style.cursor = '';
      this.style.touchAction = 'pan-y';   // flat render: let the page scroll
      this.classList.remove('is-3d');
      const img = document.createElement('img');
      img.alt = this.getAttribute('alt') || '';
      img.decoding = 'async';
      img.style.cssText =
        'display:block;width:100%;height:100%;min-height:0;object-fit:contain;' +
        'filter:drop-shadow(0 40px 60px rgba(0,0,0,.55));transform-style:preserve-3d;will-change:transform';
      this.img = img;
      this.applyImgSources();
      this.inner.appendChild(img);
    }

    teardown3d() {
      if (this.ro) { this.ro.disconnect(); this.ro = null; }
      if (this.vis) { this.vis.disconnect(); this.vis = null; }
      if (!this.renderer) return;
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
          m.dispose();
        });
      });
      this.renderer.dispose();
      this.renderer = this.scene = this.camera = this.group = null;
      this.modelRoot = null;
      if (this.hs) { this.hs.layer.classList.remove('is-live'); this.hs = null; }
    }

    /* ---------------- callouts ----------------
     *
     * The labels are HTML held over the board, not geometry in it: text that
     * stays crisp at any zoom, selects, translates, and reaches a screen
     * reader as a list. The cost is that HTML never enters the depth buffer,
     * so a label cannot truly be hidden behind the board — every library
     * that does this fakes it, and so does this.
     *
     * The fake: each callout carries the normal of the face it sits on. Turn
     * the board and that normal turns with it; once it points away from the
     * camera the label fades out, and the underside's set fades in. On a
     * board — a flat slab with parts on one face — that is very close to
     * exact, and it costs one dot product per label per frame.
     *
     * The markup is a plain list until this runs. Nothing here is required
     * to read what is on the board.
     * ---------------- */

    mountHotspots() {
      const layer = this.hsLayer;
      if (!layer || !this.group || !this.modelRoot) return;
      layer.classList.remove('is-pending');
      const nodes = [...layer.querySelectorAll('.hs-pt')];
      if (!nodes.length) return;
      const THREE = this.THREE;

      const svg = layer.querySelector('.hs-wires');
      const NS = 'http://www.w3.org/2000/svg';
      // One gradient per side, so every wire runs bright where it meets the
      // board and fades out as it reaches its label.
      if (svg && !svg.firstChild) {
        const defs = document.createElementNS(NS, 'defs');
        ['l', 'r'].forEach((side) => {
          const g = document.createElementNS(NS, 'linearGradient');
          g.setAttribute('id', 'hsw-' + side);
          g.setAttribute('x1', side === 'l' ? '1' : '0');
          g.setAttribute('x2', side === 'l' ? '0' : '1');
          [['0%', '1'], ['40%', '.82'], ['100%', '.5']].forEach(([off, op]) => {
            const st = document.createElementNS(NS, 'stop');
            st.setAttribute('offset', off);
            st.setAttribute('stop-color', '#efe6d3');
            st.setAttribute('stop-opacity', op);
            g.appendChild(st);
          });
          defs.appendChild(g);
        });
        svg.appendChild(defs);
      }

      const items = nodes.map((el) => {
        // An empty object parented to the model: three.js then carries it
        // through the same centring, uprighting and spin as the geometry,
        // and we never repeat that arithmetic here.
        const at = new THREE.Object3D();
        at.position.fromArray(el.dataset.p.split(',').map(Number));
        this.modelRoot.add(at);
        const wire = document.createElementNS(NS, 'path');
        wire.setAttribute('class', 'hs-wire');
        wire.setAttribute('stroke', `url(#hsw-${el.dataset.side})`);
        if (svg) svg.appendChild(wire);
        return {
          el, wire, at,
          side: el.dataset.side,
          i: 0,
          local: new THREE.Vector3().fromArray(el.dataset.n.split(',').map(Number)),
          normal: new THREE.Vector3(),
          y: 0, len: 0,
        };
      });

      this.hs = {
        layer, svg, items, t0: performance.now(),
        left: items.filter((i) => i.side === 'l'),
        right: items.filter((i) => i.side !== 'l'),
        pos: new THREE.Vector3(),
        toCam: new THREE.Vector3(),
      };
      layer.classList.add('is-live');
      this.placeHotspots();
    }

    /** Lay a column out: in the order the parts appear up the board, evenly
     *  down the space available.
     *
     *  Not each label level with its own part, which was the obvious thing
     *  and the wrong one. A label level with its part leaves the leader no
     *  rise to work with, so it comes out horizontal — and a horizontal
     *  leader reads as a rule under the text rather than as a line pointing
     *  at something, which is exactly what drawing practice says to avoid.
     *  Spacing them evenly guarantees every leader an angle to be drawn at,
     *  and keeping them in the parts' own order keeps leaders from crossing.
     */
    static column(col, top, bottom, gap, colX) {
      if (!col.length) return;
      // Ordered by the angle each part subtends from the column, not by how
      // far down the screen it is. Height alone is not enough: two leaders
      // starting level on the column still cross if the nearer part belongs
      // to the lower label, which is exactly what happened to the sensor on
      // the near edge and the one out in the middle of the board. Fanning
      // them by angle is the ordering that cannot cross.
      const mid = (top + bottom) / 2;
      col.sort((a, b) =>
        Math.atan2(a.py - mid, Math.abs(a.px - colX) + 1) -
        Math.atan2(b.py - mid, Math.abs(b.px - colX) + 1));
      const tallest = Math.max(...col.map((it) => it.h));
      const step = Math.max((bottom - top) / col.length, tallest + gap);
      const run = step * (col.length - 1);
      // Centred on the space, so a short column sits against the board
      // rather than stranded at the top.
      let start = (top + bottom) / 2 - run / 2;
      start = Math.max(top + tallest / 2, Math.min(start, bottom - run));
      col.forEach((it, i) => { it.y = start + step * i; });
    }

    placeHotspots() {
      const hs = this.hs;
      const host = hs.layer;
      const w = host.clientWidth, h = host.clientHeight;
      const bw = this.clientWidth, bh = this.clientHeight;
      if (!w || !h || !bw || !bh) return;
      const cam = this.camera;
      this.group.updateWorldMatrix(true, true);

      // The canvas is centred in the layer, which is wider than it: the
      // labels live in the margins either side. Projection is in canvas
      // pixels, so everything is shifted into the layer's frame once here.
      const ox = (w - bw) / 2, oy = (h - bh) / 2;
      const colL = Math.max(ox - 18, 96);
      const colR = Math.min(ox + bw + 18, w - 96);

      for (const it of hs.items) {
        it.at.getWorldPosition(hs.pos);

        // Facing: +1 straight at the camera, 0 edge-on, negative turned away.
        it.normal.copy(it.local).transformDirection(this.modelRoot.matrixWorld);
        hs.toCam.copy(cam.position).sub(hs.pos).normalize();
        it.facing = it.normal.dot(hs.toCam);
        // How near the camera this part is, across the board's own depth.
        it.depth = hs.pos.distanceTo(cam.position);

        hs.pos.project(cam);
        it.px = ox + (hs.pos.x * 0.5 + 0.5) * bw;
        it.py = oy + (-hs.pos.y * 0.5 + 0.5) * bh;
        it.want = it.py;
        it.y = it.py;
        it.h = it.el.offsetHeight || 20;
        it.w = it.el.offsetWidth || 80;
      }

      // Run the reveal down each column from the top, not in markup order,
      // so it reads as a sweep. Ordered on the first frame, once the parts
      // have actually been projected: the board is turned in its own plane,
      // so its own axes no longer say which label is highest on screen.
      if (!hs.ordered) {
        hs.ordered = true;
        [hs.left, hs.right].forEach((col) => {
          col.slice().sort((a, b) => a.py - b.py).forEach((it, n) => { it.i = n; });
        });
      }

      // First sight: each label comes up from nothing to its full strength,
      // one after the next, and its leader draws itself out to the part.
      const t = performance.now() - hs.t0;
      const ease = (k) => 1 - Math.pow(1 - k, 3);
      const reveal = (i) =>
        ease(Math.max(0, Math.min(1, (t - 140 - i * 85) / 560)));

      const near = Math.min(...hs.items.map((i) => i.depth));
      const far = Math.max(...hs.items.map((i) => i.depth));
      const span = Math.max(far - near, 1e-4);

      FBBoard.column(hs.left, oy + 24, oy + bh - 24, 18, colL);
      FBBoard.column(hs.right, oy + 24, oy + bh - 24, 18, colR);

      for (const it of hs.items) {
        const el = it.el;
        const left = it.side === 'l';
        const colX = left ? colL : colR;

        // The label hangs above its reference line, and the line is what the
        // leader actually arrives at — so `it.y` is the rule, not the middle
        // of the text. Left-hand text is right-aligned to the column so both
        // columns read inwards towards the board.
        el.style.transform =
          'translate3d(' + colX.toFixed(1) + 'px,' + it.y.toFixed(1) + 'px,0)' +
          (left ? ' translateX(-100%)' : '');

        // Two things dim a label: its part turning away from us, and its part
        // being the far side of the board. The first is a hard fade, because
        // a label for something you cannot see is noise; the second is gentle,
        // and is the depth cue.
        const facing = Math.max(0, Math.min(1, (it.facing - 0.04) / 0.30));
        const depth = 1 - ((it.depth - near) / span) * 0.22;
        const k = reveal(it.i);
        const vis = facing * depth * k;
        if (vis !== it.shown) {
          it.shown = vis;
          el.style.opacity = vis.toFixed(3);
          el.style.pointerEvents = vis > 0.3 ? 'auto' : 'none';
        }
        if (!it.wire) continue;

        // ---- the leader ----
        // Drawing convention, and the reason this reads as a callout rather
        // than a stray rule: the angled run is snapped to 15 degrees, and it
        // arrives at a level landing that carries on under the text as the
        // reference line the label sits on. A leader left horizontal reads as
        // part of the drawing; a leader at a stated angle reads as pointing.
        const dir = left ? -1 : 1;              // which way the text lies

        // The landing is a fixed short shelf into the text and the angled run
        // is everything else — standardised length, as drawing practice asks,
        // and the reason this reads as a callout sheet.
        //
        // The alternative was to snap the angle to 15 degrees and let the
        // landing fall where it may. That looks right on paper and wrong
        // here: a label near level with its part then needs a very long
        // shallow run, which leaves a landing most of the way across the
        // stage, and that near-horizontal rule cuts straight through the
        // leaders of the labels above it. A short shelf cannot.
        const elbowX = colX - dir * LANDING;

        it.wire.setAttribute('d',
          'M' + it.px.toFixed(1) + ' ' + it.py.toFixed(1) +
          'L' + elbowX.toFixed(1) + ' ' + it.y.toFixed(1) +
          'H' + (colX + dir * it.w).toFixed(1));
        it.wire.style.opacity = vis.toFixed(3);

        // Draw the leader on rather than fade it in: dash the whole length,
        // then pull the gap back to nothing.
        if (k < 1) {
          const len = it.wire.getTotalLength() || 0;
          it.wire.style.strokeDasharray = len.toFixed(1);
          it.wire.style.strokeDashoffset = (len * (1 - k)).toFixed(1);
        } else if (it.len !== -1) {
          it.len = -1;
          it.wire.style.strokeDasharray = 'none';
          it.wire.style.strokeDashoffset = '0';
        }

        const lit = el.classList.contains('is-on') || el === document.activeElement
          || (el.matches && el.matches(':hover'));
        if (lit !== it.lit) {
          it.lit = lit;
          it.wire.classList.toggle('is-on', lit);
        }
      }

      if (hs.svg) hs.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    /* ---------------- WebGL upgrade ---------------- */

    /** force=true means a person asked for it, so the auto gate does not apply. */
    async upgrade(force) {
      const src = this.getAttribute('src');
      if (!src || this.busy || this.group) return;
      if (!force && !autoCapable()) return;
      if (force && !hasWebGL()) return;
      if (force && !this.img) this.mountEmpty();

      this.busy = true;
      const gen = (this.gen = (this.gen || 0) + 1);
      this.showLoading(0);
      try {
        await this.mount3d(src, gen);
      } catch (err) {
        console.warn('fb-board: model failed, showing the render —', err.message);
        if (gen === this.gen && !this.group) this.mount2d();
      } finally {
        this.busy = false;
        this.hideLoading();
      }
    }

    showLoading(pct) {
      if (!this.pill) {
        this.pill = document.createElement('div');
        this.pill.className = 'fb-loading eyebrow';
        this.pill.setAttribute('role', 'status');
        this.appendChild(this.pill);
      }
      // Clamped, because the number can legitimately exceed 1. Hosts serve
      // these models gzipped, and then `loaded` counts bytes after the
      // browser has inflated them while `total` is the compressed
      // Content-Length — so Spark, 3.9 MB inflated from 1.6 MB, counts its
      // way to 242%. Nothing is wrong with the download; only the ratio is.
      const k = Math.max(0, Math.min(1, pct));
      this.pill.textContent = k > 0 ? `Loading 3D · ${Math.round(k * 100)}%` : 'Loading 3D';
    }

    hideLoading() {
      if (this.pill) { this.pill.remove(); this.pill = null; }
    }

    async mount3d(src, gen) {
      const { THREE, GLTFLoader } = await loadThree();
      const gltf = await new GLTFLoader().loadAsync(src, (ev) => {
        if (ev.lengthComputable && gen === this.gen) this.showLoading(ev.loaded / ev.total);
      });
      if (!this.isConnected || gen !== this.gen || this.getAttribute('src') !== src) return;

      const w = this.clientWidth || 800;
      const h = this.clientHeight || 600;

      const renderer = new THREE.WebGLRenderer({
        antialias: true, alpha: true, powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, w / h, 0.01, 100);

      // A black solder mask swallows light, so this has to be generous — but
      // the generosity belongs in the hemisphere light, not the directionals.
      // A hemisphere light contributes diffuse only: it lifts the board out
      // of the dark without putting a highlight anywhere. A directional light
      // is what puts a hard specular on every metal shell and clearcoated
      // package, and at 3.0 it was blowing them out. So the ambient goes up
      // and the three directionals come down by roughly half; the board ends
      // up as bright as it was and nothing like as shiny.
      scene.add(new THREE.HemisphereLight(0xfff3dc, 0x4a3c26, 2.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(2, 4, 5); scene.add(key);
      const fill = new THREE.DirectionalLight(0xffe9c4, 0.85);
      fill.position.set(-3, 1, 4); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xf39a00, 0.7);
      rim.position.set(-4, 2, -3); scene.add(rim);

      const group = new THREE.Group();
      const pivot = new THREE.Group();   // holds the model's upright correction
      const obj = gltf.scene;
      pivot.add(obj);
      group.add(pivot);
      scene.add(group);

      // Turn the board in its own plane first, before anything is measured.
      // These models lie flat with Y through the board, so a Y rotation
      // spins the board the way you would turn it on a desk — it does not
      // tip it. Everything downstream (the centring, the fit, the callout
      // anchors, which are parented to this) follows from it, so the pose
      // the page presents is a property of the board, not of the camera.
      soften(obj, 0.45);

      const roll = parseFloat(this.getAttribute('roll'));
      if (!Number.isNaN(roll)) obj.rotation.y = (roll * Math.PI) / 180;

      let box = new THREE.Box3().setFromObject(obj);
      let size = box.getSize(new THREE.Vector3());
      obj.position.sub(box.getCenter(new THREE.Vector3()));

      // These boards are exported lying flat, so a camera on +Z would see them
      // edge-on. Turn the thinnest axis — the board's thickness — to face us.
      const dims = [size.x, size.y, size.z];
      const thin = dims.indexOf(Math.min(...dims));
      if (thin === 1) pivot.rotation.x = Math.PI / 2;        // lying flat, top up
      else if (thin === 0) pivot.rotation.y = -Math.PI / 2;  // on its edge
      pivot.updateMatrixWorld(true);

      // Re-measure upright, recentre, then fit both width and height.
      box = new THREE.Box3().setFromObject(pivot);
      size = box.getSize(new THREE.Vector3());
      pivot.position.sub(box.getCenter(new THREE.Vector3()));
      const half = Math.tan((camera.fov * Math.PI) / 360);
      this.fitV = size.y / 2 / half;
      this.fitH = size.x / 2 / half;
      camera.position.set(0, 0, this.frameDist(camera.aspect));
      camera.lookAt(0, 0, 0);

      const canvas = renderer.domElement;
      canvas.style.cssText =
        'display:block;width:100%;height:100%;opacity:0;transition:opacity .6s ease';
      this.inner.innerHTML = '';
      this.inner.appendChild(canvas);
      this.img = null;
      Object.assign(this, { renderer, scene, camera, group, modelRoot: obj, THREE });
      this.mountHotspots();
      this.style.cursor = 'grab';
      this.style.touchAction = 'none';   // a drag on the model spins it, never the page
      this.classList.add('is-3d');
      this.lastInput = performance.now();
      requestAnimationFrame(() => { canvas.style.opacity = '1'; });

      this.ro = new ResizeObserver(() => {
        const w2 = this.clientWidth, h2 = this.clientHeight;
        if (!w2 || !h2 || !this.renderer) return;
        this.renderer.setSize(w2, h2);
        this.camera.aspect = w2 / h2;
        this.camera.updateProjectionMatrix();
        this.camera.position.z = this.frameDist(this.camera.aspect) * (this.zoom || 1);
      });
      this.ro.observe(this);

      // Stop rendering while it is off screen.
      this.vis = new IntersectionObserver(
        (es) => { this.visible = es.some((e) => e.isIntersecting); },
        { rootMargin: '100px' }
      );
      this.vis.observe(this);
    }

    frameDist(aspect) {
      return Math.max(this.fitV, this.fitH / aspect) * 1.12;
    }
  }

  customElements.define('fb-board', FBBoard);
})();
