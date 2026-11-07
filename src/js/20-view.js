/* ============================== 视图变换 ============================== */
// 旋转动画期间每帧都会调用 applyView；避免重复 getBoundingClientRect 造成强制重排
let vpCache = {w:0, h:0};
function containerSize(){
  if(!vpCache.w){
    const r = mapEl.getBoundingClientRect();
    vpCache = {w:r.width, h:r.height};
  }
  return vpCache;
}
function invalidateViewport(){ vpCache = {w:0, h:0}; }

let lastWorldTr = "";
function applyView(){
  const {x,y,s} = state.view;
  const {w,h} = containerSize();
  const ax = state.view.ax == null ? w/2 : state.view.ax;
  const ay = state.view.ay == null ? h/2 : state.view.ay;
  const rot = compassRotationDeg();
  const tr = Math.abs(rot) < 0.01
    ? `translate(${x} ${y}) scale(${s})`
    : `translate(${ax} ${ay}) rotate(${rot}) translate(${-ax} ${-ay}) translate(${x} ${y}) scale(${s})`;
  if(tr !== lastWorldTr){
    world.setAttribute("transform", tr);
    lastWorldTr = tr;
  }
  updateLabelStyle();
  updateLabelRotation();
  updateMarkersScale();
  updateScaleBar();
}

function fitBounds(b, padding=54, maxScale=8, insets=null){
  const {w,h} = containerSize();
  const mobile = w < 980;
  let L,R,T,B;
  if(insets){ ({L,R,T,B} = insets); }
  else if(state.nav.active){ L = 30; R = 30; T = mobile ? 140 : 150; B = mobile ? 255 : 245; }
  else if(state.preview.open && typeof previewInsets === "function"){ ({L,R,T,B} = previewInsets()); }
  else { L = mobile ? 16 : 76; R = mobile ? 16 : 34; T = mobile ? 112 : 64; B = mobile ? 24 : 34; }
  const availW = Math.max(120, w-L-R), availH = Math.max(120, h-T-B);
  const bw = Math.max(1,b[2]-b[0]), bh = Math.max(1,b[3]-b[1]);
  // 旋转后地图在屏幕上的外接矩形会变大，按旋转后的宽高取景
  const rotDeg = state.nav.active && state.compass.enabled && compassSupported() ? -state.compass.heading : compassRotationDeg();
  const rad = rotDeg * Math.PI / 180;
  const ca = Math.abs(Math.cos(rad)), sa = Math.abs(Math.sin(rad));
  const bwR = Math.max(1, bw*ca + bh*sa), bhR = Math.max(1, bw*sa + bh*ca);
  const pad = padding * (Math.abs(rotDeg) > 0.5 ? 1.5 : 1.2);
  let s = Math.min((availW-pad)/bwR, (availH-pad)/bhR);
  s = clamp(s, 0.012, maxScale);
  const ax = L + availW/2, ay = T + availH/2;
  const cx = (b[0]+b[2])/2, cy = (b[1]+b[3])/2;
  const x = ax - s*cx;
  const y = ay - s*cy;
  state.view = {x,y,s,ax,ay};
  applyView();
}

function fitFloor(id=state.floor){
  const f = FLOOR_BY_ID.get(id);
  if(f) fitBounds(f.bounds, 54, 8);
}

function fitBoxToView(b, insets){
  const {w,h} = containerSize();
  // 有 insets 时取景只使用顶部/底部卡片之间的可视区域
  const availW = Math.max(160, w - (insets ? insets.L + insets.R : 110));
  const availH = Math.max(160, h - (insets ? insets.T + insets.B : 98));
  const aspect = Math.max(0.8, availW/availH);
  let [x0,y0,x1,y1] = b;
  const bw = x1-x0, bh = y1-y0;
  if(bw/bh < aspect){ const c=(x0+x1)/2, nw=bh*aspect; x0=c-nw/2; x1=c+nw/2; }
  else { const c=(y0+y1)/2, nh=bw/aspect; y0=c-nh/2; y1=c+nh/2; }
  fitBounds([x0,y0,x1,y1], insets ? 18 : 74, 8, insets || null);
}

function fitRoute(insets){
  if(!state.route){ fitFloor(); return; }
  const b = routeBounds();
  if(!b){ fitFloor(); return; }
  fitBoxToView(b, insets);
}

function routeBounds(){
  if(!state.route) return null;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const p of state.route.points){
    x0=Math.min(x0,NODES[p][0]); x1=Math.max(x1,NODES[p][0]);
    y0=Math.min(y0,NODES[p][1]); y1=Math.max(y1,NODES[p][1]);
  }
  if(x0>x1) return null;
  const minW = 760, minH = 620;
  if(x1-x0 < minW){ const c=(x0+x1)/2; x0=c-minW/2; x1=c+minW/2; }
  if(y1-y0 < minH){ const c=(y0+y1)/2; y0=c-minH/2; y1=c+minH/2; }
  const mx = (x1-x0)*0.12, my = (y1-y0)*0.12;
  return [x0-mx,y0-my,x1+mx,y1+my];
}

let lastScaleBarS = -1;
function updateScaleBar(){
  const s = state.view.s;           // px per map unit
  if(Math.abs(s - lastScaleBarS) < 1e-9) return;
  lastScaleBarS = s;
  const pxPerMeter = s * UNIT;
  const targetPx = 64;
  const meters = targetPx / Math.max(pxPerMeter, 1e-9);
  const nice = niceNumber(meters);
  const w = nice * pxPerMeter;
  const bar = $("scaleBar");
  if(bar) bar.style.width = Math.max(24, Math.min(140, w)) + "px";
  const txt = $("scaleText");
  if(txt) txt.textContent = nice >= 1000 ? (nice/1000) + " 公里" : nice >= 1 ? Math.round(nice) + " 米" : Math.round(nice*100) + " 厘米";
}
function niceNumber(v){
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v/pow;
  const step = n>=5?5:n>=2?2:1;
  return step*pow;
}

/* ============================== 缩放/平移 ============================== */
function zoomAt(factor, mx, my){
  const {w,h} = containerSize();
  mx = mx ?? w/2; my = my ?? h/2;
  const v = state.view;
  const s2 = clamp(v.s*factor, 0.012, 12);
  const ax = v.ax == null ? w/2 : v.ax;
  const ay = v.ay == null ? h/2 : v.ay;
  const M = screenToMap(mx + mapEl.getBoundingClientRect().left, my + mapEl.getBoundingClientRect().top);
  const rad = compassRotationDeg() * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = mx - ax, dy = my - ay;
  const rx = dx*cos + dy*sin;
  const ry = -dx*sin + dy*cos;
  state.view = { ...v, s:s2, x: rx + ax - s2*M[0], y: ry + ay - s2*M[1] };
  applyView();
}

mapEl.addEventListener("wheel", e=>{
  e.preventDefault();
  const r = mapEl.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.12 : 1/1.12, e.clientX-r.left, e.clientY-r.top);
}, {passive:false});

/* 桌面端在 #map 上按下鼠标时，浏览器会从 SVG 文字标注开始建立原生选区；
   拖拽过程中 <g> 的 transform 每帧变化，选区还会失控扩大（看起来像全选页面文字）。
   在选区源头拦掉，并在地图拖拽期间锁住整页选区。 */
mapEl.addEventListener("selectstart", e=>e.preventDefault());
mapEl.addEventListener("dragstart", e=>e.preventDefault());

let selectionLocked = false;
function lockPageSelection(){
  if(selectionLocked) return;
  selectionLocked = true;
  document.body.classList.add("map-dragging");
}
function unlockPageSelection(){
  if(!selectionLocked) return;
  selectionLocked = false;
  document.body.classList.remove("map-dragging");
}
/* 地图按下的同时清掉页面里已有的选区，避免残留高亮被误认为本次点击选中了文字 */
function clearTextSelection(){
  const sel = window.getSelection();
  if(sel && sel.rangeCount && !sel.isCollapsed) sel.removeAllRanges();
}
window.addEventListener("blur", unlockPageSelection);

/* 触控：单指拖拽，双指捏合缩放。用 Pointer Events 统一鼠标与触摸。 */
const activePointers = new Map();   // pointerId -> {x, y}（client 坐标）
let pinch = null;

mapEl.addEventListener("pointerdown", e=>{
  if(e.pointerType === "mouse" && e.button !== 0) return;
  clearTextSelection();
  if(state.pick){
    if(activePointers.size === 0) handlePick(e);
    return;
  }
  activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  try{ mapEl.setPointerCapture(e.pointerId); }catch(_){}

  if(activePointers.size === 1){
    lockPageSelection();
    state.drag = {x:e.clientX, y:e.clientY, vx:state.view.x, vy:state.view.y, moved:false};
    mapEl.classList.add("dragging");
  } else if(activePointers.size === 2){
    state.drag = null;
    mapEl.classList.remove("dragging");
    const [a, b] = [...activePointers.values()];
    pinch = {
      d0: Math.hypot(a.x-b.x, a.y-b.y),
      midX: (a.x+b.x)/2, midY: (a.y+b.y)/2
    };
  }
});

mapEl.addEventListener("pointermove", e=>{
  if(!activePointers.has(e.pointerId)){
    if(!state.drag && !pinch) hoverPolygon(e);
    return;
  }
  activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if(pinch && activePointers.size >= 2){
    const [a, b] = [...activePointers.values()];
    const d1 = Math.hypot(a.x-b.x, a.y-b.y);
    const midX = (a.x+b.x)/2, midY = (a.y+b.y)/2;
    const rad = compassRotationDeg() * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // 1) 双指平移：中点位移按旋转角反变换到地图坐标
    const dx = midX - pinch.midX, dy = midY - pinch.midY;
    state.view.x += dx*cos + dy*sin;
    state.view.y += -dx*sin + dy*cos;
    // 2) 捏合缩放：以当前中点为锚
    let zoomed = false;
    if(pinch.d0 > 4 && Math.abs(d1 - pinch.d0) > 0.5){
      const r = mapEl.getBoundingClientRect();
      zoomAt(d1 / pinch.d0, midX - r.left, midY - r.top);
      zoomed = true;
    }
    pinch.d0 = d1; pinch.midX = midX; pinch.midY = midY;
    if(!zoomed) applyView();
  } else if(state.drag){
    const dx = e.clientX-state.drag.x, dy = e.clientY-state.drag.y;
    if(Math.abs(dx)+Math.abs(dy) > 3) state.drag.moved = true;
    const rad = compassRotationDeg() * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    state.view.x = state.drag.vx + (dx*cos + dy*sin);
    state.view.y = state.drag.vy + (-dx*sin + dy*cos);
    applyView();
  } else {
    hoverPolygon(e);
  }
});

function releasePointer(e){
  activePointers.delete(e.pointerId);
  if(pinch && activePointers.size < 2){
    pinch = null;
    // 剩下一根手指继续拖拽，避免跳变
    if(activePointers.size === 1){
      const p = [...activePointers.values()][0];
      state.drag = {x:p.x, y:p.y, vx:state.view.x, vy:state.view.y, moved:false};
      mapEl.classList.add("dragging");
    }
  }
  if(activePointers.size === 0){
    state.drag = null;
    pinch = null;
    mapEl.classList.remove("dragging");
    unlockPageSelection();
  }
}
mapEl.addEventListener("pointerup", e=>releasePointer(e));
mapEl.addEventListener("pointercancel", e=>releasePointer(e));
mapEl.addEventListener("dblclick", e=>{
  const r = mapEl.getBoundingClientRect();
  zoomAt(1.6, e.clientX-r.left, e.clientY-r.top);
});

function hoverPolygon(e){
  const t = e.target;
  if(t && t.dataset && t.dataset.n){
    const r = mapEl.getBoundingClientRect();
    tipEl.textContent = t.dataset.n;
    tipEl.style.left = (e.clientX-r.left)+"px";
    tipEl.style.top = (e.clientY-r.top)+"px";
    tipEl.classList.add("show");
  } else {
    tipEl.classList.remove("show");
  }
}
mapEl.addEventListener("pointerleave", ()=>tipEl.classList.remove("show"));
