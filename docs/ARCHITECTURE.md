# 架构说明

[← 返回 README](../README.md) · [变更记录](CHANGELOG.md)

## 目录

1. [总体结构](#1-总体结构)
2. [运行时数据流](#2-运行时数据流)
3. [路径与步骤模型](#3-路径与步骤模型)
4. [导航模式状态机](#4-导航模式状态机)
5. [路段缩略图](#5-路段缩略图)
6. [构建与作用域约定](#6-构建与作用域约定)
7. [指南针与地图旋转](#7-指南针与地图旋转)
8. [为什么仍然产出单文件](#8-为什么仍然产出单文件)
9. [手机端路线预览](#9-手机端路线预览)

## 1. 总体结构

应用是纯前端、零依赖的原生 JavaScript + SVG。源码按职责拆分为 11 个脚本和 5 个样式文件，构建时按顺序拼接为一个 IIFE，并内联数据与图片，产出单文件 `index.html`。

```
index.html
 ├─ styles/base.css          变量、重置、品牌区
 ├─ styles/panel.css         左侧规划面板、摘要、步骤列表
 ├─ styles/map.css           地图、楼层栏、图例、路线、缩放
 ├─ styles/navigation.css    导航模式（顶部指令条 + 底部路段卡）
 └─ styles/mobile-preview.css 手机端路线预览（顶部起终点条 + 底部抽屉）

js/00-data.js               数据解析、全局状态、DOM 引用、图标、toast
js/05-rooms.js              房间目录索引：按名称/编号匹配 POI、分类展示
js/15-compass.js            指南针检测/授权/平滑、朝向旋转、开关状态
js/10-floorplan.js          楼层多边形渲染、标签避让
js/20-view.js               视口变换、缩放/平移、取景、比例尺
js/30-router.js             Dijkstra、分步指引生成、跨层步骤
js/40-route-render.js       路线折线、起终点/换层标记、当前步高亮
js/50-ui.js                 摘要、步骤列表、楼层栏、搜索、聚焦步骤
js/55-preview.js            手机端路线预览、抽屉展开/收起、楼层取景
js/60-navigation.js         导航模式、路段缩略图、上一步/下一步
js/70-app.js                计算路线、地图点选、事件绑定、初始化
```

## 2. 运行时数据流

```
data/map-data.json
      │  (构建时内联为 window.MAP_DATA)
      ▼
00-data.js  解析出 FLOORS / NODES / EDGES / POIS / ADJ / LEVEL
      │
      ├─ 10-floorplan.js  按楼层画多边形与标签
      ├─ 20-view.js       维护 state.view，控制 SVG transform
      ├─ 30-router.js     输入起点/终点 → Dijkstra → buildRoute → steps
      ├─ 40-route-render.js 把 path 按楼层切段画到 routeLayer
      ├─ 50-ui.js         摘要卡、步骤列表、搜索、楼层栏
      ├─ 55-preview.js    手机端路线预览、抽屉、预览取景
      └─ 60-navigation.js 以 steps 为单位逐条播放
```

房间目录 `data/room.json`（`{ date, data: [{ room_number, name, category }] }`）由构建时内联为 `window.ROOM_DATA`，`05-rooms.js` 把名称/编号映射到对应 POI，搜索时命中即以房间名 + 编号的形式展示，并带上分类。

`state` 是单一状态源，字段包括：

```js
{
  floor,            // 当前楼层 id
  view,             // {x, y, s} SVG 视口变换
  start, end,       // 起终点 POI
  route,            // buildRoute 的结果（含 steps）
  activeStep,       // 普通模式选中的步骤
  pick,             // 地图点选模式：'start' | 'end' | null
  useTeachingLift,  // 是否允许使用教学楼电梯（其他楼栋电梯不受限）
  nav: { active, index }, // 导航模式
  preview: { open, expanded }, // 手机端路线预览：显示中 / 步骤抽屉展开
  compass: { state, enabled, heading, rot, ... } // 指南针
}
```

## 3. 路径与步骤模型

`buildRoute()` 把 Dijkstra 的节点序列转换成“同层腿 + 跨层过渡”：

- 同层腿做 RDP 简化（容差 12 地图单位），按转角切分为“直行 / 左转 / 右转 / 稍向左 / 稍向右 / 掉头”步骤；
- 小于 15 m 的碎步合并进下一步，避免“右转 4 米、左转 15 米”这类噪音；
- 跨层边合并为一条“走楼梯 A2，上 1 层（L1 → L2）”步骤，并带 `dirLabel` 供地图气泡使用；
- 每一步包含：`type`、`floor`、`icon`、`text`、`dist`、`weight`、`pts`、`bld`、`floorName`。

`route.distance` 是 Dijkstra 的加权距离（含跨层当量）；`step.weight` 用于导航模式计算“剩余距离”。

## 4. 导航模式状态机

```
planning ──[开始导航]──▶ navigating ──[上一步/下一步]──▶ navigating
    ▲                        │
    └────[结束/完成/Esc]─────┘
```

进入导航时：

1. `body.navigating` 隐藏左侧面板，地图改为全屏 fixed；
2. `focusStep(0, {nav:true})` 切到起点楼层，按导航留白（顶部指令条 + 底部路段卡）取景；
3. `renderNav()` 更新指令条、缩略图、剩余距离、进度条与按钮状态；
4. `navTo()` 只改变 `state.nav.index` 并调用 `focusStep`，地图、楼层、缩略图同步。

导航模式下 `focusStep` 使用 `fitStepNav()`：步骤包围盒至少 70 m × 52 m，最大缩放 2.4 px/单位，避免短步骤把地图放得过大。

## 5. 路段缩略图

`thumbSvg(step)` 生成一段内联 SVG：

- 以步骤包围盒为基础，按 1.62:1 比例扩展并留边；
- 画当前楼层的多边形（按 `DRAW_ORDER` 排序，确保房间在室内地面之上）；
- L1 额外叠加室外的道路 / 草地 / 水体 / 建筑轮廓；
- 画步骤折线（白描边 + 蓝色主线）；
- 起终点圆点 / 换层橙色圆点，半径按视口宽度比例计算，保证缩略图里可见；
- 换层或出入口步骤会纳入附近 10 个房间，避免缩略图落在楼栋边缘的空地上。

## 6. 构建与作用域约定

开发时各脚本以传统 `<script>` 顺序加载，顶层 `const` / `function` 位于全局词法环境，天然共享；构建时再把全部脚本包进一个 IIFE，避免污染 `window`。

因此：

- 新增模块时按依赖顺序插入 `index.html`；
- 不要重复声明同名顶层常量；
- 初始化逻辑集中在 `70-app.js` 末尾的 `init()`，此前不要触发依赖 DOM 的调用（60 中的事件绑定除外，脚本位于 body 末尾）。

## 7. 指南针与地图旋转

- 仅导航模式旋转：`state.nav.active && state.compass.enabled` 时，目标旋转角为 `-heading`；规划页目标为 0。
- 视口变换扩展为 `translate(A) rotate(θ) translate(-A) translate(x,y) scale(s)`，`A` 为旋转锚点（`fitBounds` 设为可用区域中心）。
- `fitBounds` 按旋转后的外接矩形计算缩放；`screenToMap`、`zoomAt`、拖拽都做了逆旋转，保证缩放/平移/点选不漂移。
- 标签在碰撞布局后只对可见项绕自身锚点反向旋转；起终点/换层标记组同样反向旋转，保证文字正立。
- 详见 [COMPASS.md](COMPASS.md)。

## 8. 为什么仍然产出单文件

校内使用场景经常是离线、拷贝、双击打开。单文件产物避免了静态服务器、跨域 fetch、图片路径等问题；多文件源码只服务于开发维护。构建脚本只做“内联”，不改变运行时行为。

## 9. 手机端路线预览

窄屏（`max-width:760px`，或高度 ≤520px 的横屏设备）在算路完成后进入预览形态，桌面端不启用。

```
body.m-previewing
 ├─ 地图（fixed 全屏）
 ├─ .m-top     返回 / 起点 / 终点 / 交换
 └─ .m-sheet   整屏高的底部抽屉
     ├─ .m-peek   常驻：距离、时长、起终点与楼层、概览标签、开始导航
     └─ .m-detail 展开：按楼层分组的分步指引
```

- 抽屉折叠时用 `transform: translateY(calc(100% - var(--m-peek)))` 只露出 `.m-peek`；`--m-peek` 由 `measurePeek()` 实测内容高度写入 `body`，避免不同字号或换行导致露出不全。
- 展开 / 收起由按钮、`mGrab` 拖拽（Pointer Events + `touch-action:none`）或点击步骤触发；`.m-detail` 折叠时 `visibility:hidden`，不会进入 Tab 序。
- 概览的距离 / 时长 / 标签由 `routeDistance()`、`routeMinutes()`、`routeMetaItems()` 生成，与桌面摘要共用，避免两套估算。
- 取景：`previewInsets()` 返回顶部起终点条、楼层栏、底部抽屉占用的像素；`fitRouteOnFloor()` 只取当前楼层的路线段包围盒（各层共用平面坐标，跨层合并会把当前层路线挤扁），`fitStepPreview()` 在点步骤时聚焦单段。`fitBounds()` 在预览态默认使用这些留白。
- 进入 / 退出：手机端 `computeRoute()` 成功后自动 `openPreview()`；返回键 `closePreview()` 回到规划面板，摘要卡的「查看路线预览」可再次进入。开始导航先收起预览，`navFromPreview` 记录来源，结束导航后回到预览。跨断点缩放时自动进入 / 退出预览并重新取景。
