// The hero logo plays once (115 frames at 20 ms). Starting the 3D scene runs the Spline runtime and
// parses a ~23 MB scene on the main thread, which made the logo stall twice. So: let the logo download
// first, fetch the runtime and the scene in the background, and start them once the logo has played.
const RUNTIME = 'https://unpkg.com/@splinetool/runtime@1.12.98/build/runtime.js';
const LOGO_MS = 2300;

const canvas       = document.getElementById('spline-canvas');
const logo         = document.querySelector('.plantry-logo');

const logoLoaded = new Promise(resolve => {
  if (!logo || logo.complete) resolve();
  else { logo.addEventListener('load', resolve, { once: true }); logo.addEventListener('error', resolve, { once: true }); }
});

const sceneUrl = logoLoaded.then(() => {
  fetch(RUNTIME).catch(() => {});            // warms the cache for the import below
  return fetch(canvas.dataset.scene)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then(b => URL.createObjectURL(b))
    .catch(() => canvas.dataset.scene);      // let the runtime fetch it itself
});

const logoPlayed = logoLoaded.then(() => new Promise(resolve => setTimeout(resolve, logo ? LOGO_MS : 0)));

// The screen's video is a <video> the runtime creates off-page; catch it so we can start it ourselves.
function catchVideos() {
  const videos = [];
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = create.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'video') videos.push(el);
    return el;
  };
  return { videos, release: () => { Document.prototype.createElement = create; } };
}

// Resolves once the playing video has presented a frame (not just loaded one), so the 3D screen can draw it
function framePresented(video) {
  return new Promise(resolve => {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => resolve());
    else video.addEventListener('timeupdate', () => resolve(), { once: true });
  });
}

const nextFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

Promise.all([sceneUrl, logoPlayed]).then(async ([url]) => {
  const { Application } = await import(RUNTIME);
  const app = new Application(canvas);
  const caught = catchVideos();
  try { await app.load(url); } finally { caught.release(); }

  const phone = app.findObjectByName('IPhone Air');
  if (phone) {
    window.__splinePhone     = phone;
    window.__splinePhoneBase = { rx: phone.rotation.x, ry: phone.rotation.y, rz: phone.rotation.z };
  }

  // Keep the 3D phone hidden until its screen shows the video's first frame, so it never appears with a blank screen
  const video = caught.videos.find(v => v.src.startsWith('data:video') || v.duration > 1);
  if (video) {
    video.currentTime = 0;
    video.play().catch(() => {});
    await Promise.race([framePresented(video), new Promise(r => setTimeout(r, 3000))]);
  }
  await nextFrames();                                               // let Spline draw it onto the screen
  await nextFrames();
  canvas.parentElement.classList.add('is-ready');                   // swaps the placeholder for the 3D phone (golden.css)
});
