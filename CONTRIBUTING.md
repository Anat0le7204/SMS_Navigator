# 贡献指南

感谢你愿意改进深圳中学室内导航！本项目是小型、零依赖的纯前端应用，贡献门槛很低。

## 如何贡献

1. **反馈问题**：搜索 [已有 Issue](https://github.com/ZhangDongzai/SMS_Navigator/issues)，确认是新问题后[新建 Issue](https://github.com/ZhangDongzai/SMS_Navigator/issues/new)，写清复现步骤与期望行为。
2. **提交改动**：Fork → 建分支（`git checkout -b fix/xxx`）→ 改动 → 自测 → 提 PR。描述里说明「改了什么、为什么、如何验证」。
3. **补充数据**：房间/教室信息更新请改 `data/room.json`；地图几何问题请附截图与房间编号。

适合作为第一次贡献的方向：`good first issue` 标签的 Issue、文档错别字、`data/room.json` 缺漏补全、指引文案优化。

## 本地开发

```bash
# 预览（不要直接双击 src/index.html）
python -m http.server 8000        # 打开 http://localhost:8000/src/

# 打包单文件并自测
python scripts/build.py           # 输出根目录 index.html

# 改了房间目录后
python scripts/check_rooms.py
```

约定：

- 技术栈是**原生 JS + SVG，零依赖**，请不要引入框架或构建工具链；
- 源码在 `src/`，按职责拆分在编号前缀的模块里（`00-data` … `70-app`），新模块按依赖顺序插入 `src/index.html`；
- **不要直接修改**根目录 `index.html`（构建产物），改完源码后运行 `scripts/build.py` 重新生成；
- 不要重复声明同名顶层常量（开发与构建共享词法环境）；
- 动画帧内**不要**给 SVG 树加 `filter` / `backdrop-filter`（会造成闪烁与长帧，详见 `docs/COMPASS.md` 第 8 节）；
- 提交前用浏览器自测：默认路线、班级搜索、导航模式、移动端缩放。

## 文档规范

文档是本项目的重要组成部分，遵循以下原则（源自主流前端项目的文档实践）：

1. **首屏即结论**：README 开头用一句话说清「是什么、给谁用」，配截图与快速开始，细节下沉到 `docs/`。
2. **可复制运行**：所有命令与代码块必须可直接复制执行，不写臆测的参数。
3. **表格优于段落**：兼容性、快捷键、字段取值等并列信息用表格。
4. **文档互链**：新增主题写进 `docs/` 并在 README「文档」表登记；文档头部保留「← 返回 README」。
5. **变更记录**：行为变化记入 `docs/CHANGELOG.md`（语义化版本），历史条目不改写。
6. **诚实记录缺口**：已知问题与数据缺口如实写明（如 `docs/DATA.md` 第 7 节），不粉饰。

## 代码风格

- 缩进 2 空格，字符串优先双引号，分号结尾；
- 注释解释「为什么」而不是复述代码；
- CSS 走 `src/styles/`，新增变量放 `base.css` 的 `:root`。

## 行为准则

保持友善与耐心。Issue 与 PR 讨论对事不对人；学校相关数据（班级、房间）注意不要引入个人隐私信息。
