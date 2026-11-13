# -*- coding: utf-8 -*-
"""把地图数据写成"人能读、diff 也好看"的 JSON。

data/*.json 需要人工查看与版本对比，但也不能每个数字占一行：
map-data.json 有 6000+ 节点，标准 indent=2 会膨胀到 22 万行、3.4MB。
所以这里的规则是——

  - 缩进 2 空格，容器的元素逐项换行；
  - 序列化后不超过 max_width 的小容器（单个节点 / 边 / 兴趣点 / 多边形）
    压成一行，一条记录一行，便于逐行 diff；
  - 超长的纯数字数组（多边形顶点坐标）按 max_width 折行。

注意：打包成单文件页面时不要用这里，scripts/build.py 会另外压缩成单行。
"""
import json


def dumps(obj, max_width=110, indent=2):
    """返回格式化后的 JSON 文本（不含结尾换行）。"""
    return _render(obj, 0, 0, max_width, indent)


def _is_scalar(v):
    return not isinstance(v, (dict, list))


def _scalar(v):
    return json.dumps(v, ensure_ascii=False)


def _inline(v):
    if _is_scalar(v):
        return _scalar(v)
    if isinstance(v, dict):
        if not v:
            return "{}"
        return "{" + ", ".join(_scalar(k) + ": " + _inline(x) for k, x in v.items()) + "}"
    if not v:
        return "[]"
    return "[" + ", ".join(_inline(x) for x in v) + "]"


def _render(v, level, prefix_len, max_width, indent):
    if _is_scalar(v):
        return _scalar(v)

    one = _inline(v)
    if not v or prefix_len + len(one) <= max_width:
        return one

    pad = " " * (level * indent)
    pad_in = " " * ((level + 1) * indent)

    if isinstance(v, dict):
        lines = []
        for k, x in v.items():
            head = pad_in + _scalar(k) + ": "
            lines.append(head + _render(x, level + 1, len(head), max_width, indent))
        return "{\n" + ",\n".join(lines) + "\n" + pad + "}"

    if all(_is_scalar(x) for x in v):
        # 纯标量长数组：按宽度折行，一行放尽量多的值
        lines, cur = [], ""
        for x in v:
            piece = _scalar(x)
            nxt = piece if not cur else cur + ", " + piece
            if cur and len(pad_in) + len(nxt) > max_width:
                lines.append(pad_in + cur + ",")
                cur = piece
            else:
                cur = nxt
        if cur:
            lines.append(pad_in + cur)
        return "[\n" + "\n".join(lines) + "\n" + pad + "]"

    lines = [pad_in + _render(x, level + 1, len(pad_in), max_width, indent) for x in v]
    return "[\n" + ",\n".join(lines) + "\n" + pad + "]"
