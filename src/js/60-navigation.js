/* ============================== 导航模式 ============================== */
const navLayer = $("navLayer");
const navText = $("navText"), navMeta = $("navMeta"), navArrow = $("navArrow"),
      navStepNo = $("navStepNo"), navStepTotal = $("navStepTotal"),
      navRemain = $("navRemain"), navHint = $("navHint"), navBar = $("navBar"),
      navThumbMap = $("navThumbMap"), navThumbCap = $("navThumbCap"),
      navPrev = $("navPrev"), navNext = $("navNext");

let navFromPreview = false;   // 本次导航是否由手机端路线预览进入

function navInsets(){
  const mobile = containerSize().w < 980;
  return mobile ? {L:16,R:16,T:140,B:255} : {L:30,R:30,T:150,B:245};
}

function stepBounds(st){
  const pts = (st.pts && st.pts.length) ? st.pts : null;
  if(!pts) return null;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const p of pts){
    x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]);
    y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]);
  }
  const minW = 700, minH = 520;
  if(x1-x0 < minW){ const c=(x0+x1)/2; x0=c-minW/2; x1=c+minW/2; }
  if(y1-y0 < minH){ const c=(y0+y1)/2; y0=c-minH/2; y1=c+minH/2; }
  const mx=(x1-x0)*0.18, my=(y1-y0)*0.18;
  return [x0-mx,y0-my,x1+mx,y1+my];
}

function fitStepNav(st){
  const b = stepBounds(st);
  if(!b){ fitFloor(); return; }
  fitBounds(b, 40, 2.4, navInsets());
}

/* 生成当前路段的矢量缩略图 */
function thumbSvg(st){
  const f = FLOOR_BY_ID.get(st.floor);
  const pts = (st.pts && st.pts.length) ? st.pts : [[0,0]];
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const p of pts){
    x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]);
    y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]);
  }
  // 换层步骤只有一个点，补上附近的房间，避免缩略图落在楼栋边缘的空地上
  if(st.type === "vertical" || st.type === "entry"){
    const near = f.labels
      .filter(l=>l.c === "workstationaction")
      .map(l=>({l, d:Math.hypot(l.x-pts[0][0], l.y-pts[0][1])}))
      .filter(o=>o.d < 150*UNIT)
      .sort((a,b)=>a.d-b.d)
      .slice(0, 10);
    for(const o of near){
      x0=Math.min(x0,o.l.x); x1=Math.max(x1,o.l.x);
      y0=Math.min(y0,o.l.y); y1=Math.max(y1,o.l.y);
    }
  }
  const minW = 600, minH = 420;
  if(x1-x0 < minW){ const c=(x0+x1)/2; x0=c-minW/2; x1=c+minW/2; }
  if(y1-y0 < minH){ const c=(y0+y1)/2; y0=c-minH/2; y1=c+minH/2; }
  const aspect = 1.62;
  let w = x1-x0, h = y1-y0;
  if(w/h < aspect){ const c=(x0+x1)/2; w=h*aspect; x0=c-w/2; x1=c+w/2; }
  else { const c=(y0+y1)/2; h=w/aspect; y0=c-h/2; y1=c+h/2; }
  const pad = Math.max(w,h)*0.06;
  x0-=pad; y0-=pad; w+=pad*2; h+=pad*2;

  const THUMB = {
    room:["#DCEAFB","#A9C4E4"], stair:["#D8DEE6","#AEB7C4"], lift:["#D8DEE6","#AEB7C4"],
    wc:["#CFE7E2","#A9CCC5"], mech:["#E9ECF0","#CBD1D9"], atrium:["#F3E9DC","#DCCBB4"],
    indoor:["#F1F5FA","#D8E0E9"], outline:["#E2E6EB","#C0C8D2"], road:["#F1F3F5","#DEE3E8"],
    grass:["#DFEFD6","#C6E0B8"], water:["#D6ECF2","#B5D9E4"], other:["#EFEFEF","#D8DCE1"]
  };
  let polys = f.polys;
  if(f.id === "L1"){
    const gf = FLOOR_BY_ID.get("ground");
    if(gf) polys = gf.polys.filter(p=>p.t==="road"||p.t==="grass"||p.t==="water"||p.t==="outline").concat(polys);
  }
  polys = polys.slice().sort((a,b)=>(ORDER_IDX.get(a.t)??9)-(ORDER_IDX.get(b.t)??9));
  let body = "";
  for(const p of polys){
    if(p.t === "roadlabel" || p.t === "dash") continue;
    const stl = THUMB[p.t] || THUMB.other;
    body += `<path d="${polyD(p.p)}" fill="${stl[0]}" stroke="${stl[1]}" stroke-width="0.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }

  let route = "";
  if(pts.length > 1){
    const d = pts.map((p,i)=>(i?"L":"M")+p[0]+" "+p[1]).join("");
    route = `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
            `<path d="${d}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }

  const a = pts[0], b = pts[pts.length-1];
  const rr = Math.max(9, w * 0.013);
  let markers = "";
  if(st.type === "vertical" || st.type === "entry"){
    markers = `<g>
      <circle cx="${b[0]}" cy="${b[1]}" r="${(rr*1.25).toFixed(1)}" fill="#fff"/>
      <circle cx="${b[0]}" cy="${b[1]}" r="${rr.toFixed(1)}" fill="#f59e0b"/>
      <path d="M${b[0]} ${b[1]+rr*0.42} V ${b[1]-rr*0.42} M${b[0]-rr*0.3} ${b[1]-rr*0.1} L${b[0]} ${b[1]-rr*0.42} L${b[0]+rr*0.3} ${b[1]-rr*0.1}"
        stroke="#fff" stroke-width="${(rr*0.2).toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  } else {
    markers = `<g>
      <circle cx="${a[0]}" cy="${a[1]}" r="${(rr*0.95).toFixed(1)}" fill="#fff"/>
      <circle cx="${a[0]}" cy="${a[1]}" r="${(rr*0.68).toFixed(1)}" fill="#10b981"/>
      <circle cx="${b[0]}" cy="${b[1]}" r="${(rr*0.95).toFixed(1)}" fill="#fff"/>
      <circle cx="${b[0]}" cy="${b[1]}" r="${(rr*0.68).toFixed(1)}" fill="#ef4444"/>
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#F7F9FC"/>
    ${body}${route}${markers}
  </svg>`;
}

function renderNav(){
  if(!state.nav.active || !state.route) return;
  const steps = state.route.steps;
  const i = clamp(state.nav.index, 0, steps.length - 1);
  const st = steps[i];
  if(!st) return;

  navStepNo.textContent = i + 1;
  navStepTotal.textContent = steps.length;
  navText.textContent = st.text;
  navArrow.innerHTML = ICON[st.icon] || ICON.straight;

  const pills = [];
  if(st.dist != null) pills.push(`<span class="nav-pill"><b>${Math.max(1,Math.round(st.dist))}</b> 米</span>`);
  else if(st.type === "vertical") pills.push(`<span class="nav-pill warm">换层</span>`);
  else if(st.type === "entry") pills.push(`<span class="nav-pill warm">出入</span>`);
  if(st.floorName) pills.push(`<span class="nav-pill">${esc(st.floorName)}</span>`);
  if(st.sub) pills.push(`<span class="nav-pill">${esc(st.sub)}</span>`);
  navMeta.innerHTML = pills.join("");

  navThumbMap.innerHTML = thumbSvg(st);
  const f = FLOOR_BY_ID.get(st.floor);
  const bld = f.id === "L1" ? "校园地面层" : (st.bld || floorBuildings(f));
  navThumbCap.innerHTML = `<b>${esc(f.name)}</b>${bld ? " · " + esc(bld) : ""}${st.dirLabel ? " · " + esc(st.dirLabel) : ""}`;

  let before = 0;
  for(let j=0;j<i;j++) before += (steps[j].weight || 0);
  const remain = Math.max(0, state.route.distance - before);
  if(i === steps.length - 1){
    navRemain.innerHTML = `已到达 <small>${esc(state.route.endPoi.n)}</small>`;
    navHint.textContent = "点击“完成”结束导航";
  } else {
    const mins = Math.max(1, Math.round((remain / 1.25 + (steps.length - i) * 6) / 60));
    navRemain.innerHTML = `剩余 ${fmtM(remain)} <small>约 ${mins} 分钟</small>`;
    navHint.textContent = st.type === "vertical" ? "换层后继续跟随蓝色路线" : "沿蓝色路线前进，可点“上一步 / 下一步”切换";
  }
  navBar.style.width = (((i + 1) / steps.length) * 100).toFixed(1) + "%";

  navPrev.disabled = i <= 0;
  const isLast = i >= steps.length - 1;
  navNext.classList.toggle("primary", !isLast);
  navNext.innerHTML = isLast ? "完成" : "下一步";
}

function startNavigation(){
  if(!state.route) return;
  // 从手机端路线预览进入导航，结束后回到预览而不是搜索面板
  navFromPreview = state.preview.open;
  if(state.preview.open) closePreview(true);
  state.nav.active = true;
  state.nav.index = 0;
  state.activeStep = 0;
  document.body.classList.add("navigating");
  navLayer.classList.add("show");
  // 导航模式下左侧面板隐藏，地图容器尺寸变化，先失效缓存再取景
  invalidateViewport();
  focusStep(0, {nav:true});   // 内部已调用 renderNav()，不要重复构建缩略图
  if(state.compass.enabled && compassSupported()){
    startCompassSensor();
    startCompassTick();
  }
}

function exitNavigation(silent){
  const fromPreview = navFromPreview;
  navFromPreview = false;
  state.nav.active = false;
  document.body.classList.remove("navigating");
  navLayer.classList.remove("show");
  invalidateViewport();
  stopCompassSensor();
  state.compass.rot = 0;
  updateCompassNeedle();
  if(!silent){
    state.activeStep = -1;
    renderSteps();
    updateRailDots();
    updateFloorHeader();
    if(fromPreview && isPhoneLayout() && state.route){
      openPreview({fit:true});
    } else {
      fitRoute();
    }
  }
}

function refitNavForCompass(){
  if(!state.nav.active || !state.route) return;
  const st = state.route.steps[state.nav.index];
  if(st) fitStepNav(st);
}

function navTo(i){
  if(!state.nav.active || !state.route) return;
  const steps = state.route.steps;
  const n = clamp(i, 0, steps.length - 1);
  state.nav.index = n;
  focusStep(n, {nav:true});
}

function navStep(delta){
  if(!state.nav.active || !state.route) return;
  const last = state.route.steps.length - 1;
  if(delta > 0 && state.nav.index >= last){ exitNavigation(); return; }
  navTo(state.nav.index + delta);
}

navPrev.addEventListener("click", ()=>navStep(-1));
navNext.addEventListener("click", ()=>navStep(1));
$("navExit").addEventListener("click", ()=>exitNavigation());

document.addEventListener("keydown", e=>{
  if(!state.nav.active) return;
  if(e.key === "ArrowLeft"){ e.preventDefault(); navStep(-1); }
  else if(e.key === "ArrowRight"){ e.preventDefault(); navStep(1); }
  else if(e.key === "Escape"){ e.preventDefault(); exitNavigation(); }
});

/* 点击摘要卡里的“开始导航” */
summaryEl.addEventListener("click", e=>{
  if(e.target.closest("[data-start-nav]")) startNavigation();
});
