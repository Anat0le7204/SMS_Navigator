/* ============================== 指南针 / 朝向旋转 ============================== */
const COMPASS_KEY = "szzx.compass";
let compassProbeTimer = null;
let compassRAF = 0;

/* ---- 旋转性能探针（?perf=1，调试用）：把逐帧间隔写进 document.title ---- */
const perf = { on:false, frames:[], last:0, loaf:[], timer:0 };
function perfStart(){
  if(!perf.on) return;
  perf.frames = []; perf.last = 0; perf.loaf = [];
  clearTimeout(perf.timer);
  document.title = "PERF 测量中…";
  perf.timer = setTimeout(perfReport, 1400);
}
function perfFrame(){
  if(!perf.on) return;
  const t = performance.now();
  if(perf.last) perf.frames.push(t - perf.last);
  perf.last = t;
}
function perfReport(){
  if(!perf.on) return;
  const a = perf.frames.slice().sort((x,y)=>x-y);
  if(!a.length){ document.title = "PERF 无旋转帧"; return; }
  const q = p => a[Math.min(a.length-1, Math.floor(a.length*p))].toFixed(1);
  const over = a.filter(v=>v>33).length;
  const loaf = perf.loaf.length ? Math.max(...perf.loaf).toFixed(1) : "-";
  document.title = `PERF n=${a.length} p50=${q(.5)} p90=${q(.9)} max=${a[a.length-1].toFixed(1)} >33ms=${over} LoAFmax=${loaf}`;
}

function norm360(d){ return ((d % 360) + 360) % 360; }
function norm180(d){ let v = ((d + 180) % 360 + 360) % 360 - 180; return v; }

function compassSupported(){
  return state.compass.state === "supported" || state.compass.sim;
}

function readHeading(e, absoluteEvent){
  if(!e) return null;
  if(typeof e.webkitCompassHeading === "number" && isFinite(e.webkitCompassHeading) && e.webkitCompassHeading >= 0){
    return norm360(e.webkitCompassHeading);
  }
  if(typeof e.alpha === "number" && isFinite(e.alpha) && (absoluteEvent || e.absolute === true)){
    const angle = (screen.orientation && typeof screen.orientation.angle === "number")
      ? screen.orientation.angle
      : (typeof window.orientation === "number" ? window.orientation : 0);
    return norm360(360 - e.alpha + angle);
  }
  return null;
}

function setCompassHeading(h, snap){
  const c = state.compass;
  h = norm360(h);
  if(snap || !c.hasSignal){
    c.heading = h;
  } else {
    // 平滑系数按事件间隔归一化：不同设备的采样率（20–60Hz）下跟随速度一致
    const now = performance.now();
    const dt = Math.min(250, now - (c.lastHeadingAt || now - 16.7));
    const k = 1 - Math.pow(1 - 0.22, dt / 16.7);
    let d = norm180(h - c.heading);
    c.heading = norm360(c.heading + d * k);
  }
  c.lastHeadingAt = performance.now();
  c.hasSignal = true;
  c.lastEvent = Date.now();
  if(state.nav.active && c.enabled) startCompassTick();
}

function compassRotationDeg(){
  return state.compass.rot || 0;
}

let lastNeedleRot = NaN;
function updateCompassNeedle(){
  const needle = $("compassNeedle");
  if(!needle) return;
  const c = state.compass;
  const deg = c.rot || 0;
  if(Math.abs(deg - lastNeedleRot) < 0.05) return;
  lastNeedleRot = deg;
  // 与地图旋转角保持一致（北向指针指向屏幕上的真北），随缓动平滑转动
  needle.style.transform = `rotate(${deg.toFixed(2)}deg)`;
}

function renderCompassButton(){
  const btn = $("compassToggle"), label = $("compassLabel");
  if(!btn || !label) return;
  const c = state.compass;
  const hardDisabled = c.state === "checking" || c.state === "unsupported" || c.state === "denied";
  const on = c.enabled && compassSupported();
  btn.classList.toggle("on", on);
  btn.classList.toggle("disabled", hardDisabled);
  btn.classList.toggle("prompt", c.state === "prompt");
  btn.setAttribute("aria-disabled", String(hardDisabled));
  btn.setAttribute("aria-checked", String(on));

  if(c.state === "checking") label.textContent = "检测中";
  else if(c.state === "prompt") label.textContent = "授权";
  else label.textContent = "朝向";

  if(c.state === "checking") btn.title = "正在检测指南针…";
  else if(c.state === "prompt") btn.title = "点击授权使用设备指南针";
  else if(c.state === "unsupported") btn.title = c.reason || "当前设备不支持指南针";
  else if(c.state === "denied") btn.title = "方向权限已被拒绝，点击查看说明";
  else if(on) btn.title = "已开启：开始导航后地图跟随朝向（点击关闭）";
  else btn.title = "开启后，开始导航时地图跟随设备朝向";

  updateCompassNeedle();
}

function saveCompassPref(on){
  try{ localStorage.setItem(COMPASS_KEY, on ? "1" : "0"); }catch(_){}
}
function loadCompassPref(){
  try{ return localStorage.getItem(COMPASS_KEY); }catch(_){ return null; }
}

function startCompassTick(){
  if(compassRAF) return;
  perfStart();
  let prev = 0;
  const step = now => {
    compassRAF = 0;
    perfFrame();
    const c = state.compass;
    const t = typeof now === "number" ? now : performance.now();
    const dt = prev ? Math.min(80, t - prev) : 16.7;
    prev = t;

    const active = state.nav.active && c.enabled && compassSupported();
    const target = active ? -c.heading : 0;
    let d = norm180(target - c.rot);

    if(Math.abs(d) < 0.06){
      if(Math.abs(c.rot - target) > 1e-6){
        c.rot = target;
        applyView();
      }
      updateCompassNeedle();
      return;
    }

    // 时间步长相关缓动：60/90/120Hz 屏幕上的收敛速度保持一致；掉帧时快速追上
    const k = 1 - Math.pow(1 - 0.22, dt / 16.67);
    c.rot = norm180(c.rot + d * k);
    applyView();
    updateCompassNeedle();
    compassRAF = requestAnimationFrame(step);
  };
  compassRAF = requestAnimationFrame(step);
}

function startCompassSensor(){
  const c = state.compass;
  if(c.listening || c.sim || !compassSupported()) return;
  const onOrient = e => {
    if(e.type === "deviceorientationabsolute"){
      c.lastAbsolute = Date.now();
    } else if(Date.now() - (c.lastAbsolute || 0) < 1200){
      return;
    }
    const h = readHeading(e, e.type === "deviceorientationabsolute");
    if(h == null) return;
    setCompassHeading(h);
  };
  window.addEventListener("deviceorientationabsolute", onOrient, true);
  window.addEventListener("deviceorientation", onOrient, true);
  c.listening = true;
  c.orientHandler = onOrient;
}

function stopCompassSensor(){
  const c = state.compass;
  if(!c.listening) return;
  window.removeEventListener("deviceorientationabsolute", c.orientHandler, true);
  window.removeEventListener("deviceorientation", c.orientHandler, true);
  c.listening = false;
  c.orientHandler = null;
}

function requestCompassPermission(){
  const c = state.compass;
  if(typeof DeviceOrientationEvent.requestPermission !== "function"){
    c.state = "unsupported";
    c.reason = "当前设备不支持指南针";
    renderCompassButton();
    return;
  }
  c.state = "checking";
  renderCompassButton();
  DeviceOrientationEvent.requestPermission().then(res=>{
    if(res === "granted"){
      c.state = "supported";
      c.enabled = true;
      saveCompassPref(true);
      startCompassSensor();
      if(state.nav.active){ startCompassTick(); refitNavForCompass(); }
      renderCompassButton();
      toast(state.nav.active ? "已授权，地图将跟随朝向" : "已授权，开始导航后地图将跟随朝向");
    } else {
      c.state = "denied";
      c.enabled = false;
      saveCompassPref(false);
      renderCompassButton();
      toast("未获得方向权限，无法使用朝向旋转");
    }
  }).catch(()=>{
    c.state = "denied";
    c.enabled = false;
    renderCompassButton();
    toast("未获得方向权限，无法使用朝向旋转");
  });
}

function toggleCompass(){
  const c = state.compass;
  if(c.state === "checking"){ toast("正在检测指南针，请稍候…"); return; }
  if(c.state === "prompt"){ requestCompassPermission(); return; }
  if(c.state === "unsupported"){
    toast(c.reason || "当前设备不支持指南针");
    return;
  }
  if(c.state === "denied"){
    toast("方向权限已被拒绝，请在浏览器设置中允许后刷新页面");
    return;
  }
  if(c.state !== "supported"){ toast("当前设备不支持指南针"); return; }

  c.enabled = !c.enabled;
  saveCompassPref(c.enabled);
  if(c.enabled){
    if(state.nav.active){
      startCompassSensor();
      startCompassTick();
      refitNavForCompass();
      toast("已开启，地图将跟随设备朝向");
    } else {
      toast("已开启，开始导航后地图将跟随设备朝向");
    }
  } else {
    stopCompassSensor();
    startCompassTick();
  }
  renderCompassButton();
}

function initCompass(){
  const btn = $("compassToggle");
  if(!btn) return;
  btn.addEventListener("click", toggleCompass);

  const params = new URLSearchParams(location.search);
  const sim = params.get("compass");
  const c = state.compass;

  if(params.get("perf") === "1"){
    perf.on = true;
    try{
      new PerformanceObserver(list=>{
        for(const e of list.getEntries()) perf.loaf.push(e.duration);
      }).observe({type:"long-animation-frame", buffered:false});
    }catch(_){}
  }

  if(sim === "sim" || sim === "1"){
    c.sim = true;
    c.state = "supported";
    c.enabled = true;
    const h = parseFloat(params.get("heading") || "0");
    c.heading = Number.isFinite(h) ? norm360(h) : 0;
    c.hasSignal = true;
    c.rot = 0;
    renderCompassButton();
    window.__compassSetHeading = d => {
      c.heading = norm360(d);
      c.hasSignal = true;
      if(state.nav.active) startCompassTick();
      updateCompassNeedle();
    };
    return;
  }
  if(sim === "unsupported" || sim === "denied" || sim === "prompt"){
    c.state = sim;
    c.reason = sim === "unsupported" ? "当前设备不支持指南针（模拟）" : "";
    c.enabled = false;
    renderCompassButton();
    return;
  }

  if(!("DeviceOrientationEvent" in window)){
    c.state = "unsupported";
    c.reason = "当前设备不支持指南针";
    renderCompassButton();
    return;
  }
  // 传感器通常要求安全上下文；file:// 在部分浏览器仍可工作，先放行探测
  const secureContext = window.isSecureContext || location.protocol === "file:";
  if(!secureContext){
    c.state = "unsupported";
    c.reason = "指南针需要 HTTPS 或 localhost 环境";
    renderCompassButton();
    return;
  }
  if(typeof DeviceOrientationEvent.requestPermission === "function"){
    c.state = "prompt";
    c.enabled = false;
    renderCompassButton();
    return;
  }

  c.state = "checking";
  renderCompassButton();
  let done = false;
  const cleanup = () => {
    done = true;
    clearTimeout(compassProbeTimer);
    window.removeEventListener("deviceorientationabsolute", onProbe, true);
    window.removeEventListener("deviceorientation", onProbe, true);
  };
  const onProbe = e => {
    if(done) return;
    const h = readHeading(e, e.type === "deviceorientationabsolute");
    if(h == null) return;
    cleanup();
    c.state = "supported";
    setCompassHeading(h, true);
    const stored = loadCompassPref();
    c.enabled = stored !== "0";
    renderCompassButton();
    if(c.enabled && state.nav.active){
      startCompassSensor();
      startCompassTick();
      refitNavForCompass();
    }
  };
  window.addEventListener("deviceorientationabsolute", onProbe, true);
  window.addEventListener("deviceorientation", onProbe, true);
  compassProbeTimer = setTimeout(()=>{
    if(done) return;
    cleanup();
    c.state = "unsupported";
    c.reason = "当前设备没有可用的方向传感器";
    c.enabled = false;
    renderCompassButton();
  }, 1800);
}
