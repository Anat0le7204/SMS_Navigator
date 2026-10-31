# -*- coding: utf-8 -*-
"""
文体楼楼层统一编码：GF1→L2、文体楼原 L2→L3、GF2→L4，与全校区 L 编码合并。

背景：文体楼跨 L1、GF1、L2、GF2 四层，原数据用 GF1/GF2（夹层）+ 共用 L2 表示，
与其他楼的 L1/L2/L3/L4 编码不一致。本模块把文体楼各层并入对应编号的 L 楼层：
  * GF1（文体楼 2 层） → 并入 L2（与教学楼 2 层合并）
  * 文体楼在 L2 上的部分（3 层）→ 并入 L3（与教学楼 3 层合并）
  * GF2（文体楼 4 层） → 并入 L4（与教学楼 4 层合并）

实现要点：
  * 楼层多边形没有楼栋标签 → 用「文体楼包围盒」（由 GF1/GF2 多边形求出，含 padding）
    按质心归属拆分 L2，把文体楼部分挪到 L3；
  * 节点 / POI / 标签按「包围盒 + building 字段」归属（build_data.py 的就近楼栋推断
    会把 LT-62 这类楼梯误标成行政楼，故以坐标兜底）；
  * 节点 floorIdx、POI.f 重算；垂直边权重按新层级差重算（9.0 楼梯 / 6.0 电梯 × 层高差）。

在 data/build_data.py 末尾调用 apply()，使每次重新抽取自动生效；
也可对已生成的 data/map-data.json 直接运行本文件完成一次性迁移。
"""

RENAME = {"GF1": "L2", "GF2": "L4"}   # 文体楼 2/4 层并入对应 L 楼层；L2 的文体楼部分另并入 L3


def _bbox(polys):
    xs = [p["p"][i] for p in polys for i in range(0, len(p["p"]), 2)]
    ys = [p["p"][i] for p in polys for i in range(1, len(p["p"]), 2)]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)


def _centroid(p):
    pts = p["p"]
    return (sum(pts[0::2]) / len(pts[0::2]), sum(pts[1::2]) / len(pts[1::2]))


def _bounds(polys, labels):
    xs = [p["p"][i] for p in polys for i in range(0, len(p["p"]), 2)]
    ys = [p["p"][i] for p in polys for i in range(1, len(p["p"]), 2)]
    xs += [l["x"] for l in labels]
    ys += [l["y"] for l in labels]
    if not xs:
        return [0, 0, 0, 0]
    pad = 40
    return [round(min(xs) - pad, 1), round(min(ys) - pad, 1),
            round(max(xs) + pad, 1), round(max(ys) + pad, 1)]


def apply(d):
    F = {f["id"]: f for f in d["floors"]}
    if "GF1" not in F or "GF2" not in F:   # 已合并过，幂等
        return d

    old_order = d["meta"]["floorOrder"]

    # ---- 文体楼包围盒 ----
    x0, y0, x1, y1 = _bbox(F["GF1"]["polys"] + F["GF2"]["polys"])
    pad = 30
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
    def in_wt(x, y): return x0 <= x <= x1 and y0 <= y <= y1
    def is_wt(x, y, bld): return in_wt(x, y) or bld == "文体楼"

    # ---- 拆分共用 L2：文体楼部分（→L3）与教学楼等部分（留在 L2） ----
    l2 = F["L2"]
    wt_polys = [p for p in l2["polys"] if in_wt(*_centroid(p))]
    keep_polys = [p for p in l2["polys"] if not in_wt(*_centroid(p))]
    wt_labels = [l for l in l2["labels"] if in_wt(l["x"], l["y"])]
    keep_labels = [l for l in l2["labels"] if not in_wt(l["x"], l["y"])]

    # ---- 合并 ----
    # L2 = 教学楼等 L2 部分 + GF1（文体楼 2 层）
    l2["polys"] = keep_polys + F["GF1"]["polys"]
    l2["labels"] = keep_labels + F["GF1"]["labels"]
    l2["bounds"] = _bounds(l2["polys"], l2["labels"])

    # L3 = 教学楼等 L3 + 文体楼原 L2 部分（3 层）
    l3 = F["L3"]
    l3["polys"] = l3["polys"] + wt_polys
    l3["labels"] = l3["labels"] + wt_labels
    l3["bounds"] = _bounds(l3["polys"], l3["labels"])

    # L4 = 教学楼等 L4 + GF2（文体楼 4 层）
    l4 = F["L4"]
    l4["polys"] = l4["polys"] + F["GF2"]["polys"]
    l4["labels"] = l4["labels"] + F["GF2"]["labels"]
    l4["bounds"] = _bounds(l4["polys"], l4["labels"])

    # ---- 删除 GF1/GF2，重排 floorOrder ----
    d["floors"] = [f for f in d["floors"] if f["id"] not in ("GF1", "GF2")]
    new_order = [f["id"] for f in d["floors"]]
    d["meta"]["floorOrder"] = new_order

    # ---- 节点 floorIdx 重算 ----
    for n in d["nodes"]:
        old_fid = old_order[n[2]]
        if old_fid == "GF1":
            n[2] = new_order.index("L2")
        elif old_fid == "GF2":
            n[2] = new_order.index("L4")
        elif old_fid == "L2" and is_wt(n[0], n[1], n[5]):
            n[2] = new_order.index("L3")
        else:
            n[2] = new_order.index(old_fid)

    # ---- POI 楼层重算 ----
    for p in d["pois"]:
        if p["f"] == "GF1":
            p["f"] = "L2"
        elif p["f"] == "GF2":
            p["f"] = "L4"
        elif p["f"] == "L2" and is_wt(p["x"], p["y"], p.get("b")):
            p["f"] = "L3"

    # ---- 垂直边权重按新层级差重算（9.0 楼梯 / 6.0 电梯） ----
    levels = {f["id"]: f["level"] for f in d["floors"]}
    for e in d["edges"]:
        a, b, w, k = e
        if k in (1, 2):
            la = levels[new_order[d["nodes"][a][2]]]
            lb = levels[new_order[d["nodes"][b][2]]]
            e[2] = round((9.0 if k == 1 else 6.0) * abs(la - lb), 2)

    return d


if __name__ == "__main__":
    import json, io, os
    path = os.path.join(os.path.dirname(__file__), "map-data.json")
    d = json.load(io.open(path, encoding="utf-8"))
    before = {f["id"]: len(f["polys"]) for f in d["floors"]}
    apply(d)
    after = {f["id"]: len(f["polys"]) for f in d["floors"]}
    io.open(path, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))
    print("文体楼楼层已统一编码为 L 编码")
    print("  GF1 → L2:", before.get("GF1"), "并入 L2 (原", before.get("L2"), "→", after.get("L2"), ")")
    print("  GF2 → L4:", before.get("GF2"), "并入 L4 (原", before.get("L4"), "→", after.get("L4"), ")")
    print("  文体楼原 L2 部分 → L3:", after.get("L3"), "(原", before.get("L3"), ")")
    print("  floorOrder:", d["meta"]["floorOrder"])
    print("  形体室:", [p["f"] for p in d["pois"] if p["n"] == "形体室"])
    print("  化妆间:", [p["f"] for p in d["pois"] if p["n"] == "化妆间"])
    print("  D202:", [p["f"] for p in d["pois"] if p["n"] == "D202"])
