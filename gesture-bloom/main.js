import { createGitHubRoseData, createGitHubRoseMesh } from './vendor/github-parametric-rose.js';

/**
 * 指尖花开 — 原生 ES Module，无后端、无 API Key、无画面上传。
 * 分区：可调参数 → 张开度数学 → 粒子几何/着色器 → 摄像头 → UI/渲染。
 * Three.js 与 MediaPipe 使用 vendor/ 内的固定版本，CDN 仅作为显式备用。
 */

export const CONFIG = Object.freeze({
  desktopParticles: 20000,
  minParticles: 5000,
  maxParticles: 20000,
  closedThreshold: 0.32,
  openThreshold: 0.66,
  // 四根手指的平均距离比；可在“关于作品”里进行个人校准。
  fistRatio: 1.05,
  palmRatio: 1.95,
  tensionSmoothingSeconds: 0.11,
  positionSmoothingSeconds: 0.14,
  rotationSmoothingSeconds: 0.22,
  maxHandRoll: Math.PI * .4, // 屏幕内旋转最多 72°，避免突然翻面。
  maxHandTilt: .30, // 俯仰与侧倾最多约 17°，始终能看到花心。
  defaultSpread: 1.22,
  trackingFps: 18,
  trackingInputWidth: 640, // 仅缩小识别输入；预览和背景仍保持摄像头原始分辨率。
  trackingLostSeconds: 0.55,
  maxPixelRatio: 2,
  particleSize: 4.6,
  // 稍增加观察花杯的角度，让卷瓣侧壁和花心螺旋可见；没有自动侧倾或摇摆。
  viewAngle: Math.PI * 0.34,
  flowerRadius: 3.25,
  dustParticles: 240,
  seed: 20261011,
  threeCDN: 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js',
  handsCDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/',
});

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}
/** 帧率无关的指数平滑：α = 1 - exp(-Δt / τ)。 */
export function damp(current, target, deltaSeconds, tau) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, deltaSeconds) / tau));
}

/**
 * MediaPipe 关键点：腕 0；食/中/无名/小指根 5/9/13/17；指尖 8/12/16/20。
 * r_i = ||P_tip - P_wrist|| / max(||P_mcp - P_wrist||, ε)
 * r = (r_index + r_middle + r_ring + r_pinky) / 4
 * tension_raw = clamp((r - r_fist) / (r_palm - r_fist), 0, 1)
 *
 * 优先传入 worldLandmarks（以米计）；降级使用 normalized landmarks 时，
 * x,z 乘视频宽高比，避免 16:9 图像中的坐标被当作正方形坐标。
 * 拇指不计入张开度：对掌、夹拇指的习惯容易干扰握拳判断。
 */
export function measureHandRatio(landmarks, aspect = 1) {
  if (!landmarks || landmarks.length !== 21) return null;
  const distance = (a, b) => Math.hypot(
    (a.x - b.x) * aspect, a.y - b.y, ((a.z ?? 0) - (b.z ?? 0)) * aspect,
  );
  const wrist = landmarks[0];
  const ratios = [[8, 5], [12, 9], [16, 13], [20, 17]].map(([tip, mcp]) =>
    distance(landmarks[tip], wrist) / Math.max(distance(landmarks[mcp], wrist), 1e-6),
  );
  return ratios.every(Number.isFinite) ? ratios.reduce((a, b) => a + b, 0) / 4 : null;
}
export function ratioToTension(ratio, fist = CONFIG.fistRatio, palm = CONFIG.palmRatio) {
  if (!Number.isFinite(ratio) || palm - fist < 0.15) return 0;
  return clamp((ratio - fist) / (palm - fist));
}
export function tensionToBloom(tension) {
  // t < .32 完全闭合；t > .66 完全打开；两侧导数为零，过渡不突跳。
  return smoothstep(CONFIG.closedThreshold, CONFIG.openThreshold, tension);
}

/**
 * 手腕→中指根决定镜像预览中的旋转方向；掌面法线决定轻微俯仰/侧倾。
 * 法线由 (食指根−小指根) × (中指根−手腕) 求得，优先使用米制 world 点。
 * 法线统一到朝向屏幕的半球，左右手/掌背切换不会造成整朵花翻转 180°。
 * 指尖弯曲不参与朝向计算，握拳本身不会误触发旋转。
 */
export function measureHandOrientation(landmarks, world = null, aspect = 1) {
  if (!landmarks || landmarks.length !== 21) return null;
  const dx = (landmarks[9].x - landmarks[0].x) * aspect;
  const dy = landmarks[9].y - landmarks[0].y;
  if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) < 1e-6) return null;
  const roll = clamp(Math.atan2(dx, -dy), -CONFIG.maxHandRoll, CONFIG.maxHandRoll);
  const points = world?.length === 21 ? world : landmarks;
  const factor = points === world ? 1 : aspect;
  const difference = (a, b) => [(a.x - b.x) * factor, a.y - b.y, ((a.z ?? 0) - (b.z ?? 0)) * factor];
  const across = difference(points[5], points[17]), along = difference(points[9], points[0]);
  let nx = across[1] * along[2] - across[2] * along[1];
  let ny = across[2] * along[0] - across[0] * along[2];
  let nz = across[0] * along[1] - across[1] * along[0];
  const length = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(length)) return null;
  if (length < 1e-8) return { roll, pitch: 0, yaw: 0 };
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const z = Math.max(nz, length * .18);
  return { roll, pitch: clamp(Math.atan2(ny, z) * .45, -CONFIG.maxHandTilt, CONFIG.maxHandTilt),
    yaw: clamp(-Math.atan2(nx, z) * .45, -CONFIG.maxHandTilt, CONFIG.maxHandTilt) };
}

/** 仅按设备实际名称分类，不把浏览器“默认摄像头”当成电脑摄像头。 */
export function cameraDeviceKind(label = '') {
  if (!label.trim()) return 'unknown';
  if (/(?:camo|droidcam|ivcam|iriun|epoccam|android|iphone|ipad|phone|手机|oppo|find\s*x\d|xiaomi|redmi|huawei|honor|vivo|samsung|oneplus|realme|小米|华为|荣耀|三星|Windows\s*虚拟)/i.test(label)) return 'phone';
  if (/(?:obs|virtual|虚拟|snap\s*camera|manycam|xsplit)/i.test(label)) return 'virtual';
  return 'camera';
}

/**
 * 导出的纯选择策略便于验证：过滤手机与虚拟来源，再优先内置/USB/HD 摄像头。
 * 未授权时设备名称为空，返回 null，让用户主动选择，不猜测第一个设备。
 */
export function selectDesktopCamera(devices = []) {
  const candidates = devices.filter((device) => device.kind === 'videoinput'
    && device.deviceId && cameraDeviceKind(device.label) === 'camera');
  const score = (label) => /(?:integrated|built.?in|internal|内置|集成)/i.test(label) ? 3
    : /(?:\bhd\s*camera\b|\bhd\s*webcam\b|\busb\b|webcam|摄像头)/i.test(label) ? 2 : 1;
  return candidates.reduce((best, device) => !best || score(device.label) > score(best.label) ? device : best, null);
}

/** 固定种子随机数：刷新、调整粒子数时形状一致，便于调参。 */
function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从 GitHub 移植完整三维玫瑰曲面，按瓣面面积与瓣缘长度采样。
 * 函数及源仓库见 vendor/github-parametric-rose.js；保留两份 MIT 许可。
 * 粒子数据包含花苞/展开对应位置、法线明暗、瓣缘光晕和局部流光分类。
 */
export function createParticleData(count, seed = CONFIG.seed) {
  return createGitHubRoseData(count, seed);
}


const ROSE_DEFORM_GLSL = `
  // Adapted from Woffluon/WebGL-Flower, src/shaders/mod2.frag (MIT).
  // Copyright (c) 2026 Efe Arabacı. Full license: vendor/WEBGL-FLOWER-LICENSE.txt.
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1; i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 a0 = x - floor(x + 0.5);
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // 网格和粒子调用同一基础形变，避免绽放/微风时深度网格吞掉亮点。
  vec3 deformRose(vec3 closedPosition,vec3 openedPosition,float layer) {
    float bloom=smoothstep(layer*.045,.80+layer*.05,uBloom);
    vec3 p=mix(closedPosition,openedPosition,bloom);
    // 外瓣扩展，花心保持卷曲；网格和粒子共用，深度遮挡仍与瓣面一致。
    float radius=length(openedPosition.xz);
    p.xz*=1.0+(uSpread-1.0)*bloom*smoothstep(.35,2.5,radius);
    float wave=sin(uTime*.7+layer*1.3+p.x*.8);
    p.y+=wave*.035*uBloom*uMotion;
    p.z+=snoise(p.xy*.7+vec2(uTime*.045,0.0))*.035*uBloom*uMotion;
    p+=uWind*.055*uBloom;
    float age=max(0.0,uTime-uReleaseTime);
    float release=sin(age*3.0)*exp(-age*2.0)*.35;
    p+=normalize(openedPosition+vec3(.01))*release*uBloom*uMotion;
    return p;
  }
`;

const VERTEX_SHADER = `
  attribute vec3 aBloomPosition;
  attribute float aSize;
  attribute float aShade;
  attribute float aSeed;
  attribute float aLayer;
  attribute float aLight;
  attribute float aRim;
  attribute float aDrift;
  uniform float uBloom;
  uniform float uSpread;
  uniform float uTime;
  uniform float uReleaseTime;
  uniform float uPixelRatio;
  uniform float uPointScale;
  uniform float uMotion;
  uniform float uDensityOpacity;
  uniform float uPassOpacity;
  uniform vec3 uWind;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform vec3 uAccentColor;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vRim;
  ${ROSE_DEFORM_GLSL}
  void main() {
    vec3 p=deformRose(position,aBloomPosition,aLayer);
    float driftOpacity = 1.0;
    if (aDrift > 0.5) {
      // 稳定种子 + 周期相位：从花瓣缓慢散出、淡去、重新从花瓣出现。
      // 回到花苞时散点立刻汇入相应闭合坐标，不留外围漂浮的残点。
      float age = fract(uTime * 0.105 * uMotion + aSeed / 6.2831853);
      vec3 direction = normalize(aBloomPosition * vec3(1.0, 0.35, 1.0) + vec3(0.1,0.8,0.1));
      p += (direction * age * age * (1.6 + aSeed * 0.21) * uSpread
        + vec3(sin(age * 5.0 + aSeed) * 0.13, age * 0.75, cos(age * 4.0 + aSeed) * 0.12)) * uBloom;
      driftOpacity = pow(sin(age * 3.14159265), 0.6) * mix(0.35, 0.90, uBloom);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // 留出薄薄的前景偏移，避免曲面深度挡住同一瓣面上的点核。
    mv.z += mix(0.01, 0.025, uBloom);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPointScale * uPixelRatio * (12.0 / -mv.z) * mix(0.55, 1.0, uBloom), 1.0, 12.0 * uPixelRatio);
    // 点精灵变大只扩展柔光，细小亮核保持可辨认。
    gl_PointSize *= mix(1.0, 1.38, aRim);
    vColor = mix(uInnerColor, uOuterColor, clamp(aShade, 0.0, 1.0));
    vColor = mix(vColor, uAccentColor, (1.0 - aLayer * 0.25) * 0.22 + smoothstep(0.1, 0.95, sin(aSeed)) * 0.07);
    vColor *= (0.75 + aLight * 0.6) * 1.6;
    // 瓣缘亮核微微泛白，底色保持粉色，避免整瓣变白。
    vColor = mix(vColor, vec3(1.6, 1.08, 1.2), aRim * 0.08);
    vRim = aRim;
    if (aShade < 0.0) vColor = mix(uInnerColor, vec3(1.0, 0.46, 0.19), 0.7) * 0.7;
    // 握拳时缩小透明度，防止粒子集中后叠成白色。
    vOpacity = (0.78 + sin(aSeed + uTime * 0.45) * 0.04 * uMotion)
      * mix(0.20, 1.0, uBloom) * uDensityOpacity * uPassOpacity
      * mix(1.0, 2.60, aRim);
    vOpacity *= driftOpacity;
    if(aDrift > 0.5) { gl_PointSize *= 0.80; vOpacity *= 0.45; }
  }
`;
const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vRim;
  uniform bool uPostProcessing;
  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (distanceToCenter > 1.0) discard;
    // 在一个点内组合细亮核与柔光，保持单遍绘制。
    // 瓣缘的柔光略强，瓣面较弱，不执行全屏多轮 Bloom。
    float core = exp(-distanceToCenter * distanceToCenter * 12.0);
    float halo = exp(-distanceToCenter * distanceToCenter * 3.0) * mix(0.16, 0.25, vRim);
    float alpha = (core + halo) * (1.0 - smoothstep(0.72, 1.0, distanceToCenter));
    gl_FragColor = vec4(vColor, alpha * vOpacity);
    // RenderPass 写入线性空间；最终合成时只做一次 sRGB 转换。
    if (!uPostProcessing) {
      #include <colorspace_fragment>
    }
  }
`;
const PALETTES = {
  rose: ['#ff893d', '#ee378e', '#9355c4'],
  lavender: ['#dc81d4', '#9e65ed', '#5780dc'],
  peach: ['#ffa347', '#ef7d60', '#c462a8'],
};
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20]];

async function boot() {
  const $ = (id) => document.getElementById(id);
  const app = $('app'), stage = $('stage'), video = $('cameraVideo');
  const preview = $('cameraPreview');
  const processingCanvas = document.createElement('canvas');
  const processingContext = processingCanvas.getContext('2d');
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = 64; lightCanvas.height = 36;
  const lightContext = lightCanvas.getContext('2d', { willReadFrequently: true });
  const canvas = $('flowerCanvas'), overlay = $('landmarkCanvas');
  const ctx = overlay.getContext('2d');
  const slider = $('tensionSlider'), countSelect = $('particleCount');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    mode: 'demo', cameraPhase: 'idle', cameraSession: 0, stream: null,
    cameraWanted: false, cameraStartedAt: 0, modelResults: 0, lastModelResult: 0,
    lastVideoTime: -1, lastVideoFrameAt: 0, lastLightSample: 0,
    brightness: null, brightFraction: 0, inferenceMs: 0,
    cameraDevices: [], selectedDeviceId: '', explicitCameraSelection: false,
    hands: null, handsPromise: null, landmarks: null, ratio: null,
    closedRatio: CONFIG.fistRatio, openRatio: CONFIG.palmRatio,
    tension: 0.78, targetTension: 0.78, smoothedHandTension: 0.78,
    manualDemo: false, lastHandTime: 0, lastResultTime: 0,
    inferenceFrame: 0, lastInferenceTime: 0, sendPromise: null, sendingSession: 0, width: 1, height: 1,
    count: CONFIG.desktopParticles,
    spread: CONFIG.defaultSpread, handOrientation: { roll: 0, pitch: 0, yaw: 0 },
    zoom: 1, dragId: null, dragX: 0, dragY: 0,
    pointer: { x: 0, y: 0 }, handPoint: { x: 0.5, y: 0.5 },
    elapsed: 0, demoStarted: 0, lastBloom: 1, graphicsAvailable: true, landmarksVisible: false,
  };
  function showNotice(message) { $('noticeText').textContent = message; $('notice').hidden = false; }
  function setStatus(text, kind = '') {
    if ($('statusText').textContent !== text) $('statusText').textContent = text;
    $('statusDot').className = `status-dot ${kind ? `is-${kind}` : ''}`;
  }
  function setHint(text) { if ($('interactionHint').textContent !== text) $('interactionHint').textContent = text; }
  $('noticeClose').addEventListener('click', () => { $('notice').hidden = true; });

  // 固定版本本地优先；若使用者删除 vendor，可显式联网降级到 CDN。
  let THREE;
  try {
    THREE = await import('./vendor/three.module.min.js').catch(() => import(CONFIG.threeCDN));
  } catch {
    showNotice('图形库加载失败。请保留 vendor 文件夹，使用本地 HTTP 服务打开，或检查 CDN 网络。');
    setStatus('图形库未加载', 'error'); return;
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch {
    showNotice('这个浏览器无法启用 WebGL。请开启硬件加速，或使用新版 Edge、Chrome、Safari。');
    setStatus('WebGL 不可用', 'error'); return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
  camera.position.z = 12;
  const flowerGroup = new THREE.Group();
  flowerGroup.rotation.order = 'ZYX'; // 屏幕内转手作用于整朵花，不沿倾斜的局部轴翻转。
  flowerGroup.rotation.x = CONFIG.viewAngle;
  // 保存自由观察视角；四元数旋转没有欧拉角极点锁定，可以翻到侧面、背面和底部。
  const manualView = flowerGroup.quaternion.clone();
  const targetView = manualView.clone(), dragRotation = new THREE.Quaternion();
  const rotationAxis = new THREE.Vector3(0, 1, 0);
  const viewEuler = new THREE.Euler(0, 0, 0, 'ZYX');
  scene.add(flowerGroup);
  // 只使用粒子软点光晕，去掉全屏 Bloom 的 14 次额外后处理绘制。
  // 粒子数与画布分辨率保持不变；没有自动减粒子/降分辨率。
  const uniforms = {
    uBloom: { value: 1 }, uTime: { value: 0 }, uReleaseTime: { value: -100 }, uPixelRatio: { value: 1 },
    uSpread: { value: CONFIG.defaultSpread },
    uPointScale: { value: CONFIG.particleSize }, uMotion: { value: reducedMotion.matches ? 0 : 1 },
    uWind: { value: new THREE.Vector3() },
    uDensityOpacity: { value: 1 },
    uPassOpacity: { value: 1 },
    uPostProcessing: { value: false },
    uInnerColor: { value: new THREE.Color(PALETTES.rose[0]) },
    uOuterColor: { value: new THREE.Color(PALETTES.rose[1]) },
    uAccentColor: { value: new THREE.Color(PALETTES.rose[2]) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  // 使用 GitHub 的同一完整曲面写深度，单次绘制补充卷瓣与遮挡。
  // 曲面、主粒子、极淡透光粒子及微尘，共 4 次绘制，保留同一套粒子数据。
  const roseMeshData = createGitHubRoseMesh();
  const roseGeometry = new THREE.BufferGeometry();
  roseGeometry.setAttribute('position',new THREE.BufferAttribute(roseMeshData.closed,3));
  roseGeometry.setAttribute('aBloomPosition',new THREE.BufferAttribute(roseMeshData.opened,3));
  roseGeometry.setAttribute('aLayer',new THREE.BufferAttribute(roseMeshData.layers,1));
  roseGeometry.setAttribute('aPetalRadius',new THREE.BufferAttribute(roseMeshData.petalRadius,1));
  roseGeometry.setIndex(new THREE.BufferAttribute(roseMeshData.indices,1));
  const roseSurfaceMaterial = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, depthWrite:true, polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
    vertexShader:`attribute vec3 aBloomPosition;attribute float aLayer;attribute float aPetalRadius;
      uniform float uBloom;uniform float uSpread;uniform float uTime;uniform float uMotion;
      uniform float uReleaseTime;uniform vec3 uWind;
      varying vec3 vViewPosition;varying vec3 vBloomPosition;varying float vPetalRadius;
      ${ROSE_DEFORM_GLSL}
      void main(){vec3 p=deformRose(position,aBloomPosition,aLayer);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        vViewPosition=mv.xyz;vBloomPosition=aBloomPosition;vPetalRadius=aPetalRadius;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform vec3 uInnerColor;uniform vec3 uOuterColor;uniform vec3 uAccentColor;uniform float uBloom;
      varying vec3 vViewPosition;varying vec3 vBloomPosition;varying float vPetalRadius;
      void main(){vec3 n=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
        if(n.z<0.0)n=-n;
        vec3 lightDirection=normalize(vec3(-.65,.85,.75));
        vec3 viewDirection=normalize(-vViewPosition);
        float light=max(0.0,dot(n,lightDirection));
        float rim=pow(1.0-max(0.0,dot(n,normalize(-vViewPosition))),2.0);
        float radial=clamp(length(vBloomPosition.xz)/3.0,0.0,1.0);
        vec3 color=mix(uInnerColor,uOuterColor,radial);
        color=mix(color,uAccentColor,smoothstep(.5,1.0,radial)*.22);
        // 瓣面柔光显示卷曲和遮挡；边缘沿真实参数边界发亮，而非整个轮廓糊成光圈。
        float lip=smoothstep(.94,.998,vPetalRadius);
        float specular=pow(max(0.0,dot(n,normalize(lightDirection+viewDirection))),24.0);
        float cupShadow=mix(.45,1.0,smoothstep(.12,.72,vPetalRadius));
        vec3 face=color*(.025+.25*light+.09*rim)*cupShadow;
        face+=mix(color,vec3(1.0,.65,.77),.34)*lip*(.16+.22*light);
        face+=vec3(1.0,.58,.36)*specular*.06;
        gl_FragColor=vec4(face*mix(.28,1.0,uBloom),1.0);
        #include <colorspace_fragment>
      }`,
  });
  const roseSurface = new THREE.Mesh(roseGeometry,roseSurfaceMaterial);
  roseSurface.renderOrder=-1;flowerGroup.add(roseSurface);
  // 极淡透光补充深度遮挡后的后层细节；共享几何，不重复生成或更新数组。
  const transmissionMaterial=material.clone();
  transmissionMaterial.uniforms={...uniforms,uPassOpacity:{value:0.035}};
  transmissionMaterial.depthTest=false;
  let flower,transmissionFlower;
  function rebuildFlower(count) {
    count = Math.round(clamp(Number(count), CONFIG.minParticles, CONFIG.maxParticles));
    const data = createParticleData(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.closed, 3));
    geometry.setAttribute('aBloomPosition', new THREE.BufferAttribute(data.opened, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1));
    geometry.setAttribute('aShade', new THREE.BufferAttribute(data.shades, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.seeds, 1));
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(data.layers, 1));
    geometry.setAttribute('aLight', new THREE.BufferAttribute(data.lights, 1));
    geometry.setAttribute('aRim', new THREE.BufferAttribute(data.rims, 1));
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(data.drifts, 1));
    uniforms.uDensityOpacity.value = Math.pow(20000 / count, 0.25);
    // 包围球包含开花位置；只按闭合位置算包围球会在屏幕边缘错误剔除。
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CONFIG.flowerRadius * 1.45 + 3.5);
    if (flower) { flowerGroup.remove(flower); flower.geometry.dispose(); }
    if (transmissionFlower) flowerGroup.remove(transmissionFlower);
    flower = new THREE.Points(geometry, material);
    transmissionFlower=new THREE.Points(geometry,transmissionMaterial);
    transmissionFlower.renderOrder=1;
    flowerGroup.add(flower,transmissionFlower); state.count = count;
  }
  rebuildFlower(state.count); countSelect.value = String(state.count);

  // 环境微尘：独立的一次 draw call，低亮度、不参与主要绽放粒子数。
  const dustRandom = randomGenerator(143);
  const dustPositions = new Float32Array(CONFIG.dustParticles * 3);
  for (let i = 0; i < CONFIG.dustParticles; i++) {
    const a = dustRandom() * Math.PI * 2, r = 1.6 + dustRandom() * 3.0;
    dustPositions.set([Math.cos(a) * r, Math.sin(a) * r, (dustRandom() - 0.5) * 3.0], i * 3);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: '#b77c9f', size: 0.018, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  flowerGroup.add(dust);
  const targetPosition = new THREE.Vector3();
  let visibleHeight = 1, visibleWidth = 1;
  function resize() {
    const rect = stage.getBoundingClientRect();
    state.width = rect.width; state.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
    renderer.setPixelRatio(dpr); renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    visibleWidth = visibleHeight * camera.aspect;
    uniforms.uPixelRatio.value = dpr;
    // 小屏上同样数量的粒子更密集，缩小点精灵，避免白色过曝。
    uniforms.uPointScale.value = CONFIG.particleSize * Math.min(1, rect.width / 1280);
    overlay.width = Math.round(rect.width * dpr); overlay.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 小屏花朵控制在宽度的 88% 内，不裁切左右两侧花瓣。
    // 扩大主体，同时按视口高度和展开范围限制大小，桌面与窄窗口都能看到外瓣。
    flowerGroup.scale.setScalar(state.zoom * Math.min(1.36, visibleWidth * .41 / (CONFIG.flowerRadius * state.spread),
      visibleHeight * .44 / (CONFIG.flowerRadius * state.spread)));
    drawLandmarks();
  }
  new ResizeObserver(resize).observe(stage); resize();
  flowerGroup.position.set(0, 0.10, 0);

  /** 和 object-fit:cover、自拍镜像完全一致的坐标映射，避免连线/花朵偏移。 */
  function videoPoint(landmark) {
    const w = video.videoWidth || 1280, h = video.videoHeight || 720;
    const scale = Math.max(state.width / w, state.height / h);
    const offsetX = (w * scale - state.width) / 2;
    const offsetY = (h * scale - state.height) / 2;
    return { x: state.width - (landmark.x * w * scale - offsetX), y: landmark.y * h * scale - offsetY };
  }
  function drawLandmarks() {
    const shouldDraw = $('showLandmarks').checked && state.landmarks && state.mode === 'camera';
    // 没有连线时不反复清空全屏 2D canvas；移除连线时只清空一次。
    if (!shouldDraw && !state.landmarksVisible) return;
    ctx.clearRect(0, 0, state.width, state.height);
    state.landmarksVisible = Boolean(shouldDraw);
    if (!shouldDraw) return;
    const points = state.landmarks.map(videoPoint);
    ctx.strokeStyle = 'rgba(236, 181, 222, .62)'; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) { ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); }
    ctx.stroke();
    for (let i = 0; i < points.length; i++) {
      ctx.beginPath(); ctx.arc(points[i].x, points[i].y, i === 8 ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i === 8 ? '#ffe2b5' : '#f1c1e6'; ctx.fill();
    }
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let completed = false;
      const finish = (error) => {
        if (completed) return; completed = true; clearTimeout(timer);
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('识别库加载超时')), 20000);
      script.src = url; script.async = true;
      script.onload = () => finish(); script.onerror = () => finish(new Error('识别库无法加载'));
      document.head.append(script);
    });
  }
  async function ensureHands() {
    if (state.handsPromise) return state.handsPromise;
    state.handsPromise = (async () => {
      let base = new URL('./vendor/mediapipe/', import.meta.url).href;
      if (!window.Hands) {
        try { await loadScript(`${base}hands.js`); }
        catch { base = CONFIG.handsCDN; await loadScript(`${base}hands.js`); }
      }
      const hands = new window.Hands({ locateFile: (file) => `${base}${file}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1,
        minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });
      hands.onResults(onHandResults);
      state.hands = hands;
      await hands.initialize();
      return hands;
    })().catch(async (error) => {
      const broken = state.hands; state.hands = null; state.handsPromise = null;
      if (broken) { try { await broken.close(); } catch { /* 初始化失败时资源可能尚未就绪。 */ } }
      throw error;
    });
    return state.handsPromise;
  }

  function onHandResults(results) {
    // 已关闭摄像头的旧异步结果不能覆盖演示模式。
    if (state.mode !== 'camera' || state.cameraPhase !== 'running' || state.sendingSession !== state.cameraSession) return;
    const landmarks = results.multiHandLandmarks?.[0];
    const now = performance.now() / 1000;
    state.modelResults++; state.lastModelResult = performance.now();
    // 短暂遮挡先保留最后一帧，超过 trackingLostSeconds 才由动画循环收拢。
    if (!landmarks) return;
    const world = results.multiHandWorldLandmarks?.[0];
    const ratio = measureHandRatio(world || landmarks, world ? 1 : (video.videoWidth || 1280) / (video.videoHeight || 720));
    if (ratio === null) return;
    const raw = ratioToTension(ratio, state.closedRatio, state.openRatio);
    const dt = state.lastResultTime ? clamp(now - state.lastResultTime, 0, 0.2) : 1 / CONFIG.trackingFps;
    state.smoothedHandTension = damp(state.smoothedHandTension, raw, dt, CONFIG.tensionSmoothingSeconds);
    state.targetTension = state.smoothedHandTension;
    state.lastResultTime = now; state.lastHandTime = now; state.ratio = ratio;
    state.landmarks = landmarks; state.handPoint = videoPoint(landmarks[8]);
    const orientation = measureHandOrientation(landmarks, world, (video.videoWidth || 1280) / (video.videoHeight || 720));
    if (orientation) state.handOrientation = orientation;
    const label = results.multiHandedness?.[0]?.label;
    setStatus(`已识别${label === 'Left' ? '左' : label === 'Right' ? '右' : ''}手`);
    setHint($('followRotation').checked ? '握拳收拢，张手绽放；转动手掌，花朵跟随旋转。'
      : '握拳收拢，张手绽放；拖拽旋转，滚轮缩放。'); drawLandmarks();
  }
  function updateCameraFeedback(now, tracking) {
    if (state.cameraPhase !== 'running') return;
    // currentTime 用来区分视频冻结和静止的手；不能用画面像素变化判定冻结。
    if (video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = video.currentTime; state.lastVideoFrameAt = now;
    }
    if (video.readyState >= 2 && now - state.lastLightSample > 1000) {
      state.lastLightSample = now;
      lightContext.drawImage(video, 0, 0, 64, 36);
      const pixels = lightContext.getImageData(0, 0, 64, 36).data;
      let total = 0, bright = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        total += value; if (value > 40) bright++;
      }
      state.brightness = total / (64 * 36); state.brightFraction = bright / (64 * 36);
    }
    let feedback;
    if (now - state.lastVideoFrameAt > 2500) {
      feedback = '摄像头画面停止更新，关闭后重新开启试试。';
      setStatus('摄像头画面未更新', 'error');
    } else if (tracking) {
      feedback = '已识别 21 个关键点 · 握拳收拢，张手绽放';
    } else if (now - state.cameraStartedAt > 2500 && state.brightness < 25 && state.brightFraction < .01) {
      feedback = '收到的画面过暗：检查镜头遮挡或遮挡滑盖，并增加正面光线。';
      setStatus('画面过暗，未检测到手', 'waiting');
    } else if (!state.modelResults || now - state.lastModelResult > 3000) {
      feedback = '手部识别尚未返回结果…'; setStatus('等待识别结果', 'waiting');
    } else {
      feedback = '画面正常更新，未检测到手。让整只手出现在小窗内，掌心朝向镜头。';
      setStatus('等待手部入镜', 'waiting');
    }
    if ($('cameraFeedback').textContent !== feedback) $('cameraFeedback').textContent = feedback;
    $('trackingMetrics').textContent = `识别返回 ${state.modelResults} 帧 · ${Math.round(state.inferenceMs)} ms/帧 · 关键点 ${tracking ? 21 : 0}`;
  }
  function cameraErrorMessage(error) {
    const messages = {
      NotAllowedError: '摄像头权限未开启。请在地址栏允许此页面使用摄像头，然后重试。你也可以继续体验演示。',
      NotFoundError: '没有找到摄像头。连接摄像头后重试，或直接体验演示。',
      NotReadableError: '摄像头被其他应用占用或无法读取。关闭占用摄像头的应用后重试。',
      OverconstrainedError: '所选摄像头已经断开或不支持当前参数。请在右下角重新选择摄像头。',
      SecurityError: '浏览器禁止摄像头访问。请在 localhost 或 HTTPS 页面中打开。',
    };
    return messages[error.name] || `手部识别启动失败：${error.message || '请检查识别模型是否完整、网络及浏览器支持'}`;
  }
  const cameraSelect = $('cameraDevice');
  const cameraSource = $('cameraSource');
  let cameraEnumeration = 0;
  function showCameraSource(track = null) {
    // 名称来源必须是实际视频轨道，不从下拉选项推断连接成功。
    if (!track) {
      cameraSource.textContent = state.selectedDeviceId ? '尚未开启摄像头' : '请选择电脑摄像头';
      cameraSource.dataset.deviceKind = '';
      return;
    }
    const settings = track.getSettings();
    const size = settings.width && settings.height ? ` · ${settings.width}×${settings.height}` : '';
    cameraSource.textContent = `当前：${track.label || '设备未提供名称'}${size}`;
    cameraSource.dataset.deviceKind = cameraDeviceKind(track.label);
  }
  async function refreshCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const request = ++cameraEnumeration;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    if (request !== cameraEnumeration) return state.cameraDevices;
    state.cameraDevices = devices;
    const stillPresent = devices.some((device) => device.deviceId === state.selectedDeviceId);
    if (!stillPresent || !state.explicitCameraSelection) {
      state.selectedDeviceId = selectDesktopCamera(devices)?.deviceId || '';
      state.explicitCameraSelection = false;
    }
    const placeholder = new Option(devices.some((device) => device.label)
      ? '选择电脑摄像头' : '授权前名称不可见，请主动选择', '');
    cameraSelect.replaceChildren(placeholder);
    devices.forEach((device, index) => {
      const kind = cameraDeviceKind(device.label);
      const suffix = kind === 'phone' ? '（手机来源）' : kind === 'virtual' ? '（虚拟来源）' : '';
      const option = new Option(`${device.label || `摄像头 ${index + 1}（名称未授权）`}${suffix}`, device.deviceId);
      option.disabled = !device.deviceId;
      cameraSelect.add(option);
    });
    cameraSelect.value = state.selectedDeviceId;
    if (!state.stream) showCameraSource();
    return devices;
  }
  function stopTracks(stream) { stream?.getTracks().forEach((track) => track.stop()); }
  function stopCamera({ preserveIntent = false } = {}) {
    if (!preserveIntent) state.cameraWanted = false;
    state.cameraSession++; state.cameraPhase = 'idle'; state.mode = 'demo';
    cancelAnimationFrame(state.inferenceFrame); state.inferenceFrame = 0;
    stopTracks(state.stream); state.stream = null; video.srcObject = null; preview.srcObject = null;
    $('cameraMonitor').hidden = true;
    state.landmarks = null; state.ratio = null; state.lastResultTime = 0; state.lastHandTime = 0;
    state.manualDemo = false; state.demoStarted = state.elapsed; slider.disabled = false;
    app.classList.remove('is-camera-mode', 'has-camera-background');
    $('cameraButtonText').textContent = '开启摄像头';
    showCameraSource();
    setStatus('演示模式'); setHint('拖拽旋转 · 滚轮缩放 · 双击回正'); drawLandmarks();
  }
  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showNotice('摄像头需要安全环境。本机预览请用 http://localhost:5500，分享给其他电脑时请使用 HTTPS 网站。'); return;
    }
    state.cameraWanted = true;
    const session = ++state.cameraSession;
    state.cameraPhase = 'starting';
    $('cameraButtonText').textContent = '取消开启'; setStatus('等待摄像头授权', 'waiting');
    $('notice').hidden = true;
    try {
      await refreshCameraDevices();
      if (session !== state.cameraSession) return;
      const chosen = state.cameraDevices.find((device) => device.deviceId === state.selectedDeviceId);
      if (!chosen) {
        stopCamera();
        showNotice(state.cameraDevices.some((device) => device.label)
          ? '没有自动选中电脑摄像头。请连接内置或 USB 摄像头，并在右下角选择；手机和虚拟摄像头不会自动开启。'
          : state.cameraDevices.some((device) => device.deviceId)
            ? '授权前浏览器隐藏了设备名称。请在右下角主动选择电脑摄像头，再点击开启并允许访问。打开后会核对真实来源。'
            : '浏览器尚未提供可选择的摄像头。请打开地址栏的站点设置，允许摄像头访问，再点击右下角“刷新”，选择电脑摄像头后开启。页面不会自动打开默认的手机来源。');
        return;
      }
      const requestedDeviceId = chosen.deviceId;
      const knowinglyChosenOtherSource = state.explicitCameraSelection
        && ['phone', 'virtual'].includes(cameraDeviceKind(chosen.label));
      // 页面不在加载时索取权限；只有用户主动按按钮才进入这里。
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        deviceId: { exact: requestedDeviceId },
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 },
      } });
      if (session !== state.cameraSession) { stopTracks(stream); return; }
      const actualTrack = stream.getVideoTracks()[0];
      const actualDeviceId = actualTrack?.getSettings().deviceId;
      const actualKind = cameraDeviceKind(actualTrack?.label);
      if (!actualTrack || (actualDeviceId && actualDeviceId !== requestedDeviceId)
        || (['phone', 'virtual'].includes(actualKind) && !knowinglyChosenOtherSource)) {
        const actualName = actualTrack?.label || '未识别的设备';
        stopTracks(stream); stopCamera();
        state.selectedDeviceId = ''; state.explicitCameraSelection = false;
        await refreshCameraDevices();
        showNotice(`所选来源实际为“${actualName}”，已停止。请在右下角选择电脑摄像头，再开启。`);
        return;
      }
      state.stream = stream;
      // 授权后名称会补全；保留返回轨道对应的选择，展示真实来源。
      state.selectedDeviceId = actualDeviceId || requestedDeviceId;
      state.explicitCameraSelection = true;
      await refreshCameraDevices();
      if (session !== state.cameraSession) return;
      showCameraSource(actualTrack);
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        if (state.stream === stream) { stopCamera(); showNotice('摄像头连接已断开，已切换回演示模式。'); }
      }));
      video.srcObject = stream; preview.srcObject = stream;
      $('cameraMonitor').hidden = false;
      $('cameraPreviewName').textContent = actualTrack.label;
      $('cameraFeedback').textContent = '正在加载手部识别…';
      $('trackingMetrics').textContent = '等待手部识别';
      await Promise.all([video.play(), preview.play()]);
      if (session !== state.cameraSession) return;
      setStatus('正在加载手部识别', 'waiting');
      await ensureHands();
      if (session !== state.cameraSession) return;
      state.mode = 'camera'; state.cameraPhase = 'running'; state.lastInferenceTime = 0;
      state.cameraStartedAt = performance.now(); state.lastVideoFrameAt = state.cameraStartedAt;
      state.lastVideoTime = -1; state.lastLightSample = 0; state.modelResults = 0;
      state.lastInferenceVideoTime = -1;
      state.lastModelResult = 0; state.brightness = null; state.inferenceMs = 0;
      state.lastHandTime = performance.now() / 1000;
      state.landmarks = null; slider.disabled = true;
      app.classList.add('is-camera-mode');
      app.classList.toggle('has-camera-background', $('showBackground').checked);
      $('cameraButtonText').textContent = '关闭摄像头';
      setStatus('请把整只手举到镜头前', 'waiting'); setHint('让手掌朝向镜头，握拳或张手试试。');
      // 循环使用异步 send 并等待完成，识别帧永不重叠；绘图循环独立运行。
      async function infer(time) {
        if (session !== state.cameraSession || state.cameraPhase !== 'running') return;
        try {
          if (time - state.lastInferenceTime >= 1000 / CONFIG.trackingFps && video.readyState >= 2 && video.currentTime !== state.lastInferenceVideoTime) {
            // 快速关闭再开启时，上一会话的 send 也必须结束才可发送下一帧。
            if (state.sendPromise) await state.sendPromise;
            if (session !== state.cameraSession) return;
            state.lastInferenceTime = time;
            state.lastInferenceVideoTime = video.currentTime;
            state.sendingSession = session;
            // 模型不需要完整 720p 纹理；等比例缩放，不裁切、不镜像，归一化坐标保持一致。
            const width = Math.min(CONFIG.trackingInputWidth, video.videoWidth);
            const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
            if (processingCanvas.width !== width || processingCanvas.height !== height) {
              processingCanvas.width = width; processingCanvas.height = height;
            }
            processingContext.drawImage(video, 0, 0, width, height);
            const started = performance.now();
            state.sendPromise = state.hands.send({ image: processingCanvas });
            try { await state.sendPromise; } finally {
              state.sendPromise = null;
              if (session === state.cameraSession) state.inferenceMs = performance.now() - started;
            }
          }
        } catch (error) {
          if (session === state.cameraSession) { stopCamera(); showNotice(cameraErrorMessage(error)); }
          return;
        }
        if (session === state.cameraSession) state.inferenceFrame = requestAnimationFrame(infer);
      }
      state.inferenceFrame = requestAnimationFrame(infer);
    } catch (error) {
      if (session === state.cameraSession) { stopCamera(); showNotice(cameraErrorMessage(error)); }
    }
  }

  $('cameraButton').addEventListener('click', () => {
    if (state.cameraPhase === 'idle') startCamera(); else stopCamera();
  });
  cameraSelect.addEventListener('change', () => {
    const restart = state.cameraPhase !== 'idle';
    if (restart) stopCamera();
    state.selectedDeviceId = cameraSelect.value;
    state.explicitCameraSelection = Boolean(cameraSelect.value);
    showCameraSource();
    if (restart && state.selectedDeviceId) startCamera();
  });
  $('refreshCameras').addEventListener('click', () => refreshCameraDevices().catch((error) => showNotice(cameraErrorMessage(error))));
  navigator.mediaDevices?.addEventListener('devicechange', async () => {
    try {
      const activeId = state.stream?.getVideoTracks()[0]?.getSettings().deviceId;
      const devices = await refreshCameraDevices();
      if (activeId && !devices.some((device) => device.deviceId === activeId)) {
        stopCamera(); showNotice('当前摄像头已断开。请重新选择电脑摄像头。');
      }
    } catch (error) { showNotice(cameraErrorMessage(error)); }
  });
  // 只读取设备列表，不在初始化时申请摄像头权限。
  refreshCameraDevices().catch(() => { cameraSource.textContent = '设备列表暂不可用，点击刷新重试'; });
  $('demoButton').addEventListener('click', () => {
    stopCamera(); state.manualDemo = false; state.targetTension = 0.78;
    $('notice').hidden = true;
    setHint('拖动下方滑杆，体验从花苞到绽放的变化。');
  });
  slider.addEventListener('input', () => {
    state.manualDemo = true; state.targetTension = Number(slider.value);
    setHint('拖拽旋转 · 滚轮缩放 · 双击回正');
  });
  countSelect.addEventListener('change', () => rebuildFlower(countSelect.value));
  $('spreadSlider').value = String(state.spread);
  $('spreadSlider').addEventListener('input', (event) => {
    state.spread = clamp(Number(event.target.value), 1, 1.45);
    uniforms.uSpread.value = state.spread;
    $('spreadValue').textContent = `${state.spread.toFixed(2)}×`;
    event.target.style.setProperty('--fill', `${(state.spread - 1) / .45 * 100}%`);
    resize();
  });
  document.querySelectorAll('[data-palette]').forEach((button) => button.addEventListener('click', () => {
    const palette = PALETTES[button.dataset.palette];
    uniforms.uInnerColor.value.set(palette[0]); uniforms.uOuterColor.value.set(palette[1]); uniforms.uAccentColor.value.set(palette[2]);
    document.querySelectorAll('[data-palette]').forEach((swatch) => {
      const selected = swatch === button; swatch.classList.toggle('is-selected', selected); swatch.setAttribute('aria-pressed', String(selected));
    });
  }));
  $('showLandmarks').addEventListener('change', drawLandmarks);
  $('showBackground').addEventListener('change', () => app.classList.toggle('has-camera-background', state.mode === 'camera' && $('showBackground').checked));
  const updatePointer = (event) => {
    const rect = stage.getBoundingClientRect();
    state.pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    state.pointer.y = 1 - (event.clientY - rect.top) / rect.height * 2;
  };
  function activateFreeView() {
    if ($('followRotation').checked) { manualView.copy(flowerGroup.quaternion); $('followRotation').checked = false; }
    if (state.mode === 'demo' && !state.manualDemo) { state.manualDemo = true; state.targetTension = 1; }
    $('viewPreset').value = 'custom';
  }
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || state.dragId !== null) return;
    activateFreeView(); $('autoRotate').checked = false;
    state.dragId = event.pointerId; state.dragX = event.clientX; state.dragY = event.clientY;
    stage.setPointerCapture(event.pointerId); stage.classList.add('is-dragging'); event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    updatePointer(event);
    if (state.dragId !== event.pointerId) return;
    const dx = event.clientX - state.dragX, dy = event.clientY - state.dragY;
    state.dragX = event.clientX; state.dragY = event.clientY;
    // 左右拖拽绕屏幕 Y 轴，上下拖拽绕屏幕 X 轴；不限角度，真正查看完整曲面。
    dragRotation.setFromEuler(viewEuler.set(dy * .007, dx * .007, 0, 'YXZ'));
    manualView.premultiply(dragRotation).normalize();
    setHint('拖拽旋转 · 滚轮缩放 · 双击回正');
  });
  function endDrag(event) {
    if (state.dragId !== event.pointerId) return;
    state.dragId = null; stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('lostpointercapture', endDrag);
  stage.addEventListener('wheel', (event) => {
    event.preventDefault(); activateFreeView();
    state.zoom = clamp(state.zoom * Math.exp(-event.deltaY * .001), .55, 1.6); resize();
  }, { passive: false });
  function resetView() {
    $('autoRotate').checked = false; $('followRotation').checked = false;
    manualView.setFromEuler(viewEuler.set(CONFIG.viewAngle, 0, 0, 'ZYX'));
    state.zoom = 1; $('viewPreset').value = 'front'; resize();
    setHint('拖拽旋转 · 滚轮缩放 · 双击回正');
  }
  $('resetView').addEventListener('click', resetView);
  stage.addEventListener('dblclick', resetView);
  $('viewPreset').addEventListener('change', (event) => {
    const preset = event.target.value; activateFreeView(); $('autoRotate').checked = false;
    const angles = { front: [CONFIG.viewAngle, 0, 0], side: [.12, Math.PI / 2, 0],
      back: [CONFIG.viewAngle, Math.PI, 0], bottom: [-Math.PI / 2, 0, 0] };
    if (angles[preset]) manualView.setFromEuler(viewEuler.set(...angles[preset], 'ZYX'));
    state.zoom = .90; resize(); $('viewPreset').value = preset;
  });
  $('autoRotate').addEventListener('change', (event) => { if (event.target.checked) activateFreeView(); });
  $('followRotation').addEventListener('change', (event) => {
    if (event.target.checked) $('autoRotate').checked = false;
    else manualView.copy(flowerGroup.quaternion);
  });
  stage.addEventListener('pointerleave', () => { state.pointer.x = 0; state.pointer.y = 0; });
  const dialog = $('aboutDialog');
  $('aboutButton').addEventListener('click', () => dialog.showModal());
  $('closeAbout').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  function calibrate(kind) {
    if (state.mode !== 'camera' || state.ratio === null) { $('calibrationMessage').textContent = '先开启摄像头，并让整只手进入画面。'; return; }
    const closed = kind === 'closed' ? state.ratio : state.closedRatio;
    const opened = kind === 'open' ? state.ratio : state.openRatio;
    if (opened - closed < 0.2) { $('calibrationMessage').textContent = '握拳和张手的差异太小，请保持掌心朝向镜头后重新记录。'; return; }
    state.closedRatio = closed; state.openRatio = opened;
    $('calibrationMessage').textContent = `已记录${kind === 'closed' ? '握拳' : '张手'}，距离比范围 ${closed.toFixed(2)} ～ ${opened.toFixed(2)}。`;
  }
  $('calibrateClosed').addEventListener('click', () => calibrate('closed'));
  $('calibrateOpen').addEventListener('click', () => calibrate('open'));
  $('resetCalibration').addEventListener('click', () => {
    state.closedRatio = CONFIG.fistRatio; state.openRatio = CONFIG.palmRatio;
    $('calibrationMessage').textContent = '已恢复默认校准，校准仅对当前页面生效。';
  });
  $('fullscreenButton').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (app.requestFullscreen) await app.requestFullscreen();
      else showNotice('当前浏览器不支持网页全屏，可以通过浏览器菜单隐藏工具栏。');
    } catch { showNotice('全屏暂时不可用，请再次点击，或使用浏览器的全屏功能。'); }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    $('fullscreenButton').setAttribute('aria-label', full ? '退出全屏' : '进入全屏');
    $('fullscreenButton').querySelector('span').textContent = full ? '退出全屏' : '全屏';
  });
  // 隐藏时释放摄像头，但保留这次用户主动开启的意图，切回自动恢复同一设备。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.cameraPhase !== 'idle') {
      stopCamera({ preserveIntent: true }); setStatus('摄像头暂停，返回窗口后恢复', 'waiting');
    } else if (!document.hidden && state.cameraWanted && state.cameraPhase === 'idle') startCamera();
  });
  window.addEventListener('pagehide', stopCamera);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); state.graphicsAvailable = false; stopCamera();
    setStatus('图形连接中断', 'error'); showNotice('图形连接暂时中断。恢复后可继续体验；若未恢复，请刷新页面。');
  });
  canvas.addEventListener('webglcontextrestored', () => { state.graphicsAvailable = true; $('notice').hidden = true; setStatus('演示模式'); });
  reducedMotion.addEventListener('change', () => { uniforms.uMotion.value = reducedMotion.matches ? 0 : 1; });

  let lastFrame = performance.now(), lastUi = 0, fpsFrames = 0, fpsStart = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastFrame) / 1000, 0.05); lastFrame = now;
    if (document.hidden || !state.graphicsAvailable) return;
    state.elapsed += dt;
    fpsFrames++;
    if (now - fpsStart >= 1000) {
      $('fpsValue').textContent = String(Math.round(fpsFrames * 1000 / (now - fpsStart)));
      fpsFrames = 0; fpsStart = now;
    }
    if (state.mode === 'demo' && !state.manualDemo) {
      // 首次显示完整花朵；随后演示收拢/逐层舒展，变形来自粒子而非摇摆模型。
      const age = state.elapsed - state.demoStarted;
      state.targetTension = reducedMotion.matches || age < 3 ? 0.78 : 0.47 + 0.42 * Math.cos((age - 3) * 0.50);
    }
    const tracking = state.mode === 'camera' && performance.now() / 1000 - state.lastHandTime <= CONFIG.trackingLostSeconds && state.landmarks;
    if (state.mode === 'camera' && !tracking) {
      state.targetTension = 0.1; state.landmarks = null; state.ratio = null;
      setHint('让整只手进入摄像头小窗，握拳或张手。'); drawLandmarks();
    }
    state.tension = damp(state.tension, state.targetTension, dt, 0.10);
    const bloom = tensionToBloom(state.tension);
    if (bloom > 0.9 && state.lastBloom <= 0.9) uniforms.uReleaseTime.value = state.elapsed;
    state.lastBloom = bloom;
    uniforms.uBloom.value = bloom; uniforms.uTime.value = state.elapsed;
    if (tracking) {
      targetPosition.set((state.handPoint.x / state.width - 0.5) * visibleWidth,
        (0.5 - state.handPoint.y / state.height) * visibleHeight + 0.25, 0);
      // 大花接近边缘时限制中心位置；花苞仍能自由跟随指尖，散点允许漂出画面。
      const radius = (.6 + (CONFIG.flowerRadius * state.spread - .6) * bloom) * flowerGroup.scale.x;
      const limitX = Math.max(0, visibleWidth * .5 - radius);
      const limitY = Math.max(0, visibleHeight * .5 - radius);
      targetPosition.x = clamp(targetPosition.x, -limitX, limitX);
      targetPosition.y = clamp(targetPosition.y, -limitY, limitY);
    } else {
      targetPosition.set(state.pointer.x * 0.34, 0.10 + state.pointer.y * 0.18, 0);
    }
    flowerGroup.position.lerp(targetPosition, 1 - Math.exp(-dt / CONFIG.positionSmoothingSeconds));
    // 自由观察保存任意四元数朝向；仅勾选手掌旋转时使用受限的手部朝向。
    const followHand = tracking && $('followRotation').checked;
    if (followHand) {
      const orientation = state.handOrientation;
      targetView.setFromEuler(viewEuler.set(CONFIG.viewAngle + orientation.pitch, orientation.yaw, orientation.roll, 'ZYX'));
    } else {
      if ($('autoRotate').checked) {
        dragRotation.setFromAxisAngle(rotationAxis, dt * .24);
        manualView.premultiply(dragRotation).normalize();
      }
      targetView.copy(manualView);
    }
    flowerGroup.quaternion.slerp(targetView, 1 - Math.exp(-dt / CONFIG.rotationSmoothingSeconds));
    uniforms.uWind.value.set(state.pointer.x, state.pointer.y, 0);
    dust.rotation.z = 0;
    dust.material.opacity = 0.05 + bloom * 0.17;
    renderer.render(scene, camera);
    // HUD 只以 10Hz 更新，避免每个渲染帧触发布局/无障碍播报。
    if (now - lastUi > 100) {
      lastUi = now; $('tensionValue').textContent = state.tension.toFixed(2);
      updateCameraFeedback(now, tracking);
      slider.style.setProperty('--fill', `${state.tension * 100}%`);
      if (state.mode === 'camera' || !state.manualDemo) slider.value = state.tension.toFixed(2);
      $('bloomState').textContent = state.tension < CONFIG.closedThreshold ? '花苞' : state.tension > CONFIG.openThreshold ? '绽放' : '舒展';
    }
  }
  requestAnimationFrame(animate);
}

// 此判断允许 Node 直接导入数学函数做验证，不会尝试使用 DOM 或 WebGL。
if (typeof document !== 'undefined') {
  boot().catch((error) => {
    console.error('Gesture Bloom initialization failed:', error);
    const notice = document.getElementById('notice');
    document.getElementById('noticeText').textContent = '网页初始化失败，请通过 HTTP 服务打开，并确认依赖文件完整。';
    notice.hidden = false;
  });
}
