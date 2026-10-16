# 来源与改编说明

## Three.js

- 上游：https://github.com/mrdoob/three.js
- 固定发布版本：0.169.0 / r169。
- 本地文件：`vendor/three.module.min.js`、`vendor/addons/` 下八个后处理模块。
- 许可证：MIT，完整文本见 `vendor/THREE-LICENSE.txt`。
- 原样保留官方模块。v6 使用 Three.js 的直接渲染和粒子内部柔光；`vendor/addons/` 保留在代码包中，当前页面不加载这些后处理模块。

## Mathematics_And_Nature · 完整三维玫瑰曲面

- 上游：https://github.com/Tonumoy/Mathematics_And_Nature
- 固定提交：`11f8341349faf2220d6a6e0617c4d383ffcb9629`。
- 原文件：https://github.com/Tonumoy/Mathematics_And_Nature/blob/11f8341349faf2220d6a6e0617c4d383ffcb9629/Equations_of_Rose.ipynb
- 原作者：Tonumoy Mukherjee，Copyright (c) 2024。
- 许可证：MIT，完整文本见 `vendor/PARAMETRIC-ROSE-LICENSE.txt`。
- 本地改编文件：`vendor/github-parametric-rose.js`。
- 实际移植范围：完整 `rose(x, theta)` 曲面函数，包括 `phi`、花瓣轮廓系数 `X`、弯曲项 `y`、半径 `r` 与三维位置；保留 `x ∈ [0,1]`、`theta ∈ [-2π,15π]` 的参数范围。
- 改动：用 JavaScript 正模运算对应 NumPy `mod`，把上游 Z 高度转换为 Three.js 的 Y，缩放 3.25 倍并将 Y 平移 -0.55；增加网格生成、对应花苞坐标、法线明暗、瓣缘采样与 GPU 形变数据。
- 没有复制上游 Matplotlib 窗口、绘图界面、旋转动画或视频导出代码。

## particle-rose · 面积采样算法

- 上游：https://github.com/xueweiwujxw/particle-rose
- 固定提交：`448239aebb750feffa73fdcace0280a0d988132e`。
- 原文件：https://github.com/xueweiwujxw/particle-rose/blob/448239aebb750feffa73fdcace0280a0d988132e/scripts/build-rose-points.mjs
- 原作者：Xuewei Wu，Copyright (c) 2026。
- 许可证：MIT，完整文本见 `vendor/PARTICLE-ROSE-SAMPLING-LICENSE.txt`。
- 本地改编文件：`vendor/github-parametric-rose.js`。
- 实际改编范围：通过叉积计算三角形面积，建立累计面积分布，以二分查找选择三角形；使用反射法生成均匀重心坐标，并移植固定种子的伪随机函数。
- 改动：将算法用于 Tonumoy 参数曲面生成的三角网格，在面积采样基础上对 `theta > 7.5π` 附近的花心区域加密；另约七分之一粒子按瓣缘长度抽样，加强花瓣轮廓。最终分布包含视觉加密，并非全瓣面严格均匀。增加花苞对应坐标、颜色、光照、瓣缘及流光属性。
- 没有在运行项目中使用上游 OBJ 模型或预生成的 `rose-points.bin`，也没有复制它的页面与粒子动画系统。

## WebGL-Flower

- 上游：https://github.com/Woffluon/WebGL-Flower
- 固定提交：`ccd0d2ec267fb12fb7adc26ee6c2816c3f9e3c0a`。
- 原文件：https://github.com/Woffluon/WebGL-Flower/blob/ccd0d2ec267fb12fb7adc26ee6c2816c3f9e3c0a/src/shaders/mod2.frag
- 原作者：Efe Arabacı，Copyright (c) 2026。
- 许可证：MIT，完整文本见 `vendor/WEBGL-FLOWER-LICENSE.txt`。
- 改编范围：将 `mod289`、`permute`、`snoise` 连续噪声函数移入共享基础形变的顶点着色器，调整格式，用于低幅度的花瓣风动。
- 未复制 React 页面或它的二维花朵系统。噪声用于瓣面局部微风，不驱动整朵花摆动。

## particle-handtracker · 历史改编来源

- 上游：https://github.com/FIQTOR/particle-handtracker
- 固定提交：`f1b39077b340fced07ef1862ca0d737d8523f78e`。
- 原文件：https://github.com/FIQTOR/particle-handtracker/blob/f1b39077b340fced07ef1862ca0d737d8523f78e/index.html
- 原作者：FIQTOR，Copyright (c) 2026。
- 许可证：MIT，完整文本见 `vendor/PARTICLE-HANDTRACKER-LICENSE.txt`。
- v4 曾改编其 `shapes.flower` 玫瑰曲线 `r = 2.5 * abs(cos(k*u) * sin(v))` 和 fragment shader 软点衰减 `pow(1.0 - r * 2.0, 1.5)`。
- v6 的花型已替换为 Tonumoy 的完整曲面，当前粒子 fragment shader 使用 Gaussian 亮核与柔光；这两部分不再归属于 FIQTOR 的实现。
- 为保留历次改编记录，代码包继续附原许可证。没有复制上游页面、其他形态、CPU 位置动画或手势映射。

## MediaPipe Hands

- 上游：https://github.com/google-ai-edge/mediapipe
- npm 包：`@mediapipe/hands@0.4.1675469240`。
- 本地文件：`vendor/mediapipe/`。
- 许可证：Apache-2.0，完整文本见 `vendor/MEDIAPIPE-LICENSE.txt`。
- 固定本地 JS、WASM 和模型，无摄像头画面上传。
