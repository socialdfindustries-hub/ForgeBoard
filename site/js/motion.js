/* ForgeBoard — motion layer.
 * Scroll reveals, mobile nav and the enquiry form.
 * Everything here is an enhancement: with JS off the site still reads.
 *
 * Deliberately NOT here: wheel hijacking and a custom cursor. Both were tried
 * and removed — the page scrolls natively, which is what people expect.
 */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ *
   * Scroll reveals
   * ------------------------------------------------------------------ */
  const revealAll = () =>
    document.querySelectorAll('.rv, .wd').forEach((el) => el.setAttribute('data-in', '1'));

  if (!('IntersectionObserver' in window) || reduced) {
    // No observer, or the reader asked for no motion: show everything now.
    revealAll();
  } else {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.setAttribute('data-in', '1');
        io.unobserve(e.target);
      }),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );
    document.querySelectorAll('.rv, .wd').forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------ *
   * In-page anchors — native smooth scroll, plus the focus move that
   * scrolling alone does not do.
   * ------------------------------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      scrollTo({
        top: el.getBoundingClientRect().top + scrollY - 24,
        behavior: reduced ? 'auto' : 'smooth',
      });
      history.replaceState(null, '', '#' + id);
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
  });

  /* ------------------------------------------------------------------ *
   * Board views — 3D · Top · Bottom
   *
   * Every board already ships a top and a bottom render; until now nothing
   * on the site showed them. Anyone deciding on a board wants to see the
   * side the pads are on, so the stage switches between the live model and
   * the two flat views.
   *
   * fb-board does the work: setting `fallback` then dropping `src` leaves it
   * showing that render, and putting `src` back brings the model up again.
   * ------------------------------------------------------------------ */
  const stage = document.querySelector('.pdp-stage fb-board');
  const views = document.querySelector('.pdp-views');
  if (stage && views) {
    const buttons = [...views.querySelectorAll('button')];
    let view = '3d';
    const show = (want) => {
      if (want === view) return;
      view = want;
      buttons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.view === want)));

      const d = stage.dataset;
      const label = want === '3d' ? '3D view' : want === 'top' ? 'top view' : 'underside';
      // Order matters: the render is in place before the model comes or goes,
      // so the stage never blanks between views.
      stage.setAttribute('fallback', d['v' + want.charAt(0).toUpperCase() + want.slice(1)] || d['v3d']);
      stage.setAttribute('srcset', d['s' + want.charAt(0).toUpperCase() + want.slice(1)] || d['s3d']);
      stage.setAttribute('alt', (stage.getAttribute('alt') || '').replace(/(3D view|top view|underside)$/, '') + label);
      if (want === '3d') {
        stage.setAttribute('src', d.model);
        if (stage.upgrade) stage.upgrade(true);
      } else {
        stage.removeAttribute('src');
      }
    };
    buttons.forEach((btn) => btn.addEventListener('click', () => show(btn.dataset.view)));
  }

  /* ------------------------------------------------------------------ *
   * Scroll rail
   *
   * A hairline across the top that fills as the page goes by. Written on a
   * frame, and only when the value actually moves, so scrolling stays on the
   * compositor.
   * ------------------------------------------------------------------ */
  const rail = document.querySelector('.scroll-rail i');
  if (rail) {
    let last = -1, queued = false;
    const draw = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      const k = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      if (Math.abs(k - last) < 0.001) return;
      last = k;
      rail.style.transform = 'scaleX(' + k.toFixed(4) + ')';
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    draw();
  }

  /* ------------------------------------------------------------------ *
   * Mobile nav
   * ------------------------------------------------------------------ */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    const head = document.querySelector('.site-head');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      if (head) head.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
    });
  }

  /* ------------------------------------------------------------------ *
   * Header — one state to set: has the page moved.
   *
   * This used to also watch every `.print` panel and flip the bar between a
   * cream treatment and a dark one as each passed under it. That made sense
   * when the page was cream with dark panels cut into it. It is charcoal
   * throughout now, so the cream half of the swap was simply wrong: on an
   * inner page the only `.print` element is the footer, so scrolling put
   * cream text on a cream slab until you reached the bottom, and on the home
   * page the bar flashed light and dark between sections. The bar keeps one
   * appearance; all that changes is whether it has a ground under it.
   *
   * The old scan also gated `scrolled` behind finding a panel at all, so a
   * page without one never got a ground. It is unconditional now.
   * ------------------------------------------------------------------ */
  const head = document.querySelector('.site-head');
  if (head) {
    // Hysteresis: the bar grows a ground at 8px and loses it again at 2, so a
    // scroll that comes to rest on the threshold cannot flicker it.
    let scrolled = null;
    const sync = () => {
      const want = scrollY > (scrolled ? 2 : 8);
      if (want === scrolled) return;
      scrolled = want;
      head.classList.toggle('scrolled', want);
    };
    sync();
    addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * Line video (home, Made in India) — plays muted only while on screen.
   * Stays a plain <video controls> for reduced motion, save-data, slow
   * connections and JS-off, so nobody is left with a frozen poster.
   * ------------------------------------------------------------------ */
  const vid = document.querySelector('.line-video');
  if (vid) {
    const net = navigator.connection;
    const lean = !!(net && (net.saveData || /(^|-)[23]g$/.test(net.effectiveType || '')));
    if (!reduced && !lean) {
      vid.removeAttribute('controls');
      vid.muted = true;
      // Phones get the smaller encode. Setting .src (not <source>) restarts
      // resource selection; nothing has been fetched yet with preload=none.
      const sm = vid.dataset.srcSm;
      if (sm && matchMedia('(max-width:860px)').matches) vid.src = sm;

      const play = () => {
        const p = vid.play();
        if (p && p.catch) p.catch(() => vid.setAttribute('controls', ''));
      };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(
          (entries) => entries.forEach((e) => (e.isIntersecting ? play() : vid.pause())),
          { rootMargin: '160px 0px', threshold: 0.01 },
        ).observe(vid);
      } else {
        play();
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Enquiry form — composes an email, since there is no backend yet.
   * ------------------------------------------------------------------ */
  const form = document.querySelector('.form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const get = (k) => String(f.get(k) || '').trim();
      const body = [
        `Name: ${get('name')}`,
        `Email: ${get('email')}`,
        `Board: ${get('board')}`,
        `Quantity: ${get('qty') || '—'}`,
        '',
        get('message'),
      ].join('\n');

      location.href =
        'mailto:contact@defenceforgeindustries.com' +
        `?subject=${encodeURIComponent('ForgeBoard enquiry — ' + get('board'))}` +
        `&body=${encodeURIComponent(body)}`;

      const note = form.querySelector('.form-note');
      const btn = form.querySelector('button[type=submit]');
      if (btn) {
        btn.textContent = 'Opening your email…';
        setTimeout(() => { btn.textContent = 'Send enquiry'; }, 4000);
      }
      if (note) {
        note.textContent =
          'If nothing opened, write to contact@defenceforgeindustries.com directly.';
      }
    });
  }
})();
