/* ============================== 数据 ============================== */
const DATA = window.MAP_DATA;
const FLOORS = DATA.floors;
const FLOOR_INDEX = new Map(FLOORS.map((f,i)=>[f.id,i]));
const FLOOR_BY_ID = new Map(FLOORS.map(f=>[f.id,f]));
const NODES = DATA.nodes;                 // [x,y,floorIdx,code,name,building]
const N = NODES.length;
const EDGES = DATA.edges;                 // [a,b,w,kind] kind:0 walk 1 stair 2 lift 3 entry
const POIS = DATA.pois.map(p=>({...p, key:p.n.toLowerCase()}));
const LEVEL = new Map(FLOORS.map(f=>[f.id,f.level]));
const UNIT = DATA.meta.unitPerMeter;

const ADJ = Array.from({length:N},()=>[]);
for(const [a,b,w,k] of EDGES){ ADJ[a].push([b,w,k]); ADJ[b].push([a,w,k]); }

const POI_BY_INDEX = new Map(POIS.map(p=>[p.i,p]));
const NODE_POI = new Map(); // 每个节点对应的可搜索地点（用于地图点选吸附）
for(const p of POIS) if(!NODE_POI.has(p.i)) NODE_POI.set(p.i,p);

/* ============================== 状态 ============================== */
const state = {
  floor: "L1",
  view: {x:0,y:0,s:1,ax:null,ay:null},
  start: null,
  end: null,
  route: null,
  activeStep: -1,
  pick: null,
  useLift: false,
  drag: null,
  hover: null,
  nav: { active: false, index: 0 },
  compass: {
    state: "checking",     // checking | prompt | supported | unsupported | denied
    reason: "",
    enabled: false,
    heading: 0,            // 设备朝向（0=北，顺时针）
    rot: 0,                // 地图当前旋转角（度，正=顺时针）
    listening: false,
    hasSignal: false,
    lastEvent: 0,
    sim: false
  }
};

/* ============================== 工具 ============================== */
const $ = id => document.getElementById(id);
const mapEl = $("map"), world = $("world"), floorLayer = $("floorLayer"),
      routeLayer = $("routeLayer"), markerLayer = $("markerLayer"),
      stepsEl = $("steps"), summaryEl = $("summary"), railEl = $("rail"),
      startInput = $("startInput"), endInput = $("endInput"),
      suggestEl = $("suggest"), toastEl = $("toast"), tipEl = $("tip"),
      pickHint = $("pickHint"), noRouteEl = $("noRoute");

const SVGNS = "http://www.w3.org/2000/svg";
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const fmtM = d => d >= 1000 ? (d/1000).toFixed(1)+" 公里" : Math.round(d)+" 米";
const esc = s => String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

window.addEventListener("error", function(ev){
  try{
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;z-index:9999;left:12px;bottom:12px;background:#fff1f1;color:#991b1b;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;font:12px/1.5 monospace;max-width:70vw";
    d.textContent = "JS 错误: " + ev.message;
    document.body.appendChild(d);
  }catch(_){}
});

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>toastEl.classList.remove("show"), 2600);
}

/* ============================== 图标 ============================== */
const ICON = {
  straight:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M12 5l-5 5M12 5l5 5"/></svg>',
  left:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 19v-6a4 4 0 0 0-4-4H5M9 5 5 9l4 4"/></svg>',
  right:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 19v-6a4 4 0 0 1 4-4h9M15 5l4 4-4 4"/></svg>',
  slightLeft:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 20l-4-9a4 4 0 0 0-3-2H6M10 5 6 9l4 4"/></svg>',
  slightRight:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20l4-9a4 4 0 0 1 3-2h4M14 5l4 4-4 4"/></svg>',
  stair:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h4v-4h4v-4h4V7h4"/><path d="M16 4l3 3-3 3"/></svg>',
  lift:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 10l2-2 2 2M15 14l-2 2-2-2"/></svg>',
  entry:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6v18h8"/><path d="M14 3v18"/><path d="M18 12H11M13 9l-3 3 3 3"/></svg>',
  flag:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/></svg>',
  search:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>',
  room:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v15"/><path d="M3 20h18"/><path d="M14 12h.01"/></svg>'
};
