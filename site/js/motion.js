/* ForgeBoard — motion layer.
 * Scroll reveals, mobile nav, board view switching and the enquiry form.
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
   * Product page — 3D / top / bottom views
   * ------------------------------------------------------------------ */
  const views = document.querySelector('.views');
  const stage = document.querySelector('.pdp-stage fb-board');
  if (views && stage) {
    views.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      views.querySelectorAll('button').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn))
      );
      stage.setAttribute('alt', btn.dataset.alt || '');
      stage.setAttribute('fallback', btn.dataset.img);
      if (btn.dataset.srcset) stage.setAttribute('srcset', btn.dataset.srcset);
      else stage.removeAttribute('srcset');

      // Only the 3D view carries a model; the flat views are renders.
      if (btn.dataset.model) {
        stage.setAttribute('src', btn.dataset.model);
        // Tapping 3D is an explicit request, so load it even on a phone,
        // where it never loads on its own.
        if (typeof stage.upgrade === 'function') stage.upgrade(true);
      } else {
        stage.removeAttribute('src');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Header theme — the bar sits over dark panels and cream ones, so it
   * swaps its own colours and logo instead of blending.
   * ------------------------------------------------------------------ */
  const head = document.querySelector('.site-head');
  const darkPanels = [...document.querySelectorAll('.print')];
  if (head && darkPanels.length) {
    const band = 34;   // vertical centre of the header bar
    let last = null, lastScrolled = null;
    const sync = () => {
      const over = darkPanels.some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= band && r.bottom >= band;
      });
      if (over !== last) {
        last = over;
        head.classList.toggle('over-dark', over);
      }
      const scrolled = scrollY > 8;
      if (scrolled !== lastScrolled) {
        lastScrolled = scrolled;
        head.classList.toggle('scrolled', scrolled);
      }
    };
    sync();
    addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync, { passive: true });
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
