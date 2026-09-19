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

  const SPIN = 0.0038;        // idle rotation, radians per frame
  const IDLE_AFTER = 1400;    // ms of stillness before it resumes turning
  const MAX_PITCH = 1.0;      // ~57°, so it never tumbles over

  class FBBoard extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'fallback', 'srcset', 'sizes', 'tilt', 'motion', 'alt'];
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

          const idle = performance.now() - this.lastInput > IDLE_AFTER;
          if (idle && !this.yawV && !reduced()) this.yaw += SPIN;
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

      const items = nodes.map((el) => {
        // An empty object parented to the model: three.js then carries it
        // through the same centring, uprighting and spin as the geometry,
        // and we never have to repeat that arithmetic here.
        const at = new THREE.Object3D();
        at.position.fromArray(el.dataset.p.split(',').map(Number));
        this.modelRoot.add(at);
        return {
          el,
          card: el.querySelector('.hs-card'),
          at,
          local: new THREE.Vector3().fromArray(el.dataset.n.split(',').map(Number)),
          normal: new THREE.Vector3(),
          shown: -1,
        };
      });

      this.hs = {
        layer, items,
        pos: new THREE.Vector3(),
        mid: new THREE.Vector3(),
        toCam: new THREE.Vector3(),
      };
      layer.classList.add('is-live');
      this.placeHotspots();
    }

    placeHotspots() {
      const hs = this.hs;
      const w = this.clientWidth, h = this.clientHeight;
      if (!w || !h) return;
      const cam = this.camera;
      this.group.updateWorldMatrix(true, true);

      // The board's own centre on screen. Cards are pushed away from it, so
      // they fan outwards and sit off the board instead of over it.
      hs.mid.set(0, 0, 0);
      this.group.localToWorld(hs.mid);
      hs.mid.project(cam);
      const mx = (hs.mid.x * 0.5 + 0.5) * w;
      const my = (-hs.mid.y * 0.5 + 0.5) * h;
      const reach = Math.min(w, h) * 0.34;

      for (const it of hs.items) {
        it.at.getWorldPosition(hs.pos);

        // Facing: +1 straight at the camera, 0 edge-on, negative turned away.
        it.normal.copy(it.local).transformDirection(this.modelRoot.matrixWorld);
        hs.toCam.copy(cam.position).sub(hs.pos).normalize();
        const facing = it.normal.dot(hs.toCam);

        hs.pos.project(cam);
        const x = (hs.pos.x * 0.5 + 0.5) * w;
        const y = (-hs.pos.y * 0.5 + 0.5) * h;

        // Fade across the last 30 degrees rather than snapping at edge-on,
        // so a slow turn hands the labels over instead of blinking them.
        const vis = Math.max(0, Math.min(1, (facing - 0.06) / 0.34));
        const el = it.el;
        if (vis !== it.shown) {
          it.shown = vis;
          el.style.opacity = vis.toFixed(3);
          // Off the back of the board it must not be clickable either, or a
          // label you cannot see still takes the pointer.
          el.style.pointerEvents = vis > 0.25 ? 'auto' : 'none';
        }
        el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';

        // Where its card hangs. On anything with room, straight out from the
        // middle of the board, so the cards fan outwards and sit off it
        // rather than over it. On a phone there is no such room: every card
        // goes to the same place at the foot of the stage, and only the dot
        // moves, which is also why the leader line is off down there.
        let dx = x - mx, dy = y - my;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const narrow = w < 700;
        const cx = narrow ? w / 2 - x : dx * reach;
        const cy = narrow ? h - 52 - y : dy * reach;
        if (it.card) {
          it.card.style.setProperty('--cx', cx.toFixed(1) + 'px');
          it.card.style.setProperty('--cy', cy.toFixed(1) + 'px');
          // The leader is one CSS line: how long, and which way round.
          el.style.setProperty('--len', (reach - 10).toFixed(1) + 'px');
          el.style.setProperty('--ang', Math.atan2(cy, cx).toFixed(3) + 'rad');
          // Cards on the left of the board read right-to-left.
          el.classList.toggle('is-left', dx < 0);
        }
      }
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
      renderer.toneMappingExposure = 1.25;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, w / h, 0.01, 100);

      // A black solder mask swallows light, so this is deliberately generous.
      scene.add(new THREE.HemisphereLight(0xfff3dc, 0x4a3c26, 2.0));
      const key = new THREE.DirectionalLight(0xffffff, 3.0);
      key.position.set(2, 4, 5); scene.add(key);
      const fill = new THREE.DirectionalLight(0xffe9c4, 1.6);
      fill.position.set(-3, 1, 4); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xf39a00, 1.4);
      rim.position.set(-4, 2, -3); scene.add(rim);

      const group = new THREE.Group();
      const pivot = new THREE.Group();   // holds the model's upright correction
      const obj = gltf.scene;
      pivot.add(obj);
      group.add(pivot);
      scene.add(group);

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
