/* ============================== 路线渲染 ============================== */
function renderRoute(){
  lastMkKey = "";
  routeLayer.innerHTML = "";
  markerLayer.innerHTML = "";
  if(!state.route){ return; }
  const r = state.route;
  const fi = FLOOR_INDEX.get(state.floor);
  const f = FLOORS[fi];

  // 本层的连续段
  const segs = [];
  let cur = [];
  let lastFi = -1;
  for(let i=0;i<r.points.length;i++){
    const n = NODES[r.points[i]];
    if(n[2] === fi){
      cur.push([n[0],n[1]]);
      lastFi = n[2];
    } else {
      if(cur.length > 1) segs.push(cur);
      cur = [];
    }
  }
  if(cur.length > 1) segs.push(cur);

  // 路线气泡
  let svg = "";
  for(const s of segs){
    const d = s.map((p,i)=>(i?"L":"M")+p[0]+" "+p[1]).join("");
    svg += `<path class="route-glow" d="${d}"/>`;
    svg += `<path class="route-casing" d="${d}"/>`;
    svg += `<path class="route-line" d="${d}"/>`;
    svg += `<path class="route-dash" d="${d}"/>`;
  }
  routeLayer.innerHTML = svg;

  // 起终点 / 换层标记
  let marks = "";
  const sIdx = r.points[0], eIdx = r.points[r.points.length-1];
  if(NODES[sIdx][2] === fi) marks += marker(NODES[sIdx][0], NODES[sIdx][1], "start", "起");
  if(NODES[eIdx][2] === fi) marks += marker(NODES[eIdx][0], NODES[eIdx][1], "end", "终");

  for(const st of r.steps){
    if(st.type !== "vertical" || !st.pts.length) continue;
    const up = !st.text.includes("下");
    const drawArrow = (x,y,label)=>{
      const w = label ? (label.replace(/\s/g,"").length * 8.2 + 12) : 0;
      marks += `<g class="mk" transform="translate(${x} ${y}) rotate(${(-compassRotationDeg()).toFixed(2)}) scale(${1/state.view.s})">
        <circle r="10" fill="#fff" opacity=".95"/>
        <circle r="8" fill="#f59e0b"/>
        <path d="M0 ${up?4:-4} V ${up?-4:4} M-3 ${up?-1:1} L0 ${up?-4:4} L3 ${up?-1:1}"
          stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        ${label ? `<g transform="translate(0 -20)">
          <rect x="${-w/2}" y="-8" width="${w}" height="16" rx="5" fill="#fff" opacity=".96"/>
          <text x="0" y="0.5" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="600" fill="#b45309">${label}</text>
        </g>` : ""}
      </g>`;
    };
    if(st.floor === state.floor) drawArrow(st.pts[0][0], st.pts[0][1], st.dirLabel || "");
    if(st.prevFloor === state.floor && st.fromPts && st.fromPts.length) drawArrow(st.fromPts[0][0], st.fromPts[0][1], st.dirLabel || "");
  }
  markerLayer.innerHTML = marks;

  renderActiveStep();
}

function marker(x,y,type,label){
  const color = type === "start" ? "#10b981" : "#ef4444";
  return `<g class="mk" transform="translate(${x} ${y}) rotate(${(-compassRotationDeg()).toFixed(2)}) scale(${1/state.view.s})">
    <circle r="11" fill="#fff" opacity=".95"/>
    <circle r="9" fill="${color}"/>
    <text y="0.5" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="10" font-weight="700">${label}</text>
  </g>`;
}

let lastMkKey = "";
function updateMarkersScale(){
  const k = 1/state.view.s;
  const rot = -compassRotationDeg();
  const key = k.toFixed(5) + "|" + rot.toFixed(3);
  if(key === lastMkKey) return;
  lastMkKey = key;
  markerLayer.querySelectorAll(".mk").forEach(g=>{
    const t = g.getAttribute("transform") || "";
    const m = t.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    if(m) g.setAttribute("transform", `translate(${m[1]} ${m[2]}) rotate(${(-compassRotationDeg()).toFixed(2)}) scale(${k})`);
  });
}

function renderActiveStep(){
  const old = routeLayer.querySelector(".step-glow");
  if(old) old.remove();
  if(state.activeStep < 0 || !state.route) return;
  const st = state.route.steps[state.activeStep];
  if(!st || !st.pts || st.pts.length < 2) return;
  if(st.floor !== state.floor) return;
  const d = st.pts.map((p,i)=>(i?"L":"M")+p[0]+" "+p[1]).join("");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("class", "step-glow");
  p.setAttribute("d", d);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "#f59e0b");
  p.setAttribute("stroke-width", "9");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("opacity", ".45");
  p.setAttribute("vector-effect", "non-scaling-stroke");
  routeLayer.appendChild(p);
}
