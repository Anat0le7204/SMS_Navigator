# -*- coding: utf-8 -*-
"""
校验 data/room.json 的格式，并检查房间能否在 data/map-data.json 中定位。

用法:
    python scripts/check_rooms.py

退出码:
    0  格式合法（存在无法定位的房间时仅提示，不影响退出码）
    1  格式或数据有错（字段缺失、分类非法、编号重复等）
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOM_JSON = os.path.join(ROOT, "data", "room.json")
MAP_JSON = os.path.join(ROOT, "data", "map-data.json")

CATEGORIES = ("教室", "功能室", "宿舍", "办公室")
FIELDS = ("room_number", "name", "category")
# 这些类型的 POI 与“房间”语义不符，编号命中时给出提示
ODD_TYPES = ("卫生间", "楼梯", "电梯")


def load(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    errors = []
    warns = []

    if not os.path.exists(ROOM_JSON):
        sys.exit("缺少 data/room.json")
    room = load(ROOM_JSON)

    if not isinstance(room, dict):
        sys.exit("room.json 顶层必须是对象")
    for key in ("date", "data"):
        if key not in room:
            errors.append("缺少顶层字段 %s" % key)
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(room.get("date", ""))):
        errors.append("date 不是 YYYY-MM-DD：%r" % room.get("date"))

    items = room.get("data")
    if not isinstance(items, list):
        sys.exit("data 必须是数组")

    seen = {}
    for i, r in enumerate(items):
        tag = "第 %d 条" % (i + 1)
        if not isinstance(r, dict):
            errors.append("%s 不是对象" % tag)
            continue
        extra = set(r.keys()) - set(FIELDS)
        missing = set(FIELDS) - set(r.keys())
        if extra:
            errors.append("%s 有多余字段 %s" % (tag, sorted(extra)))
        if missing:
            errors.append("%s 缺少字段 %s" % (tag, sorted(missing)))
        num = str(r.get("room_number", "")).strip()
        name = str(r.get("name", "")).strip()
        cat = str(r.get("category", "")).strip()
        if not num:
            errors.append("%s room_number 为空" % tag)
        if not name:
            errors.append("%s name 为空" % tag)
        if cat not in CATEGORIES:
            errors.append("%s category 非法：%r" % (tag, cat))
        if num:
            seen.setdefault(num, []).append(i + 1)

    for num, idx in seen.items():
        if len(idx) > 1:
            errors.append("编号 %s 重复（第 %s 条）" % (num, "、".join(map(str, idx))))

    # 与地图 POI 对照
    poi_by_no = {}
    if os.path.exists(MAP_JSON):
        for p in load(MAP_JSON).get("pois", []):
            poi_by_no.setdefault(str(p.get("n", "")).strip(), []).append(p)

    miss = []
    odd = []
    for r in items:
        num = str(r.get("room_number", "")).strip()
        hits = poi_by_no.get(num)
        if not hits:
            miss.append(r)
            continue
        if all(any(t in str(h.get("t", "")) for t in ODD_TYPES) for h in hits):
            odd.append((r, sorted({h.get("t", "") for h in hits})))

    cats = {}
    for r in items:
        cats[r.get("category", "")] = cats.get(r.get("category", ""), 0) + 1

    print("date: %s" % room.get("date"))
    print("条目: %d 条 | 分类: %s" % (len(items), " ".join("%s %d" % (k, v) for k, v in cats.items())))
    if os.path.exists(MAP_JSON):
        print("地图可定位: %d 条 | 无法定位: %d 条" % (len(items) - len(miss), len(miss)))

    if miss:
        print("\n[提示] 以下房间编号在 map-data.json 中不存在，搜索里不会出现：")
        for r in miss:
            print("  %-9s %s（%s）" % (r["room_number"], r["name"], r["category"]))
    if odd:
        print("\n[提示] 以下编号在地图中只有非房间类 POI，定位可能不准：")
        for r, ts in odd:
            print("  %-9s %s → %s" % (r["room_number"], r["name"], "/".join(ts)))

    if errors:
        print("\n[错误]")
        for e in errors:
            print("  - %s" % e)
        sys.exit(1)

    print("\n格式校验通过。")


if __name__ == "__main__":
    main()
