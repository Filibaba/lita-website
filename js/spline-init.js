// Spline viewer is loaded via <script> in <head> — no import needed here.
const viewer      = document.getElementById('spline-viewer');
const splineLoader = document.getElementById('splineLoader');

// Hide "Built with Spline" badge via shadow DOM injection
const hideSplineBadge = () => {
  if (!viewer.shadowRoot) return;
  if (viewer.shadowRoot.querySelector('style[data-hide-badge]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-hide-badge', '');
  style.textContent = '#logo { display: none !important; }';
  viewer.shadowRoot.appendChild(style);
};
hideSplineBadge();
const badgePoll = setInterval(() => {
  hideSplineBadge();
  if (viewer.shadowRoot?.querySelector('#logo')) clearInterval(badgePoll);
}, 100);
setTimeout(() => clearInterval(badgePoll), 10000);

let splinePollId;

function initSplinePhone() {
  const app = viewer._spline;
  if (!app) return false;
  const phone = app.getAllObjects().find(o => o.name === 'IPhone Air');
  if (!phone) return false;
  window.__splinePhone     = phone;
  window.__splinePhoneBase = { rx: phone.rotation.x, ry: phone.rotation.y, rz: phone.rotation.z };
  clearInterval(splinePollId);
  if (splineLoader) splineLoader.classList.add('is-hidden');
  try {
    const s = document.createElement('style');
    s.textContent = '#logo { display: none !important; }';
    viewer.shadowRoot.appendChild(s);
  } catch (e) {}
  return true;
}

viewer.addEventListener('load', initSplinePhone, { once: true });
splinePollId = setInterval(() => initSplinePhone(), 250);
setTimeout(() => clearInterval(splinePollId), 20000);
