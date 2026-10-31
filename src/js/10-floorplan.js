/* ============================== 楼层渲染 ============================== */
const TYPE_STYLE = {
  room:{fill:"#E4EFFC",stroke:"#B9CFE9"},
  stair:{fill:"#DEE3E9",stroke:"#B6BEC8"},
  lift:{fill:"#DEE3E9",stroke:"#B6BEC8"},
  wc:{fill:"#D5E9E5",stroke:"#B7D3CD"},
  mech:{fill:"#EEF0F2",stroke:"#D8DCE1"},
  atrium:{fill:"#F7F0E8",stroke:"#E5D8C9"},
  indoor:{fill:"#F6F8FB",stroke:"#DDE4EC"},
  outline:{fill:"#E7EAED",stroke:"#B3BAC4"},
  road:{fill:"#F4F6F7",stroke:"#E6E9EC"},
  grass:{fill:"#DFEFD6",stroke:"#CBE3BE"},
  water:{fill:"#D6ECF2",stroke:"#B9DCE7"},
  other:{fill:"#EFEFEF",stroke:"#DDDDDD"},
  dash:{fill:"none",stroke:"#D9DEE4"},
  roadlabel:{fill:"none",stroke:"none"}
};
const DRAW_ORDER = ["road","grass","water","other","outline","indoor","atrium","room","wc","mech","stair","lift","dash","roadlabel"];
const ORDER_IDX = new Map(DRAW_ORDER.map((t,i)=>[t,i]));

const floorCache = new Map();

function polyD(pts){
  let d = "M" + pts[0] + " " + pts[1];
  for(let i=2;i<pts.length;i+=2) d += "L" + pts[i] + " " + pts[i+1];
  return d + "Z";
}

const GROUND_CTX = new Set(["road","grass","water","outline"]);
function buildFloor(id){
  const f = FLOOR_BY_ID.get(id);
  if(!f) return "";
  let base = f.polys;
  if(id === "L1"){
    const gf = FLOOR_BY_ID.get("ground");
    if(gf) base = gf.polys.filter(p=>GROUND_CTX.has(p.t)).concat(f.polys);
  }
  const polys = base.slice().sort((a,b)=>(ORDER_IDX.get(a.t)??9)-(ORDER_IDX.get(b.t)??9));
  const b = f.bounds;
  let out = `<rect x="${b[0]}" y="${b[1]}" width="${b[2]-b[0]}" height="${b[3]-b[1]}" fill="#FBFCFD"/>`;
  for(const p of polys){
    const st = TYPE_STYLE[p.t] || TYPE_STYLE.other;
    if(p.t === "roadlabel") continue;
    const nameAttr = p.n ? ` data-n="${esc(p.n)}"` : "";
    out += `<path d="${polyD(p.p)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="0.9" stroke-linejoin="round"${nameAttr}/>`;
  }
  // 楼栋轮廓再描一次，增强边界
  for(const p of polys){
    if(p.t !== "outline") continue;
    out += `<path d="${polyD(p.p)}" fill="none" stroke="#AEB5BE" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  // 标签
  let labels = "";
  const SITE_KEEP = new Set(["教学楼","行政楼","文体楼","steam","一号宿舍楼","二号宿舍楼","三号宿舍楼","四号宿舍楼","校园人行主入口","南门","东门","门卫1","门卫2"]);
  let labelSrc = f.labels;
  if(id === "L1"){
    const gf = FLOOR_BY_ID.get("ground");
    if(gf) labelSrc = f.labels.concat(gf.labels.filter(l=>l.c === "roadmark" && SITE_KEEP.has(l.n)));
  }
  labelSrc = labelSrc.filter(l=> (l.c === "roadmark" || l.c === "gate") ? SITE_KEEP.has(l.n) : true);
  for(const l of labelSrc){
    if(!l.n) continue;
    const isRoom = l.c === "workstationaction";
    const isCirculation = l.c === "stair" || l.c === "lifts";
    const isOutdoor = l.c === "roadmark" || l.c === "gate";
    const cls = isRoom ? "lb-room" : isCirculation ? "lb-circ" : isOutdoor ? "lb-site" : "lb-room";
    const disp = l.n === "steam" ? "STEAM 中心" : l.n;
    labels += `<text class="${cls}" x="${l.x}" y="${l.y}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round">${esc(disp)}</text>`;
  }
  out += `<g id="labels">${labels}</g>`;
  return out;
}

function renderFloor(){
  const id = state.floor;
  if(!floorCache.has(id)) floorCache.set(id, buildFloor(id));
  floorLayer.innerHTML = floorCache.get(id);
  lastLabelScale = -1;
  updateLabelStyle();
}

let lastLabelScale = -1;
function updateLabelStyle(){
  const s = state.view.s;
  const g = floorLayer.querySelector("#labels");
  if(!g) return;
  const base = containerSize().w < 980 ? 9.5 : 11;
  const fs = base / s;
  if(lastLabelScale > 0 && Math.abs(s-lastLabelScale)/s < 0.002) return;
  lastLabelScale = s;
  // 字体族只需在真正重排标签时写一次；每帧写会反复使整个文本层失效
  g.setAttribute("font-family", "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif");
  const rooms = [...g.querySelectorAll(".lb-room")];
  const circs = [...g.querySelectorAll(".lb-circ")];
  const outs = [...g.querySelectorAll(".lb-out")];
  rooms.forEach(t=>{ t.setAttribute("font-size", fs.toFixed(2)); t.setAttribute("fill", "#56616f"); });
  circs.forEach(t=>{ t.setAttribute("font-size", (fs*0.9).toFixed(2)); t.setAttribute("fill", "#6f7885"); });
  outs.forEach(t=>{ t.setAttribute("font-size", (fs*1.05).toFixed(2)); t.setAttribute("fill", "#7c8694"); t.setAttribute("letter-spacing","0.4"); });
  g.querySelectorAll(".lb-site").forEach(t=>{ t.setAttribute("font-size", (fs*1.15).toFixed(2)); t.setAttribute("fill", "#5d6876"); t.setAttribute("font-weight","600"); t.setAttribute("letter-spacing","1.2"); });
  layoutLabels(fs);
}

function textWidth(txt, fs){
  let w = 0;
  for(const ch of txt){
    w += /[\u3400-\u9fff]/.test(ch) ? fs : fs*0.56;
  }
  return w + fs*0.35;
}

let visibleLabels = [];

function layoutLabels(fs){
  const g = floorLayer.querySelector("#labels");
  if(!g) return;
  visibleLabels = [];
  const items = [];
  g.querySelectorAll("text").forEach(t=>{
    const cls = t.getAttribute("class");
    const txt = (t.textContent || "").trim();
    const isBld = /[楼]|steam/i.test(txt);
    const pri = cls === "lb-site" ? (isBld ? 5 : 4) : cls === "lb-circ" ? 3 : cls === "lb-out" ? 1 : 2;
    if(!txt) { t.style.display = "none"; return; }
    items.push({t, pri, txt, x:+t.getAttribute("x"), y:+t.getAttribute("y")});
  });
  items.sort((a,b)=> b.pri - a.pri || b.txt.length - a.txt.length);
  const placed = [];
  const cell = fs*2.2;
  const grid = new Map();
  const key = (cx,cy)=>cx+","+cy;
  for(const it of items){
    const w = textWidth(it.txt, fs) + fs*0.35;
    const h = fs*1.12;
    const r = [it.x-w/2, it.y-h/2, it.x+w/2, it.y+h/2];
    const cx0 = Math.floor(r[0]/cell), cx1 = Math.floor(r[2]/cell);
    const cy0 = Math.floor(r[1]/cell), cy1 = Math.floor(r[3]/cell);
    let hit = false;
    for(let cx=cx0; cx<=cx1 && !hit; cx++){
      for(let cy=cy0; cy<=cy1; cy++){
        const arr = grid.get(key(cx,cy));
        if(!arr) continue;
        for(const q of arr){
          if(r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]){ hit = true; break; }
        }
        if(hit) break;
      }
    }
    if(hit){ it.t.style.display = "none"; }
    else {
      it.t.style.display = "";
      visibleLabels.push(it.t);
      placed.push(r);
      for(let cx=cx0; cx<=cx1; cx++) for(let cy=cy0; cy<=cy1; cy++){
        const k = key(cx,cy);
        if(!grid.has(k)) grid.set(k, []);
        grid.get(k).push(r);
      }
    }
  }
  updateLabelRotation(true);
}

// 地图旋转时让文字保持正立：每个标签绕自身锚点反向旋转
// 只有角度真正变化时才写 DOM，避免每帧重写几百个文本节点
let lastLabelRot = NaN;
function updateLabelRotation(force){
  const deg = -compassRotationDeg();
  if(!force && Math.abs(deg - lastLabelRot) < 0.02) return;
  lastLabelRot = deg;
  for(const t of visibleLabels){
    if(Math.abs(deg) < 0.05){
      t.removeAttribute("transform");
    } else {
      t.setAttribute("transform", `rotate(${deg.toFixed(2)} ${t.getAttribute("x")} ${t.getAttribute("y")})`);
    }
  }
}
