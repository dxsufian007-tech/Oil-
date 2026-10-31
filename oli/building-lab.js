/* Oli - building-lab.js  (Phase 2 host: the building system on the Phase 1 world)
 * SELECT (palette chip) -> DRAG (live ghost, finger offset) -> VALIDATE (one verdict) -> SMART SNAP (ports line up) -> CONFIRM (build bar).
 * The palette drag, the ghost drag and the pipe tool are captured before the map's own camera input sees them, so the camera never moves during a build gesture.
 * Nothing here touches core.js, the Phase A camera, the Phase C pipes or the map generator; pipes drawn here are a lab layer (a Set of tiles) only.
 */
(function () {
  'use strict';
  const WP = window.__wp, B = OliBuildings, A = OliBuildingArt, world = WP.world, ctx = WP.ctx, cam = WP.cam, hooks = WP.hooks, CFG = OliWorld.CONFIG, cv = document.getElementById('c');
  const ts = B.fromWorld(world), STORE = new B.BuildingStore(ts, { cash: 150000 }), pipes = new Set(), WW = world.W, PIPE_COST = 10, SAVE_KEY = 'oli-lab-v1';
  const $ = id => document.getElementById(id), fmt$ = n => '$' + Math.round(n).toLocaleString('en-US');
  const CAT = { EXTRACTION: '#d9962b', PIPE_NETWORK: '#4f8fc0', STORAGE: '#9aa7b3', PROCESSING: '#6faa7d', COMPANY: '#b9825a' };
  const REASON = { outside: 'Outside the map', water: 'Cannot build on water', terrain: 'Wrong terrain for this building', slope: 'Ground is too steep', overlap: 'Overlaps another building', tooClose: 'Too close to another plant (keep 1 tile free)',
    needsZone: 'Needs the refinery zone', noOilField: 'Needs an oil field you can drill', notDrillable: 'This field is not ready to drill', depleted: 'This field is depleted', alreadyBuilt: 'Only one of these is allowed', needsWell: 'Place it right next to an oil well',
    wellHasJack: 'This well already has a pump jack', connectionBlocked: 'A pipe connection is blocked', notLoaded: 'Loading this part of the world…', cash: 'Not enough cash', unknownBuilding: 'Unknown building' };
  const state = { drag: null, pending: null, sel: null, pipeTool: false, pipeDrag: null, demo: null, toast: '', toastAt: 0, rot: {}, lastTile: null };
  let animUntil = 0;

  /* ------------------------------------------------------------ palette */
  const pal = $('pal');
  for (const id of B.ORDER) {
    const d = B.DEFS[id], b = document.createElement('button'); b.className = 'chip'; b.dataset.def = id; b.style.setProperty('--cat', CAT[d.category]);
    const c = document.createElement('canvas'), W = 76, H = 50; c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px'; b.appendChild(c);
    const g = c.getContext('2d'), [fw, fh] = d.footprint, zz = Math.min(.5, 70 / ((fw + fh) * 32), 40 / ((fw + fh) * 16 + 52));
    g.scale(2, 2); A.draw(g, d.visual, { ox: W / 2 + (fh - fw) * 16 * zz, oy: H - 6 - (fw + fh) * 16 * zz, z: zz, r: 0, w: fw, h: fh, t: .4, fill: .6, state: 'OPERATIONAL' });
    const s = document.createElement('span'); s.textContent = d.name; b.appendChild(s); const q = document.createElement('i'); q.textContent = fmt$(d.cost) + ' · ' + fw + '×' + fh; b.appendChild(q); pal.appendChild(b);
  }
  function toast(m) { state.toast = m; state.toastAt = performance.now(); const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.opacity = 0; }, 2600); }

  /* ------------------------------------------------------------ geometry helpers */
  const dims = (id, r) => B.dimsOf(B.DEFS[id], B.DEFS[id].rotatable ? r : 0);
  function anchorFor(id, r, clientX, clientY, touch) {                            // the pointer is the footprint centre; touch lifts the ghost above the finger
    const t = WP.toTile(clientX, clientY - (touch ? 58 : 0)), [w, h] = dims(id, r); return { x: Math.round(t.x - w / 2), y: Math.round(t.y - h / 2) };
  }
  function evaluate(g, raw) {                                                     // snap + verdict for a ghost {def, r, x, y}; raw = no snapping (dropping exactly where the player pointed)
    const R = Math.max(1, Math.min(4, Math.round(26 / (32 * cam.z))));           // snap radius in tiles shrinks as the player zooms in
    const sn = raw ? null : STORE.snap(g.def, g.x, g.y, g.r, { radius: R, ignoreCash: true });
    if (sn) { g.x = sn.x; g.y = sn.y; g.r = sn.r; g.snapped = true; g.aligned = sn.aligned; } else { g.snapped = false; g.aligned = false; }
    g.verdict = STORE.validate(g.def, g.x, g.y, g.r, {}); return g;
  }

  /* ------------------------------------------------------------ palette drag */
  let pdn = null;
  pal.addEventListener('pointerdown', e => { const chip = e.target.closest('.chip'); if (!chip) return; pdn = { id: chip.dataset.def, x0: e.clientX, y0: e.clientY, pid: e.pointerId, started: false, chip, touch: e.pointerType !== 'mouse' }; });
  window.addEventListener('pointermove', e => {
    if (pdn && e.pointerId === pdn.pid) {
      const dx = e.clientX - pdn.x0, dy = e.clientY - pdn.y0;
      if (!pdn.started && (pdn.touch ? (dy < -10 && Math.abs(dy) > Math.abs(dx) * .7) : Math.hypot(dx, dy) > 6)) { pdn.started = true; try { pdn.chip.setPointerCapture(e.pointerId); } catch (_) { } beginDrag(pdn.id, e, pdn.touch, 'palette'); }
      if (pdn.started) { moveDrag(e); e.preventDefault(); }
    } else if (state.drag && state.drag.from === 'ghost' && e.pointerId === state.drag.pid) { moveDrag(e); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pointerup', e => {
    if (pdn && e.pointerId === pdn.pid) { const was = pdn; pdn = null; if (was.started) endDrag(e); else showDefinition(was.id); return; }
    if (state.drag && state.drag.from === 'ghost' && e.pointerId === state.drag.pid) { endDrag(e); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pointercancel', e => { if (pdn && e.pointerId === pdn.pid) { if (pdn.started) cancelAll(true); pdn = null; } if (state.drag && e.pointerId === state.drag.pid) cancelAll(true); }, true);

  function beginDrag(id, e, touch, from) {
    const r = state.rot[id] || 0, g = { def: id, r, x: 0, y: 0, from, pid: e.pointerId, touch }; state.pending = null; hideBar(); const a = anchorFor(id, r, e.clientX, e.clientY, touch); g.x = a.x; g.y = a.y; state.drag = evaluate(g); state.sel = null; WP.markDirty();
    $('info').innerHTML = '<h4>' + B.DEFS[id].name + '</h4><span class="k">Move your finger over the map: green = can build here, red = cannot.</span>';
  }
  function moveDrag(e) {
    const g = state.drag; if (!g) return; const a = g.from === 'ghost' ? { x: Math.round(WP.toTile(e.clientX, e.clientY - (g.touch ? 58 : 0)).x - g.grab.x), y: Math.round(WP.toTile(e.clientX, e.clientY - (g.touch ? 58 : 0)).y - g.grab.y) } : anchorFor(g.def, g.r, e.clientX, e.clientY, g.touch);
    g.over = e.clientY > innerHeight - 100; if (a.x === g.rawX && a.y === g.rawY) { WP.markDirty(); return; } g.rawX = a.x; g.rawY = a.y; g.x = a.x; g.y = a.y; evaluate(g); WP.markDirty();
  }
  function endDrag(e) {
    const g = state.drag; state.drag = null; if (!g) return;
    if (g.over || e.clientY > innerHeight - 100) { state.pending = null; hideBar(); toast('Cancelled'); WP.markDirty(); return; }
    state.pending = { def: g.def, x: g.x, y: g.y, r: g.r, verdict: g.verdict, snapped: g.snapped, aligned: g.aligned }; showBar(); WP.markDirty();
  }
  function cancelAll(silent) { state.drag = null; state.pending = null; state.pipeDrag = null; hideBar(); if (!silent) toast('Cancelled'); WP.markDirty(); }

  /* a pending ghost can be dragged again by touching it (everything else still pans the map) */
  window.addEventListener('pointerdown', e => {
    if (e.target !== cv) return;
    if (state.drag) { e.stopImmediatePropagation(); return; }                                     // a build gesture is running: nothing else may move the camera
    if (state.pipeTool) { e.stopImmediatePropagation(); startPipe(e); return; }
    const p = state.pending; if (!p) return; const t = WP.toTile(e.clientX, e.clientY), [w, h] = dims(p.def, p.r);
    if (t.x >= p.x - .6 && t.x <= p.x + w + .6 && t.y >= p.y - .6 && t.y <= p.y + h + .6) {
      e.stopImmediatePropagation(); state.drag = { def: p.def, r: p.r, x: p.x, y: p.y, from: 'ghost', pid: e.pointerId, touch: e.pointerType !== 'mouse', grab: { x: t.x - p.x, y: t.y - p.y + (e.pointerType !== 'mouse' ? 0 : 0) }, verdict: p.verdict }; state.pending = null; hideBar(); WP.markDirty();
    }
  }, true);

  /* ------------------------------------------------------------ confirm bar */
  const bar = $('buildbar');
  function showBar() { const p = state.pending; if (!p) return; const d = B.DEFS[p.def], v = p.verdict, ok = v.ok;
    bar.innerHTML = '<div class="msg ' + (ok ? 'good' : 'bad') + '">' + d.name + ' · ' + (ok ? fmt$(v.cost) + (p.aligned ? ' · pipes line up' : '') : (v.state === 'UNAFFORDABLE' ? 'Not enough cash (' + fmt$(v.cost) + ')' : REASON[v.reason] || v.reason)) + '</div>'
      + '<div class="btns"><button id="bBuild"' + (ok ? '' : ' disabled') + '>✓ Build</button>' + (d.rotatable ? '<button id="bRot">⟳ Rotate</button>' : '') + '<button id="bCancel">✕ Cancel</button></div>'; bar.style.display = 'block'; }
  function hideBar() { bar.style.display = 'none'; bar.innerHTML = ''; }
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; if (b.id === 'bBuild') confirmBuild(); else if (b.id === 'bRot') rotatePending(); else if (b.id === 'bCancel') cancelAll(); });
  function rotatePending() { const p = state.pending; if (!p) return; const d = B.DEFS[p.def]; if (!d.rotatable) return; const [w0, h0] = dims(p.def, p.r); p.r = (p.r + 1) & 3; state.rot[p.def] = p.r; const [w, h] = dims(p.def, p.r);
    p.x += Math.round((w0 - w) / 2); p.y += Math.round((h0 - h) / 2); const g = evaluate({ def: p.def, r: p.r, x: p.x, y: p.y }, true); p.x = g.x; p.y = g.y; p.verdict = g.verdict; p.aligned = false; showBar(); WP.markDirty(); }
  function confirmBuild() {
    const p = state.pending; if (!p) return; const r = STORE.place(p.def, p.x, p.y, p.r, {});                       // place() validates again: the player can never build on a stale verdict
    if (!r.ok) { p.verdict = r; showBar(); toast(REASON[r.reason] || r.reason); return; }
    state.pending = null; hideBar(); state.sel = r.building.id; toast(B.DEFS[p.def].name + ' under construction · −' + fmt$(r.cost)); save(); showBuilding(r.building.id); WP.markDirty(); updateCash();
  }

  /* ------------------------------------------------------------ existing buildings: panel, demolish */
  function showDefinition(id) {
    const d = B.DEFS[id], req = [d.requires.oilField ? 'on a drillable oil field' : '', d.requires.adjacentTo ? 'right next to an oil well' : '', d.zone ? 'inside the ' + d.zone.toLowerCase() + ' zone' : '', d.requires.unique ? 'only one allowed' : ''].filter(Boolean);
    $('info').innerHTML = '<h4>' + d.name + ' <span class="k">' + d.category.replace('_', ' ') + '</span></h4><span class="k">' + d.footprint.join('×') + ' tiles · ' + fmt$(d.cost) + ' · build ' + d.buildTime + ' s · upkeep ' + fmt$(d.maintenanceCost) + '/day · ' + d.capacity.value + ' ' + d.capacity.unit
      + '<br>Terrain: ' + d.allowedTerrain.map(t => CFG.TERRAIN[t].label).join(', ') + (req.length ? '<br>Needs: ' + req.join(', ') : '') + '</span><div class="k" style="margin-top:6px">Drag it onto the map.</div>';
  }
  function showBuilding(id) {
    const i = STORE.info(id, pipes); if (!i) return; state.sel = id; const b = STORE.get(id), lk = STORE.links(pipes).filter(l => l.from === id || l.to === id);
    const name = x => B.DEFS[STORE.get(x).d].name;
    $('info').innerHTML = '<h4>' + i.name + ' <span class="k">#' + id + '</span></h4><table class="kv"><tr><td>Status</td><td>' + i.status.replace('_', ' ').toLowerCase() + '</td></tr><tr><td>Capacity</td><td>' + i.capacity + '</td></tr><tr><td>Input</td><td>' + i.input + '</td></tr><tr><td>Output</td><td>' + i.output
      + '</td></tr><tr><td>Condition</td><td>' + i.condition + '</td></tr><tr><td>Maintenance</td><td>' + i.maintenance + '</td></tr><tr><td>Connected pipes</td><td>' + i.connectedPipes + (lk.length ? ' · ' + lk.map(l => (l.from === id ? '→ ' + name(l.to) : '← ' + name(l.from))).join(', ') : '') + '</td></tr>'
      + (i.field ? '<tr><td>Oil field</td><td>' + i.field + '</td></tr>' : '') + '</table><div class="row"><button id="bDemo">Demolish…</button></div>'; WP.markDirty();
  }
  $('info').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'bDemo') { const plan = STORE.demolishPlan(state.sel, pipes); state.demo = { id: state.sel, step: 1, plan };
      $('info').innerHTML = '<h4>Demolish ' + plan.name + '?</h4><span class="k">You get back ' + fmt$(plan.refund) + '. ' + (plan.dependents.length ? 'A linked pump jack will lose its well. ' : '') + '</span><div class="row"><button id="bDemoYes" class="danger">Yes, demolish</button><button id="bDemoNo">Keep it</button></div>'; }
    else if (b.id === 'bDemoNo') { state.demo = null; showBuilding(state.sel); }
    else if (b.id === 'bDemoYes') { const d = state.demo; if (!d) return;
      if (d.plan.needsPipeConfirm && d.step === 1) { d.step = 2; $('info').innerHTML = '<h4>' + d.plan.connectedPipes.length + ' pipe' + (d.plan.connectedPipes.length > 1 ? 's are' : ' is') + ' connected</h4><span class="k">The pipes stay in place with an open end. Demolish anyway?</span><div class="row"><button id="bDemoYes" class="danger">Demolish and leave open pipe</button><button id="bDemoNo">Keep it</button></div>'; return; }
      const r = STORE.demolish(d.id, { building: true, pipes: true, pipeSet: pipes }); state.demo = null; if (r.ok) { state.sel = null; toast('Demolished · +' + fmt$(r.refund)); $('info').textContent = 'Demolished.'; save(); updateCash(); } else toast(r.reason); WP.markDirty(); }
  });
  hooks.tap = (px, py) => {
    if (state.pending || state.drag) return false;
    const t = WP.toTile(px, py), b = STORE.at(Math.floor(t.x), Math.floor(t.y)); if (b) { showBuilding(b.id); return true; }
    const near = STORE.query(Math.floor(t.x) - 1, Math.floor(t.y) - 1, Math.floor(t.x) + 1, Math.floor(t.y) + 1)[0]; if (near && cam.z < .5) { showBuilding(near.id); return true; }
    if (state.sel) { state.sel = null; WP.markDirty(); } return false;
  };

  /* ------------------------------------------------------------ pipe tool (lab layer: tiles only, to show that ports are real attachment points) */
  $('tPipe').onclick = () => { state.pipeTool = !state.pipeTool; $('tPipe').classList.toggle('on', state.pipeTool); toast(state.pipeTool ? 'Pipe tool: drag from a port to another port. Switch it off to pan.' : 'Pipe tool off'); };
  function portNear(t) {
    let best = null, bd = 2.6; for (const b of STORE.query(Math.floor(t.x) - 4, Math.floor(t.y) - 4, Math.floor(t.x) + 4, Math.floor(t.y) + 4)) for (const p of B.worldPoints(b)) { if (p.kind !== 'pipe' || p.reserved) continue; const d = Math.hypot(p.ax + .5 - t.x, p.ay + .5 - t.y); if (d < bd) { bd = d; best = p; } }
    return best ? [best.ax, best.ay] : [Math.floor(t.x), Math.floor(t.y)];
  }
  function lpath(a, b, horizFirst) {
    const o = [], dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]); let x = a[0], y = a[1]; o.push([x, y]);
    const sX = () => { while (x !== b[0]) { x += dx; o.push([x, y]); } }, sY = () => { while (y !== b[1]) { y += dy; o.push([x, y]); } };
    if (horizFirst) { sX(); sY(); } else { sY(); sX(); } return o;
  }
  function pipePath(a, b) { const h = lpath(a, b, true), v = lpath(a, b, false), bad = p => p.filter(([x, y]) => !pipeOk([x, y]) && !pipes.has(B.key(WW, x, y))).length; return bad(h) <= bad(v) ? h : v; }
  function pipeOk([x, y]) { if (x < 0 || y < 0 || x >= world.W || y >= world.H) return false; const t = ts.tile(x, y); return !!t && ts.terrain[t.terrain].buildable && !STORE.at(x, y); }
  function startPipe(e) { const t = WP.toTile(e.clientX, e.clientY), a = portNear(t); state.pipeDrag = { a, b: a, pid: e.pointerId }; WP.markDirty();
    const mv = ev => { if (ev.pointerId !== state.pipeDrag.pid) return; state.pipeDrag.b = portNear(WP.toTile(ev.clientX, ev.clientY)); WP.markDirty(); };
    const up = ev => { if (ev.pointerId !== state.pipeDrag.pid) return; window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); const d = state.pipeDrag; state.pipeDrag = null; commitPipe(d.a, d.b); };
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); }
  function commitPipe(a, b) {
    const path = pipePath(a, b), fresh = path.filter(([x, y]) => !pipes.has(B.key(WW, x, y))); if (!path.every(pipeOk) && !path.every(([x, y]) => pipes.has(B.key(WW, x, y)) || pipeOk([x, y]))) { toast('Pipe blocked: water, a building or unloaded ground'); WP.markDirty(); return; }
    const cost = fresh.length * PIPE_COST; if (cost > STORE.cash) { toast('Not enough cash for the pipe'); return; } for (const [x, y] of fresh) pipes.add(B.key(WW, x, y)); STORE.cash -= cost; toast('Pipe laid · ' + fresh.length + ' tiles · −' + fmt$(cost)); save(); updateCash(); if (state.sel) showBuilding(state.sel); WP.markDirty();
  }

  /* ------------------------------------------------------------ drawing */
  const sx = WP.sx, sy = WP.sy;
  function diamondPath(x, y, w, h) { ctx.beginPath(); ctx.moveTo(sx(x, y), sy(x, y)); ctx.lineTo(sx(x + w, y), sy(x + w, y)); ctx.lineTo(sx(x + w, y + h), sy(x + w, y + h)); ctx.lineTo(sx(x, y + h), sy(x, y + h)); ctx.closePath(); }
  function tankFill(b) { return .35 + .3 * Math.sin(b.id * 1.7); }
  function drawBuildings(lv, vb) {
    const now = performance.now() / 1000, list = STORE.query(Math.floor(vb.x0) - 2, Math.floor(vb.y0) - 2, Math.ceil(vb.x1) + 2, Math.ceil(vb.y1) + 2); let anim = false;
    list.sort((p, q) => { const a = B.dimsOf(B.DEFS[p.d], p.r), c = B.dimsOf(B.DEFS[q.d], q.r); return (p.x + a[0] + p.y + a[1]) - (q.x + c[0] + q.y + c[1]); });
    // pipes first (they lie on the ground)
    if (pipes.size && lv !== 'FAR') drawPipes(vb);
    for (const b of list) {
      const d = B.DEFS[b.d], [w, h] = B.dimsOf(d, b.r);
      if (lv === 'FAR' || cam.z < .12) { diamondPath(b.x, b.y, w, h); ctx.fillStyle = CAT[d.category]; ctx.fill(); ctx.strokeStyle = 'rgba(20,16,10,.7)'; ctx.lineWidth = 1; ctx.stroke(); continue; }
      A.draw(ctx, d.visual, { ox: sx(b.x, b.y), oy: sy(b.x, b.y), z: cam.z, r: b.r, w: d.footprint[0], h: d.footprint[1], t: now, fill: tankFill(b), state: b.st });
      if (b.d === 'pump_jack' || b.d === 'refinery' || b.d === 'power') anim = true;
      if (b.id === state.sel) { diamondPath(b.x, b.y, w, h); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.2; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]); drawPorts(b, true); }
    }
    if (anim && cam.z >= .3) { animUntil = performance.now() + 140; setTimeout(() => WP.markDirty(), 120); }
  }
  function drawPipes(vb) {
    ctx.lineCap = 'round'; const wd = Math.max(2, 7 * cam.z), seg = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(sx(x0 + .5, y0 + .5), sy(x0 + .5, y0 + .5)); ctx.lineTo(sx(x1 + .5, y1 + .5), sy(x1 + .5, y1 + .5)); ctx.stroke(); };
    const tiles = []; for (const k of pipes) { const x = k % WW, y = (k / WW) | 0; if (x >= vb.x0 - 2 && x <= vb.x1 + 2 && y >= vb.y0 - 2 && y <= vb.y1 + 2) tiles.push([x, y, k]); }
    ctx.strokeStyle = 'rgba(30,26,20,.55)'; ctx.lineWidth = wd + 3 * cam.z; for (const [x, y] of tiles) { if (pipes.has(B.key(WW, x + 1, y))) seg(x, y, x + 1, y); if (pipes.has(B.key(WW, x, y + 1))) seg(x, y, x, y + 1); seg(x, y, x, y); }
    ctx.strokeStyle = '#7f8a96'; ctx.lineWidth = wd; for (const [x, y] of tiles) { if (pipes.has(B.key(WW, x + 1, y))) seg(x, y, x + 1, y); if (pipes.has(B.key(WW, x, y + 1))) seg(x, y, x, y + 1); seg(x, y, x, y); }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, wd * .3); for (const [x, y] of tiles) { if (pipes.has(B.key(WW, x + 1, y))) seg(x, y, x + 1, y); if (pipes.has(B.key(WW, x, y + 1))) seg(x, y, x, y + 1); }
  }
  function drawPorts(b, selected) {                                                // little arrows on the access tile: blue = in, orange = out, white = both
    for (const p of B.worldPoints(b)) { if (p.kind !== 'pipe' && !selected) continue; const x = sx(p.ax + .5, p.ay + .5), y = sy(p.ax + .5, p.ay + .5), r = Math.max(3, 6 * cam.z); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = p.reserved ? 'rgba(200,200,200,.5)' : p.role === 'in' ? '#4aa3ff' : p.role === 'out' ? '#ff9a3a' : '#f1f1f1'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  hooks.afterOverlays = (lv, vb) => drawBuildings(lv, vb);
  hooks.top = (lv, vb) => {
    const g = state.drag || state.pending; if (state.pipeDrag) { const pd = state.pipeDrag, path = pipePath(pd.a, pd.b), good = path.every(([x, y]) => pipeOk([x, y]) || pipes.has(B.key(WW, x, y))); ctx.fillStyle = good ? 'rgba(80,220,120,.55)' : 'rgba(240,70,60,.55)'; for (const [x, y] of path) { diamondPath(x, y, 1, 1); ctx.fill(); } }
    if (!g) return; const d = B.DEFS[g.def], v = g.verdict, [w, h] = dims(g.def, g.r), ok = v && v.ok, loading = v && v.state === 'LOADING';
    const col = loading ? 'rgba(180,180,190,.45)' : ok ? 'rgba(80,220,120,.38)' : 'rgba(240,70,60,.42)', edge = loading ? '#c9c9d2' : ok ? '#6dff9a' : '#ff8a80';
    diamondPath(g.x, g.y, w, h); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 2.4; ctx.stroke();
    if (lv !== 'FAR' && cam.z >= .12) { A.draw(ctx, d.visual, { ox: sx(g.x, g.y), oy: sy(g.x, g.y), z: cam.z, r: g.r, w: d.footprint[0], h: d.footprint[1], t: 0, fill: .5, state: 'OPERATIONAL', alpha: ok ? .8 : .55 }); }
    if (v && v.connections) for (const c of v.connections) { if (c.kind !== 'pipe' && c.kind !== 'link') continue; const x = sx(c.ax + .5, c.ay + .5), y = sy(c.ax + .5, c.ay + .5), r = Math.max(3.5, 7 * cam.z); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = !c.ok ? '#ff5a4d' : c.reserved ? 'rgba(210,210,210,.6)' : c.role === 'in' ? '#4aa3ff' : c.role === 'out' ? '#ff9a3a' : '#f4f4f4'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      const sd = B.SIDES[c.side]; ctx.beginPath(); ctx.moveTo(sx(c.x + .5, c.y + .5), sy(c.x + .5, c.y + .5)); ctx.lineTo(x, y); ctx.strokeStyle = !c.ok ? '#ff5a4d' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6; ctx.stroke(); }
    // direction arrow: from the footprint centre toward the rotated "east" face (the way a rotation turns)
    { const cx = g.x + w / 2, cy = g.y + h / 2, dv = [[1, 0], [0, 1], [-1, 0], [0, -1]][g.r & 3], x0 = sx(cx, cy), y0 = sy(cx, cy), x1 = sx(cx + dv[0] * Math.min(w, h) * .38, cy + dv[1] * Math.min(w, h) * .38), y1 = sy(cx + dv[0] * Math.min(w, h) * .38, cy + dv[1] * Math.min(w, h) * .38);
      if (d.rotatable) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.beginPath(); ctx.arc(x1, y1, 4.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); } }
    const label = loading ? 'Loading…' : ok ? fmt$(v.cost) : state.drag && state.drag.over ? 'Release to cancel' : (REASON[v.reason] || v.reason); ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; const X = sx(g.x + w / 2, g.y), Y = sy(g.x + w / 2, g.y) - 12 - (d.footprint[0] > 1 ? 40 * cam.z : 14 * cam.z);
    const tw = ctx.measureText(label).width, Xc = Math.max(tw / 2 + 8, Math.min(WP.VW() - tw / 2 - 8, X)); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,16,.85)'; ctx.strokeText(label, Xc, Y); ctx.fillStyle = ok ? '#8dffb0' : loading ? '#ddd' : '#ffb0a8'; ctx.fillText(label, Xc, Y);
  };

  /* ------------------------------------------------------------ cash, save / load, keys, test handle */
  function updateCash() { $('cash').textContent = fmt$(STORE.cash); }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, store: STORE.toJSON(), pipes: [...pipes], cash: STORE.cash })); } catch (_) { } }
  function load() {
    let raw = null; try { raw = localStorage.getItem(SAVE_KEY); } catch (_) { } if (!raw) return { loaded: 0, from: 'none' };
    let d; try { d = JSON.parse(raw); } catch (_) { return { loaded: 0, from: 'corrupt' }; }
    const r = B.BuildingStore.fromJSON(ts, d.store); STORE.items = r.store.items; STORE.occ = r.store.occ; STORE.bucket = r.store.bucket; STORE.nextId = r.store.nextId; STORE.time = r.store.time; STORE.cash = d.cash == null ? STORE.cash : d.cash; pipes.clear(); for (const k of d.pipes || []) pipes.add(k); updateCash(); WP.markDirty(); return { loaded: r.report.loaded, dropped: r.report.dropped, from: 'localStorage' };
  }
  function reset() { STORE.items.clear(); STORE.occ.clear(); STORE.bucket.clear(); STORE.nextId = 1; STORE.cash = 150000; pipes.clear(); state.sel = null; state.pending = null; hideBar(); save(); updateCash(); WP.markDirty(); }
  $('tSave').onclick = () => { save(); toast('Saved · ' + STORE.items.size + ' buildings'); };
  $('tLoad').onclick = () => { const r = load(); toast(r.loaded ? 'Loaded ' + r.loaded + ' buildings' : 'Nothing saved yet'); };
  $('tReset').onclick = () => { if (confirm('Remove every building?')) { reset(); toast('Cleared'); } };
  window.addEventListener('keydown', e => { if (e.key === 'Escape') cancelAll(); else if ((e.key === 'r' || e.key === 'R')) { if (state.drag) { const g = state.drag; g.r = (g.r + 1) & 3; state.rot[g.def] = g.r; evaluate(g); WP.markDirty(); } else rotatePending(); } else if (e.key === 'Enter' && state.pending && state.pending.verdict.ok) confirmBuild(); });
  $('tFields').onclick = () => { const sr = world.regions.find(r => r.starter), f = world.regionSites(sr.id).filter(s => s.kind === 'FIELD' && (world.stateOf(s.id) === 'DRILLABLE' || world.stateOf(s.id) === 'PRODUCING'))[0]; if (f) WP.goto(f.x, f.y, .75); };
  $('tRef').onclick = () => { const sr = world.regions.find(r => r.starter), z = world.refineryZones(sr.id)[0]; if (z) WP.goto(z.x + z.w / 2, z.y + z.h / 2, .5); };

  /* a coherent demo compound for screenshots and device checks: wells + jacks on the field, a gathering line to a pump station and tanks, and a processing site with the refinery in its zone */
  const until = async fn => { for (let i = 0; i < 600; i++) { await new Promise(r => setTimeout(r, 100)); if (fn()) return true; } return false; };
  const settle = async () => { await new Promise(r => setTimeout(r, 450)); await until(() => WP.idle()); };
  async function buildDemo() {
    reset(); STORE.cash = 1e8; const sr = world.regions.find(r => r.starter), fld = world.regionSites(sr.id).find(q => q.kind === 'FIELD' && (world.stateOf(q.id) === 'DRILLABLE' || world.stateOf(q.id) === 'PRODUCING')); if (!fld) return { ok: false, reason: 'noField' };
    const put = (def, x, y, r, rad) => { const sn = STORE.snap(def, Math.round(x), Math.round(y), r || 0, { radius: rad == null ? 5 : rad, ignoreCash: true }); if (!sn) return null; const res = STORE.place(def, sn.x, sn.y, sn.r, { instant: true }); return res.ok ? res.building : null; };
    const fx = Math.round(fld.x), fy = Math.round(fld.y), out = {}, wells = []; WP.goto(fx + 4, fy + 4, .3); await settle();
    for (const [dx, dy] of [[-4, -3], [0, -4], [4, -1], [-3, 2]]) { const w = put('oil_well', fx + dx, fy + dy, 0, 3); if (w) { wells.push(w); const j = [[1, 0, 0], [-2, 0, 0], [0, 1, 1], [0, -1, 1]].map(([a, b, r]) => STORE.validate('pump_jack', w.x + a, w.y + b, r, { ignoreCash: true })).findIndex(v => v.ok); if (j >= 0) { const o = [[1, 0, 0], [-2, 0, 0], [0, 1, 1], [0, -1, 1]][j]; STORE.place('pump_jack', w.x + o[0], w.y + o[1], o[2], { instant: true }); } } }
    out.wells = wells.length; const jn = put('junction', fx, fy + 7, 0, 4), vs = put('valve_station', fx + 3, fy + 7, 0, 4), ps = put('pump_station', fx + 6, fy + 6, 0, 4), t1 = put('oil_tank', fx + 11, fy + 6, 0, 4), t2 = put('oil_tank', fx + 11, fy + 10, 0, 5);
    const lay = (a, b) => { if (!a || !b) return; const pa = B.worldPoints(a).filter(p => p.kind === 'pipe' && !p.reserved), pb = B.worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved); let best = null; for (const p of pa) if (p.role !== 'in') for (const q of pb) if (q.role !== 'out') { const d = Math.abs(p.ax - q.ax) + Math.abs(p.ay - q.ay); if (!best || d < best.d) best = { d, p, q }; } if (best) { const path = pipePath([best.p.ax, best.p.ay], [best.q.ax, best.q.ay]); if (path.every(pipeOk) || path.every(([x, y]) => pipeOk([x, y]) || pipes.has(B.key(WW, x, y)))) for (const [x, y] of path) pipes.add(B.key(WW, x, y)); } };
    for (const w of wells) lay(w, jn); lay(jn, vs); lay(vs, ps); lay(ps, t1); lay(ps, t2);
    const z = world.refineryZones(sr.id)[0]; if (z) { WP.goto(z.x + 14, z.y + 12, .3); await settle(); const rf = put('refinery', z.x + 16, z.y + 8, 0, 6); out.refinery = !!rf; put('large_tank', z.x + 3, z.y + 4, 0, 4); put('separator', z.x + 3, z.y + 12, 0, 4); const pp = put('processing_plant', z.x + 16, z.y + 22, 0, 5); put('control_center', z.x - 8, z.y + 2, 0, 5); put('maintenance', z.x - 8, z.y + 10, 0, 5); put('power', z.x + 26, z.y + 24, 0, 5); put('warehouse', z.x - 8, z.y + 16, 0, 5); }
    for (const b of STORE.list()) b.st = 'OPERATIONAL'; out.total = STORE.list().length; out.pipeTiles = pipes.size; save(); updateCash(); WP.markDirty(); return Object.assign({ ok: true }, out);
  }
  $('tDemo').onclick = async () => { toast('Building the demo compound…'); const r = await buildDemo(); toast(r.ok ? 'Demo compound: ' + r.total + ' buildings' : 'Demo needs a drillable field'); };

  const tick = setInterval(() => { STORE.tick(1); WP.markDirty(); }, 1000);
  window.__lab = { buildDemo, store: STORE, pipes, state, B, A, evaluate, save, load, reset, toast, confirmBuild, rotatePending, cancelAll, showBuilding, anchorFor, pipePath, commitPipe, updateCash,
    ready: () => true };
  updateCash();
  // restore the previous session once the demo discovery states exist (wells need drillable fields)
  const wait = setInterval(() => { if (WP.idle && WP.idle()) { clearInterval(wait); const r = load(); window.__lab.restored = r; if (r.loaded) toast('Restored ' + r.loaded + ' buildings'); WP.markDirty(); } }, 200);
})();
