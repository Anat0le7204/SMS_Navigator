/* ============================== 房间目录 ==============================
 * 目录来自独立配置 data/room.json（构建时内联为 window.ROOM_DATA）。
 * 结构：{ date: "YYYY-MM-DD", data: [{ room_number, name, category }] }
 *   - room_number：房间编号，对应 map-data.json 中 POI 的 n 字段（如 D202、A101）
 *   - name：房间名称，可按名称搜索（如「高一(1)班教室」）
 *   - category：教室 / 功能室 / 宿舍 / 办公室
 * 房间变动时只改配置文件，无需改动业务代码。
 */
const ROOM_DATA = window.ROOM_DATA || { date: "", data: [] };
const ROOM_CATEGORIES = ["教室", "功能室", "宿舍", "办公室"];

// 名称/编号规范化：小写、去空格与括号分隔符，便于「高一(1)班 / 高一1班」都能命中
function normRoomKey(s){
  return String(s || "").toLowerCase().replace(/[\s()（）\[\]【】·・、,，.。_\-\/\\]+/g, "");
}

const ROOM_ENTRIES = (ROOM_DATA.data || []).map(r => {
  const num = String(r.room_number || "").trim();
  const name = String(r.name || "").trim() || num;
  const raw = String(r.category || "").trim();
  return {
    num,
    name,
    category: ROOM_CATEGORIES.indexOf(raw) >= 0 ? raw : "教室",
    key: normRoomKey(name),
    numKey: normRoomKey(num)
  };
}).filter(r => r.num && r.name);

// 房间编号 → 目录条目（地图标签按编号取名称）
const ROOM_BY_NO = new Map();
for(const r of ROOM_ENTRIES){
  if(!ROOM_BY_NO.has(r.num)) ROOM_BY_NO.set(r.num, r);
}

// 房间编号 → POI（编号可能与卫生间等重名，优先取教室类）
const POI_BY_ROOM_NO = new Map();
for(const p of POIS){
  const cur = POI_BY_ROOM_NO.get(p.n);
  if(!cur || (!cur.t.includes("教室") && p.t.includes("教室"))) POI_BY_ROOM_NO.set(p.n, p);
}

// 查询命中房间目录时，返回对应 POI（带 roomName / roomCategory 供界面显示）
function matchRoomPois(q, limit=6){
  const qc = normRoomKey(q);
  if(!qc) return [];
  const out = [];
  for(const r of ROOM_ENTRIES){
    let score = -1;
    if(r.key === qc || r.numKey === qc) score = 100;
    else if(r.key.startsWith(qc) || r.numKey.startsWith(qc)) score = 80;
    else if(r.key.includes(qc) || r.numKey.includes(qc)) score = 60;
    else if(qc.length >= 2 && qc.split("").every(ch => r.key.includes(ch))) score = 40;
    if(score < 0) continue;
    const poi = POI_BY_ROOM_NO.get(r.num);
    if(!poi) continue;
    out.push({ score, poi: Object.assign({}, poi, { roomName: r.name, roomCategory: r.category }) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// 目录中存在、但地图上没有对应 POI 的房间：只用于搜索提示，不能导航
function matchUnmappedRooms(q, limit=3){
  const qc = normRoomKey(q);
  if(!qc) return [];
  const out = [];
  for(const r of ROOM_ENTRIES){
    if(POI_BY_ROOM_NO.has(r.num)) continue;
    let score = -1;
    if(r.key === qc || r.numKey === qc) score = 100;
    else if(r.key.startsWith(qc) || r.numKey.startsWith(qc)) score = 80;
    else if(r.key.includes(qc) || r.numKey.includes(qc)) score = 60;
    if(score < 0) continue;
    out.push({ score, room: r });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(x => x.room);
}

// 房间编号 → 目录条目（用于按编号反查名称与分类）
function roomInfo(roomNumber){
  return ROOM_BY_NO.get(String(roomNumber || "").trim()) || null;
}
