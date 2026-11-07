/* ============================== 路径规划 ============================== */
function dijkstra(startIdx, endIdx, useTeachingLift){
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const prevKind = new Uint8Array(N);
  const done = new Uint8Array(N);
  dist[startIdx] = 0;
  const heap = new MinHeap();
  heap.push(startIdx, 0);
  while(heap.size){
    const [u,du] = heap.pop();
    if(done[u]) continue;
    done[u] = 1;
    if(u === endIdx) break;
    for(const [v,w,k] of ADJ[u]){
      // 关闭「使用教学楼电梯」时只屏蔽教学楼电梯边，其他楼栋电梯保持可用
      if(k === 2 && !useTeachingLift && (IS_TEACHING_LIFT[u] || IS_TEACHING_LIFT[v])) continue;
      const nd = du + w;
      if(nd < dist[v] - 1e-9){
        dist[v] = nd; prev[v] = u; prevKind[v] = k;
        heap.push(v, nd);
      }
    }
  }
  if(dist[endIdx] === Infinity) return null;
  const path = [endIdx], kinds = [];
  let cur = endIdx;
  while(cur !== startIdx){
    const p = prev[cur];
    if(p < 0) return null;
    kinds.push(prevKind[cur]);
    path.push(p);
    cur = p;
  }
  path.reverse(); kinds.reverse();
  return {path, kinds, distance:dist[endIdx]};
}

class MinHeap{
  constructor(){ this.a = []; }
  get size(){ return this.a.length; }
  push(node, pri){
    const a = this.a; a.push([node,pri]);
    let i = a.length-1;
    while(i>0){
      const p = (i-1)>>1;
      if(a[p][1] <= a[i][1]) break;
      [a[p],a[i]] = [a[i],a[p]]; i = p;
    }
  }
  pop(){
    const a = this.a;
    const top = a[0], last = a.pop();
    if(a.length){
      a[0] = last;
      let i = 0;
      while(true){
        const l = i*2+1, r = l+1;
        let m = i;
        if(l<a.length && a[l][1] < a[m][1]) m = l;
        if(r<a.length && a[r][1] < a[m][1]) m = r;
        if(m === i) break;
        [a[m],a[i]] = [a[i],a[m]]; i = m;
      }
    }
    return top;
  }
}

/* ============================== 分步指引 ============================== */
const TURN = {
  straight:{icon:"straight",word:"直行"},
  left:{icon:"left",word:"左转"},
  right:{icon:"right",word:"右转"},
  slightLeft:{icon:"slightLeft",word:"稍向左"},
  slightRight:{icon:"slightRight",word:"稍向右"},
  back:{icon:"straight",word:"掉头"}
};

function angleDeg(a,b,c){
  const a1 = Math.atan2(b[1]-a[1], b[0]-a[0]);
  const a2 = Math.atan2(c[1]-b[1], c[0]-b[0]);
  let d = a2-a1;
  while(d > Math.PI) d -= Math.PI*2;
  while(d < -Math.PI) d += Math.PI*2;
  return d*180/Math.PI;
}
function turnOf(deg){
  const a = Math.abs(deg);
  if(a < 30) return TURN.straight;
  if(a > 150) return TURN.back;
  if(deg > 0) return a > 62 ? TURN.right : TURN.slightRight;
  return a > 62 ? TURN.left : TURN.slightLeft;
}

function rdp(points, eps){
  if(points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length-1] = 1;
  const stack = [[0, points.length-1]];
  while(stack.length){
    const [i0,i1] = stack.pop();
    const [x0,y0] = points[i0], [x1,y1] = points[i1];
    const dx = x1-x0, dy = y1-y0;
    const len = Math.hypot(dx,dy) || 1e-9;
    let md = -1, mi = -1;
    for(let i=i0+1;i<i1;i++){
      const [x,y] = points[i];
      const d = Math.abs(dy*x - dx*y + x1*y0 - y1*x0)/len;
      if(d > md){ md = d; mi = i; }
    }
    if(md > eps){
      keep[mi] = 1;
      stack.push([i0,mi],[mi,i1]);
    }
  }
  return points.filter((_,i)=>keep[i]);
}

function pointDist(a,b){ return Math.hypot(a[0]-b[0],a[1]-b[1]) / UNIT; }

function buildRoute(res, startPoi, endPoi){
  const {path, kinds} = res;
  const floorOrder = DATA.meta.floorOrder;

  // 1) 拆成同层腿 + 跨层/入口
  const legs = [];
  const trans = [];
  let cur = {fi:NODES[path[0]][2], nodes:[path[0]]};
  for(let i=1;i<path.length;i++){
    const k = kinds[i-1];
    const fi = NODES[path[i]][2];
    if(k === 1 || k === 2 || k === 3){
      legs.push(finishLeg(cur));
      trans.push({kind:k, a:path[i-1], b:path[i], from:NODES[path[i-1]][2], to:fi});
      cur = {fi, nodes:[path[i]]};
    } else {
      cur.nodes.push(path[i]);
    }
  }
  legs.push(finishLeg(cur));

  function finishLeg(l){
    const pts = l.nodes.map(i=>[NODES[i][0],NODES[i][1]]);
    let d = 0;
    for(let i=1;i<pts.length;i++) d += pointDist(pts[i-1],pts[i]);
    return {fi:l.fi, nodes:l.nodes.slice(), pts, dist:d};
  }

  // 2) 合并中间的空腿（同一楼梯连续两层）
  for(let i=legs.length-1;i>0;i--){
    if(legs[i].dist < 0.6 && legs[i].pts.length <= 2){
      // 把第 i 腿前面的过渡与后面的过渡合并
      const t1 = trans[i-1], t2 = trans[i];
      if(t2 && t1 && (t1.kind === t2.kind || t1.kind === 3 || t2.kind === 3)){
        trans.splice(i-1, 2, {
          kind: t1.kind === 3 || t2.kind === 3 ? 3 : t1.kind,
          a: t1.a, b: t2.b, from: t1.from, to: t2.to,
          nameNode: t1.nameNode ?? t1.a, via: t1.via || t2.via
        });
        legs.splice(i,1);
      }
    }
  }

  // 3) 生成步骤
  const steps = [];
  let si = 0;

  function legSteps(leg, isFirstLeg){
    const f = FLOORS[leg.fi];
    if(leg.pts.length === 1 || leg.dist < 0.6) return;
    const firstIdx = steps.length;
    const exclude = new Set([startPoi.n, endPoi.n]);
    const legBld = (leg.nodes.length && NODES[leg.nodes[leg.nodes.length-1]][5]) || "";
    const simp = rdp(leg.pts, 12);
    // 距离与拐点
    const segs = [];
    for(let i=1;i<simp.length;i++){
      segs.push({a:simp[i-1], b:simp[i], d:pointDist(simp[i-1],simp[i])});
    }
    const turns = [];
    for(let i=1;i<simp.length-1;i++){
      const deg = angleDeg(simp[i-1], simp[i], simp[i+1]);
      if(Math.abs(deg) >= 30) turns.push({idx:i, deg});
    }
    const bounds = [0, ...turns.map(t=>t.idx), simp.length-1];
    for(let bi=0; bi<bounds.length-1; bi++){
      const s0 = bounds[bi], s1 = bounds[bi+1];
      let dist = 0;
      for(let i=s0;i<s1;i++) dist += pointDist(simp[i],simp[i+1]);
      if(dist < 1.2 && bi < bounds.length-2) continue;
      const p0 = simp[s0];
      let word = null, icon = "straight";
      if(bi === 0){
        if(turns.length && turns[0].idx === 0){
          const t = turnOf(turns[0].deg); word = t.word; icon = t.icon;
        }
      } else {
        const t = turnOf(turns[bi-1].deg);
        word = t.word; icon = t.icon;
      }
      let landmark = nearestRoom(p0, leg.fi, 10);
      if(landmark && exclude.has(landmark)) landmark = null;
      let text;
      if(isFirstLeg && bi === 0){
        text = `从${startPoi.n}出发` + (word && word !== "直行" ? `，${word}` : "，向前直行");
      } else {
        text = word && word !== "直行" ? `${word}，直行` : (bi===0 ? "出楼梯后直行" : "继续直行");
      }
      steps.push({
        type:"walk", floor:f.id, icon, dist, text,
        sub: landmark ? `经过 ${landmark}` : "",
        pts: simp.slice(s0, s1+1),
        floorName:f.name, weight: dist, bld: legBld
      });
    }
    // 合并过短的碎步（<15 米），避免“右转 4 米、左转 15 米”这类噪音
    for(let i=firstIdx+1; i<steps.length-1; i++){
      const a = steps[i], b = steps[i+1];
      if(a.type === "walk" && b.type === "walk" && a.floor === b.floor && a.dist < 15){
        b.dist += a.dist;
        b.pts = a.pts.concat(b.pts.slice(1));
        steps.splice(i,1);
        i--;
      }
    }
  }

  for(let i=0;i<legs.length;i++){
    legSteps(legs[i], i===0);
    if(i < trans.length){
      const t = trans[i];
      const nf = FLOORS[t.to], pf = FLOORS[t.from];
      const a = NODES[t.a], b = NODES[t.b];
      const name = a[4] || b[4] || "";
      const dir = (LEVEL.get(nf.id) > LEVEL.get(pf.id)) ? "上" : "下";
      const lv = Math.abs((LEVEL.get(nf.id)||0) - (LEVEL.get(pf.id)||0));
      const floors = lv % 1 === 0 ? lv : Number(lv.toFixed(1));
      const amt = floors === 0.5 ? "半" : floors;
      const outdoor = pf.id === "ground" || nf.id === "ground";
      const where = t.kind === 3
        ? `经${b[5] || pf.name}入口`
        : (t.kind === 2 ? `乘电梯${name ? " " + name : ""}` : `走楼梯${name ? " " + name : ""}`);
      let type = "vertical", icon = t.kind === 2 ? "lift" : (t.kind === 3 ? "entry" : "stair");
      let text;
      if(outdoor){
        type = "entry"; icon = "entry";
        const fromName = a[4] || "校园入口";
        const isGate = /入口|门/.test(fromName);
        text = nf.id === "ground"
          ? `前往${b[4] || "室外"}`
          : (isGate ? `从${fromName}进入校园` : `从${fromName}进入室内`);
      } else if(t.kind === 3){
        text = floors ? `${where}，${dir} ${amt} 层到 ${nf.name}` : `${where}进入${nf.name}`;
      } else {
        text = `${where}，${dir} ${amt} 层（${pf.name} → ${nf.name}）`;
      }
      const vWeight = outdoor ? 0 : (t.kind === 2 ? 6 : 9) * Math.abs((LEVEL.get(nf.id)||0) - (LEVEL.get(pf.id)||0));
      steps.push({
        type, floor:nf.id, icon,
        text, dist:null, sub: "", pts:[[b[0],b[1]]], floorName:nf.name,
        verticalKind:t.kind, prevFloor: pf.id, fromPts:[[a[0],a[1]]],
        dirLabel: outdoor ? "" : `${dir} ${amt} 层`, weight: vWeight, bld: b[5] || ""
      });
    }
  }

  // 终点步骤
  const lastNode = NODES[path[path.length-1]];
  steps.push({
    type:"end", floor:FLOORS[lastNode[2]].id, icon:"flag",
    text:`到达 ${endPoi.n}`, dist:null,
    sub:`${FLOORS[lastNode[2]].name}${lastNode[5] ? " · " + lastNode[5] : ""}`,
    pts:[[lastNode[0],lastNode[1]]], floorName:FLOORS[lastNode[2]].name, weight: 0, bld: lastNode[5] || ""
  });

  // 4) 楼层序列（按路径节点，避免首段只有楼梯节点时漏层）
  const seq = [];
  for(const idx of path){
    const fid = FLOORS[NODES[idx][2]].id;
    if(seq[seq.length-1] !== fid) seq.push(fid);
  }

  return {
    steps, points:path, distance:res.distance,
    floors:seq, startPoi, endPoi,
    stairs: steps.filter(s=>s.verticalKind===1).length,
    lifts: steps.filter(s=>s.verticalKind===2).length
  };
}

function nearestRoom(p, fi, maxM){
  let best = null, bd = maxM*UNIT;
  const f = FLOORS[fi];
  for(const l of f.labels){
    if(l.c !== "workstationaction") continue;
    const d = Math.hypot(l.x-p[0], l.y-p[1]);
    if(d < bd){ bd = d; best = l.n; }
  }
  return best;
}
