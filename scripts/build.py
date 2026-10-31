# -*- coding: utf-8 -*-
"""
把 src/ 下的多文件源码打包为单文件离线网页。

用法:
    python scripts/build.py

产物:
    index.html   (根目录，可直接双击打开)
    data/map-data.js        (开发用，把 JSON 包装成 window.MAP_DATA)

打包内容:
    - src/index.html
    - src/styles/*.css
    - src/js/*.js  (按 index.html 中的顺序)
    - src/assets/badge.png (base64)
    - data/map-data.json   (内联为 window.MAP_DATA)
"""
import base64
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "index.html")
DATA_JSON = os.path.join(ROOT, "data", "map-data.json")
DATA_JS = os.path.join(ROOT, "data", "map-data.js")


def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    if not os.path.exists(DATA_JSON):
        sys.exit("缺少 data/map-data.json，请先运行 python data/build_data.py")

    html = read(os.path.join(SRC, "index.html"))
    raw = read(DATA_JSON).strip()

    # 开发用数据脚本
    with io.open(DATA_JS, "w", encoding="utf-8") as f:
        f.write("window.MAP_DATA = " + raw.replace("</script", "<\\/script") + ";\n")

    # 1) 内联 CSS
    css_links = re.findall(r'<link rel="stylesheet" href="(styles/[^"]+)"\s*/?>', html)
    styles = []
    for href in css_links:
        css = read(os.path.join(SRC, href))
        styles.append("/* ---- %s ---- */\n%s" % (href, css.strip()))
        html = re.sub(r'<link rel="stylesheet" href="%s"\s*/?>\s*' % re.escape(href), "", html)
    html = html.replace("</head>", "<style>\n" + "\n\n".join(styles) + "\n</style>\n</head>")

    # 2) 内联校徽
    badge_path = os.path.join(SRC, "assets", "badge.png")
    with open(badge_path, "rb") as f:
        badge_uri = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    html = html.replace('src="assets/badge.png"', 'src="%s"' % badge_uri)
    html = html.replace('href="assets/badge.png"', 'href="%s"' % badge_uri)

    # 3) 内联数据（替换开发用脚本）
    data_tag = re.compile(r'<script src="\.\./data/map-data\.js"[^>]*></script>\s*')
    data_code = "<script>window.MAP_DATA = " + raw.replace("</script", "<\\/script") + ";</script>\n"
    if not data_tag.search(html):
        sys.exit("index.html 中未找到 data/map-data.js 引用")
    html = data_tag.sub(data_code, html, count=1)

    # 4) 内联 JS（保持 index.html 中的顺序）
    js_tags = re.findall(r'<script src="(js/[^"]+)"\s*></script>\s*', html)
    if not js_tags:
        sys.exit("index.html 中未找到 JS 模块引用")
    js_parts = []
    for src in js_tags:
        code = read(os.path.join(SRC, src))
        js_parts.append("/* ==================== %s ==================== */\n%s" % (src, code.strip()))
        html = re.sub(r'<script src="%s"\s*></script>\s*' % re.escape(src), "", html)
    bundle = '(function(){\n"use strict";\n\n' + "\n\n".join(js_parts) + "\n\n})();\n"
    html = html.replace("</body>", "<script>\n" + bundle.replace("</script", "<\\/script") + "</script>\n</body>")

    with io.open(OUT, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(OUT) / 1024 / 1024
    print("已生成: %s" % OUT)
    print("大小: %.2f MB" % size)
    print("样式: %d 个 | 脚本: %d 个 | 数据: %.2f MB" % (len(styles), len(js_tags), len(raw) / 1024 / 1024))


if __name__ == "__main__":
    main()
