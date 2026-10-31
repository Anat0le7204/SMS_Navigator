/* ============================== 面板渲染 ============================== */
function normBuilding(b){
  if(!b) return "";
  if(b.indexOf("宿舍") >= 0) return "宿舍区";
  if(b === "steam") return "STEAM 中心";
  return b;
}
function floorBuildings(f){
  const set = new Set();
  for(const n of NODES){
    if(n[2] !== FLOOR_INDEX.get(f.id)) continue;
    const b = normBuilding(n[5]);
    if(b && b !== "校园地面" && b !== "室外") set.add(b);
  }
  const arr = [...set];
  arr.sort((a,b)=> (a==="教学楼"?-2:a==="宿舍区"?-1:0) - (b==="教学楼"?-2:b==="宿舍区"?-1:0));
  return arr.slice(0,3).join(" · ");
}

function renderSummary(){
  if(!state.route){ summaryEl.classList.remove("show"); return; }
  const r = state.route;
  const verticals = r.steps.filter(x=>x.type === "vertical");
  const minutes = Math.max(1, Math.round((r.distance/1.25 + r.stairs*8 + r.lifts*30 + verticals.length*10)/60));
  const shownFloors = r.floors.length > 5 ? [r.floors[0], null, r.floors[r.floors.length-1]] : r.floors;
  const floorBadges = shownFloors.map(fid=>{
    if(!fid) return `<span class="arr">…</span>`;
    const f = FLOOR_BY_ID.get(fid);
    return `<span class="fbadge">${esc(f.name)}</span>`;
  }).join('<span class="arr">›</span>');
  const levels = r.floors.map(fid=>LEVEL.get(fid) || 0);
  const depth = Math.max(...levels) - Math.min(...levels);
  const entries = r.steps.filter(x=>x.type === "entry").length;
  const meta = [];
  if(verticals.length === 0){
    meta.push(`<span>${entries ? "室外路段" : "同层步行"}</span>`);
  } else {
    if(depth > 0) meta.push(`<span>跨 ${depth % 1 ? depth.toFixed(1) : depth} 层</span>`);
    meta.push(`<span>换层 ${verticals.length} 次</span>`);
  }
  if(entries) meta.push(`<span>出入 ${entries} 次</span>`);
  if(r.stairs) meta.push(`<span>楼梯 ${r.stairs} 次</span>`);
  if(r.lifts) meta.push(`<span>电梯 ${r.lifts} 次</span>`);
  const isKm = r.distance >= 1000;
  const num = isKm ? (r.distance/1000).toFixed(1) : String(Math.round(r.distance));
  summaryEl.innerHTML = `
    <div class="sum-top">
      <div class="sum-num">${num}<small>${isKm ? "公里" : "米"}</small></div>
      <div class="sum-time">约 ${minutes} 分钟</div>
    </div>
    <div class="sum-meta">${meta.join("")}</div>
    <div class="sum-route">${floorBadges}</div>
    <button class="start-nav" data-start-nav>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>
      开始导航
    </button>`;
  summaryEl.classList.add("show");
}

function renderSteps(){
  if(!state.route){
    stepsEl.innerHTML = `<div class="steps-empty"><b>输入起点与终点</b>可搜索教室编号（如 D202）、功能室或校门，也可以点击右侧地图选点。</div>`;
    return;
  }
  let html = "";
  let lastFloor = null;
  state.route.steps.forEach((st,i)=>{
    if(st.floor !== lastFloor){
      const f = FLOOR_BY_ID.get(st.floor);
      const b = (f.id === "L1" || f.id === "ground" || f.id === "B1") ? "" : floorBuildings(f);
      const extra = f.id === "L1" ? "校园地面层" : f.note;
      html += `<div class="group-head">${esc(f.name)}${b ? " · " + esc(b) : ""}${extra ? " · " + esc(extra) : ""}</div>`;
      lastFloor = st.floor;
    }
    const icon = ICON[st.icon] || ICON.straight;
    const distTxt = st.dist != null ? `<b>${Math.max(1,Math.round(st.dist))}</b> 米` : (st.type === "vertical" ? "换层" : st.type === "entry" ? "出入" : "");
    html += `<button class="step ${st.type === "vertical" ? "vertical" : ""} ${i === state.activeStep ? "active" : ""}" data-i="${i}">
      <span class="s-ico">${icon}</span>
      <span class="s-body"><span class="s-text">${esc(st.text)}</span>${st.sub ? `<span class="s-sub">${esc(st.sub)}</span>` : ""}</span>
      <span class="s-dist">${distTxt}<i>${esc(st.floorName || "")}</i></span>
    </button>`;
  });
  stepsEl.innerHTML = html;
  stepsEl.querySelectorAll(".step").forEach(btn=>{
    btn.addEventListener("click", ()=>focusStep(+btn.dataset.i));
  });
}

function focusStep(i, opts){
  if(!state.route) return;
  const st = state.route.steps[i];
  if(!st) return;
  const navMode = !!(opts && opts.nav) || state.nav.active;
  state.activeStep = i;
  if(navMode || state.floor !== st.floor){
    const floorChanged = state.floor !== st.floor;
    state.floor = st.floor;
    if(floorChanged){
      renderFloor();
      renderRoute();
    }
    if(navMode){
      fitStepNav(st);
    } else if(st.pts && st.pts.length){
      const xs = st.pts.map(p=>p[0]), ys = st.pts.map(p=>p[1]);
      let b = [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      if(b[2]-b[0] < 160){ const c=(b[0]+b[2])/2; b[0]=c-80; b[2]=c+80; }
      if(b[3]-b[1] < 160){ const c=(b[1]+b[3])/2; b[1]=c-80; b[3]=c+80; }
      b = [b[0]-40,b[1]-40,b[2]+40,b[3]+40];
      fitBounds(b, 60, 8);
    } else {
      fitFloor();
    }
  } else {
    renderActiveStep();
  }
  if(navMode) renderActiveStep();
  if(navMode){
    renderNav();
  } else {
    renderSteps();
    const activeBtn = stepsEl.querySelector(".step.active");
    if(activeBtn) activeBtn.scrollIntoView({block:"nearest", behavior:"smooth"});
  }
  updateRailDots();
  updateFloorHeader();
}

/* ============================== 楼层栏 ============================== */
function renderRail(){
  railEl.innerHTML = "";
  const routeFloors = new Set(state.route ? state.route.floors : []);
  for(const fid of DATA.meta.floorOrder){
    const f = FLOOR_BY_ID.get(fid);
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.f = fid;
    b.className = (fid === state.floor ? "active " : "") + (routeFloors.has(fid) ? "on-route" : "");
    b.innerHTML = esc(f.name);
    b.title = f.name + (f.note ? " · " + f.note : "");
    b.addEventListener("click", ()=>{
      state.floor = fid;
      state.activeStep = -1;
      renderFloor(); renderRoute(); renderRail(); updateFloorHeader();
      fitFloor();
      renderSteps();
    });
    railEl.appendChild(b);
    if(fid === "L1") {
      const sep = document.createElement("div");
      sep.className = "rail-sep";
      railEl.appendChild(sep);
    }
  }
}

function updateRailDots(){
  const routeFloors = new Set(state.route ? state.route.floors : []);
  railEl.querySelectorAll("button").forEach(b=>{
    const fid = b.dataset.f;
    b.classList.toggle("active", fid === state.floor);
    b.classList.toggle("on-route", routeFloors.has(fid));
    if(b.classList.contains("active") && window.innerWidth < 980){
      railEl.scrollLeft = b.offsetLeft - railEl.clientWidth/2 + b.offsetWidth/2;
    }
  });
}

function updateFloorHeader(){
  const f = FLOOR_BY_ID.get(state.floor);
  $("floorName").textContent = f.name;
  const parts = [];
  const b = (f.id === "L1" || f.id === "ground" || f.id === "B1") ? "" : floorBuildings(f);
  if(b) parts.push(b);
  if(f.id === "L1") parts.push("校园地面层");
  if(f.note) parts.push(f.note);
  if(state.route && state.route.floors.includes(f.id)){
    const idx = state.route.floors.indexOf(f.id);
    parts.push(`路线第 ${idx+1} 段`);
  }
  $("floorBuildings").textContent = parts.join(" · ");
}

/* ============================== 搜索 ============================== */
let activeField = "end";
let sugIndex = -1;
let sugList = [];

function poiIcon(t){
  if(t.includes("楼梯")) return ICON.stair;
  if(t.includes("电梯")) return ICON.lift;
  if(t.includes("卫生间")) return ICON.entry;
  if(t.includes("室外") || t.includes("出入口")) return ICON.entry;
  return ICON.room;
}

function searchPois(q, limit=9){
  q = q.trim().toLowerCase();
  if(!q) return [];
  const scored = [];
  // 班级命中：显示班级名，选中后定位到对应教室（数据来自独立配置）
  for(const c of matchClassPois(q, limit)){
    scored.push([c.score + 10, c.poi]);
  }
  for(const p of POIS){
    const n = p.key;
    let score = -1;
    if(n === q) score = 100;
    else if(n.startsWith(q)) score = 80;
    else if(n.includes(q)) score = 60;
    else if(q.length >= 2 && q.split(/\s+/).every(part=>n.includes(part))) score = 40;
    if(score < 0) continue;
    if(p.t.includes("教室")) score += 32;
    else if(p.t.includes("楼梯") || p.t.includes("电梯")) score -= 26;
    else if(p.t.includes("室外") || p.t.includes("出入口")) score += 4;
    scored.push([score, p]);
  }
  scored.sort((a,b)=> b[0]-a[0] || a[1].n.length - b[1].n.length);
  return scored.slice(0, limit).map(x=>x[1]);
}

function renderSuggest(q){
  const list = searchPois(q);
  sugList = list;
  sugIndex = -1;
  if(!q.trim()){
    suggestEl.classList.remove("show");
    return;
  }
  if(!list.length){
    suggestEl.innerHTML = `<div class="sg-none">没有找到「${esc(q)}」，试试 D202、形体室、南门</div>`;
    suggestEl.classList.add("show");
    return;
  }
  let html = `<div class="sg-head">搜索结果</div>`;
  list.forEach((p,i)=>{
    const f = FLOOR_BY_ID.get(p.f);
    const nameHtml = p.className
      ? `${highlight(p.className, q)} <span class="sg-room">${esc(p.n)}</span>`
      : highlight(p.n, q);
    html += `<button class="sg-item" data-i="${i}">
      <span class="sg-ico">${poiIcon(p.t)}</span>
      <span class="sg-main">
        <span class="sg-name">${nameHtml}</span>
        <span class="sg-meta">${esc(f.name)}${p.b ? " · " + esc(p.b) : ""} · ${esc(p.t)}</span>
      </span>
    </button>`;
  });
  suggestEl.innerHTML = html;
  suggestEl.classList.add("show");
  suggestEl.querySelectorAll(".sg-item").forEach(el=>{
    el.addEventListener("mousedown", e=>{
      e.preventDefault();
      choosePoi(sugList[+el.dataset.i]);
    });
  });
}

function highlight(text, q){
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if(i < 0 || !q.trim()) return esc(text);
  return esc(text.slice(0,i)) + "<mark>" + esc(text.slice(i,i+q.trim().length)) + "</mark>" + esc(text.slice(i+q.trim().length));
}

function choosePoi(p){
  if(!p) return;
  const val = p.n;
  if(activeField === "start"){
    state.start = p; startInput.value = val;
  } else {
    state.end = p; endInput.value = val;
  }
  suggestEl.classList.remove("show");
  computeRoute();
}

function onInput(e, field){
  activeField = field;
  const v = e.target.value;
  if(field === "start" && state.start && state.start.n !== v) state.start = null;
  if(field === "end" && state.end && state.end.n !== v) state.end = null;
  renderSuggest(v);
  if(!v) computeRoute();
}

function setupInput(input, field){
  input.addEventListener("focus", ()=>{ activeField = field; });
  input.addEventListener("input", e=>onInput(e, field));
  input.addEventListener("keydown", e=>{
    if(!suggestEl.classList.contains("show")){
      if(e.key === "Enter") { activeField = field; if(input.value.trim()) renderSuggest(input.value); }
      return;
    }
    if(e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault();
      sugIndex = clamp(sugIndex + (e.key === "ArrowDown" ? 1 : -1), 0, sugList.length-1);
      suggestEl.querySelectorAll(".sg-item").forEach((el,i)=>el.classList.toggle("sel", i===sugIndex));
      const el = suggestEl.querySelector(".sg-item.sel");
      if(el) el.scrollIntoView({block:"nearest"});
    } else if(e.key === "Enter"){
      e.preventDefault();
      choosePoi(sugList[sugIndex >= 0 ? sugIndex : 0]);
    } else if(e.key === "Escape"){
      suggestEl.classList.remove("show");
    }
  });
}

document.addEventListener("click", e=>{
  if(!e.target.closest(".planner")) suggestEl.classList.remove("show");
});
