// ── Scroll reveal ─────────────────────────────────────────────────────────────
const revealEls = document.querySelectorAll('section h2, .card, .award, .review, .articlequote, .ipad-hero, .slide-presentation, .giveafork, .hero-cta, .hero-awards, .buttons');
revealEls.forEach(el => el.classList.add('reveal'));

const heroAwards = document.querySelector('.hero-awards');
if (heroAwards) heroAwards.style.transitionDelay = '150ms';

requestAnimationFrame(() => requestAnimationFrame(() => {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -80px 0px', threshold: 0.1 });

  // Stagger award/review rows
  document.querySelectorAll('.award-grid, .review-grid').forEach(grid => {
    const items = [...grid.children];
    const rows  = new Map();
    items.forEach(item => {
      const top = item.offsetTop;
      if (!rows.has(top)) rows.set(top, []);
      rows.get(top).push(item);
    });
    let rowIndex = 0;
    rows.forEach(rowItems => {
      rowItems.forEach(item => item.style.transitionDelay = (rowIndex * 100) + 'ms');
      rowIndex++;
    });
  });

  revealEls.forEach(el => revealObserver.observe(el));
}));

// ── Nav + scroll effects + Spline tilt ───────────────────────────────────────
const floatingNav  = document.getElementById('floatingNav');
const headerLogo   = document.querySelector('.plantry-logo');
const heroEl       = document.querySelector('.hero');
const trialHeading = document.querySelector('.hero-cta h3');
const veggiesEl    = document.getElementById('headerimage');
const giveaforkBg  = document.getElementById('giveaforkBg');
const giveaforkEl  = document.getElementById('giveafork');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Cached layout values — avoids mid-scroll layout reads ─────────────────────
let cachedScrollY   = window.scrollY;
let cachedVW        = window.innerWidth;
let cachedVH        = window.innerHeight;
let giveaforkTop    = 0;
let giveaforkH      = 0;
let veggiesParallax = 0;

function cacheLayout() {
  cachedVW = window.innerWidth;
  cachedVH = window.innerHeight;
  // 500px of downward drift over (element height + viewport) of scroll —
  // same curve as the old Rellax speed -5
  if (veggiesEl) veggiesParallax = 500 / (veggiesEl.offsetHeight + cachedVH);
  if (giveaforkEl) {
    giveaforkTop = giveaforkEl.offsetTop;
    giveaforkH   = giveaforkEl.offsetHeight;
  }
}
cacheLayout();
// Re-apply on resize too, so effects clear when crossing the mobile breakpoint
// (e.g. rotating an iPhone to landscape and back)
window.addEventListener('resize', () => {
  cacheLayout();
  requestAnimationFrame(applyScrollEffects);
}, { passive: true });

// Offsets shift while images load on a cold cache (e.g. first visit to the
// other language version) — re-cache once everything is in and re-apply.
window.addEventListener('load', () => {
  cacheLayout();
  cachedScrollY = window.scrollY;
  requestAnimationFrame(applyScrollEffects);
});

// Lazy images finish after the load event and can still shift offsets —
// re-cache as each one lands.
document.querySelectorAll('img[loading="lazy"]').forEach(img => {
  if (!img.complete) img.addEventListener('load', cacheLayout, { once: true });
});

// ── Smoothed cursor position for Spline tilt ─────────────────────────────────
let mouseX = 0, mouseY = 0, smoothX = 0, smoothY = 0;
if (!reducedMotion) {
  window.addEventListener('mousemove', e => {
    mouseX = (e.clientX / cachedVW - 0.5) * 2;
    mouseY = (e.clientY / cachedVH - 0.5) * 2;
  }, { passive: true, capture: true });
}

// ── Spline tilt rAF loop — only writes when values actually change ────────────
let _splineRx = null, _splineRy = null;
(function splineTiltLoop() {
  if (window.__splinePhone && window.__splinePhoneBase) {
    const b = window.__splinePhoneBase;
    if (reducedMotion) {
      if (_splineRx !== b.rx || _splineRy !== b.ry) {
        window.__splinePhone.rotation.x = b.rx;
        window.__splinePhone.rotation.y = b.ry;
        _splineRx = b.rx; _splineRy = b.ry;
      }
    } else {
      const ease = 0.06;
      smoothX += (mouseX - smoothX) * ease;
      smoothY += (mouseY - smoothY) * ease;
      const scrollProgress = Math.min(cachedScrollY / 700, 1);
      const rx = b.rx - scrollProgress * 0.45 + smoothY * 0.12;
      const ry = b.ry + smoothX * 0.18;
      if (Math.abs(rx - _splineRx) > 1e-5 || Math.abs(ry - _splineRy) > 1e-5) {
        window.__splinePhone.rotation.x = rx;
        window.__splinePhone.rotation.y = ry;
        _splineRx = rx; _splineRy = ry;
      }
    }
  }
  requestAnimationFrame(splineTiltLoop);
}());

// ── Track logo/hero via IntersectionObserver — no layout reads on scroll ──────
new IntersectionObserver(([e]) => {
  if (cachedVW >= 568) floatingNav.classList.toggle('is-scrolled', !e.isIntersecting);
}, { threshold: 0 }).observe(headerLogo);

new IntersectionObserver(([e]) => {
  floatingNav.classList.toggle('is-past-hero', !e.isIntersecting);
}, { threshold: 0 }).observe(heroEl);

// ── rAF-throttled scroll handler ──────────────────────────────────────────────
// All DOM writes are batched into one rAF per frame — no forced layout mid-scroll.
let scrollTick = false;

function applyScrollEffects() {
  const sy     = cachedScrollY;
  const vh     = cachedVH;
  const mobile = cachedVW < 568;

  // Veggies: parallax + opacity + blur — desktop only
  if (veggiesEl) {
    if (!mobile) {
      if (!reducedMotion) veggiesEl.style.transform = `translate3d(0, ${sy * veggiesParallax}px, 0)`;
      veggiesEl.style.opacity = 1 - Math.min(sy / 400, 1) * 0.4;
      veggiesEl.style.filter  = `blur(${sy / vh * 12}px)`;
    } else if (veggiesEl.style.filter || veggiesEl.style.transform) {
      // Clear leftovers from a wider viewport (rotation, window resize)
      veggiesEl.style.transform = '';
      veggiesEl.style.opacity   = '';
      veggiesEl.style.filter    = '';
    }
  }

  // Gradient text scroll
  if (trialHeading && !reducedMotion) {
    trialHeading.style.backgroundPosition = ((sy * 0.3) % 100) + '% 0';
  }

  // Mobile nav scrolled state (desktop uses IntersectionObserver above)
  if (mobile) floatingNav.classList.toggle('is-scrolled', sy > 0);

  // Footer parallax — desktop only
  if (!mobile && !reducedMotion && giveaforkBg && giveaforkH) {
    const rectTop    = giveaforkTop - sy;
    const rectBottom = rectTop + giveaforkH;
    if (rectBottom > 0 && rectTop < vh) {
      const progress   = (vh - rectTop) / (vh + giveaforkH);
      const translateY = (progress - 0.5) * 800;
      const blurAmount = Math.max(0, (1 - progress * 2) * 30);
      const brightness = 0.6 + 0.4 * Math.min(progress * 2, 1);
      giveaforkBg.style.transform = `translateY(${translateY}px)`;
      giveaforkBg.style.filter    = `blur(${blurAmount}px) brightness(${brightness})`;
    }
  } else if (giveaforkBg && giveaforkBg.style.filter) {
    // Clear leftovers from a wider viewport so the image isn't stuck blurred
    giveaforkBg.style.transform = '';
    giveaforkBg.style.filter    = '';
  }

  scrollTick = false;
}

window.addEventListener('scroll', () => {
  cachedScrollY = window.scrollY;
  if (!scrollTick) {
    requestAnimationFrame(applyScrollEffects);
    scrollTick = true;
  }
}, { passive: true });
