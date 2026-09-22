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
    if (reduced || lean) {
      // Asked for no motion, or on a metered connection: a still frame with
      // the controls, and nothing fetched until they press play.
      vid.pause();
      vid.removeAttribute('autoplay');
      vid.preload = 'none';
      vid.setAttribute('controls', '');
    } else {
      vid.removeAttribute('controls');
      vid.muted = true;
      // The phone encode is picked by the <source media> in the markup, so
      // the right file is chosen before any script runs and nothing is
      // fetched twice.

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
   * Compare, on a phone. Two selectors head two columns; each names the
   * board its column shows, and choosing the board the other already shows
   * swaps them, so it is always two different boards. A row the two agree
   * on is marked, the switch shows only the rows they don't, and the bar
   * folds to the selectors alone once the page has scrolled past it.
   * ------------------------------------------------------------------ */
  const sel = document.querySelector('.cmp-sel');
  const cmp = document.querySelector('.cmp');
  if (sel && cmp) {
    // The bar sticks exactly under the header, whatever height the header
    // has on this screen: a fixed offset left a strip of page showing
    // between the two.
    const headEl = document.querySelector('.site-head');
    // Its rendered bottom edge, not its box height: the header rides up a
    // few pixels as the page scrolls, and the bar has to follow it.
    const setHead = () => { if (headEl) document.documentElement.style.setProperty('--head-h', Math.max(0, Math.round(headEl.getBoundingClientRect().bottom)) + 'px'); };
    setHead(); addEventListener('resize', setHead, { passive: true });
    const col = { a: sel.querySelector('[data-col="a"]'), b: sel.querySelector('[data-col="b"]') };
    const img = { a: sel.querySelector('[data-col-img="a"]'), b: sel.querySelector('[data-col-img="b"]') };
    const tag = { a: sel.querySelector('[data-col-tag="a"]'), b: sel.querySelector('[data-col-tag="b"]') };
    const rows = [...cmp.querySelectorAll('tbody tr:not(.cmp-group)')];
    const groups = [...cmp.querySelectorAll('tbody tr.cmp-group')];
    const diff = sel.querySelector('[data-diff]');
    const count = sel.querySelector('[data-diff-count]');

    const head = (k) => {
      const o = col[k].selectedOptions[0];
      if (img[k]) { img[k].src = o.dataset.img; img[k].srcset = o.dataset.srcset; }
      if (tag[k]) tag[k].textContent = o.dataset.tag;
    };
    const apply = () => {
      rows.forEach((tr) => {
        let a = null, b = null;
        tr.querySelectorAll('td').forEach((td) => {
          const isA = td.dataset.board === col.a.value, isB = td.dataset.board === col.b.value;
          td.classList.toggle('is-a', isA); td.classList.toggle('is-b', isB);
          if (isA) a = td; if (isB) b = td;
        });
        tr.classList.toggle('is-same', !!(a && b && a.dataset.v === b.dataset.v));
      });
      const n = rows.filter((tr) => !tr.classList.contains('is-same')).length;
      if (count) count.textContent = `${n} of ${rows.length} differ`;
      groups.forEach((g) => {
        let t = g.nextElementSibling, any = false;
        while (t && !t.classList.contains('cmp-group')) { if (!t.classList.contains('is-same')) any = true; t = t.nextElementSibling; }
        g.classList.toggle('is-empty', !any);
      });
    };
    let fade = 0;
    const change = (k, other) => () => {
      if (col[k].value === col[other].value) col[other].value = col[k].dataset.prev;   // swap
      col.a.dataset.prev = col.a.value; col.b.dataset.prev = col.b.value;
      head('a'); head('b');
      clearTimeout(fade);
      cmp.classList.add('is-swapping');
      fade = setTimeout(() => { apply(); cmp.classList.remove('is-swapping'); }, 180);
    };
    col.a.dataset.prev = col.a.value; col.b.dataset.prev = col.b.value;
    col.a.addEventListener('change', change('a', 'b'));
    col.b.addEventListener('change', change('b', 'a'));
    if (diff) diff.addEventListener('change', () => cmp.classList.toggle('diff-only', diff.checked));
    head('a'); head('b'); apply();

    // The bar folds once the page has scrolled past where it started.
    const selTop = sel.getBoundingClientRect().top + window.scrollY;
    let compact = false;
    let settle = 0;
    const fold = () => {
      setHead();
      // and once more when the header has finished its own move
      clearTimeout(settle); settle = setTimeout(setHead, 380);
      const c = window.scrollY > selTop - 40;
      if (c !== compact) { compact = c; sel.classList.toggle('is-compact', c); }
    };
    addEventListener('scroll', fold, { passive: true });
    fold();
  }

  /* ------------------------------------------------------------------ *
   * Contact form
   *
   * Name, email, message. Still a mailto, because there is still no
   * backend: the fields are folded into a mail the visitor's own client
   * sends, and the note under the button says where to write if no client
   * opens.
   * ------------------------------------------------------------------ */
  const form = document.querySelector('.form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const get = (k) => String(f.get(k) || '').trim();
      const note = form.querySelector('.form-note');

      const body = [
        get('message'),
        '',
        '—',
        `${get('name')}`,
        `${get('email')}`,
      ].join('\n');

      location.href =
        'mailto:contact@forgeboard.in' +
        `?subject=${encodeURIComponent('Message from ' + get('name'))}` +
        `&body=${encodeURIComponent(body)}`;

      const btn = form.querySelector('button[type=submit]');
      if (btn) {
        btn.textContent = 'Opening your email…';
        setTimeout(() => { btn.textContent = 'Send message'; }, 4000);
      }
      if (note) {
        note.textContent =
          'If nothing opened, write to contact@forgeboard.in.';
      }
    });
  }
})();
