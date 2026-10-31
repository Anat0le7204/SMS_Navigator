/* ============================== 班级 ↔ 教室映射 ==============================
 * 映射来自独立配置 config/classroom-map.json（构建时内联为 window.CLASSROOM_MAP）。
 * 每年班级/教室变动时只改配置文件，无需改动业务代码。
 */
const CLASSROOM_MAP = window.CLASSROOM_MAP || { version: "0", classes: [] };

// 班级名规范化：小写、去空格与括号，便于「高一(1)班 / 高一1班」都能命中
function normClassKey(s){
  return String(s || "").toLowerCase().replace(/[\s()（）\[\]【】]/g, "");
}

const CLASS_ENTRIES = (CLASSROOM_MAP.classes || []).map(c => ({
  cls: c.class,
  room: c.classroom,
  grade: c.grade || "",
  key: normClassKey(c.class)
})).filter(c => c.cls && c.room);

// 教室编号 → 班级（反查，用于在搜索结果里显示班级）
const CLASS_BY_ROOM = new Map();
for(const c of CLASS_ENTRIES){
  if(!CLASS_BY_ROOM.has(c.room)) CLASS_BY_ROOM.set(c.room, []);
  CLASS_BY_ROOM.get(c.room).push(c.cls);
}

// 教室编号 → POI（多个同名 POI 时取第一个）
const POI_BY_NAME = new Map();
for(const p of POIS){
  if(!POI_BY_NAME.has(p.n)) POI_BY_NAME.set(p.n, p);
}

// 查询命中班级时，返回对应教室 POI（带 className 供界面显示）
function matchClassPois(q, limit=6){
  const qc = normClassKey(q);
  if(!qc) return [];
  const out = [];
  for(const c of CLASS_ENTRIES){
    let score = -1;
    if(c.key === qc) score = 100;
    else if(c.key.startsWith(qc)) score = 80;
    else if(c.key.includes(qc)) score = 60;
    else if(qc.length >= 2 && qc.split("").every(ch => c.key.includes(ch))) score = 40;
    if(score < 0) continue;
    const poi = POI_BY_NAME.get(c.room);
    if(!poi) continue;
    out.push({ score, poi: Object.assign({}, poi, { className: c.cls }) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function classForRoom(roomName){
  const list = CLASS_BY_ROOM.get(roomName);
  return list && list.length ? list[0] : "";
}
