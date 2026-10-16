# 指尖花开 · GitHub 曲面电脑版 v11

一个完整的纯静态网页：摄像头识别手部，握拳收拢为花苞，张手绽放为粒子花，食指指尖带动花朵。也可以不开摄像头，用滑杆、鼠标或触屏体验。

v11 增加完整三维观察：按住画面拖拽可以持续旋转到侧面、背面和底部，不限制在手掌倾斜幅度内。滚轮缩放，倍率范围 0.55～1.60；双击画面或点击“重置视角”恢复初始角度与倍率。左下提供正面/侧面/背面/底部快捷视角及“自动环绕”。使用四元数保持任意朝向并平滑过渡，模型的双面花瓣已有真实深度遮挡。手掌旋转默认关闭，主动勾选后开启；拖拽会关闭手掌旋转以避免争抢视角，手势开合继续工作。演示模式下首次拖拽/缩放/选择视角会保持花朵展开，便于观察。

v7 增加明确的摄像头设备选择。默认优先使用内置、USB 或 HD 摄像头，不自动使用手机与 OBS 等虚拟来源；请求时使用所选设备的精确 ID，右下角从真实视频轨道显示设备名称与分辨率。设备名称未获浏览器授权时不猜测默认设备，显示选择/授权步骤。

v8 增加不压暗的原始摄像头小窗，共用背景的同一条视频流，不额外申请设备。显示真实来源、识别返回帧数、推理耗时和关键点数量；区分画面过暗、视频停止更新和未检测到手。识别输入等比例缩放至最大宽度 640，预览与背景仍保留原始 1280×720。页面隐藏时释放摄像头，返回后恢复用户此前主动开启的同一设备；手动关闭后不会自动恢复。

v9 默认跟随手掌旋转：手腕到中指根决定屏幕内转动，掌面法线决定轻微俯仰和侧倾。旋转有 0.22 秒指数平滑，屏幕内限幅 72°、俯仰/侧倾限幅约 17°；丢失手部或关闭“跟随手掌旋转”后平滑回到默认正面。张开后的外瓣更宽，花心加密采样从三分之一降至五分之一，把更多粒子分给外层；散出粒子从约 7.7% 增至 10%，漂浮范围更宽。左下“展开范围”可调 1.00～1.45，默认 1.22；网格和粒子共用同一展开形变，保持花瓣遮挡一致。主体根据窗口宽、高调整大小；花朵展开后跟随指尖接近屏幕边缘时限制中心位置，减少主体裁切，散点仍可漂出画面。

v10 加强花型辨识：真实曲面上加入瓣面柔光、内壁阴影、卷瓣边缘高光，透光粒子强度从 0.13 降到 0.035，减少背面粒子穿透造成的形状混淆。默认角度让花杯与内层螺旋可见；瓣缘采样提高至四分之一、花心加密采样调整至四分之一，漂浮粒子降至约 6.25%，仍保留较宽漂浮范围和外瓣展开控制。粒子总数与渲染分辨率保留，主要场景仍为四次绘制。默认构图略向上移，并预留上下空间。

第六版以电脑浏览器为目标，实际移植 GitHub 项目 Mathematics_And_Nature 的完整三维玫瑰曲面，并改编 particle-rose 的面积采样算法。花瓣具有卷曲和前后遮挡，瓣缘亮核、暖色花心与粉紫渐变由实时着色器绘制。花心朝向屏幕，保留自然的轻度俯视，没有左右侧倾；鼠标只带来几度轻微视差。部分粒子缓慢散出、淡去并重新出现，张手时有一次短促舒展，握拳时收回花苞；整朵花没有自动摇摆。

保留默认 20,000 粒子和最高 DPR 2，不自动减少粒子或分辨率。每帧主要场景有四次绘制：同一玫瑰曲面的深度网格、主粒子、共享几何的极淡透光粒子，以及 240 颗微尘。粒子光晕在点精灵内部生成，当前不加载全屏 Bloom 后处理。识别使用完整 MediaPipe Hands 模型，频率上限 18Hz。左上 FPS 是当前页面的实际渲染频率，随设备、摄像头和浏览器状态变化，不承诺固定数值。

视觉对照依据是用户提供的截图；原始抖音视频尚未直接读取，当前实现不宣称像素级还原。GitHub 来源、具体移植范围和完整许可见 THIRD_PARTY.md。

## 本地运行

在这个文件夹打开终端：

```powershell
python -m http.server 5500
```

打开 **http://localhost:5500**。请不要双击 `index.html` 使用 `file://`，ES Module 和识别模型需要 HTTP 服务。

预览地址 **http://localhost:5500/?v=11**。如果 5500 已被占用，可用 `python -m http.server 5501`，然后打开 http://localhost:5501。localhost 只用于当前电脑；分享给别人的电脑需要部署到 HTTPS 网站，对方使用自己的摄像头。

完整的库、WASM、识别模型已放在 `vendor/`，**正常运行不依赖外网，不需要 npm 安装、后端服务或 API Key**。首次启动摄像头会加载本地识别模型，可能需要几秒。

## 文件结构

```text
gesture-bloom/
├── index.html                 # 页面、无障碍控件、关于与校准窗口
├── style.css                  # 全屏画布、角落控件、窄窗口适配
├── main.js                    # 张开度公式、几何、GLSL、识别、状态管理
├── package.json               # ES Module 标记；可选 npm run check
├── README.md
├── THIRD_PARTY.md             # 固定 GitHub 来源、改编范围和许可文件
└── vendor/
    ├── three.module.min.js    # Three.js 0.169.0
    ├── THREE-LICENSE.txt
    ├── MEDIAPIPE-LICENSE.txt
    ├── WEBGL-FLOWER-LICENSE.txt # GitHub shader 改编部分的完整 MIT 许可
    ├── PARAMETRIC-ROSE-LICENSE.txt # 完整玫瑰曲面，MIT © 2024 Tonumoy Mukherjee
    ├── PARTICLE-ROSE-SAMPLING-LICENSE.txt # 面积采样，MIT © 2026 Xuewei Wu
    ├── PARTICLE-HANDTRACKER-LICENSE.txt # v4 历史改编来源，保留许可
    ├── github-parametric-rose.js # 参数曲面、网格、面积/瓣缘采样及花苞数据
    ├── addons/                # 保留的官方模块；v6 当前不加载后处理
    └── mediapipe/             # MediaPipe Hands 0.4.1675469240
        ├── hands.js
        ├── hands.binarypb
        ├── hand_landmark_full.tflite
        ├── hand_landmark_lite.tflite
        ├── hands_solution_packed_assets.data
        ├── hands_solution_packed_assets_loader.js
        ├── hands_solution_simd_wasm_bin.data
        ├── hands_solution_simd_wasm_bin.js
        ├── hands_solution_simd_wasm_bin.wasm
        ├── hands_solution_wasm_bin.js
        └── hands_solution_wasm_bin.wasm
```

其中 `hands_solution_simd_wasm_bin.data` 在上游发布包中就是 0 字节文件，并非下载失败。

## 使用

1. 页面默认演示模式，自动演示收拢/舒展/绽放。拖动“手掌张开度”转为手动控制。
2. 右下角查看摄像头来源，再点击“开启摄像头”，在浏览器允许访问；不请求麦克风。连接后核对“当前”一栏的真实设备名称。
3. 将整只手放进画面，掌心朝向摄像头。握拳、张手，移动食指；默认可鼠标拖拽完整查看花朵，滚轮缩放。主动勾选“跟随手掌旋转”可使用手掌朝向；拖拽会切回自由观察。左下也可调整“展开范围”、选择视角和自动环绕。
4. 选择蔷薇粉、月光紫、落日橘；粒子数可选 5,000 / 8,000 / 12,000 / 20,000。
5. 摄像头背景默认勾选，摄像头获准开启后显示。可关闭背景或开启关键点连线。
6. 如果握拳和张手识别的范围不适合你的手，在“关于作品”中依次握拳并点击“记录握拳”，张手并点击“记录张手”。校准不上传、不持久化。
7. 关闭摄像头、切换演示、页面进入后台或离开页面时，都会释放摄像头。临时切到后台后，返回页面会恢复此前主动开启的摄像头；手动关闭或离开页面后不会恢复。

如果花朵没有反应，先看左上角原始画面小窗：整只手应出现在小窗里。小窗不会被背景压暗或花朵遮住。相机有画面但模型没有手部结果时，关键点显示 0；真正识别到手时显示 21。

v8 验证：使用 Google MediaPipe 官方 right_hands.jpg 和 thumb_up.jpg 替代摄像头输入，运行项目真实 WASM 模型，均返回 21 个关键点，张手 tension 0.84、四指收拢 tension 0.28，分别触发绽放和花苞。另验证画面过暗/冻结提示、后台释放/返回恢复、手动关闭取消恢复及权限/来源错误处理。照片测试验证软件链路，实际使用仍依赖摄像头收到清晰的手部画面。

摄像头模式中滑杆显示真实张开度，因此不能手动拖动；切回演示即可拖动。丢失手部超过 0.55 秒时，花朵逐渐收拢。

## 张开度公式

使用 MediaPipe 21 个关键点中的四根手指，排除拇指：

| 手指 | 指根 MCP | 指尖 TIP |
| --- | --- | --- |
| 食指 | 5 | 8 |
| 中指 | 9 | 12 |
| 无名指 | 13 | 16 |
| 小指 | 17 | 20 |

手腕为 0。优先使用 MediaPipe 的三维世界坐标，坐标单位为米。没有世界坐标时使用归一化坐标，并对 x/z 做视频宽高比修正。

```text
r_i = distance(wrist, tip_i) / max(distance(wrist, mcp_i), 0.000001)
r = (r_index + r_middle + r_ring + r_pinky) / 4
tension_raw = clamp((r - 1.05) / (1.95 - 1.05), 0, 1)
alpha = 1 - exp(-deltaTime / 0.11)
tension_smoothed += alpha * (tension_raw - tension_smoothed)
```

距离比对手部大小和刚体旋转不敏感；透视遮挡、侧掌以及不同人的手型仍会影响估计，可使用校准改善。该计算是连续几何指标，不是离散的“握拳分类器”。

张开度到花朵绽放程度：

```text
x = clamp((tension - 0.32) / (0.66 - 0.32), 0, 1)
bloom = x * x * (3 - 2*x)
```

因此低于 0.32 完全闭合，高于 0.66 完全绽放，中间平滑过渡。动画循环再做轻微平滑，减少噪声。

## 花朵与性能

花型来自 Tonumoy 的完整参数曲面。`x ∈ [0,1]` 表示从花心到瓣缘的径向位置，`theta ∈ [-2π,15π]` 随螺旋逐渐形成内外层卷瓣。上游方程完整保留，并转换到 Three.js 的坐标系：

```text
phi = (PI/2) * exp(-theta/(8*PI))
modulo = ((3.6*theta) % (2*PI) + 2*PI) % (2*PI)
X = 1 - 0.5 * (1.25 * (1 - modulo/PI)^2 - 0.25)^2
y = 1.95653 * x^2 * (1.27689*x - 1)^2 * sin(phi)
r = X * (x*sin(phi) + y*cos(phi))
position = [
  3.25*r*sin(theta),
  3.25*X*(x*cos(phi) - y*sin(phi)) - 0.55,
  3.25*r*cos(theta)
]
```

采样网格使用 640 个角向区间和 38 个径向区间，共 24,999 个顶点、48,640 个三角形。采用“面积采样＋花心加密＋瓣缘增强”：从整个瓣面按三角形面积抽样，同时为 `theta > 7.5π` 附近的花心区域增加采样密度，避免卷起的内层过稀；约四分之一粒子再按瓣缘长度抽样，加强轮廓。三角形内采用反射重心采样，最终分布经过视觉加密，并非全瓣面严格均匀。固定随机种子让刷新和调整粒子数时的形状稳定。

花苞坐标沿竖直方向收拢，同一粒子与展开位置对应。深度曲面与主粒子使用同一基础形变，曲面提供花瓣前后遮挡和很淡的底色，透光粒子补充后层细节。主粒子与透光粒子共享同一几何数据，选择器的 20,000 表示花朵的独立粒子数；240 颗环境微尘另计。外围流光属于花朵总粒子数，运动由独立属性与时间驱动，握拳时一起收回。

几何生成发生在启动和改变粒子数量时。每帧 CPU 只更新少量 uniform 与整朵花的变换，顶点着色器执行：

```glsl
float layer = aLayer;
float layerBloom = smoothstep(layer * 0.045, 0.80 + layer * 0.05, uBloom);
vec3 p = mix(position, aBloomPosition, layerBloom);
```

使用 `THREE.Points + ShaderMaterial`、加法混合和软点精灵。fragment shader 使用 Gaussian 亮核与柔光，在每个点内部生成光晕，不进行全屏模糊。瓣缘通过独立属性增强亮度，配色保留暖色花心与粉紫过渡。透明画布保留摄像头叠加，局部深度曲面提供真实遮挡。

默认 20,000，DPR 上限 2。摄像头识别最多 18Hz、等待 `hands.send` 完成后再发下一帧，渲染独立运行。关闭关键点时不反复清空全屏 canvas，HUD 仅 10Hz 更新。尊重 `prefers-reduced-motion`，关闭自动绽放和散点运动，但保留手动及手势控制。

## 调参

`main.js` 顶部 `CONFIG` 可修改：

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| desktopParticles | 20000 | 电脑默认粒子数 |
| closedThreshold / openThreshold | 0.32 / 0.66 | 收拢/全开阈值 |
| fistRatio / palmRatio | 1.05 / 1.95 | 张开度归一化参考 |
| tensionSmoothingSeconds | 0.11 | 手势响应平滑时间 |
| positionSmoothingSeconds | 0.14 | 跟随指尖平滑时间 |
| trackingFps | 18 | 识别频率上限 |
| trackingLostSeconds | 0.55 | 丢手收拢延迟 |
| particleSize | 4.6 | 点精灵范围；内部细亮核和外围柔光分别衰减，瓣缘单独增强 |
| viewAngle | PI * 0.34 | 绕 X 轴朝向屏幕，保留约 29° 倾角以显示花杯侧壁 |
| flowerRadius | 3.25 | 花朵数学半径 |
| maxPixelRatio | 2 | 清晰度/性能折中 |

配色在 `PALETTES` 中，每种包含内侧、外侧与强调色。完整曲面、网格分辨率、瓣面/瓣缘采样及花苞对应坐标位于 `vendor/github-parametric-rose.js`；`main.js` 管理 GLSL、渲染、手势和界面。

## CDN 与依赖来源

本地优先加载，若本地 Three.js 或 Hands JS 缺失，代码使用以下固定版本 CDN 备用：

```text
https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js
https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js
```

建议完整保留本地 `vendor/`，避免 CDN 不稳定。MediaPipe 的 JS、WASM、模型必须属于同一版本。当前实现使用经典 MediaPipe Hands API，满足指定技术栈；它属于旧版方案，后续可迁移至 Hand Landmarker。

来源与许可证：

- [Three.js](https://github.com/mrdoob/three.js)，MIT，附本地许可文本。
- [Mathematics_And_Nature](https://github.com/Tonumoy/Mathematics_And_Nature/blob/11f8341349faf2220d6a6e0617c4d383ffcb9629/Equations_of_Rose.ipynb)，MIT © 2024 Tonumoy Mukherjee：移植完整三维玫瑰曲面，固定提交 `11f8341349faf2220d6a6e0617c4d383ffcb9629`，附完整许可。
- [particle-rose 采样脚本](https://github.com/xueweiwujxw/particle-rose/blob/448239aebb750feffa73fdcace0280a0d988132e/scripts/build-rose-points.mjs)，MIT © 2026 Xuewei Wu：改编面积累计分布、二分抽样、重心采样和种子随机函数，固定提交 `448239aebb750feffa73fdcace0280a0d988132e`，附完整许可。
- [particle-handtracker](https://github.com/FIQTOR/particle-handtracker)，MIT © 2026 FIQTOR：v4 历史改编来源；v6 花型及点着色器已替换，保留固定提交 `f1b39077b340fced07ef1862ca0d737d8523f78e` 的许可记录。
- [WebGL-Flower](https://github.com/Woffluon/WebGL-Flower)，MIT：改编 Simplex 噪声函数用于花瓣局部风动；保留原作者 Efe Arabacı 的许可。固定提交 `ccd0d2ec267fb12fb7adc26ee6c2816c3f9e3c0a`。
- [MediaPipe Hands 官方接口及示例](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md)，Apache-2.0，附本地许可文本。
- [新版 Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)。

## 电脑使用与常见问题

- 电脑 `http://localhost` 是摄像头可用的安全上下文。公开分享必须使用 HTTPS；别人用自己的电脑和摄像头，不需要连接这台电脑。
- `NotAllowedError`：允许地址栏中的摄像头权限再重试。
- `NotReadableError`：关闭占用摄像头的会议、直播等应用。
- `NotFoundError`：没有摄像头，仍可演示。
- 空白花朵：检查浏览器 WebGL 与硬件加速；保持所有文件完整。
- 识别模型加载失败：检查本地 HTTP 服务及 `vendor/mediapipe/` 是否完整。
- 若仍卡顿，检查浏览器硬件加速、关闭重复打开的花朵页面和同时占用摄像头的应用。默认不自动降画质，实际性能需在目标电脑验证。

## 以后接入 jntm

本次交付独立页面，没有修改或发布 jntm。

如果 jntm 是静态网站，可以将整个文件夹放到 `jntm/gesture-bloom/`，加一个链接：

```html
<a href="./gesture-bloom/">指尖花开</a>
```

所有项目资源使用相对路径，支持 GitHub Pages 仓库子路径。推荐独立页面跳转。若需要 iframe 嵌入，必须允许摄像头和全屏：

```html
<iframe
  src="./gesture-bloom/"
  title="指尖花开"
  allow="camera; fullscreen"
  style="width:100%;height:850px;border:0;border-radius:20px"
></iframe>
```

之后再根据实际 jntm 的框架、布局与托管方式做正式整合。
