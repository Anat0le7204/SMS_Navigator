# -*- coding: utf-8 -*-
"""
文体楼楼层重映射：GF1→F2、文体楼的 L2→F3、GF2→F4（其他楼不动）。

背景：文体楼跨 L1、GF1、L2、GF2 四层，其中 GF1/GF2 是文体楼独有的夹层，
L2 则与教学楼/行政楼/宿舍共用。本模块把两个夹层与文体楼在 L2 的部分
分别改为正式楼层 F2 / F3 / F4，其余楼栋的 L2 保持不变。

实现要点：
  * 楼层多边形没有楼栋标签 → 用「文体楼包围盒」（由文体楼独有的 GF1/GF2
    多边形求出，含 padding）按质心归属拆分 L2 多边形；
  * 节点 / POI / 标签都有楼栋信息 → 按 building 字段精确归属；
  * 节点 floorIdx、POI.f 全部重算；edges 引用节点下标，无需改动。

在 data/build_data.py 末尾调用 apply()，使每次重新抽取自动生效；
也可对已生成的 data/map-data.json 直接运行本文件完成一次性迁移。
"""
import math

RENAME = {"GF1": "F2", "GF2": "F4"}   # 文体楼独有夹层 → 正式楼层


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
    if "F3" in F:            # 已迁移过，直接返回（幂等）
        return d

    # ---- 文体楼包围盒 ----
    x0, y0, x1, y1 = _bbox(F["GF1"]["polys"] + F["GF2"]["polys"])
    pad = 30
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
    def in_wt(x, y): return x0 <= x <= x1 and y0 <= y <= y1

    old_order = d["meta"]["floorOrder"]

    # L2 上属于文体楼的节点/POI/标签 → F3
    # 判据用「空间包围盒」为主（与多边形拆分一致），building 字段为辅
    # （build_data.py 的就近楼栋推断会把 LT-62 这类楼梯误标成行政楼，须按坐标兜底）
    def is_wt(x, y, building):
        return in_wt(x, y) or building == "文体楼"

    # ---- 拆分 L2：多边形按包围盒、标签按包围盒、节点/POI 按包围盒+楼栋 ----
    l2 = F["L2"]
    wt_polys = [p for p in l2["polys"] if in_wt(*_centroid(p))]
    keep_polys = [p for p in l2["polys"] if not in_wt(*_centroid(p))]
    wt_labels = [l for l in l2["labels"] if in_wt(l["x"], l["y"])]
    keep_labels = [l for l in l2["labels"] if not in_wt(l["x"], l["y"])]
    l2["polys"] = keep_polys
    l2["labels"] = keep_labels
    l2["bounds"] = _bounds(keep_polys, keep_labels)

    f3 = {
        "id": "F3", "name": "F3", "note": "",
        "level": l2["level"], "kind": "indoor",
        "bounds": _bounds(wt_polys, wt_labels),
        "polys": wt_polys, "labels": wt_labels,
    }

    # ---- 重命名 GF1/GF2（level 保持不变） ----
    for old, new in RENAME.items():
        F[old]["id"] = new
        F[old]["name"] = new
        F[old]["note"] = ""

    # ---- 重排 floors（原 GF2 之后插入 F3） ----
    new_floors = []
    for f in d["floors"]:
        new_floors.append(f)
        if f["id"] == "F4":
            new_floors.append(f3)
    d["floors"] = new_floors
    new_order = [f["id"] for f in new_floors]
    d["meta"]["floorOrder"] = new_order

    # ---- 节点 floorIdx 重算 ----
    for n in d["nodes"]:
        old_fid = old_order[n[2]]
        if old_fid in RENAME:
            n[2] = new_order.index(RENAME[old_fid])
        elif old_fid == "L2" and is_wt(n[0], n[1], n[5]):
            n[2] = new_order.index("F3")
        else:
            n[2] = new_order.index(old_fid)

    # ---- POI 楼层重算 ----
    for p in d["pois"]:
        if p["f"] in RENAME:
            p["f"] = RENAME[p["f"]]
        elif p["f"] == "L2" and is_wt(p["x"], p["y"], p.get("b")):
            p["f"] = "F3"

    return d


if __name__ == "__main__":
    import json, io, os
    path = os.path.join(os.path.dirname(__file__), "map-data.json")
    d = json.load(io.open(path, encoding="utf-8"))
    before = {f["id"]: len(f["polys"]) for f in d["floors"]}
    apply(d)
    after = {f["id"]: len(f["polys"]) for f in d["floors"]}
    io.open(path, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))
    print("文体楼楼层重映射完成")
    print("  L2 多边形:", before.get("L2"), "→", after.get("L2"))
    print("  F3(文体楼原L2):", after.get("F3"), " F2(原GF1):", after.get("F2"), " F4(原GF2):", after.get("F4"))
    print("  floorOrder:", d["meta"]["floorOrder"])
    print("  文体楼 F3 房间:", [p["n"] for p in d["pois"] if p["f"] == "F3"])
    print("  形体室所在楼层:", [p["f"] for p in d["pois"] if p["n"] == "形体室"])
