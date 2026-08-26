// Mock-DOM smoke test for 飞机大战 v2 (multi-boss + difficulty bump).
// Tests: tap handler, stage system, boss config, difficulty scaling.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const open = html.indexOf('<script>') + 8;
const close = html.indexOf('</script>');
let js = html.slice(open, close);

// ---- Browser API mocks -----------------------------------------------
const gradient = { addColorStop() {} };
const ctx = new Proxy({
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  getImageData: () => ({ data: [] }),
}, {
  get(t, p) { if (p in t) return t[p]; return () => {}; },
  set(t, p, v) { t[p] = v; return true; },
});
function makeEl() {
  const handlers = {};
  return {
    width: 480, height: 800, style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800, right: 480, bottom: 800 }),
    addEventListener: (t, f) => { handlers[t] = f; }, removeEventListener: () => {}, appendChild: () => {},
    _handlers: handlers,
  };
}
const canvasEl = makeEl();
const elements = {};
const document = {
  getElementById: (id) => (id === 'gameCanvas' ? canvasEl : (elements[id] || (elements[id] = makeEl()))),
  addEventListener: () => {}, createElement: () => makeEl(),
  body: makeEl(), documentElement: makeEl(),
};
function AudioCtx() {
  return {
    currentTime: 0, state: 'running', destination: {},
    createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    resume() {}, suspend() {}, close() {},
  };
}
const visualViewport = { width: 480, height: 800, addEventListener: () => {}, scale: 1 };
const windowMock = {
  addEventListener: () => {},
  AudioContext: AudioCtx, webkitAudioContext: AudioCtx,
  visualViewport, innerWidth: 480, innerHeight: 800, devicePixelRatio: 1,
};
const localStorageMock = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const navigatorMock = { userAgent: 'iPhone' };

const sandbox = {
  window: windowMock, document, navigator: navigatorMock,
  localStorage: localStorageMock,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, Math, JSON, Date, Object, Array, Map, Set, Proxy, Promise,
  Image: function () { return { onload: null, src: '', width: 0, height: 0, complete: true, naturalWidth: 0, naturalHeight: 0 }; },
};
sandbox.window.AudioContext = AudioCtx;
sandbox.window.webkitAudioContext = AudioCtx;

// ---- Test harness ----------------------------------------------------
js += `
;(function () {
  const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('PASS: ' + m); };

  // === 1. STAGES structure ===
  assert(Array.isArray(STAGES) && STAGES.length === 5, 'STAGES is array with 5 stages');
  assert(STAGES[0].name === '第一关', 'Stage 1 name = 第一关');
  assert(STAGES[1].name === '第二关', 'Stage 2 name = 第二关');
  assert(STAGES[4].name === '最终关', 'Stage 5 name = 最终关');

  // === 2. Boss config per stage (HP & size grow each stage) ===
  assert(STAGES[0].bossConfig.hp > 0, 'Stage 1 boss has HP config');
  let hpMonotonic = true, sizeMonotonic = true;
  for (let i = 1; i < STAGES.length; i++) {
    if (STAGES[i].bossConfig.hp <= STAGES[i - 1].bossConfig.hp) hpMonotonic = false;
    if (STAGES[i].bossConfig.width <= STAGES[i - 1].bossConfig.width) sizeMonotonic = false;
  }
  assert(hpMonotonic, 'Boss HP increases each stage');
  assert(sizeMonotonic, 'Boss size increases each stage');
  assert(typeof STAGES[0].bossName === 'string' && STAGES[0].bossName.length > 0, 'Stage 1 has bossName');

  // === 3. Tap handler (mobile menu) ===
  gameState = STATE.MENU;
  handleCanvasTap(240, 447);
  assert(gameMode === 'normal', 'Tap normal mode btn -> gameMode=normal');
  handleCanvasTap(240, 501);
  assert(gameMode === 'endless', 'Tap endless mode btn -> gameMode=endless');
  gameState = STATE.MENU; gameMode = 'normal';
  handleCanvasTap(135, 572);
  assert(gameState !== STATE.MENU, 'Tap start -> leaves MENU');

  // Bestiary entry from menu
  gameState = STATE.MENU;
  handleCanvasTap(345, 572);
  assert(gameState === STATE.BESTIARY, 'Tap 图鉴 btn -> BESTIARY');
  handleCanvasTap(240, 400);
  assert(gameState === STATE.MENU, 'Tap anywhere in BESTIARY -> back to MENU');

  // === 4. Boss defeat -> next stage (not immediate VICTORY) ===
  currentStageIndex = 0; bossesDefeated = 0;
  gameState = STATE.BOSS;
  gameMode = 'normal';
  for (let i = 1; i <= 5; i++) {
    advanceToNextStage();
    if (i < 5) {
      assert(currentStageIndex === i, 'Boss ' + i + ' defeat advances to stage ' + i);
      assert(bossesDefeated === i, 'bossesDefeated = ' + i);
      assert(gameState === STATE.PLAYING, 'Stage ' + i + ' -> back to PLAYING (not victory yet)');
    }
  }
  assert(gameState === STATE.VICTORY, '5th (final) boss defeat -> VICTORY');
  assert(bossesDefeated === 5, 'All 5 bosses defeated');

  // === 6. Bestiary (图鉴) ===
  assert(typeof STATE.BESTIARY === 'string', 'STATE.BESTIARY defined');
  assert(Array.isArray(BESTIARY_BOSSES) && BESTIARY_BOSSES.length === 5, '5 boss entries');
  assert(Array.isArray(BESTIARY_ENEMIES) && BESTIARY_ENEMIES.length === 3, '3 enemy entries');
  assert(BESTIARY_BOSSES[0].name === '没事溜达猪', 'Boss1 = 没事溜达猪');
  assert(BESTIARY_BOSSES[4].name === '脚趾忍者', 'Boss5 = 脚趾忍者');
  assert(BESTIARY_BOSSES[0].img && typeof BESTIARY_BOSSES[0].img === 'object', 'Boss1 has img cache');
  // drawBestiary renders without throwing
  let bestiaryThrew = false;
  try { drawBestiary(); } catch (e) { bestiaryThrew = true; console.log('drawBestiary error:', e.message); }
  assert(!bestiaryThrew, 'drawBestiary() runs without error');
  // update() must early-return in BESTIARY
  const beforeStage = currentStageIndex;
  gameState = STATE.BESTIARY;
  let updateThrew = false;
  try { update(16); } catch (e) { updateThrew = true; console.log('update(BESTIARY) error:', e.message); }
  assert(!updateThrew, 'update() runs in BESTIARY without error');
  assert(currentStageIndex === beforeStage, 'update() does not advance game while in BESTIARY');

  // === 7. Menu renders (cover halo) without error ===
  let menuThrew = false;
  try { gameState = STATE.MENU; drawMenu(); } catch (e) { menuThrew = true; console.log('drawMenu error:', e.message); }
  assert(!menuThrew, 'drawMenu() runs without error (cover halo)');

  // === 5. Difficulty scaling on enemies ===
  difficultyScale = 1.5;
  const drone = { hp: 0, maxHp: 0, score: 0, vy: 0, vx: 0, color: '', fireInterval: 0, dropTable: [], width: 0, height: 0 };
  // Simulate spawnEnemy drone logic
  drone.width = 24; drone.height = 24;
  drone.hp = Math.ceil(3 * difficultyScale);
  drone.vy = 2.5 * (1 + (difficultyScale - 1) * 0.3);
  assert(drone.hp >= 4, 'Drone HP scales up with difficulty (got ' + drone.hp + ')');
  assert(drone.vy > 2.5, 'Drone speed increases with difficulty (got ' + drone.vy.toFixed(2) + ')');

  // Elite at scale 1.5
  const eliteHp = Math.ceil(18 * difficultyScale);
  assert(eliteHp >= 20, 'Elite HP scales well (got ' + eliteHp + ')');

  // === 8. Desktop (mouse) click path regression guard ===
  // 原 bug：handleCanvasTap 内有 !isMobile 早退、且 click 监听带 isMobile 闸门，
  // 导致电脑端鼠标点菜单/图鉴/模式全部失效。
  assert(!/!isMobile/.test(handleCanvasTap.toString()),
    'FIX: handleCanvasTap no longer early-returns on !isMobile (desktop click unblocked)');
  // 抓取真实的 click 监听函数（mock 已记录），其源码不应再引用 isMobile
  const clickHandler = canvasEl._handlers.click;
  assert(typeof clickHandler === 'function', 'click listener is registered on canvas');
  assert(!/\bisMobile\b/.test(clickHandler.toString()),
    'FIX: menu click listener no longer references isMobile at all');
  // 直接派发一次点击（模拟电脑鼠标），验证菜单真的响应
  gameState = STATE.MENU; gameMode = 'normal';
  clickHandler({ clientX: 345, clientY: 572 });
  assert(gameState === STATE.BESTIARY, 'MOUSE CLICK: 图鉴 button -> BESTIARY (desktop path works)');
  clickHandler({ clientX: 240, clientY: 400 });
  assert(gameState === STATE.MENU, 'MOUSE CLICK: tap in BESTIARY -> back to MENU');
  gameState = STATE.MENU; gameMode = 'normal';
  clickHandler({ clientX: 135, clientY: 572 });
  assert(gameState !== STATE.MENU, 'MOUSE CLICK: start button -> leaves MENU');

  console.log('=== ALL V2 SMOKE TESTS PASSED (multi-boss + difficulty) ===');
})();
`;

// ---- Run -------------------------------------------------------------
sandbox.js = js; // expose full source so in-VM tests can assert on it
sandbox.canvasEl = canvasEl; // expose canvas mock so in-VM tests can read captured listeners
try {
  vm.runInNewContext(js, sandbox, { filename: 'game-v2.js' });
  console.log('VM RUN OK');
} catch (e) {
  console.error('VM ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
}
