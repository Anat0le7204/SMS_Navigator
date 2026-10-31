# 构建与开发

## 环境

- Python 3.10+（仅标准库，无需安装包）
- 任意现代浏览器（Chrome / Edge / Safari / Firefox）

## 开发预览

源码是多文件的，不能直接双击 `src/index.html`（`../data/map-data.js` 与相对路径在 `file://` 下受限）。启动一个静态服务：

```bash
# 项目根目录
python -m http.server 8000
```

然后打开：

```
http://localhost:8000/src/
```

修改 `src/styles/*.css` 或 `src/js/*.js` 后刷新即可。

> `data/map-data.js` 由构建脚本生成。若刚更新了 `data/map-data.json`，先执行一次 `python scripts/build.py`，否则开发页仍读旧数据。

## 构建单文件

```bash
python scripts/build.py
```

输出：

```
SMS_Navigator.html
```

同时生成/刷新 `data/map-data.js`。

### 构建做了什么

1. 读取 `src/index.html`；
2. 把 `<link rel="stylesheet" href="styles/...">` 替换为内联 `<style>`；
3. 把 9 个 `<script src="js/...">` 按顺序拼接，包进一个 `(function(){ ... })()`，防止污染全局；
4. 把 `src/assets/badge.png` 替换为 base64 data URI（品牌区、导航条、favicon 共 3 处）；
5. 把 `data/map-data.json` 替换为 `window.MAP_DATA = {...}`；
6. 写入根目录 HTML。

脚本只做“内联”，不压缩、不转译，构建前后逻辑一致，便于排查。

### 指南针调试

在 URL 后追加参数可模拟设备状态（仅开发用）：

```text
?compass=sim&heading=90     # 模拟支持，固定朝向 90°
?compass=unsupported        # 模拟不支持
?compass=prompt             # 模拟 iOS 待授权
?nav=1                      # 载入后直接进入导航模式
?perf=1                     # 旋转帧间隔写入标题栏（p50 / p90 / max / >33ms）
```

验收旋转性能：

```text
SMS_Navigator.html?compass=sim&heading=90&nav=1&perf=1
```

等待约 2 秒后看标签页标题，例如 `PERF n=38 p50=9.8 p90=21.0 max=41.1 >33ms=2`。
注意：页面在后台标签页时浏览器会暂停 `requestAnimationFrame`，标题会显示「无旋转帧」，需保持前台。

模拟模式下可在控制台调用 `__compassSetHeading(45)`。

## 校验

```bash
# 语法检查（可选）
node --check src/js/00-data.js
...

# 打开构建产物
start SMS_Navigator.html
```

构建产物应当无网络请求：`grep -o 'src="[^"]*"' SMS_Navigator.html` 只应看到 data URI 或空。

## 重新生成地图数据

```bash
python data/build_data.py
python scripts/build.py
```

`build_data.py` 会访问 onemap.top 的公开接口；如接口变更，需同步修改其中的 URL、参数与字段映射。

## 新增模块

1. 在 `src/js/` 新建文件，使用现有全局符号（`state`、`$`、`fitBounds`、`renderNav` 等）；
2. 在 `src/index.html` 中按依赖顺序插入 `<script src="js/xx.js"></script>`；
3. 若新增样式，放到 `src/styles/` 并在 `<head>` 中按顺序引用；
4. 运行构建，确认 `scripts/build.py` 输出中脚本数量增加。

注意：开发时各脚本共享全局词法环境，构建时共享 IIFE 作用域，两种模式行为一致；不要重复声明同名顶层 `const`。

## 文件命名

- 构建产物：`SMS_Navigator.html`（根目录）
- 源码入口：`src/index.html`
- 数据：`data/map-data.json`（源）+ `data/map-data.js`（开发包装，生成物）
- 校徽：`src/assets/badge.png`（透明底，源图来自深圳中学官网校徽页）
