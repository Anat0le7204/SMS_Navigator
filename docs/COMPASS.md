# 指南针与地图朝向

[← 返回 README](../README.md) · [变更记录](CHANGELOG.md)

## 目录

1. [目标行为](#1-目标行为)
2. [方向数据](#2-方向数据)
3. [能力检测](#3-能力检测)
4. [旋转数学](#4-旋转数学)
5. [文字与标记正立](#5-文字与标记正立)
6. [开关与提示](#6-开关与提示)
7. [调试](#7-调试)
8. [旋转性能](#8-旋转性能v221-修复的闪烁问题)
9. [已知限制](#9-已知限制)

## 1. 目标行为

- 仅**导航模式**旋转地图：规划页始终正北，点击“开始导航”后地图跟随设备朝向。
- 设备支持指南针时，右上角“朝向”开关**默认开启**（除非用户上次手动关闭）；地图旋转使屏幕上方对应设备当前朝向。
- 文字、房间号、起终点和换层标记**保持正立**；路线、房间轮廓随地图旋转。
- 设备不支持时，按钮为灰色禁用态；点击弹出说明（不会开启）。
- iOS 13+ 需要用户手势授权：按钮显示“授权”，点击后调用 `DeviceOrientationEvent.requestPermission()`。

## 2. 方向数据

| 平台 | 事件 | 取值 |
|---|---|---|
| Android Chrome | `deviceorientationabsolute` | `heading = 360 - alpha + screen.orientation.angle` |
| iOS Safari | `deviceorientation` | `event.webkitCompassHeading`（屏幕顶部为 0°，已是屏幕相对方向） |
| 其他浏览器 | `deviceorientation`（`absolute === true`） | 同 alpha 公式 |

- 更新频率约 20–60 Hz；用最短角 EMA（系数 0.22）平滑，`requestAnimationFrame` 节流渲染。
- 同时监听绝对/相对事件；绝对事件到达后 1.2 s 内忽略相对事件，避免重复抖动。
- `screen.orientation.angle` 用于横竖屏补偿；iOS 的 `webkitCompassHeading` 不再叠加，避免重复补偿。
- 只保留有效值：`webkitCompassHeading >= 0`，alpha 必须是有限数字。

## 3. 能力检测

不能只看 `DeviceOrientationEvent` 是否存在（桌面浏览器常有构造函数但没有传感器）。检测流程：

1. 没有 `DeviceOrientationEvent`，或 `window.isSecureContext === false` → 不支持（提示 HTTPS）。
2. iOS 且存在 `requestPermission` → `prompt` 状态，按钮显示“授权”。
3. 其余情况监听 1.8 s：
   - 收到有效 heading → `supported`，按偏好决定默认开关；
   - 超时没有任何有效事件 → `unsupported`。

状态：`checking` / `prompt` / `supported` / `unsupported` / `denied`。

## 4. 旋转数学

当前视口变换：

```
屏幕坐标 P = A + R(θ) · (T + s·M − A)
```

- `M` 地图坐标，`s` 缩放，`T = (view.x, view.y)`，`A = (view.ax, view.ay)` 旋转锚点；
- `θ = state.compass.rot`，导航中目标为 `−heading`（设备朝东 90° → 地图逆时针转 90°，东在屏幕上方）；
- `fitBounds()` 把锚点设为可用区域中心，并按旋转后的外接矩形计算缩放，保证内容居中且尽量铺满。

相关实现：

- `applyView()`：写入 `translate(A) rotate(θ) translate(−A) translate(T) scale(s)`；
- `screenToMap()`：`M = (R(−θ)(P−A) + A − T) / s`；
- `zoomAt()`：先求光标下的地图点，再反解新的 `T`，保持光标位置不漂移；
- 拖拽：屏幕位移 `d` 转成地图位移 `R(−θ)·d` 后加到 `T`。

## 5. 文字与标记正立

- 楼层标签：每个可见 `<text>` 绕自身锚点反向旋转 `−θ`，即 `rotate(−θ x y)`；只更新碰撞检测后可见的标签（约 30–80 个）。
- 起终点/换层标记：组变换改为 `translate(x y) rotate(−θ) scale(k)`，圆点与“起/终/上 N 层”文字保持正立。
- 路线、房间多边形、当前步高亮随地图旋转，符合“屏幕上方 = 朝向”的直觉。
- 缩略图不旋转，始终正北，作为路段小地图。

## 6. 开关与提示

| 状态 | 按钮 | 点击行为 |
|---|---|---|
| checking | “检测中”，禁用样式 | Toast：正在检测 |
| prompt（iOS） | “授权”，琥珀色 | 请求方向权限 |
| supported / 开 | 绿色“朝向” | 关闭，地图回正 |
| supported / 关 | 普通“朝向” | 开启；在规划页提示“开始导航后生效” |
| unsupported | 灰色禁用“朝向” | Toast 说明原因（无传感器 / 需 HTTPS） |
| denied | 灰色禁用“朝向” | Toast：权限被拒，需在浏览器设置允许 |

偏好写入 `localStorage["szzx.compass"]`（`"1"` / `"0"`）。iOS 未授权前不会自动开启。

## 7. 调试

仅用于开发/验收，不影响正常用户：

| URL 参数 | 作用 |
|---|---|
| `?compass=sim&heading=90` | 模拟支持指南针，固定朝向 90° |
| `?compass=unsupported` | 模拟不支持 |
| `?compass=prompt` | 模拟 iOS 待授权 |
| `?nav=1` | 载入后直接进入导航模式（便于截图与真机验证） |
| `?perf=1` | 旋转性能探针，把帧间隔写入标题栏 |

模拟模式下可在控制台调用 `__compassSetHeading(45)` 改变朝向。

## 8. 旋转性能（v2.2.1 修复的闪烁问题）

### 触发条件

只有在**导航模式 + 朝向开启 + 旋转角尚未收敛**（`|−heading − rot| ≥ 0.06°`）时才会逐帧重绘：

- 点击“开始导航”时从 0 转到 `−heading`；
- 行走中 heading 变化；
- 手动开关“朝向”时回正 / 跟随。

规划页旋转角恒为 0，不会触发。

### 根因

| 层级 | 问题 | 后果 |
|---|---|---|
| `#floorLayer` 的 `filter:drop-shadow()` | 整个楼层 SVG 被绘制到离屏滤镜表面，父级 `#world` 每帧变换都会让该表面失效并重建 | 单帧 60–125 ms 的长任务，滤镜表面重建瞬间出现空白/闪白，旋转卡顿 |
| 浮层的 `backdrop-filter:blur(10px)` | 底图旋转时每帧都要重新采样并模糊背景 | 每帧额外 3–5 ms，浮层边缘偶发闪动 |
| `applyView()` 每帧调用 `getBoundingClientRect()`（自身 + `updateLabelStyle()`） | 强制同步布局，和上一帧的样式写入形成 layout thrash | 帧时间抖动 |
| 每帧无差别写 `world` / 标签 / 标记 / 比例尺 / 指南针指针 | 大量无效 DOM 写入，触发不必要的重绘 | 掉帧 |

### 测量

`?perf=1&compass=sim&heading=90&nav=1` 会把旋转期间的逐帧间隔写入 `document.title`：

```
PERF n=38 p50=9.8 p90=21.0 max=41.1 >33ms=2 LoAFmax=103.5
```

同一台机器、同一页面的修复前后对比（Edge，1440×900）：

| 配置 | p50 | p90 | max | >33ms 帧 |
|---|---|---|---|---|
| 修复前（含全部滤镜） | 19.3 ms | 44.3 ms | 112.9 ms | 7 |
| 仅关闭 `drop-shadow` | 14.4 ms | 20.7 ms | 24.9 ms | 0 |
| 仅关闭 `backdrop-filter` | 17.8 ms | 61.5 ms | 125.7 ms | 8 |
| **修复后** | **9.8–10.0 ms** | **17.8–21.0 ms** | **28.3–41.1 ms** | **0–2** |

结论：`drop-shadow` 是主因（关闭后长帧消失），`backdrop-filter` 是次因（约 4 ms/帧）。

### 修复内容

1. 删除 `#floorLayer` 的 `drop-shadow`，轮廓由多边形自身的描边表达。
2. 删除浮层的 `backdrop-filter`，改用 97%–98% 不透明白底（视觉差异可忽略）。
3. `containerSize()` 增加缓存，面板显隐 / 窗口缩放 / `ResizeObserver` 时失效，消除每帧强制布局。
4. `applyView`、标签反旋、标记缩放、比例尺、指南针指针都做「值未变则不写」的去重。
5. 旋转缓动改为按时间步长归一化：`k = 1 − 0.78^(dt/16.67)`，60/90/120 Hz 观感一致，掉帧后快速追上。
6. 指南针指针随 `rot` 平滑转动（与地图同角度），去掉会与 rAF 打架的 CSS `transition`。

## 9. 已知限制

- 传感器需要 HTTPS 或 localhost；用 `file://` 打开单文件时，部分移动浏览器不会提供方向数据（按钮会显示禁用）。
- iOS 必须在用户手势中授权；无法在页面加载时自动开启。
- 桌面设备通常没有指南针，会显示禁用。
- `screen.orientation.angle` 的补偿方向在不同浏览器实现上可能有差异；如在横屏发现固定偏移，可在 `readHeading()` 中调整符号。
- 地图旋转只在导航模式生效；规划页保持正北，便于对照楼层平面。
