// Headless sim: prove the "air wall" (幽灵碰撞) is fixed by grid-snapping.
// Uses the EXACT collision/move formulas from index.html.
const CELL = 30, TANK = 26;
const DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0]; // 0上 1下 2左 3右
const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_GRASS = 4, T_ICE = 5, T_BASE = 6;
const COLS = 13, ROWS = 13;

// Build a map: row 2 is a solid brick wall; everything else empty.
const map = [];
for (let r = 0; r < ROWS; r++) { map[r] = []; for (let c = 0; c < COLS; c++) map[r][c] = T_EMPTY; }
for (let c = 0; c < COLS; c++) map[2][c] = T_BRICK;

function tankBlocked(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  const t = map[r][c];
  return t === T_BRICK || t === T_STEEL || t === T_WATER || t === T_BASE;
}
function rectHitsTank(x, y, s) {
  const c1 = Math.floor(x / CELL), c2 = Math.floor((x + s - 1) / CELL);
  const r1 = Math.floor(y / CELL), r2 = Math.floor((y + s - 1) / CELL);
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (tankBlocked(c, r)) return true;
  return false;
}

// OLD (buggy) mover: no perpendicular snap.
function moveOld(t, dir) {
  const sp = 2;
  const mx = t.x + DX[dir] * sp, my = t.y + DY[dir] * sp;
  if (!rectHitsTank(mx, t.y, t.size)) t.x = mx;
  if (!rectHitsTank(t.x, my, t.size)) t.y = my;
}
// NEW (fixed) mover: snap perpendicular axis to cell center first.
function moveFixed(t, dir) {
  const sp = 2;
  const off = (CELL - t.size) / 2;
  if (DX[dir] !== 0) t.y = Math.round((t.y - off) / CELL) * CELL + off;
  else if (DY[dir] !== 0) t.x = Math.round((t.x - off) / CELL) * CELL + off;
  const mx = t.x + DX[dir] * sp, my = t.y + DY[dir] * sp;
  if (!rectHitsTank(mx, t.y, t.size)) t.x = mx;
  if (!rectHitsTank(t.x, my, t.size)) t.y = my;
}

// Scenario: tank sitting in the open row-1 corridor, but 3px off-center (y=35,
// straddling row 1 and the wall row 2). Moving RIGHT along the open corridor.
function simulate(mover) {
  const t = { x: 2, y: 35, size: TANK, dir: 3 }; // 2 = col0 center; y=35 straddles rows 1&2
  const startX = t.x;
  for (let i = 0; i < 8; i++) mover(t, 3); // keep moving right
  return t.x - startX; // how far it actually travelled
}

const oldTravel = simulate(moveOld);
const fixedTravel = simulate(moveFixed);

console.log('OLD mover travelled (px):', oldTravel, oldTravel === 0 ? '  <-- STUCK (air wall!)' : '');
console.log('FIXED mover travelled (px):', fixedTravel, fixedTravel > 0 ? '  <-- moves freely ✓' : '  <-- STILL STUCK');

if (oldTravel === 0 && fixedTravel > 0) {
  console.log('PASS: air-wall eliminated by grid-snap');
  process.exit(0);
} else {
  console.log('FAIL: unexpected result');
  process.exit(1);
}
