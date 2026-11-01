# -*- coding: utf-8 -*-
"""
深圳中学室内地图 -> 离线导航数据包
数据来源: https://www.onemap.top/szzxtest/ (cloudindoormap, pid=114, buildingID=117)

产出: data/map-data.json
坐标: 与官方楼层 SVG 一致 (viewBox 0 0 8000 8000), 10 单位 = 1 米 (SDK pixelPerMeter=10)
"""
import json
import math
import os
import re
import urllib.request
from collections import defaultdict

BASE = "https://openapi.onemap.top/ids"
PID = "114"
BID = "117"
RAW = os.path.join(os.path.dirname(__file__), "raw")
OUT = os.path.join(os.path.dirname(__file__), "map-data.json")
UNIT = 10.0  # 10 map units = 1 meter

os.makedirs(RAW, exist_ok=True)


def fetch(url, name, force=False):
    path = os.path.join(RAW, name)
    if os.path.exists(path) and not force:
        with open(path, "rb") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    with open(path, "wb") as f:
        f.write(data)
    return data


def load_json(url, name, force=False):
    return json.loads(fetch(url, name, force).decode("utf-8"))


print("1/4 下载楼层与区域元数据 ...")
areas_meta = load_json(f"{BASE}/map/getAreaInfoMulPro?pids=%5B{PID}%5D&lan=SC", "areas_meta.json")
building = areas_meta["v"][0]["areaList"][0]["Building"][0]
floor_meta = {f["Name"]: f for f in building["Floor"]}

print("2/4 下载 POI 与路网 ...")
points = load_json(f"{BASE}/map/getPointMulPro?pids=%5B{PID}%5D&lan=SC", "points.json")
floors_raw = points["v"][0]["Floor"]

print("3/4 下载每层矢量轮廓 ...")
floor_areas = {}
for f in building["Floor"]:
    fid = f["FloorID"]
    d = load_json(f"{BASE}/map/getAreaInfo?pid={PID}&lan=SC&buildingID={BID}&floorID={fid}", f"area_{fid}.json")
    floor_areas[f["Name"]] = d["v"][0]["Building"][0]["Floor"][0]

# ---------------------------------------------------------------- 楼层
# 垂直层级: B1=-1, L1=0, GF1=0.5, L2=1, GF2=1.5, L3=2 ... L15=14
LEVEL = {"B1": -1, "L1": 0, "GF1": 0.5, "L2": 1, "GF2": 1.5, "ground": 0}
for i in range(3, 16):
    LEVEL[f"L{i}"] = i - 1

FLOOR_LABEL = {"ground": "室外", "GF1": "GF1", "GF2": "GF2"}
FLOOR_NOTE = {"ground": "校园室外", "GF1": "夹层", "GF2": "夹层", "B1": "地下车库"}

# 显示顺序（从高到低，室外在 L1 与 B1 之间）
FLOOR_ORDER = [f"L{i}" for i in range(15, 2, -1)] + ["GF2", "L2", "GF1", "L1", "ground", "B1"]

# ---------------------------------------------------------------- 多边形类型
TYPE_COLORS = {
    "工位": ("room", "#E9F1FB", "#C7D8EC"),
    "楼梯": ("stair", "#E4E7EB", "#C9CED6"),
    "直梯": ("lift", "#E4E7EB", "#C9CED6"),
    "洗手间": ("wc", "#DDEDEA", "#BFD8D3"),
    "男卫生间": ("wc", "#DDEDEA", "#BFD8D3"),
    "女卫生间": ("wc", "#DDEDEA", "#BFD8D3"),
    "机房": ("mech", "#EDEEF0", "#D6D8DC"),
    "中庭轮廓": ("atrium", "#F6EFE7", "#E4D6C6"),
    "中庭地面": ("atrium", "#F6EFE7", "#E4D6C6"),
    "室内地面": ("indoor", "#FFFFFF", "#E2E6EB"),
    "建筑轮廓": ("outline", "#E2E4E6", "#C4C8CE"),
    "建筑立面": ("outline", "#E2E4E6", "#C4C8CE"),
    "室外道路": ("road", "#F4F5F6", "#E4E6E9"),
    "室外道路轮廓": ("road", "#F4F5F6", "#E4E6E9"),
    "室外路名": ("roadlabel", "none", "none"),
    "草皮": ("grass", "#DFEFD6", "#CBE3BE"),
    "草地": ("grass", "#DFEFD6", "#CBE3BE"),
    "河流": ("water", "#D6ECF2", "#B9DCE7"),
    "接入点": ("other", "#EFEFEF", "#DDDDDD"),
    "其他": ("other", "#EFEFEF", "#DDDDDD"),
    "虚线": ("dash", "none", "none"),
    "您在此": ("other", "#EFEFEF", "#DDDDDD"),
}


def poly_points(s):
    out = []
    for seg in s.split("|"):
        seg = seg.strip()
        if not seg or "," not in seg:
            continue
        x, y = seg.split(",")[:2]
        out.append(round(float(x), 1))
        out.append(round(float(y), 1))
    return out


def centroid(pts):
    xs = pts[0::2]
    ys = pts[1::2]
    return sum(xs) / len(xs), sum(ys) / len(ys)


# ---------------------------------------------------------------- 节点 / 边
nodes = {}
floor_nodes = defaultdict(list)
for fl in floors_raw:
    fname = fl["Name"]
    for p in fl["Point"]:
        nid = p["PointID"]
        nodes[nid] = {
            "id": nid,
            "floor": fname,
            "x": round(float(p["X"]), 1),
            "y": round(float(p["Y"]), 1),
            "code": (p["Code"] or "").strip(),
            "name": (p["Name"] or "").strip(),
            "path": p.get("Path") or [],
        }
        floor_nodes[fname].append(nid)

edges = []
adj = defaultdict(set)
seen = set()
for n in nodes.values():
    for e in n["path"]:
        t = e.get("ID")
        if t not in nodes:
            continue
        key = tuple(sorted((n["id"], t)))
        if key in seen:
            continue
        seen.add(key)
        a, b = nodes[n["id"]], nodes[t]
        d = math.dist((a["x"], a["y"]), (b["x"], b["y"])) / UNIT
        if a["floor"] == b["floor"]:
            edges.append((n["id"], t, round(d, 2), "walk"))
            adj[n["id"]].add(t)
            adj[t].add(n["id"])

print(f"   同层边: {len(edges)}")

# ---------------------------------------------------------------- 垂直连接
# 同名楼梯/电梯 + 坐标重合(<1m) 视为同一垂直通道的不同楼层节点
vert_groups = defaultdict(list)
for n in nodes.values():
    if n["code"] in ("stair", "lifts") and n["name"]:
        vert_groups[(n["code"], n["name"])].append(n)

vert_edges = []
for (code, name), group in vert_groups.items():
    # 同一楼层可能有重复节点，按楼层去重（取坐标中位数最近者）
    by_floor = defaultdict(list)
    for n in group:
        by_floor[n["floor"]].append(n)
    picked = []
    for fname, lst in by_floor.items():
        mx = sorted(n["x"] for n in lst)[len(lst) // 2]
        my = sorted(n["y"] for n in lst)[len(lst) // 2]
        picked.append(min(lst, key=lambda n: (n["x"] - mx) ** 2 + (n["y"] - my) ** 2))
    picked.sort(key=lambda n: LEVEL.get(n["floor"], 99))
    for a, b in zip(picked, picked[1:]):
        if math.dist((a["x"], a["y"]), (b["x"], b["y"])) > 120:
            continue
        step = abs(LEVEL.get(a["floor"], 0) - LEVEL.get(b["floor"], 0))
        if step < 0.25:
            continue
        w = round((9.0 if code == "stair" else 6.0) * step, 2)
        vert_edges.append((a["id"], b["id"], w, "stair" if code == "stair" else "lift"))
        adj[a["id"]].add(b["id"])
        adj[b["id"]].add(a["id"])

edges.extend(vert_edges)
print(f"   垂直边: {len(vert_edges)}")

# ---------------------------------------------------------------- 室外入口接入
# 室外 POI 就近接入 L1 步行网络 (L1 即校园地面层)
outdoor_edges = []
l1_all = [nodes[i] for i in floor_nodes["L1"]]
# L1 内部最大连通分量（校园地面步行主网络）
l1_seen = set()
l1_groups = []
for n in l1_all:
    if n["id"] in l1_seen:
        continue
    stack = [n["id"]]
    l1_seen.add(n["id"])
    grp = []
    while stack:
        cur = stack.pop()
        grp.append(nodes[cur])
        for nb in adj[cur]:
            if nodes[nb]["floor"] == "L1" and nb not in l1_seen:
                l1_seen.add(nb)
                stack.append(nb)
    l1_groups.append(grp)
l1_main = max(l1_groups, key=len)
print(f"   L1 主步行网络节点: {len(l1_main)} / {len(l1_all)}")

ground_named = [nodes[i] for i in floor_nodes["ground"] if nodes[i]["name"]]
for g in ground_named:
    if g["name"] == "111" or g["code"] == "gate":
        continue
    best = min(l1_main, key=lambda n: math.dist((g["x"], g["y"]), (n["x"], n["y"])))
    d = math.dist((g["x"], g["y"]), (best["x"], best["y"])) / UNIT
    if d <= 50:
        w = round(d + 2.0, 2)
        outdoor_edges.append((g["id"], best["id"], w, "entry"))
        adj[g["id"]].add(best["id"])
        adj[best["id"]].add(g["id"])
edges.extend(outdoor_edges)
print(f"   室外接入边: {len(outdoor_edges)}")

# ---------------------------------------------------------------- 连通分量
comp = {}
cid = 0
for nid in nodes:
    if nid in comp:
        continue
    stack = [nid]
    comp[nid] = cid
    size = 0
    while stack:
        cur = stack.pop()
        size += 1
        for nb in adj[cur]:
            if nb not in comp:
                comp[nb] = cid
                stack.append(nb)
    cid += 1
comp_size = defaultdict(int)
for nid, c in comp.items():
    comp_size[c] += 1
main_comp = max(comp_size, key=comp_size.get)
print(f"   分量数: {len(comp_size)}  主分量节点: {comp_size[main_comp]} / {len(nodes)}")

# ---------------------------------------------------------------- 断点补丁
# 少数楼栋（如 J 栋）在 L1 没有建模入口，但其低层楼梯距离 L1 步行网络很近。
# 对"含房间但不可达"的分量，补一条入口连接（室外/门厅），保证可达。
patches = []
room_comps = defaultdict(list)
for n in nodes.values():
    if n["code"] == "workstationaction" and n["name"]:
        room_comps[comp[n["id"]]].append(n)
for c, rooms in room_comps.items():
    if c == main_comp:
        continue
    above = [nodes[i] for i in nodes if comp[i] == c and nodes[i]["code"] == "stair" and LEVEL.get(nodes[i]["floor"], 99) >= 0]
    if not above:
        above = [nodes[i] for i in nodes if comp[i] == c and nodes[i]["code"] == "lifts" and LEVEL.get(nodes[i]["floor"], 99) >= 0]
    cand = above or rooms
    cand.sort(key=lambda n: LEVEL.get(n["floor"], 99))
    src = cand[0]
    best = min(l1_main, key=lambda n: math.dist((src["x"], src["y"]), (n["x"], n["y"])))
    d = math.dist((src["x"], src["y"]), (best["x"], best["y"])) / UNIT
    if d <= 60:
        w = round(d + 3.0, 2)
        edges.append((src["id"], best["id"], w, "entry"))
        adj[src["id"]].add(best["id"])
        adj[best["id"]].add(src["id"])
        patches.append((src["name"], src["floor"], best["floor"], round(d, 1), len(rooms)))
print(f"   可达性补丁: {len(patches)} {patches}")

if patches:
    comp = {}
    for nid in nodes:
        if nid in comp:
            continue
        stack = [nid]
        comp[nid] = nid
        while stack:
            cur = stack.pop()
            for nb in adj[cur]:
                if nb not in comp:
                    comp[nb] = nid
                    stack.append(nb)
    comp_size = defaultdict(int)
    for nid, c in comp.items():
        comp_size[c] += 1
    main_comp = max(comp_size, key=comp_size.get)
    print(f"   补丁后主分量: {comp_size[main_comp]} / {len(nodes)}")

# ---------------------------------------------------------------- 楼栋归属
BUILDING_BY_PREFIX = {
    "A": "教学楼", "B": "教学楼", "C": "教学楼", "D": "教学楼", "E": "教学楼",
    "I": "宿舍 I 栋", "J": "宿舍 J 栋", "K": "宿舍 K 栋", "L": "宿舍 L 栋",
}
GROUND_LABELS = {
    "教学楼": (4035.5, 5644.3),
    "行政楼": (2634.9, 5472.9),
    "文体楼": (1805.4, 6208.0),
    "steam": (4026.6, 3322.6),
    "一号宿舍楼": (4215.7, 2322.1),
    "二号宿舍楼": (5081.2, 2979.9),
    "三号宿舍楼": (6059.8, 3432.3),
    "四号宿舍楼": (6571.8, 4112.1),
}


def building_of(n):
    name = n["name"]
    if n["floor"] in ("GF1", "GF2"):
        return "文体楼"
    m = re.match(r"^([A-Za-z])\s*\d", name)
    if m and m.group(1).upper() in BUILDING_BY_PREFIX:
        return BUILDING_BY_PREFIX[m.group(1).upper()]
    if name:
        best, bd = None, 1e9
        for k, (bx, by) in GROUND_LABELS.items():
            d = math.dist((n["x"], n["y"]), (bx, by))
            if d < bd:
                best, bd = k, d
        if bd < 450:
            if best in ("一号宿舍楼", "二号宿舍楼", "三号宿舍楼", "四号宿舍楼"):
                return best.replace("号宿舍楼", "号宿舍楼")
            return best
    return ""


# 房间先定楼栋，走廊等就近继承
for n in nodes.values():
    n["building"] = building_of(n)

for fname, ids in floor_nodes.items():
    named = [nodes[i] for i in ids if nodes[i]["building"]]
    for i in ids:
        n = nodes[i]
        if n["building"]:
            continue
        if named:
            best = min(named, key=lambda m: math.dist((n["x"], n["y"]), (m["x"], m["y"])))
            d = math.dist((n["x"], n["y"]), (best["x"], best["y"])) / UNIT
            n["building"] = best["building"] if d < 40 else ""
        if not n["building"]:
            if fname == "ground":
                n["building"] = "室外"
            elif fname == "L1":
                n["building"] = "校园地面"
            else:
                n["building"] = ""

# ---------------------------------------------------------------- 楼层几何
floor_list = []
for fname in FLOOR_ORDER:
    if fname not in floor_areas:
        continue
    src = floor_areas[fname]
    polys = []
    labels = []
    xs = []
    ys = []
    for a in src["Area"]:
        tname = a.get("AreaTypeName")
        code, fill, stroke = TYPE_COLORS.get(tname, ("other", "#EFEFEF", "#DDDDDD"))
        pts = poly_points(a.get("Area") or "")
        if len(pts) < 6:
            continue
        simple = {"t": code, "p": pts}
        nm = (a.get("Name") or "").strip()
        if nm:
            simple["n"] = nm
        polys.append(simple)
        xs.extend(pts[0::2])
        ys.extend(pts[1::2])
    # 房间标签取点数据（位置更准，且包含功能室中文名）
    for nid in floor_nodes[fname]:
        n = nodes[nid]
        if n["name"] and n["code"] in ("workstationaction", "stair", "lifts", "roadmark", "gate"):
            labels.append({"n": n["name"], "x": n["x"], "y": n["y"], "c": n["code"]})
    if not xs:
        xs = [n["x"] for n in nodes.values() if n["floor"] == fname] or [0]
        ys = [n["y"] for n in nodes.values() if n["floor"] == fname] or [0]
    pad = 40
    bounds = [round(min(xs) - pad, 1), round(min(ys) - pad, 1), round(max(xs) + pad, 1), round(max(ys) + pad, 1)]
    floor_list.append({
        "id": fname,
        "name": FLOOR_LABEL.get(fname, fname),
        "note": FLOOR_NOTE.get(fname, ""),
        "level": LEVEL.get(fname, 0),
        "kind": "outdoor" if fname == "ground" else "indoor",
        "bounds": bounds,
        "polys": polys,
        "labels": labels,
    })

# ---------------------------------------------------------------- 搜索索引
TYPE_LABEL = {
    "workstationaction": "教室 / 功能室",
    "stair": "楼梯",
    "lifts": "电梯",
    "toilets": "卫生间",
    "male toilets": "男卫生间",
    "female toilets": "女卫生间",
    "roadmark": "室外地点",
    "gate": "出入口",
}
pois = []
for n in nodes.values():
    if comp.get(n["id"]) != main_comp:
        continue
    if not n["name"]:
        continue
    label = TYPE_LABEL.get(n["code"])
    if not label:
        continue
    if n["name"] == "steam":
        n["name"] = "STEAM 中心"
    pois.append({
        "id": n["id"],
        "n": n["name"],
        "f": n["floor"],
        "x": n["x"],
        "y": n["y"],
        "t": label,
        "b": n["building"],
    })
pois.sort(key=lambda p: (p["f"], p["n"]))

# ---------------------------------------------------------------- 输出
node_index = {nid: i for i, nid in enumerate(nodes)}
for p in pois:
    p["i"] = node_index[p["id"]]
out_nodes = []
for n in nodes.values():
    out_nodes.append([n["x"], n["y"], FLOOR_ORDER.index(n["floor"]) if n["floor"] in FLOOR_ORDER else 0,
                      n["code"], n["name"], n["building"]])
out_edges = []
for a, b, w, k in edges:
    out_edges.append([node_index[a], node_index[b], w, {"walk": 0, "stair": 1, "lift": 2, "entry": 3}[k]])

# ---------------------------------------------------------------- 文体楼楼层统一编码
# 把文体楼 GF1（2 层）→L2、原 L2 文体楼部分（3 层）→L3、GF2（4 层）→L4，
# 与全校区 L 编码合并显示；垂直边权重按新层级差重算。详见 docs/DATA.md。


def _wenti_bbox(polys):
    xs = [p["p"][i] for p in polys for i in range(0, len(p["p"]), 2)]
    ys = [p["p"][i] for p in polys for i in range(1, len(p["p"]), 2)]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)


def _wenti_centroid(p):
    pts = p["p"]
    return (sum(pts[0::2]) / len(pts[0::2]), sum(pts[1::2]) / len(pts[1::2]))


def _wenti_bounds(polys, labels):
    xs = [p["p"][i] for p in polys for i in range(0, len(p["p"]), 2)]
    ys = [p["p"][i] for p in polys for i in range(1, len(p["p"]), 2)]
    xs += [l["x"] for l in labels]
    ys += [l["y"] for l in labels]
    if not xs:
        return [0, 0, 0, 0]
    pad = 40
    return [round(min(xs) - pad, 1), round(min(ys) - pad, 1),
            round(max(xs) + pad, 1), round(max(ys) + pad, 1)]


def merge_wenti_floors(d):
    """GF1/L2/GF2 → L2/L3/L4 合并（幂等：已合并则原样返回）。"""
    F = {f["id"]: f for f in d["floors"]}
    if "GF1" not in F or "GF2" not in F:
        return d
    old_order = d["meta"]["floorOrder"]
    x0, y0, x1, y1 = _wenti_bbox(F["GF1"]["polys"] + F["GF2"]["polys"])
    pad = 30
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad

    def in_wt(x, y): return x0 <= x <= x1 and y0 <= y <= y1
    def is_wt(x, y, bld): return in_wt(x, y) or bld == "文体楼"

    # 拆分共用 L2：文体楼部分（→L3）与教学楼等部分（留在 L2）
    l2 = F["L2"]
    wt_polys = [p for p in l2["polys"] if in_wt(*_wenti_centroid(p))]
    keep_polys = [p for p in l2["polys"] if not in_wt(*_wenti_centroid(p))]
    wt_labels = [l for l in l2["labels"] if in_wt(l["x"], l["y"])]
    keep_labels = [l for l in l2["labels"] if not in_wt(l["x"], l["y"])]

    l2["polys"] = keep_polys + F["GF1"]["polys"]
    l2["labels"] = keep_labels + F["GF1"]["labels"]
    l2["bounds"] = _wenti_bounds(l2["polys"], l2["labels"])

    l3 = F["L3"]
    l3["polys"] = l3["polys"] + wt_polys
    l3["labels"] = l3["labels"] + wt_labels
    l3["bounds"] = _wenti_bounds(l3["polys"], l3["labels"])

    l4 = F["L4"]
    l4["polys"] = l4["polys"] + F["GF2"]["polys"]
    l4["labels"] = l4["labels"] + F["GF2"]["labels"]
    l4["bounds"] = _wenti_bounds(l4["polys"], l4["labels"])

    d["floors"] = [f for f in d["floors"] if f["id"] not in ("GF1", "GF2")]
    new_order = [f["id"] for f in d["floors"]]
    d["meta"]["floorOrder"] = new_order

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

    for p in d["pois"]:
        if p["f"] == "GF1":
            p["f"] = "L2"
        elif p["f"] == "GF2":
            p["f"] = "L4"
        elif p["f"] == "L2" and is_wt(p["x"], p["y"], p.get("b")):
            p["f"] = "L3"

    levels = {f["id"]: f["level"] for f in d["floors"]}
    for e in d["edges"]:
        a, b, w, k = e
        if k in (1, 2):
            la = levels[new_order[d["nodes"][a][2]]]
            lb = levels[new_order[d["nodes"][b][2]]]
            e[2] = round((9.0 if k == 1 else 6.0) * abs(la - lb), 2)
    return d


data = {
    "meta": {
        "name": "深圳中学",
        "source": "https://www.onemap.top/szzxtest/",
        "unitPerMeter": UNIT,
        "floorOrder": [f["id"] for f in floor_list],
        "mainComponent": main_comp,
    },
    "floors": floor_list,
    "nodes": out_nodes,
    "edges": out_edges,
    "pois": pois,
}

# 文体楼楼层统一编码：GF1/L2/GF2 并入 L2/L3/L4（逻辑已内联在上方 merge_wenti_floors）
data = merge_wenti_floors(data)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

size = os.path.getsize(OUT) / 1024 / 1024
print(f"4/4 输出 {OUT}  {size:.2f} MB")
print(f"   楼层 {len(floor_list)} / 节点 {len(out_nodes)} / 边 {len(out_edges)} / POI {len(pois)}")
print(f"   可路由 POI: {len(pois)}")
unreach = [n for n in nodes.values() if n["name"] and comp.get(n["id"]) != main_comp]
print(f"   不可达命名点: {len(unreach)}", [u["name"] for u in unreach[:8]])
