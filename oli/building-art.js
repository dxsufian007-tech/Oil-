/* Oli - building-art.js  (Phase 2 placeholder art: original procedural isometric drawings, no external assets, replaceable per visual id)
 * draw(ctx, visual, o)  o = { ox, oy (screen position of the footprint's north corner), z (px scale: 1 tile = 64 x 32 px at z = 1), r (0..3), w, h (UNROTATED footprint),
 *                              t (seconds, for moving parts), fill (0..1 tanks), state ('OPERATIONAL'|'UNDER_CONSTRUCTION'|...), alpha, tint ('good'|'bad'|null), valve (0 open,1 partial,2 closed) }
 * Each building is built from solid parts (box / cylinder / sphere / pipe / lattice) sorted back to front; one function per visual id so no two share a drawing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliBuildingArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HU = 26;                                                               // screen px per tile of height at z = 1
  const C = { concrete: '#b8ae9c', pad: '#9d9484', steel: '#8d99a6', dark: '#4b5662', white: '#ece8de', cream: '#d9d0b8', red: '#c4512f', yellow: '#e2b32c', blue: '#3f7fb0', green: '#5fb86e', rust: '#a4623a', glass: '#7fb4d6', roof: '#6f7a84', black: '#262b31', pipe: '#6b7682' };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (h, k) => { const [r, g, b] = hex(h); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; };

  function Painter(ctx, o) {
    this.ctx = ctx; this.o = o; this.parts = []; this.z = o.z; this.w = o.w; this.h = o.h; this.r = o.r & 3;
    const [W, H] = this.r & 1 ? [o.h, o.w] : [o.w, o.h]; this.W = W; this.H = H;
  }
  Painter.prototype = {
    // local (u,v,hh) of the UNROTATED footprint -> screen
    P(u, v, hh) {
      let a = u, b = v, w = this.w, h = this.h;
      for (let i = 0; i < this.r; i++) { const nu = h - b, nv = a; a = nu; b = nv; const t = w; w = h; h = t; }
      return [this.o.ox + (a - b) * 32 * this.z, this.o.oy + (a + b) * 16 * this.z - (hh || 0) * HU * this.z];
    },
    add(key, fn) { this.parts.push({ key, fn }); },
    key(u, v, hh) { let a = u, b = v, w = this.w, h = this.h; for (let i = 0; i < this.r; i++) { const nu = h - b, nv = a; a = nu; b = nv; const t = w; w = h; h = t; } return a + b + (hh || 0) * 0.01; },
    poly(pts, fill, stroke) { const c = this.ctx; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = Math.max(.6, this.z); c.stroke(); } },
    // axis-aligned box in local coordinates; faces facing the viewer after rotation are shaded by their world direction
    box(u0, v0, u1, v1, h0, h1, col, o) {
      o = o || {}; const self = this;
      this.add(this.key((u0 + u1) / 2, (v0 + v1) / 2, h0), () => {
        const P = (u, v, hh) => self.P(u, v, hh), top = [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)];
        // visible side faces: the ones whose outward normal points to +screen-down after rotation
        const faces = [[[u0, v1], [u1, v1], 'v+'], [[u1, v0], [u1, v1], 'u+'], [[u0, v0], [u0, v1], 'u-'], [[u0, v0], [u1, v0], 'v-']];
        for (const [a, b, n] of faces) {
          const nu = n === 'u+' ? 1 : n === 'u-' ? -1 : 0, nv = n === 'v+' ? 1 : n === 'v-' ? -1 : 0; let a2 = nu, b2 = nv; for (let i = 0; i < self.r; i++) { const x = -b2, y = a2; a2 = x; b2 = y; }
          if (a2 + b2 <= 0) continue; const k = (a2 > 0 ? 0.74 : 0.9) * (o.k || 1);
          self.poly([P(a[0], a[1], h0), P(b[0], b[1], h0), P(b[0], b[1], h1), P(a[0], a[1], h1)], shade(o.side || col, k), 'rgba(20,16,10,.35)');
        }
        self.poly(top, shade(o.top || col, 1.08 * (o.k || 1)), 'rgba(20,16,10,.35)');
      });
    },
    // vertical cylinder (iso: a circle on the ground is an ellipse rx = r*sqrt2*32, ry = r*sqrt2*16)
    cyl(cu, cv, rad, h0, h1, col, o) {
      o = o || {}; const self = this;
      this.add(this.key(cu, cv, h0), () => {
        const c = self.ctx, [x, y0] = self.P(cu, cv, h0), [, y1] = self.P(cu, cv, h1), rx = rad * 1.4142 * 32 * self.z, ry = rad * 1.4142 * 16 * self.z;
        const g = c.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, shade(col, .66)); g.addColorStop(.38, shade(col, 1.06)); g.addColorStop(1, shade(col, .58));
        c.beginPath(); c.ellipse(x, y0, rx, ry, 0, 0, Math.PI); c.lineTo(x - rx, y1); c.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(20,16,10,.4)'; c.lineWidth = Math.max(.6, self.z); c.stroke();
        c.beginPath(); c.ellipse(x, y1, rx, ry, 0, 0, 7); c.fillStyle = shade(o.top || col, 1.1); c.fill(); c.stroke();
        if (o.band) { c.fillStyle = o.band; const yb = y0 + (y1 - y0) * o.bandAt; c.beginPath(); c.ellipse(x, yb, rx, ry, 0, 0, Math.PI); c.lineTo(x - rx, yb - 3 * self.z); c.ellipse(x, yb - 3 * self.z, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill(); }
      });
    },
    // horizontal cylinder along u or v
    hcyl(u0, v0, len, axis, rad, hh, col) {
      const self = this, u1 = axis === 'u' ? u0 + len : u0, v1 = axis === 'v' ? v0 + len : v0;
      this.add(this.key((u0 + u1) / 2, (v0 + v1) / 2, hh), () => {
        const c = self.ctx, a = self.P(u0, v0, hh + rad), b = self.P(u1, v1, hh + rad), r = rad * HU * self.z * 1.05;
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        const g = c.createLinearGradient(a[0] + nx * r, a[1] + ny * r, a[0] - nx * r, a[1] - ny * r); g.addColorStop(0, shade(col, 1.12)); g.addColorStop(.5, shade(col, .95)); g.addColorStop(1, shade(col, .6));
        self.poly([[a[0] + nx * r, a[1] + ny * r], [b[0] + nx * r, b[1] + ny * r], [b[0] - nx * r, b[1] - ny * r], [a[0] - nx * r, a[1] - ny * r]], g, 'rgba(20,16,10,.4)');
        c.fillStyle = shade(col, .8); for (const p of [a, b]) { c.beginPath(); c.ellipse(p[0], p[1], r * .55, r, Math.atan2(dy, dx) + Math.PI / 2 - Math.PI / 2, 0, 7); c.fill(); }
      });
    },
    sphere(cu, cv, rad, hh, col) {
      const self = this; this.add(this.key(cu, cv, hh), () => { const c = self.ctx, [x, y] = self.P(cu, cv, hh + rad), r = rad * HU * self.z * 1.1, g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r); g.addColorStop(0, shade(col, 1.25)); g.addColorStop(1, shade(col, .6)); c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(20,16,10,.4)'; c.lineWidth = Math.max(.6, self.z); c.stroke(); });
    },
    // pipes / struts / lattice lines in local 3D
    line(u0, v0, h0, u1, v1, h1, col, wpx, o) {
      const self = this; this.add(this.key((u0 + u1) / 2, (v0 + v1) / 2, Math.min(h0, h1)) + ((o && o.bias) || 0), () => { const c = self.ctx, a = self.P(u0, v0, h0), b = self.P(u1, v1, h1); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = col; c.lineWidth = Math.max(.8, wpx * self.z); c.lineCap = 'round'; c.stroke(); });
    },
    dot(u, v, hh, rad, col) { const self = this; this.add(this.key(u, v, hh) + .05, () => { const c = self.ctx, [x, y] = self.P(u, v, hh); c.beginPath(); c.arc(x, y, Math.max(1, rad * self.z), 0, 7); c.fillStyle = col; c.fill(); }); },
    quad(u0, v0, h0, u1, v1, h1, col, key) { const self = this; this.add(key != null ? key : this.key((u0 + u1) / 2, (v0 + v1) / 2, h0), () => self.poly([self.P(u0, v0, h0), self.P(u1, v1, h0), self.P(u1, v1, h1), self.P(u0, v0, h1)], col, 'rgba(20,16,10,.3)')); },
    flat(u0, v0, u1, v1, hh, col, key) { const self = this; this.add(key != null ? key : -1, () => self.poly([self.P(u0, v0, hh), self.P(u1, v0, hh), self.P(u1, v1, hh), self.P(u0, v1, hh)], col, 'rgba(20,16,10,.18)')); },
    flush() { this.parts.sort((a, b) => a.key - b.key); for (const p of this.parts) p.fn(); this.parts.length = 0; }
  };

  /* ---------------------------------------------------------------- the 14 drawings (local coordinates of the unrotated footprint, u east / v south, heights in tiles) */
  const ART = {
    oil_well(p, o) {                                                              // 1x1: gravel pad, wellhead tree with hand wheels, slim derrick
      p.flat(.04, .04, .96, .96, 0, '#8f8676'); p.flat(.2, .2, .8, .8, 0, '#6e675c', -.5);
      p.cyl(.5, .5, .2, 0, .12, C.dark); p.cyl(.5, .5, .085, .12, .7, C.yellow); p.cyl(.5, .5, .16, .38, .46, C.red); p.cyl(.5, .5, .12, .62, .7, C.red);
      p.line(.5, .5, .55, .9, .5, .55, C.pipe, 3); p.dot(.9, .5, .55, 2.4, C.steel);
      for (const [a, b] of [[.18, .18], [.82, .18], [.82, .82], [.18, .82]]) p.line(a, b, 0, .5, .5, 2.3, '#3c4650', 1.6);                       // derrick legs
      for (const k of [.55, 1.0, 1.45, 1.9]) { const t = 1 - k / 2.3, a = .5 + (.18 - .5) * t, b = .5 + (.82 - .5) * t; p.line(a, a, k, b, a, k, '#49545f', 1); p.line(b, a, k, b, b, k, '#49545f', 1); }
      p.box(.4, .4, .6, .6, 2.3, 2.42, C.rust); p.dot(.5, .5, 2.5, 3, C.yellow);
    },
    junction(p, o) {                                                              // 1x1: a clear "+" - four fat arms to the four sides, bright flange rings, a hub with a red wheel
      p.flat(.04, .04, .96, .96, 0, '#8c8272'); p.flat(0, .36, 1, .64, .02, '#cfd6dc'); p.flat(.36, 0, .64, 1, .02, '#cfd6dc');
      p.line(0, .5, .22, 1, .5, .22, C.pipe, 9.5); p.line(.5, 0, .22, .5, 1, .22, C.pipe, 9.5);
      for (const [a, b] of [[.08, .5], [.92, .5], [.5, .08], [.5, .92]]) p.dot(a, b, .24, 5.4, C.yellow);
      p.cyl(.5, .5, .2, .14, .4, C.steel); p.cyl(.5, .5, .06, .4, .66, '#2f3942'); p.line(.34, .5, .68, .66, .5, .68, C.red, 3.4); p.line(.5, .34, .68, .5, .66, .68, C.red, 3.4);
    },
    valve_station(p, o) {                                                         // 1x1: pipe run, big gate valve body, stem, red hand wheel, status lamp
      p.flat(.08, .2, .92, .8, 0, '#8c8272'); p.line(0, .5, .26, 1, .5, .26, C.pipe, 5.4);
      p.box(.32, .34, .68, .66, .06, .46, C.steel, { top: '#a9b4bf' }); p.box(.42, .42, .58, .58, .46, .72, C.dark);
      p.line(.5, .5, .72, .5, .5, 1.12, '#2f3942', 2.2); const open = o.valve | 0;
      p.line(.28, .5, 1.12, .72, .5, 1.12, open === 2 ? '#8a3b2a' : C.red, 3.4, { bias: 1 }); p.cyl(.5, .5, .22, 1.08, 1.14, open === 2 ? '#8a3b2a' : C.red);
      p.dot(.8, .28, .42, 2.6, open === 2 ? '#e0584a' : open === 1 ? C.yellow : C.green);
    },
    separator(p, o) {                                                             // 4x3: two horizontal vessels on saddles, tall gas scrubber, catwalk, pipework
      p.flat(.03, .03, 3.97, 2.97, 0, C.pad); p.hcyl(.4, .85, 3.0, 'u', .34, .38, '#6a9a73'); p.hcyl(.4, 1.9, 3.0, 'u', .28, .34, '#5a8a66');
      for (const u of [.8, 2.2, 3.2]) { p.box(u - .06, .6, u + .06, 1.2, 0, .4, C.dark); p.box(u - .06, 1.7, u + .06, 2.2, 0, .36, C.dark); }
      p.cyl(3.45, .3, .3, 0, 2.0, '#7da98a', { top: '#8fba9a' }); p.cyl(3.45, .3, .12, 2.0, 2.18, C.dark);
      p.line(3.45, .3, 1.7, 2.9, .85, 1.0, C.pipe, 3); p.line(.4, 1.3, .6, 0, 1.3, .6, C.pipe, 4.4); p.line(3.7, 1.9, .6, 4, 1.9, .6, C.pipe, 4.4);
      p.box(.4, 1.45, 3.3, 1.65, 1.0, 1.04, '#c4c9ce'); for (const u of [.5, 1.5, 2.5, 3.2]) p.line(u, 1.45, 1.0, u, 1.45, 1.35, C.yellow, 1.2);
      p.dot(.5, .5, .5, 2.5, C.green);
    },
    pump_station(p, o) {                                                          // 2x2 / 3x2: pad, pump house, one motor+pump set per footprint column, suction/discharge stubs on the W and E ports
      const W = o.w, H = o.h, big = W > 2; p.flat(.03, .03, W - .03, H - .03, 0, C.pad); p.box(.45, .08, W - .45, .7, 0, .62, C.cream, { top: C.roof });
      for (let i = 0; i < W - 1; i++) { const u = .75 + i * (W - 1.5) / Math.max(1, W - 2) * (W > 2 ? 1 : 0) + (W > 2 ? 0 : .25); p.box(u - .3, H - .75, u + .3, H - .2, 0, .34, C.dark); p.hcyl(u - .45, H - .48, .9, 'u', .14, .12, i % 2 ? C.steel : C.blue); p.dot(u, H - .48, .5, 2.2, C.green); }
      p.line(0, .5, .3, .45, .5, .3, C.pipe, 4.4); p.line(W - .45, .5, .3, W, .5, .3, C.pipe, 4.4); p.dot(0, .5, .3, 3.4, C.yellow); p.dot(W, .5, .3, 3.4, C.yellow);
      p.line(.8, .7, .62, .8, H - .5, .3, C.pipe, 2.2); p.line(W - .8, .7, .62, W - .8, H - .5, .3, C.pipe, 2.2);
      if (big) { p.cyl(W - .4, H - .4, .17, 0, 1.0, '#7b8792'); p.dot(W - .4, H - .4, 1.05, 2.4, C.red); }
      p.dot(W - .55, .72, .66, 2, o.state === 'UNDER_CONSTRUCTION' ? C.yellow : C.green);
    },
    crude_tank(p, o) {                                                            // NxN: dark steel external-floating-roof crude tank, wind girder, spiral stair, foam dam, gauge strip
      const W = o.w, H = o.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * .92, hh = .62 + .2 * W, f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill));
      p.flat(.03, .03, W - .03, H - .03, 0, '#a59c8a'); p.cyl(cx, cy, R * 1.06, 0, .14, '#b9ae9a');
      p.cyl(cx, cy, R, .14, hh, '#6f7a84', { top: '#4a545d', band: '#262b31', bandAt: .72 }); p.cyl(cx, cy, R * .95, hh - .04 - (1 - f) * .22, hh - .0, '#555f69'); p.cyl(cx, cy, R * 1.03, hh * .62, hh * .66, '#4a545d');
      const n = 8 + W * 3; for (let k = 0; k < n; k++) { const a0 = k / n * 5.2 - 1.2, a1 = (k + 1) / n * 5.2 - 1.2; p.line(cx + Math.cos(a0) * R * 1.02, cy + Math.sin(a0) * R * 1.02, .14 + k / n * (hh - .14), cx + Math.cos(a1) * R * 1.02, cy + Math.sin(a1) * R * 1.02, .14 + (k + 1) / n * (hh - .14), '#37424d', 1.1); }
      p.line(.35, H - .2, .1, .35, H - .2, hh, 'rgba(25,30,35,.65)', 4); p.line(.35, H - .2, .1, .35, H - .2, .1 + (hh - .1) * f, '#d8962a', 4, { bias: .3 });
      p.line(W - .05, cy, .24, W + 0, cy, .24, C.pipe, 4.4); p.line(cx, H - .05, .24, cx, H, .24, C.pipe, 4.4); p.dot(cx, cy, hh + .02, 2.4, C.yellow);
    },
    gasoline_tank(p, o) {                                                         // NxN: white cylindrical tank, red product band, domed (geodesic-style) fixed roof, rooftop vent, stairs
      const W = o.w, H = o.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * .9, hh = .55 + .17 * W, f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill));
      p.flat(.03, .03, W - .03, H - .03, 0, C.pad); p.box(.08, .08, W - .08, .16, 0, .1, '#8e8878'); p.box(.08, H - .16, W - .08, H - .08, 0, .1, '#8e8878'); p.box(.08, .08, .16, H - .08, 0, .1, '#8e8878'); p.box(W - .16, .08, W - .08, H - .08, 0, .1, '#8e8878');
      p.cyl(cx, cy, R, 0, hh, C.white, { top: '#e8e3d6', band: '#d6463a', bandAt: .46 }); p.sphere(cx, cy, R * .78, hh - .12, '#e4dfd2'); p.cyl(cx, cy, .08, hh + R * .78, hh + R * .78 + .18, C.dark);
      for (let k = 1; k < 8; k++) p.line(W - .22, .5 + k * .02, k * hh / 8, W - .12, .62, k * hh / 8, '#37424d', .9); p.line(W - .2, .5, 0, W - .2, .5, hh, '#37424d', 1.4);
      p.quad(.45, H - .08, 0, .45, H - .08, hh, 'rgba(25,30,35,.5)', 99); p.quad(.45, H - .08, 0, .45, H - .08, hh * f, '#e0584a', 99.1);
    },
    diesel_tank(p, o) {                                                           // NxN: sand-yellow tank with stepped cone roof, yellow safety stripes, pump house and fire-water riser
      const W = o.w, H = o.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * .88, hh = .55 + .17 * W, f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill));
      p.flat(.03, .03, W - .03, H - .03, 0, C.pad); p.cyl(cx, cy, R, 0, hh, '#d8c47c', { top: '#bda760', band: '#8a6a1c', bandAt: .3 }); p.cyl(cx, cy, R * .86, hh, hh + .12, '#c9b46a'); p.cyl(cx, cy, R * .6, hh + .12, hh + .24, '#b9a45c'); p.cyl(cx, cy, R * .3, hh + .24, hh + .36, '#a9954f');
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; p.line(cx + Math.cos(a) * R * .98, cy + Math.sin(a) * R * .98, 0, cx + Math.cos(a) * R * .98, cy + Math.sin(a) * R * .98, hh, 'rgba(60,45,10,.5)', 1.2); }
      p.box(.12, .12, .62, .52, 0, .36, C.cream, { top: C.roof }); p.line(.37, .52, .3, .37, cy - R * .2, .3, C.pipe, 2.4); p.line(W - .2, H - .2, 0, W - .2, H - .2, hh * 1.05, C.red, 1.8); p.dot(W - .2, H - .2, hh * 1.05 + .02, 2.2, C.red);
      p.quad(.45, H - .08, 0, .45, H - .08, hh, 'rgba(25,30,35,.5)', 99); p.quad(.45, H - .08, 0, .45, H - .08, hh * f, '#e2b32c', 99.1);
    },
    jet_tank(p, o) {                                                              // NxN: bank of horizontal "bullet" tanks on saddles with a shared manifold and a blue-white fuel marking (different shape from every vertical tank)
      const W = o.w, H = o.h, rows = Math.max(1, Math.floor((H - .5) / .9)), len = W - .9, rad = Math.min(.36, (H - .5) / rows / 2.3), f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill));
      p.flat(.03, .03, W - .03, H - .03, 0, C.pad); p.box(.12, .12, W - .12, H - .12, 0, .06, '#8f8a7b');
      for (let i = 0; i < rows; i++) { const v = .55 + i * ((H - 1.1) / Math.max(1, rows - 1)) * (rows > 1 ? 1 : 0) + (rows > 1 ? 0 : (H - 1.1) / 2); const u0 = .45;
        for (const u of [u0 + .25, u0 + len - .25]) p.box(u - .06, v - rad, u + .06, v + rad, 0, rad * .9, C.dark); p.hcyl(u0, v, len, 'u', rad, rad * .55, '#cfe0ee'); p.hcyl(u0 + len * .46, v, len * .08, 'u', rad * 1.03, rad * .55, '#4aa3ff');
        p.dot(u0 + len * .5, v, rad * 2.6, 2, C.steel); p.line(u0 + len * .5, v, rad * 2.2, u0 + len * .5, H - .3, rad * 2.2, C.pipe, 1.8); }
      p.line(.3, H - .3, .4, W - .3, H - .3, .4, C.pipe, 3.4); p.dot(W - .3, H - .3, .45, 2.8, C.yellow); p.quad(.2, H - .1, 0, .2, H - .1, .8, 'rgba(25,30,35,.5)', 99); p.quad(.2, H - .1, 0, .2, H - .1, .8 * f, '#4aa3ff', 99.1);
    },
    gas_sphere(p, o) {                                                            // pressure storage: white-green spheres on leg rings with braced columns, access ladder, relief stack, pressure gauge dot
      const W = o.w, H = o.h, f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill)); p.flat(.03, .03, W - .03, H - .03, 0, '#a09886');
      const sp = W <= 2 ? [[1, 1, .62]] : W === 3 ? [[.95, .95, .6], [2.05, 2.05, .6]] : [[1.1, 1.1, .62], [2.9, 1.1, .62], [2.0, 2.9, .62]];
      for (const [u, v, r] of sp) {
        const lh = .35; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; p.line(u + Math.cos(a) * r * .8, v + Math.sin(a) * r * .8, 0, u + Math.cos(a) * r * .86, v + Math.sin(a) * r * .86, lh + .1, '#59636d', 1.9); }
        p.cyl(u, v, r * .95, .0, .06, '#8e8878'); p.sphere(u, v, r, lh, '#dfece0'); p.line(u + r * .9, v, lh + r * .2, u + r * .9, v, lh + r * 1.9, '#37424d', 1.3); p.cyl(u, v, .05, lh + r * 2, lh + r * 2 + .26, C.dark); p.dot(u, v, lh + r * 2 + .3, 2.8, f > .85 ? '#e0584a' : f > .6 ? C.yellow : C.green);
      }
      p.line(.2, H - .2, .2, W - .2, H - .2, .2, C.pipe, 3.2); p.dot(W - .2, H - .2, .24, 2.6, C.yellow);
    },
    refinery(p, o) {                                                              // 6x5 .. 12x9: a whole industrial complex.  Distillation towers, furnace + stack, pipe racks, product tank farm, spheres, cooling tower, flare, control house.  Size adds more of each.
      const W = o.w, H = o.h, t = o.t || 0, towers = Math.max(1, Math.round((W - 3) / 2.2)), farm = Math.max(2, Math.round(W / 1.7));
      p.flat(.03, .03, W - .03, H - .03, 0, '#a39a88'); p.flat(.25, H * .46, W - .25, H * .46 + .75, 0, '#8d8574', -.6);
      for (let i = 0; i < towers; i++) { const u = 1.1 + i * ((W * .56 - 1.1) / Math.max(1, towers - 1)) * (towers > 1 ? 1 : 0), v = 1.0 + (i % 2) * .5, h1 = 2.9 - i * .25 + (W > 9 ? .5 : 0);
        p.cyl(u, v, .4 + (i === 0 ? .1 : 0), 0, h1, '#c3ccd4', { top: '#d3dbe1', band: i % 2 ? '#3f7fb0' : '#c4512f', bandAt: .5 }); p.cyl(u, v, .08, h1, h1 + .3, C.dark); for (let k = 1; k < 5; k++) p.line(u + .42, v, k * h1 / 5, u + .62, v, k * h1 / 5, C.pipe, 1.4); }
      const fu = W * .66, fv = .55; p.box(fu, fv, fu + 1.5, fv + 1.2, 0, .9, '#a9553a', { top: '#7a4630' }); p.cyl(fu + .75, fv + .6, .22, .9, 3.0, '#6e625a'); p.dot(fu + .75, fv + .6, 3.1, 3.2, 'rgba(255,150,60,' + (.7 + .3 * Math.sin(t * 5)) + ')');
      p.box(.35, H * .46 + .1, W - .35, H * .46 + .4, 1.2, 1.28, '#9aa3ab'); for (let u = .6; u < W - .5; u += 1.1) p.box(u - .05, H * .46 + .15, u + .05, H * .46 + .35, 0, 1.2, C.dark); p.box(.35, H * .46 + .14, W - .35, H * .46 + .22, 1.28, 1.4, C.pipe, { k: .9 });
      const row = H - 1.2; for (let i = 0; i < farm; i++) { const u = .9 + i * ((W * .62 - .9) / Math.max(1, farm - 1)); p.cyl(u, row, .5, 0, .95, i % 3 === 0 ? C.white : i % 3 === 1 ? '#d8c47c' : '#cfe0ee', { top: '#d6d1c4', band: [C.red, '#8a6a1c', '#4aa3ff'][i % 3], bandAt: .6 }); }
      const sph = Math.max(1, Math.round(W / 4)); for (let i = 0; i < sph; i++) p.sphere(W * .68 + i * 1.3, H - 1.3, .55, 0, i % 2 ? '#cbd3d9' : '#dfece0');
      p.box(W - 1.5, H * .46 + 1.0, W - .35, H - .35, 0, .7, C.cream, { top: C.roof });
      const ft = .65, ct = W > 7 ? 2 : 1; for (let i = 0; i < ct; i++) { p.box(.4 + i * 1.5, H * .46 + .95, 1.7 + i * 1.5, H * .46 + 1.65, 0, .7, '#8fa8b8', { top: '#6c8798' }); p.line(1.05 + i * 1.5, H * .46 + 1.3, .72, 1.05 + i * 1.5 + .35 * Math.cos(t * 12), H * .46 + 1.3 + .35 * Math.sin(t * 12), .74, '#dfe5e9', 1.6, { bias: 1 }); }
      p.cyl(.5, .5, .06, 0, 3.7, '#4d5660'); p.dot(.5, .5, 3.85, 3.4 + Math.sin(t * 9) * .7, 'rgba(255,170,50,.95)'); p.dot(.5, .5, 4.15, 2 + Math.sin(t * 7 + 1), 'rgba(255,230,120,.9)');
      for (const [u, v] of [[.18, H * .5], [W - .18, 1.5], [W - .18, 2.5], [W - .18, 3.5]]) p.dot(u, v, .3, 2.6, C.yellow);
      p.line(0, Math.floor(H / 2) + .5, .4, .5, Math.floor(H / 2) + .5, .4, C.pipe, 5); p.line(W - 1, 1.5, .5, W, 1.5, .5, C.pipe, 4.4); p.line(W - 1, 2.5, .5, W, 2.5, .5, C.pipe, 4.4); p.line(W - 1, 3.5, .5, W, 3.5, .5, C.pipe, 4.4);
    }
  };

  function draw(ctx, visual, o) {
    const fn = ART[visual]; if (!fn) return false; const p = new Painter(ctx, o);
    ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.lineJoin = 'round';
    fn(p, o); p.flush();
    if (o.state === 'UNDER_CONSTRUCTION') {                                           // scaffold hint: hazard stripes over the footprint edge
      const [w, h] = p.r & 1 ? [o.h, o.w] : [o.w, o.h], a = p.P(0, 0, 0), b = p.P(w, 0, 0), c = p.P(w, h, 0), d = p.P(0, h, 0);
      ctx.setLineDash([6 * o.z, 5 * o.z]); ctx.strokeStyle = 'rgba(240,190,40,.95)'; ctx.lineWidth = Math.max(1.4, 2 * o.z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore(); return true;
  }
  return { draw, ids: Object.keys(ART), shade, COLORS: C, HU };
});
