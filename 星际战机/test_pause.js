// Smoke test for the pause-exit bug fix.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const open = html.indexOf('<script>') + 8;
const close = html.indexOf('</script>');
let js = html.slice(open, close);

const gradient = { addColorStop() {} };
const ctx = new Proxy({ measureText: () => ({ width: 0 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient, getImageData: () => ({ data: [] }) }, {
  get(t, p) { if (p in t) return t[p]; return () => {}; }, set(t, p, v) { t[p] = v; return true; },
});
function makeEl() { return { width: 480, height: 800, style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800, right: 480, bottom: 800 }), addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {} }; }
const canvasEl = makeEl();
const elements = {};
const document = { getElementById: (id) => (id === 'gameCanvas' ? canvasEl : (elements[id] || (elements[id] = makeEl()))), addEventListener: () => {}, createElement: () => makeEl(), body: makeEl(), documentElement: makeEl() };
function AudioCtx() { return { currentTime: 0, state: 'running', destination: {}, createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() {} }, connect() {}, start() {}, stop() {} }), createGain: () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }), resume() {}, suspend() {}, close() {} }; }
const visualViewport = { width: 480, height: 800, addEventListener: () => {}, scale: 1 };
const windowMock = { addEventListener: () => {}, AudioContext: AudioCtx, webkitAudioContext: AudioCtx, visualViewport, innerWidth: 480, innerHeight: 800, devicePixelRatio: 1 };
const localStorageMock = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const navigatorMock = { userAgent: 'iPhone' };
const sandbox = { window: windowMock, document, navigator: navigatorMock, localStorage: localStorageMock, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout, clearTimeout, setInterval, clearInterval, console, Math, JSON, Date, Object, Array, Map, Set, Proxy, Promise, Image: function () { return { onload: null, src: '', width: 0, height: 0, complete: true, naturalWidth: 0, naturalHeight: 0 }; } };
sandbox.window.AudioContext = AudioCtx; sandbox.window.webkitAudioContext = AudioCtx;

js += `
;(function () {
  const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('PASS: ' + m); };

  // STATE must have PAUSED (real value, not undefined)
  assert(STATE.PAUSED === 'paused', 'STATE.PAUSED is real value "paused" (was undefined before)');

  // --- Simulate mobile pause flow ---
  gameMode = 'normal';
  gameState = STATE.PLAYING;
  updateTouchControlsVisibility();
  assert(btnPause.style.display === 'block', 'btnPause visible during PLAYING');

  // Pause via touchPausePending path
  touchPausePending = true;
  // mimic the loop's pause toggle
  gameState = STATE.PLAYING;
  if (touchPausePending) { touchPausePending = false; if (gameState === STATE.PAUSED) { gameState = STATE.PLAYING; } else if (gameState === STATE.PLAYING || gameState === STATE.BOSS) { gameState = STATE.PAUSED; } }
  assert(gameState === STATE.PAUSED, 'touch pause toggles -> PAUSED');

  // KEY FIX: btnPause must remain visible while paused (so user can tap it to resume)
  updateTouchControlsVisibility();
  assert(btnPause.style.display === 'block', 'FIX: btnPause still visible during PAUSED (was hidden -> could not exit)');

  // Resume by tapping canvas anywhere (handleCanvasTap unpause branch)
  handleCanvasTap(240, 400);
  assert(gameState === STATE.PLAYING, 'FIX: tap screen while paused resumes game');

  // Edge: tap in PLAYING does nothing weird (not a menu/end rect)
  gameState = STATE.PLAYING;
  handleCanvasTap(5, 5);
  assert(gameState === STATE.PLAYING, 'tap in PLAYING is a no-op (no crash)');

  console.log('=== PAUSE-EXIT BUG FIX TESTS PASSED ===');
})();
`;

try { vm.runInNewContext(js, sandbox, { filename: 'game-pause.js' }); console.log('VM RUN OK'); }
catch (e) { console.error('VM ERROR:', e && e.stack ? e.stack : e); process.exit(1); }
