/* Oli world worker: all heavy world work (chunk terrain, pixels, overview, region data) happens here, so the drawing thread never stalls. Original code. */
importScripts('worldmap.js');
let world = null;
onmessage = e => {
  const m = e.data;
  if (m.t === 'init') { world = self.OliWorld.createWorld({ seed: m.seed }); postMessage({ t: 'ready' }); return; }
  if (!world) return;
  if (m.t === 'overview') { const o = world.renderOverview(m.step); postMessage({ t: 'overview', w: o.w, h: o.h, step: o.step, rgba: o.rgba }, [o.rgba.buffer]); }
  else if (m.t === 'img') { const rgba = world.renderChunkRGBA(m.cx, m.cy, m.k), ch = world.exportChunk(m.cx, m.cy); postMessage({ t: 'img', cx: m.cx, cy: m.cy, k: m.k, rgba, chunk: ch }, [rgba.buffer, ch.terrain.buffer, ch.elev.buffer, ch.slope.buffer]); }
  else if (m.t === 'region') postMessage({ t: 'region', d: world.regionData(m.rid) });
  else if (m.t === 'heat') { const n = 32, a = new Uint8ClampedArray(n * n * 4); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = world.oilProbability(m.cx * 64 + i * 2, m.cy * 64 + j * 2), q = (j * n + i) * 4; a[q] = 255; a[q + 1] = 80 + 80 * (1 - p); a[q + 2] = 20; a[q + 3] = Math.min(210, p * 330); } postMessage({ t: 'heat', cx: m.cx, cy: m.cy, rgba: a }, [a.buffer]); }
};
