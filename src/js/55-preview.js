/* ============================== 移动端路线预览 ==============================
   手机端（窄屏 / 矮屏）在算路完成后进入「地图全屏 + 底部抽屉」的预览形态：
   - 顶部：返回、起终点（可点击改点）、交换
   - 底部：距离 / 预计时长 / 起终点与楼层 / 概览标签 / 开始导航
   - 抽屉默认折叠，点「路线详情」或上拉展开，展开后显示分步转向指引
   桌面端完全不启用（预览层依赖 body.m-previewing 显示）。 */

const mPreview = $("mPreview"), mTop = $("mTop"), mSheet = $("mSheet"), mPeek = $("mPeek"),
      mSum = $("mSum"), mSteps = $("mSteps"),
      mStartName = $("mStartName"), mEndName = $("mEndName"),
      mStepCount = $("mStepCount"), mDetailMeta = $("mDetailMeta"),
      mGrab = $("mGrab"), mDetailBtn = $("mDetailBtn");

const PHONE_MQ = "(max-width: 760px), (max-height: 520px) and (max-width: 1000px)";
const phoneMQ = window.matchMedia ? window.matchMedia(PHONE_MQ) : null;
function isPhoneLayout(){
  return phoneMQ ? phoneMQ.matches : window.innerWidth <= 760;
}

let sheetDrag = null;

/* 地图取景时让出顶部起终点条、楼层栏与底部抽屉；抽屉高度由 --m-peek 提供 */
function previewInsets(){
  const top = mTop ? mTop.getBoundingClientRect() : { bottom: 66 };
  const peek = parseFloat(getComputedStyle(document.body).getPropertyValue("--m-peek")) || 232;
  const rail = railEl ? railEl.getBoundingClientRect() : null;
  let L = 14, T = Math.round(top.bottom + 12);
  if(rail && rail.width > 140){
    // 竖屏：楼层栏横在顶部，取景要避开
    if(rail.bottom > top.bottom) T = Math.round(rail.bottom + 12);
  } else if(rail && rail.width > 0){
    // 横屏：楼层栏竖排在地图左侧
    L = Math.round(rail.right + 10);
  }
  return { L, R: 14, T, B: Math.round(peek + 14) };
}

function measurePeek(){
  if(!mPeek) return 0;
  const h = Math.round(mPeek.getBoundingClientRect().height);
  if(h > 0) document.body.style.setProperty("--m-peek", h + "px");
  return h;
}

/* ---------------- 内容渲染 ---------------- */
function renderMobilePreview(){
  if(!state.route) return;
  const r = state.route;
  const d = routeDistance(r);
  const mins = routeMinutes(r);
  const meta = routeMetaItems(r);
  const sF = FLOOR_BY_ID.get(r.startPoi.f);
  const eF = FLOOR_BY_ID.get(r.endPoi.f);
  const startFloor = sF ? sF.name : "";
  const endFloor = eF ? eF.name : "";

  mStartName.textContent = r.startPoi.n;
  mStartName.title = r.startPoi.n;
  mEndName.textContent = r.endPoi.n;
  mEndName.title = r.endPoi.n;

  mSum.innerHTML = `
    <div class="m-sum-top">
      <div class="m-dist"><b>${esc(d.num)}</b><span>${esc(d.unit)}</span></div>
      <div class="m-eta"><b>约 ${mins} 分钟</b><em>预计步行</em></div>
    </div>
    <div class="m-via">
      <span class="pt s"><i></i><b>${esc(r.startPoi.n)}</b>${startFloor ? `<em>${esc(startFloor)}</em>` : ""}</span>
      <span class="arr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
      <span class="pt e"><i></i><b>${esc(r.endPoi.n)}</b>${endFloor ? `<em>${esc(endFloor)}</em>` : ""}</span>
    </div>
    <div class="m-meta">${meta.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`;

  // 按楼层分组，组头给出该层步数与步行距离
  const groups = [];
  for(const st of r.steps){
    let g = groups[groups.length-1];
    if(!g || g.floor !== st.floor){ g = {floor:st.floor, items:[]}; groups.push(g); }
    g.items.push(st);
  }

  let html = "";
  let idx = 0;
  for(const g of groups){
    const f = FLOOR_BY_ID.get(g.floor);
    if(!f) continue;
    const b = (f.id === "L1" || f.id === "ground" || f.id === "B1") ? "" : floorBuildings(f);
    const extra = f.id === "L1" ? "校园地面层" : (b || f.note || "");
    const sum = g.items.reduce((s,st)=>s + (st.dist || 0), 0);
    const distTxt = sum >= 1 ? ` · ${fmtM(sum)}` : "";
    html += `<div class="m-group"><b>${esc(f.name)}</b>${extra ? `<span>${esc(extra)}</span>` : ""}<i>${g.items.length} 步${distTxt}</i></div>`;
    for(const st of g.items){
      const icon = ICON[st.icon] || ICON.straight;
      const distTxtStep = st.dist != null
        ? `<b>${Math.max(1, Math.round(st.dist))}</b> 米`
        : (st.type === "vertical" ? "换层" : st.type === "entry" ? "出入" : "");
      html += `<button type="button" class="m-step ${st.type === "vertical" ? "vertical" : ""} ${idx === state.activeStep ? "active" : ""}" data-i="${idx}">
        <span class="m-step-ico">${icon}</span>
        <span class="m-step-body"><span class="m-step-text">${esc(st.text)}</span>${st.sub ? `<span class="m-step-sub">${esc(st.sub)}</span>` : ""}</span>
        <span class="m-step-side">${distTxtStep}<i>${esc(st.floorName || "")}</i></span>
      </button>`;
      idx++;
    }
  }
  mSteps.innerHTML = html;
  mStepCount.textContent = `${r.steps.length} 步`;
  mDetailMeta.textContent = `共 ${r.steps.length} 步 · ${fmtM(r.distance)}`;

  if(state.preview.open) measurePeek();
}

function updateMobileActiveStep(){
  if(!state.preview.open) return;
  mSteps.querySelectorAll(".m-step").forEach(el=>{
    el.classList.toggle("active", +el.dataset.i === state.activeStep);
  });
}

/* 预览取景只按当前楼层的路线段计算：室内各层共用同一套平面坐标，
   把跨层路径混进一个包围盒会把当前层的路线挤到屏幕一角。 */
function routeBoundsOnFloor(fid){
  if(!state.route) return null;
  let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9, n=0;
  for(const idx of state.route.points){
    const nd = NODES[idx];
    if(FLOORS[nd[2]].id !== fid) continue;
    n++;
    x0=Math.min(x0,nd[0]); x1=Math.max(x1,nd[0]);
    y0=Math.min(y0,nd[1]); y1=Math.max(y1,nd[1]);
  }
  if(!n) return null;
  const minW = 700, minH = 560;
  if(x1-x0 < minW){ const c=(x0+x1)/2; x0=c-minW/2; x1=c+minW/2; }
  if(y1-y0 < minH){ const c=(y0+y1)/2; y0=c-minH/2; y1=c+minH/2; }
  const mx=(x1-x0)*0.10, my=(y1-y0)*0.10;
  return [x0-mx, y0-my, x1+mx, y1+my];
}

function fitRouteOnFloor(fid, insets){
  const b = routeBoundsOnFloor(fid);
  if(!b){ fitRoute(insets); return; }
  fitBoxToView(b, insets);
}

/* 点步骤时把该段路线移到抽屉上方的可视区域 */
function fitStepPreview(st){
  const pts = [];
  if(st.pts) pts.push(...st.pts);
  if(st.fromPts) pts.push(...st.fromPts);
  if(!pts.length){ fitFloor(); return; }
  let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
  for(const p of pts){
    x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]);
    y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]);
  }
  const minW = 420, minH = 340;
  if(x1-x0 < minW){ const c=(x0+x1)/2; x0=c-minW/2; x1=c+minW/2; }
  if(y1-y0 < minH){ const c=(y0+y1)/2; y0=c-minH/2; y1=c+minH/2; }
  const mx=(x1-x0)*0.16, my=(y1-y0)*0.16;
  fitBounds([x0-mx, y0-my, x1+mx, y1+my], 10, 6.5, previewInsets());
}

/* ---------------- 抽屉展开 / 收起 ---------------- */
function setSheetExpanded(on, instant){
  on = !!on && state.preview.open;
  state.preview.expanded = on;
  if(instant) mSheet.classList.add("dragging");
  mSheet.classList.toggle("open", on);
  mGrab.setAttribute("aria-expanded", String(on));
  mGrab.setAttribute("aria-label", on ? "收起路线详情" : "展开路线详情");
  mDetailBtn.setAttribute("aria-expanded", String(on));
  if(on){
    const active = mSteps.querySelector(".m-step.active");
    if(active) setTimeout(()=>active.scrollIntoView({block:"center", behavior:"smooth"}), 260);
  }
  if(instant){
    // 首次打开预览时不要播放「从展开状态收起」的过渡
    void mSheet.offsetHeight;
    requestAnimationFrame(()=>mSheet.classList.remove("dragging"));
  }
}

/* ---------------- 打开 / 关闭预览 ---------------- */
function openPreview(opts){
  opts = opts || {};
  if(!state.route || !isPhoneLayout()) return;
  if(state.pick) setPick(null);
  state.preview.open = true;
  document.body.classList.add("m-previewing");
  mPreview.setAttribute("aria-hidden", "false");
  renderMobilePreview();
  setSheetExpanded(false, true);
  invalidateViewport();
  measurePeek();
  updateRailDots();
  if(opts.fit !== false) fitRouteOnFloor(state.floor, previewInsets());
}

function closePreview(silent){
  if(!state.preview.open && !document.body.classList.contains("m-previewing")) return;
  state.preview.open = false;
  state.preview.expanded = false;
  sheetDrag = null;
  document.body.classList.remove("m-previewing");
  mPreview.setAttribute("aria-hidden", "true");
  mSheet.classList.remove("open", "dragging");
  mSheet.style.transform = "";
  mGrab.setAttribute("aria-expanded", "false");
  mGrab.setAttribute("aria-label", "展开路线详情");
  mDetailBtn.setAttribute("aria-expanded", "false");
  invalidateViewport();
  if(!silent){
    window.scrollTo(0, 0);
    updateRailDots();
    if(state.route) fitRoute(); else fitFloor();
  }
}

/* 顶部起点 / 终点：回到规划面板并把光标放到对应输入框 */
function editEndpointFromPreview(which){
  closePreview(false);
  activeField = which;
  const input = which === "start" ? startInput : endInput;
  setTimeout(()=>{
    try{
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }catch(_){}
  }, 80);
}

/* ---------------- 抽屉拖拽 ---------------- */
function sheetTravel(){
  return Math.max(0, mSheet.offsetHeight - (parseFloat(getComputedStyle(document.body).getPropertyValue("--m-peek")) || 232));
}
function onGrabDown(e){
  if(!state.preview.open) return;
  if(e.pointerType === "mouse" && e.button !== 0) return;
  const base = state.preview.expanded ? 0 : sheetTravel();
  sheetDrag = {id:e.pointerId, y:e.clientY, base, moved:false};
  mSheet.classList.add("dragging");
  mSheet.style.transform = `translateY(${base}px)`;
  try{ mGrab.setPointerCapture(e.pointerId); }catch(_){}
}
function onGrabMove(e){
  if(!sheetDrag || e.pointerId !== sheetDrag.id) return;
  const dy = e.clientY - sheetDrag.y;
  if(Math.abs(dy) > 4) sheetDrag.moved = true;
  const y = clamp(sheetDrag.base + dy, 0, sheetTravel());
  mSheet.style.transform = `translateY(${y}px)`;
}
function onGrabUp(e){
  if(!sheetDrag || e.pointerId !== sheetDrag.id) return;
  const dy = e.clientY - sheetDrag.y;
  const moved = sheetDrag.moved;
  sheetDrag = null;
  mSheet.classList.remove("dragging");
  mSheet.style.transform = "";
  if(!moved){ setSheetExpanded(!state.preview.expanded); return; }
  if(dy < -32) setSheetExpanded(true);
  else if(dy > 32) setSheetExpanded(false);
  else setSheetExpanded(state.preview.expanded);
}

mGrab.addEventListener("pointerdown", onGrabDown);
mGrab.addEventListener("pointermove", onGrabMove);
mGrab.addEventListener("pointerup", onGrabUp);
mGrab.addEventListener("pointercancel", onGrabUp);
/* 键盘触发（Enter/Space）走 click；指针点击已由 pointerup 处理，避免重复切换 */
mGrab.addEventListener("click", e=>{
  if(e.detail === 0) setSheetExpanded(!state.preview.expanded);
});

/* ---------------- 事件绑定 ---------------- */
$("mBack").addEventListener("click", ()=>closePreview());
$("mSwap").addEventListener("click", ()=>$("swapBtn").click());
$("mStartRow").addEventListener("click", ()=>editEndpointFromPreview("start"));
$("mEndRow").addEventListener("click", ()=>editEndpointFromPreview("end"));
$("mStartNav").addEventListener("click", ()=>startNavigation());
$("mDetailBtn").addEventListener("click", ()=>setSheetExpanded(!state.preview.expanded));
$("mCollapse").addEventListener("click", ()=>setSheetExpanded(false));

// 规划面板摘要卡里的「查看路线预览」（仅手机端显示）
summaryEl.addEventListener("click", e=>{
  if(e.target.closest("[data-open-preview]")) openPreview({fit:true});
});

mSteps.addEventListener("click", e=>{
  const btn = e.target.closest(".m-step");
  if(!btn) return;
  // 先聚焦该段（会把地图移到抽屉上方），再收起抽屉露出地图
  focusStep(+btn.dataset.i);
  setSheetExpanded(false);
});

document.addEventListener("keydown", e=>{
  if(e.key === "Escape" && state.preview.open && !state.nav.active){
    e.preventDefault();
    closePreview();
  }
});

/* 旋转 / 窗口尺寸变化：重测抽屉高度；宽度或高度明显变化时重新取景 */
let lastVW = window.innerWidth, lastVH = window.innerHeight, lastPhone = isPhoneLayout();
window.addEventListener("resize", ()=>{
  const w = window.innerWidth, h = window.innerHeight;
  const phone = isPhoneLayout();
  if(!phone){
    if(state.preview.open) closePreview(false);
  } else if(state.preview.open){
    invalidateViewport();
    measurePeek();
    if(Math.abs(w - lastVW) > 32 || Math.abs(h - lastVH) > 140) fitRouteOnFloor(state.floor, previewInsets());
  } else if(!lastPhone && state.route){
    // 桌面窗口缩到手机宽度：地图从整屏变回半屏，重新适配路线
    invalidateViewport();
    fitRoute();
  }
  lastVW = w; lastVH = h; lastPhone = phone;
});

if(window.ResizeObserver){
  // 概览文案换行、系统字体变化都会改变露出的高度
  new ResizeObserver(()=>{
    if(state.preview.open) measurePeek();
  }).observe(mPeek);
}
