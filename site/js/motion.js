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
   * Headings arrive a word at a time
   *
   * Each word goes in a box that clips, and rises out of it on a short
   * delay after the one before. It reads as the line being set rather than
   * switched on, which is the whole difference between a heading that
   * appears and one that arrives.
   *
   * Words rather than letters: a letter stagger on a heading this size is a
   * novelty that costs legibility, and it multiplies the element count by
   * five for the same half second of motion.
   *
   * The text is only taken apart for people who asked for motion. Everyone
   * else keeps the heading exactly as the markup wrote it.
   * ------------------------------------------------------------------ */
  document.querySelectorAll('[data-split]').forEach((el) => {
    if (reduced) return;
    // Only plain text and line breaks; anything richer is left alone rather
    // than have its markup rebuilt by a regular expression.
    if ([...el.children].some((c) => c.tagName !== 'BR')) return;

    // From the markup, not from textContent: a <br> contributes nothing
    // to textContent, so the label came out as "One install.Every board."
    // with the two lines run together.
    const text = el.innerHTML
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    let i = 0;
    el.innerHTML = el.innerHTML
      .split(/<br\s*\/?>/i)
      .map((line) => line.trim().split(/\s+/).filter(Boolean)
        .map((w) => `<span class="w"><span class="wi" style="--i:${i++}">${w}</span></span>`)
        .join(' '))
      .join('<br>');
    // The heading is now a pile of inline-blocks. Name it once, and let the
    // pieces go unread, so it is still announced as one line of text.
    // The total, so each word can work out where it sits in the run and
    // take its own slice of the scroll.
    el.style.setProperty('--n', String(Math.max(i - 1, 1)));
    el.setAttribute('aria-label', text);
    [...el.querySelectorAll('.w')].forEach((w) => w.setAttribute('aria-hidden', 'true'));
    el.classList.add('is-split');
  });

  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.setAttribute('data-in', '1');
      so.unobserve(e.target);
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
    document.querySelectorAll('.is-split').forEach((el) => so.observe(el));
  } else {
    document.querySelectorAll('.is-split').forEach((el) => el.setAttribute('data-in', '1'));
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
    const hsLayer0 = document.querySelector('[data-hs-layer]');
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
      // Top and Bottom are the flat documentation renders, and the point of
      // them is to see the board itself — the silkscreen, which pad is which.
      // The callouts belong to the 3D view, where they have a model to point
      // at; here they would have nothing to anchor to, so they go away
      // entirely rather than falling back to their list.
      if (hsLayer0) hsLayer0.classList.toggle('is-flat', want !== '3d');

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
   * Callouts <-> spec table
   *
   * The dot on the board and the row in the table are the same fact told
   * twice, so pointing at either lights both. `fb-board` owns where the dots
   * are; this only owns which one is open.
   *
   * Click pins a callout, because on a touch screen there is no hover to
   * rest, and because reading a spec while the board keeps turning under
   * your finger is not reading. Pinned survives the pointer leaving; a
   * second click, Escape, or a click on empty stage clears it.
   * ------------------------------------------------------------------ */
  const hsLayer = document.querySelector('[data-hs-layer]');
  const specList = document.querySelector('.specs');
  if (hsLayer) {
    const pts = [...hsLayer.querySelectorAll('.hs-pt')];
    const rowFor = (key) =>
      specList && specList.querySelector('[data-spec="' + CSS.escape(key) + '"]');
    let pinned = null;

    const light = (pt, on) => {
      const row = pt && rowFor(pt.dataset.spec);
      if (row) row.classList.toggle('is-on', on);
    };
    const open = (pt) => {
      if (pinned === pt) return;
      if (pinned) { pinned.classList.remove('is-on'); light(pinned, false); }
      pinned = pt;
      if (pt) { pt.classList.add('is-on'); light(pt, true); }
      hsLayer.classList.toggle('has-open', !!pt);
    };

    pts.forEach((pt) => {
      // Hover only previews: it lights the spec row, it does not pin.
      pt.addEventListener('pointerenter', () => { if (!pinned) light(pt, true); });
      pt.addEventListener('pointerleave', () => { if (!pinned) light(pt, false); });
      pt.addEventListener('focus', () => { if (!pinned) light(pt, true); });
      pt.addEventListener('blur', () => { if (!pinned) light(pt, false); });
      pt.addEventListener('click', (ev) => {
        ev.stopPropagation();
        open(pinned === pt ? null : pt);
      });
    });

    // The other direction: the table lights the board.
    if (specList) {
      specList.querySelectorAll('[data-spec]').forEach((row) => {
        const key = row.dataset.spec;
        const mates = pts.filter((pt) => pt.dataset.spec === key);
        if (!mates.length) return;
        row.classList.add('has-pt');
        const hover = (on) => {
          if (pinned) return;
          row.classList.toggle('is-on', on);
          mates.forEach((pt) => pt.classList.toggle('is-on', on));
          hsLayer.classList.toggle('has-open', on);
        };
        row.addEventListener('pointerenter', () => hover(true));
        row.addEventListener('pointerleave', () => hover(false));
      });
    }

    addEventListener('keydown', (ev) => { if (ev.key === 'Escape') open(null); });
    const stage = document.querySelector('.pdp-stage');
    if (stage) stage.addEventListener('click', () => open(null));
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
   * Quote request
   *
   * A quotation is priced line by line, so what gets sent has to be lines:
   * a quantity against each board, not one board and one number. The body
   * is laid out as the quotation will be, so whoever prices it is reading
   * the same shape they are about to fill in.
   *
   * Still a mailto, because there is still no backend. That is a real
   * limit and it is why the quantities are also written into the subject —
   * if the body is lost to a mail client that mangles long mailto links,
   * the subject alone still says what was asked for.
   * ------------------------------------------------------------------ */
  const form = document.querySelector('.form');
  if (form) {
    const qtys = [...form.querySelectorAll('.q-qty')];
    const totalEl = form.querySelector('[data-q-total]');

    /** Every line with a quantity on it, as {board, qty}. */
    const lines = () => qtys
      .map((el) => ({ board: el.dataset.board, qty: parseInt(el.value, 10) || 0 }))
      .filter((l) => l.qty > 0);

    // A running count while they type: it confirms the number went in, and
    // it is the only feedback available on a form that cannot price itself.
    const tally = () => {
      if (!totalEl) return;
      const picked = lines();
      const units = picked.reduce((n, l) => n + l.qty, 0);
      totalEl.textContent = !picked.length
        ? 'No quantities yet'
        : `${units} board${units === 1 ? '' : 's'} across ` +
          `${picked.length} line${picked.length === 1 ? '' : 's'} — ` +
          picked.map((l) => `${l.board} ×${l.qty}`).join(', ');
    };
    qtys.forEach((el) => el.addEventListener('input', tally));
    tally();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const get = (k) => String(f.get(k) || '').trim();
      const picked = lines();
      const note = form.querySelector('.form-note');

      // Nothing to price is the one thing that has to be caught here: the
      // quantities are separate inputs, so `required` cannot express "at
      // least one of these".
      if (qtys.length && !picked.length) {
        if (note) note.textContent = 'Put a quantity against at least one board first.';
        (qtys[0] || form).focus();
        return;
      }

      const units = picked.reduce((n, l) => n + l.qty, 0);
      const body = [
        'Request for quotation',
        '',
        'Lines',
        ...picked.map((l) => `  ${l.board.padEnd(10)} ${String(l.qty).padStart(6)}`),
        // Spread an empty list rather than an empty string: the blank lines
        // between sections are wanted, so nothing may filter them out later.
        ...(picked.length > 1
          ? [`  ${'Total'.padEnd(10)} ${String(units).padStart(6)}`] : []),
        '',
        'Buyer',
        `  Name      ${get('name')}`,
        `  Email     ${get('email')}`,
        `  Company   ${get('company') || '—'}`,
        `  Phone     ${get('phone') || '—'}`,
        '',
        'For the tax split and the invoice',
        `  Delivery state  ${get('state') || '—'}`,
        `  GSTIN           ${get('gstin') || '—'}`,
        '',
        'Notes',
        `  ${get('message') || '—'}`,
      ].join('\n');

      const subject = picked.length
        ? 'Quotation request — ' + picked.map((l) => `${l.board} ×${l.qty}`).join(', ')
        : 'Quotation request';

      location.href =
        'mailto:contact@defenceforgeindustries.com' +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;

      const btn = form.querySelector('button[type=submit]');
      if (btn) {
        btn.textContent = 'Opening your email…';
        setTimeout(() => { btn.textContent = 'Request quotation'; }, 4000);
      }
      if (note) {
        note.textContent =
          'If nothing opened, send the same to contact@defenceforgeindustries.com.';
      }
    });
  }
})();
