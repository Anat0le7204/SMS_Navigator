/* ============================== 计算路线 ============================== */
function computeRoute(){
  noRouteEl.classList.remove("show");
  if(state.nav.active) exitNavigation(true);
  if(!state.start || !state.end){ state.route = null; state.activeStep = -1; renderSummary(); renderSteps(); renderRoute(); renderRail(); updateFloorHeader(); return; }
  if(state.start.i === state.end.i){
    state.route = null; state.activeStep = -1;
    renderSummary(); renderSteps(); renderRoute(); updateRailDots(); updateFloorHeader();
    toast("起点和终点相同，请更换其中一个");
    return;
  }
  const res = dijkstra(state.start.i, state.end.i, state.useTeachingLift);
  if(!res){
    state.route = null;
    renderSummary(); renderSteps(); renderRoute(); updateRailDots();
    noRouteEl.classList.add("show");
    setTimeout(()=>noRouteEl.classList.remove("show"), 3200);
    toast(state.useTeachingLift ? "两地之间暂无可达路线" : "楼梯方案不可达，可尝试开启教学楼电梯");
    return;
  }
  state.route = buildRoute(res, state.start, state.end);
  state.activeStep = -1;
  state.floor = state.route.floors[0];
  renderSummary(); renderSteps(); renderFloor(); renderRoute(); renderRail(); updateFloorHeader();
  fitRoute();
}

/* ============================== 地图点选 ============================== */
function setPick(which){
  state.pick = which;
  mapEl.classList.toggle("picking", !!which);
  $("pickStart").classList.toggle("on", which === "start");
  $("pickEnd").classList.toggle("on", which === "end");
  pickHint.textContent = which === "start" ? "点击地图选择起点" : "点击地图选择终点";
  pickHint.classList.toggle("show", !!which);
  if(which){
    const input = which === "start" ? startInput : endInput;
    input.focus();
    suggestEl.classList.remove("show");
  }
}

function screenToMap(clientX, clientY){
  const r = mapEl.getBoundingClientRect();
  const v = state.view;
  const w = r.width, h = r.height;
  const ax = v.ax == null ? w/2 : v.ax;
  const ay = v.ay == null ? h/2 : v.ay;
  const rad = compassRotationDeg() * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = clientX - r.left - ax;
  const dy = clientY - r.top - ay;
  const rx = dx*cos + dy*sin;
  const ry = -dx*sin + dy*cos;
  return [ (rx + ax - v.x)/v.s, (ry + ay - v.y)/v.s ];
}

function handlePick(e){
  const [x,y] = screenToMap(e.clientX, e.clientY);
  const fi = FLOOR_INDEX.get(state.floor);
  let best = null, bd = Infinity, bestCost = Infinity;
  for(let i=0;i<N;i++){
    const n = NODES[i];
    if(n[2] !== fi) continue;
    const d = Math.hypot(n[0]-x, n[1]-y);
    if(d > 30*UNIT) continue;
    const code = n[3];
    const penalty = code === "workstationaction" ? 0 : (code === "stair" || code === "lifts" ? 12*UNIT : 4*UNIT);
    const cost = d + penalty;
    if(cost < bestCost){ bestCost = cost; bd = d; best = i; }
  }
  const maxD = state.floor === "ground" ? 60*UNIT : 30*UNIT;
  if(best == null || bd > maxD){ toast("请点在楼层平面内"); return; }
  const n = NODES[best];
  const poi = NODE_POI.get(best);
  const fname = FLOOR_BY_ID.get(state.floor).name;
  let pname = poi ? poi.n : `${fname} 选点`;
  if(!poi && n[3] === "stair") pname = `${n[4] || "楼梯"} 楼梯`;
  if(!poi && n[3] === "lifts") pname = `${n[4] || "电梯"} 电梯`;
  const p = {
    i: best, n: pname, f: state.floor,
    x: n[0], y: n[1],
    t: poi ? poi.t : "地图选点",
    b: n[5] || ""
  };
  if(state.pick === "start"){ state.start = p; startInput.value = p.n; }
  else { state.end = p; endInput.value = p.n; }
  setPick(null);
  computeRoute();
}

/* ============================== 教学楼电梯偏好 ============================== */
// 只控制教学楼电梯；宿舍、行政楼、文体楼等其他楼栋电梯不受影响
const TEACHING_LIFT_KEY = "sms.teachingLift";

function loadTeachingLiftPref(){
  try{ return localStorage.getItem(TEACHING_LIFT_KEY) === "1"; }catch(_){ return false; }
}
function saveTeachingLiftPref(on){
  try{ localStorage.setItem(TEACHING_LIFT_KEY, on ? "1" : "0"); }catch(_){}
}
function applyTeachingLiftToggle(){
  const t = $("teachingLiftToggle");
  if(!t) return;
  t.classList.toggle("on", state.useTeachingLift);
  t.setAttribute("aria-checked", String(state.useTeachingLift));
}
function setTeachingLift(on){
  state.useTeachingLift = !!on;
  applyTeachingLiftToggle();
  saveTeachingLiftPref(state.useTeachingLift);
  // 之前算不出路线时也要重算，否则开关切换后界面不会刷新
  if(state.start && state.end) computeRoute();
}

/* ============================== 事件绑定 ============================== */
$("pickStart").addEventListener("click", ()=>setPick(state.pick === "start" ? null : "start"));
$("pickEnd").addEventListener("click", ()=>setPick(state.pick === "end" ? null : "end"));
$("swapBtn").addEventListener("click", ()=>{
  const s = state.start, e = state.end;
  state.start = e; state.end = s;
  startInput.value = e ? e.n : "";
  endInput.value = s ? s.n : "";
  computeRoute();
});
$("zoomIn").addEventListener("click", ()=>zoomAt(1.35));
$("zoomOut").addEventListener("click", ()=>zoomAt(1/1.35));
$("zoomFit").addEventListener("click", ()=>fitRoute());
$("fitFloor").addEventListener("click", ()=>fitFloor());
$("fitRoute").addEventListener("click", ()=>fitRoute());
$("teachingLiftToggle").addEventListener("click", ()=>setTeachingLift(!state.useTeachingLift));

document.getElementById("quick").addEventListener("click", e=>{
  const btn = e.target.closest(".chip");
  if(!btn) return;
  const q = btn.dataset.q;
  const list = searchPois(q, 1);
  if(!list.length){ toast("未找到 " + q); return; }
  const p = list[0];
  if(!state.start){ state.start = p; startInput.value = p.n; }
  else { state.end = p; endInput.value = p.n; }
  activeField = state.start ? "end" : "start";
  computeRoute();
});

if(window.ResizeObserver){
  // 面板显隐、窗口缩放都会改变地图尺寸，统一失效尺寸缓存
  new ResizeObserver(()=>invalidateViewport()).observe(mapEl);
}
window.addEventListener("resize", ()=>{
  invalidateViewport();
  if(state.nav.active && state.route){
    const st = state.route.steps[state.nav.index];
    if(st) fitStepNav(st); else applyView();
  } else {
    applyView();
  }
});

/* ============================== 初始化 ============================== */
function findPoi(name, floor){
  return POIS.find(p=>p.n === name && (!floor || p.f === floor)) || null;
}

function init(){
  state.useTeachingLift = loadTeachingLiftPref();
  applyTeachingLiftToggle();
  setupInput(startInput, "start");
  setupInput(endInput, "end");
  initCompass();
  renderRail();
  state.floor = "L1";
  renderFloor();
  fitFloor("L1");
  renderSteps();
  updateFloorHeader();
  updateRailDots();

  const params = new URLSearchParams(location.search);
  const qf = params.get("f");
  if(qf && FLOOR_BY_ID.has(qf)){
    state.floor = qf; renderFloor(); renderRail(); updateFloorHeader();
    const z = parseFloat(params.get("z") || "0");
    if(z > 0){
      const cx = parseFloat(params.get("cx") || "0"), cy = parseFloat(params.get("cy") || "0");
      const {w,h} = containerSize();
      state.view = {s:z, x:w/2-cx*z, y:h/2-cy*z};
      applyView();
    } else {
      fitFloor(qf);
    }
  }
  const demo = params.get("demo");
  const s = findPoi("南门", "L1");
  const e = findPoi("D202", "L2");
  if(demo !== "0" && s && e){
    state.start = s; state.end = e;
  }
  const ps = params.get("start"), pe = params.get("end");
  if(ps){ const p = searchPois(ps, 1)[0]; if(p){ state.start = p; } }
  if(pe){ const p = searchPois(pe, 1)[0]; if(p){ state.end = p; } }
  startInput.value = state.start ? state.start.n : "";
  endInput.value = state.end ? state.end.n : "";
  if(state.start && state.end) computeRoute();
  // 调试：?nav=1 直接进入导航模式（便于自动化测试与真机截图）
  if(params.get("nav") === "1" && state.route) startNavigation();
}

init();
