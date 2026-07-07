import { Application } from 'https://unpkg.com/@splinetool/runtime@1.12.98/build/runtime.js';

const canvas       = document.getElementById('spline-canvas');
const splineLoader = document.getElementById('splineLoader');

const app = new Application(canvas);
app.load(canvas.dataset.scene).then(() => {
  const phone = app.findObjectByName('IPhone Air');
  if (phone) {
    window.__splinePhone     = phone;
    window.__splinePhoneBase = { rx: phone.rotation.x, ry: phone.rotation.y, rz: phone.rotation.z };
  }
  if (splineLoader) splineLoader.classList.add('is-hidden');
});
