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
    pump_jack(p, o) {                                                             // 2x1: skid, gearbox, Samson post, nodding walking beam with horsehead, counterweight
      const t = (o.t || 0) * 1.6, nod = Math.sin(t) * .13;
      p.box(.05, .1, 1.95, .9, 0, .08, '#8a8070'); p.box(.12, .3, .62, .7, .08, .55, C.blue, { top: '#5d96c2' }); p.cyl(.37, .5, .17, .08, .62, '#2d6a96');
      p.line(1.0, .5, .08, 1.0, .3, .95, '#37424d', 2.2); p.line(1.0, .5, .08, 1.0, .7, .95, '#37424d', 2.2); p.line(1.0, .5, .08, 1.0, .5, 1.0, '#37424d', 2.6);
      const px = 1.0, hh = .98;                                                   // pivot; beam tilts with the nodding
      p.line(px - .62, .5, hh - nod, px + .5, .5, hh + nod * .9, '#d3a52a', 5.2, { bias: 1 });
      p.line(px + .5, .5, hh + nod * .9, px + .75, .5, hh + nod * .9 - .28, '#d3a52a', 6.5, { bias: 1 }); p.dot(px + .75, .5, hh + nod * .9 - .3, 4.5, '#b88c1f');
      p.line(px + .73, .5, hh + nod * .9 - .3, px + .73, .5, .1, '#2f3942', 1.2);                         // polished-rod line down to the wellhead
      p.box(px - .78, .38, px - .56, .62, hh - nod - .26, hh - nod - .02, '#c4512f', { k: 1 });                // counterweight
      p.line(.37, .5, .5, px - .66, .5, hh - nod - .12, '#2f3942', 1.4); p.cyl(1.73, .5, .06, 0, .1, C.dark); p.dot(1.73, .5, .12, 3, C.steel);
    },
    pump_station(p, o) {                                                          // 2x2: pad, pump house, two blue pump/motor sets, pipe stubs to the W and E ports
      p.flat(.03, .03, 1.97, 1.97, 0, C.pad); p.box(.45, .1, 1.55, .72, 0, .62, C.cream, { top: C.roof });
      p.box(.55, .02, .85, .1, .1, .5, C.dark); p.box(1.15, .02, 1.45, .1, .1, .5, C.dark);
      p.hcyl(.35, 1.25, 1.3, 'u', .15, .12, C.blue); p.hcyl(.35, 1.7, 1.3, 'u', .13, .1, C.steel);
      p.box(.2, 1.1, .5, 1.9, 0, .35, C.dark); p.box(1.55, 1.1, 1.8, 1.9, 0, .35, '#37424d');
      p.line(0, .25, .3, .45, .25, .3, C.pipe, 4.2); p.line(1.55, .25, .3, 2, .25, .3, C.pipe, 4.2); p.dot(0, .25, .3, 3.4, C.yellow); p.dot(2, .25, .3, 3.4, C.yellow);
      p.line(.8, .75, .62, .8, 1.25, .3, C.pipe, 2.2); p.line(1.2, .75, .62, 1.2, 1.25, .3, C.pipe, 2.2);
      p.dot(1.5, .72, .66, 2, o.state === 'UNDER_CONSTRUCTION' ? C.yellow : C.green);
    },
    junction(p, o) {                                                              // 1x1: cross manifold, four flange collars, central valve wheel
      p.flat(.06, .06, .94, .94, 0, '#8c8272'); p.line(0, .5, .2, 1, .5, .2, C.pipe, 5.4); p.line(.5, 0, .2, .5, 1, .2, C.pipe, 5.4);
      for (const [a, b] of [[.14, .5], [.86, .5], [.5, .14], [.5, .86]]) p.dot(a, b, .2, 3.8, C.yellow);
      p.cyl(.5, .5, .18, .12, .34, C.steel); p.cyl(.5, .5, .04, .34, .62, '#2f3942'); p.line(.36, .5, .64, .64, .5, .64, C.red, 3); p.line(.5, .36, .64, .5, .64, .64, C.red, 3);
      p.box(.04, .04, .16, .16, 0, .12, C.dark); p.box(.84, .84, .96, .96, 0, .12, C.dark);
    },
    valve_station(p, o) {                                                         // 1x1: pipe run, big gate valve body, stem, red hand wheel, status lamp
      p.flat(.08, .2, .92, .8, 0, '#8c8272'); p.line(0, .5, .26, 1, .5, .26, C.pipe, 5.4);
      p.box(.32, .34, .68, .66, .06, .46, C.steel, { top: '#a9b4bf' }); p.box(.42, .42, .58, .58, .46, .72, C.dark);
      p.line(.5, .5, .72, .5, .5, 1.12, '#2f3942', 2.2); const open = o.valve | 0;
      p.line(.28, .5, 1.12, .72, .5, 1.12, open === 2 ? '#8a3b2a' : C.red, 3.4, { bias: 1 }); p.cyl(.5, .5, .22, 1.08, 1.14, open === 2 ? '#8a3b2a' : C.red);
      p.dot(.8, .28, .42, 2.6, open === 2 ? '#e0584a' : open === 1 ? C.yellow : C.green);
    },
    oil_tank(p, o) {                                                              // 2x2: white cylindrical tank, band, dome roof, ladder, level strip
      p.flat(.02, .02, 1.98, 1.98, 0, C.pad); p.cyl(1, 1, .9, 0, 1.15, C.white, { top: '#d6d1c4', band: '#c4512f', bandAt: .62 });
      p.cyl(1, 1, .5, 1.15, 1.3, '#d6d1c4'); p.line(1.58, .55, 0, 1.58, .55, 1.15, '#37424d', 1.4); for (let k = 1; k < 7; k++) p.line(1.52, .5 + k * .005, k * .16, 1.64, .6, k * .16, '#37424d', .9);
      const f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill)); p.quad(.42, 1.86, 0, .42, 1.86, 1.0, 'rgba(25,30,35,.55)', 99); p.quad(.42, 1.86, 0, .42, 1.86, 1.0 * f, '#d8962a', 99.1);
      p.line(.3, 1.0, 1.28, .02, 1.0, 1.28, C.pipe, 1.4);
    },
    large_tank(p, o) {                                                            // 3x3: broad floating-roof tank, wind girder, spiral stair, foam dam, manifold
      p.flat(.02, .02, 2.98, 2.98, 0, '#a59c8a'); p.cyl(1.5, 1.5, 1.38, 0, .16, '#b9ae9a');
      p.cyl(1.5, 1.5, 1.28, .16, 1.75, '#c9d1d8', { top: '#9ba5ae', band: '#3f7fb0', bandAt: .55 }); p.cyl(1.5, 1.5, 1.18, 1.75, 1.8, '#7d8892'); p.cyl(1.5, 1.5, 1.32, 1.5, 1.56, '#5e6a75');
      for (let k = 0; k < 14; k++) { const a = k / 14 * 5.4, u = 1.5 + Math.cos(a - 1.2) * 1.3, v = 1.5 + Math.sin(a - 1.2) * 1.3; p.line(u, v, .16 + k / 14 * 1.55, 1.5 + Math.cos(a + .1 - 1.2) * 1.3, 1.5 + Math.sin(a + .1 - 1.2) * 1.3, .16 + (k + 1) / 14 * 1.55, '#37424d', 1.1); }
      const f = Math.max(0, Math.min(1, o.fill == null ? .5 : o.fill)); p.quad(.5, 2.78, .1, 1.1, 2.9, .1, 'rgba(0,0,0,0)', 99); p.line(.45, 2.95, .1, .45, 2.95, 1.6, 'rgba(25,30,35,.65)', 5); p.line(.45, 2.95, .1, .45, 2.95, .1 + 1.5 * f, '#d8962a', 5, { bias: .3 });
      p.line(2.9, 1.5, .26, 3, 1.5, .26, C.pipe, 4.4); p.line(1.5, 2.9, .26, 1.5, 3, .26, C.pipe, 4.4); p.dot(1.5, 1.5, 1.95, 3, C.yellow);
    },
    separator(p, o) {                                                             // 4x3: two horizontal vessels on saddles, tall gas scrubber, catwalk, pipework
      p.flat(.03, .03, 3.97, 2.97, 0, C.pad); p.hcyl(.4, .85, 3.0, 'u', .34, .38, '#6a9a73'); p.hcyl(.4, 1.9, 3.0, 'u', .28, .34, '#5a8a66');
      for (const u of [.8, 2.2, 3.2]) { p.box(u - .06, .6, u + .06, 1.2, 0, .4, C.dark); p.box(u - .06, 1.7, u + .06, 2.2, 0, .36, C.dark); }
      p.cyl(3.45, .3, .3, 0, 2.0, '#7da98a', { top: '#8fba9a' }); p.cyl(3.45, .3, .12, 2.0, 2.18, C.dark);
      p.line(3.45, .3, 1.7, 2.9, .85, 1.0, C.pipe, 3); p.line(.4, 1.3, .6, 0, 1.3, .6, C.pipe, 4.4); p.line(3.7, 1.9, .6, 4, 1.9, .6, C.pipe, 4.4);
      p.box(.4, 1.45, 3.3, 1.65, 1.0, 1.04, '#c4c9ce'); for (const u of [.5, 1.5, 2.5, 3.2]) p.line(u, 1.45, 1.0, u, 1.45, 1.35, C.yellow, 1.2);
      p.dot(.5, .5, .5, 2.5, C.green);
    },
    processing_plant(p, o) {                                                      // 5x4: pipe rack, three vertical vessels, heater with stack, control cabin
      p.flat(.03, .03, 4.97, 3.97, 0, C.pad); p.box(.3, 1.7, 4.4, 2.1, .9, .98, '#9aa3ab');
      for (const u of [.6, 1.6, 2.6, 3.6, 4.3]) p.box(u - .05, 1.8, u + .05, 2.0, 0, .9, C.dark);
      p.cyl(1.0, .8, .5, 0, 2.3, '#b9c3cc', { top: '#cbd4db', band: '#c4512f', bandAt: .4 }); p.cyl(2.2, .75, .38, 0, 1.8, '#a7b2bc'); p.cyl(3.2, .85, .42, 0, 2.0, '#b2bcc6', { band: '#3f7fb0', bandAt: .6 });
      p.box(3.5, 2.4, 4.7, 3.6, 0, .85, '#a9553a', { top: '#7a4630' }); p.cyl(4.1, 3.0, .16, .85, 2.6, '#6e625a'); p.dot(4.1, 3.0, 2.7, 3, '#ff9a3a');
      p.box(.3, 2.8, 1.5, 3.7, 0, .6, C.cream, { top: C.roof }); p.box(.5, 3.7, .9, 3.74, .15, .45, C.glass);
      for (const [a, b] of [[1.0, .8], [2.2, .75], [3.2, .85]]) p.line(a, b, 1.9, a, 1.9, .95, C.pipe, 2.4);
      p.line(0, 1.5, .35, .3, 1.5, .35, C.pipe, 4.4); p.line(4.7, 1.2, .35, 5, 1.2, .35, C.pipe, 4.4); p.line(1.6, 2.1, .45, 3.5, 3.0, .45, C.pipe, 2.4);
    },
    refinery(p, o) {                                                              // 8x6: distillation columns, furnace + stack, product spheres/tanks, long pipe racks, flare, cooling tower
      p.flat(.03, .03, 7.97, 5.97, 0, '#a39a88'); p.flat(.2, 2.4, 7.8, 3.2, 0, '#8d8574', -.6);
      const t = o.t || 0;
      p.cyl(1.3, 1.2, .5, 0, 3.1, '#c3ccd4', { top: '#d3dbe1', band: '#c4512f', bandAt: .5 }); p.cyl(2.5, 1.0, .38, 0, 2.5, '#b2bcc6'); p.cyl(3.5, 1.3, .3, 0, 1.9, '#a8b3be');
      for (const [u, v, hh] of [[1.3, 1.2, 3.1], [2.5, 1.0, 2.5]]) p.cyl(u, v, .08, hh, hh + .3, C.dark);
      p.box(4.5, .5, 6.2, 1.9, 0, 1.0, '#a9553a', { top: '#7a4630' }); p.cyl(5.35, 1.2, .24, 1.0, 3.2, '#6e625a'); p.dot(5.35, 1.2, 3.3, 3.4, 'rgba(255,150,60,' + (.7 + .3 * Math.sin(t * 5)) + ')');
      p.box(.4, 2.55, 7.6, 2.85, 1.3, 1.38, '#9aa3ab'); for (let u = .6; u < 7.6; u += 1.1) p.box(u - .05, 2.6, u + .05, 2.8, 0, 1.3, C.dark);
      p.box(.4, 2.58, 7.6, 2.66, 1.38, 1.5, C.pipe, { k: .9 });
      for (const [u, v] of [[1.0, 4.3], [2.3, 4.3], [3.6, 4.3]]) p.cyl(u, v, .56, 0, 1.0, C.white, { top: '#d6d1c4', band: C.red, bandAt: .6 });
      p.sphere(5.0, 4.5, .62, 0, '#d2c7ae'); p.sphere(6.5, 4.5, .62, 0, '#cbd3d9'); p.box(6.8, 3.5, 7.8, 5.7, 0, .7, C.cream, { top: C.roof });
      p.cyl(.6, 5.0, .06, 0, 3.4, '#4d5660'); p.dot(.6, 5.0, 3.55, 3.4 + Math.sin(t * 9) * .7, 'rgba(255,170,50,.95)'); p.dot(.6, 5.0, 3.85, 2 + Math.sin(t * 7 + 1), 'rgba(255,230,120,.9)');
      p.box(3.8, 5.2, 4.6, 5.8, 0, .8, '#8fa8b8', { top: '#6c8798' });
      p.line(4.2, 1.9, .5, 4.2, 4.4, .5, C.pipe, 3.2); p.line(0, 1.2, .4, .4, 1.2, .4, C.pipe, 5); p.line(0, 1.6, .4, .4, 1.6, .4, C.pipe, 5); p.line(7.7, 1.2, .45, 8, 1.2, .45, C.pipe, 4.4);
    },
    control_center(p, o) {                                                        // 4x3: two-storey admin building, glass band, roof units, radio mast + dish, parking
      p.flat(.03, .03, 3.97, 2.97, 0, '#a6a090'); p.flat(.2, 2.15, 3.8, 2.85, 0, '#7e7a70', -.5);
      p.box(.35, .3, 3.35, 1.8, 0, 1.55, '#e1dccd', { top: '#8a9099', side: '#e1dccd' }); p.box(.35, .3, 3.35, 1.8, .55, .95, '#5d93b4', { top: '#5d93b4', k: .97 });
      p.box(.35, .3, 3.35, 1.8, 1.55, 1.62, '#6f7780'); p.box(.6, .5, 1.1, .95, 1.62, 1.95, '#8d99a6'); p.box(1.6, .55, 2.0, .9, 1.62, 1.88, '#8d99a6');
      p.line(3.05, .6, 1.62, 3.05, .6, 3.5, '#37424d', 1.6); p.line(3.05, .6, 3.5, 3.05, .6, 3.62, C.red, 2.6); for (const k of [2.2, 2.8]) p.line(2.85, .6, k, 3.25, .6, k, '#37424d', 1.1);
      p.cyl(2.55, 1.2, .32, 1.62, 1.72, '#d8dde1'); p.line(2.55, 1.2, 1.7, 2.9, 1.0, 2.1, '#cfd6db', 1.8);
      p.box(1.4, 1.8, 2.2, 2.0, 0, .3, C.glass); p.box(.5, 2.4, 1.3, 2.7, 0, .28, C.red); p.box(1.5, 2.4, 2.3, 2.7, 0, .28, C.steel); p.box(2.5, 2.4, 3.3, 2.7, 0, .28, '#d8d3c4');
    },
    maintenance(p, o) {                                                           // 3x2: workshop with sawtooth roof, three bay doors, gantry crane, service truck, drums
      p.flat(.03, .03, 2.97, 1.97, 0, '#a09886'); p.box(.2, .15, 2.1, 1.0, 0, .8, '#b9a98a', { top: '#7a6e5a' });
      for (let k = 0; k < 4; k++) { const u0 = .2 + k * .475; p.quad(u0, .15, .8, u0, 1.0, .8, C.roof); p.quad(u0, .15, .8, u0 + .475, .15, 1.05, '#8f9aa4'); p.quad(u0, 1.0, .8, u0 + .475, 1.0, 1.05, '#8f9aa4'); }
      for (const u of [.4, 1.0, 1.6]) p.quad(u, 1.0, 0, u + .36, 1.0, .55, '#586b7a');
      p.line(.2, 1.15, 1.25, 2.1, 1.15, 1.25, '#e2b32c', 3.2); p.line(.2, 1.15, 0, .2, 1.15, 1.25, '#37424d', 1.8); p.line(2.1, 1.15, 0, 2.1, 1.15, 1.25, '#37424d', 1.8); p.line(1.2, 1.15, 1.25, 1.2, 1.15, .7, '#37424d', 1.2); p.dot(1.2, 1.15, .66, 2.4, C.red);
      p.box(2.25, .9, 2.85, 1.3, 0, .32, '#c8962a'); p.box(2.25, .9, 2.45, 1.3, .32, .55, '#d8dde1'); p.dot(2.3, 1.35, .05, 2.2, C.dark); p.dot(2.8, 1.35, .05, 2.2, C.dark);
      for (const [a, b] of [[.35, 1.55], [.6, 1.62], [.85, 1.5]]) p.cyl(a, b, .1, 0, .26, '#3f7fb0');
    },
    power(p, o) {                                                                 // 3x3: generator halls, two exhaust stacks, radiator fans (spinning), transformer yard with insulators
      const t = o.t || 0; p.flat(.03, .03, 2.97, 2.97, 0, '#9d9686');
      p.box(.2, .2, 1.9, 1.15, 0, .85, '#6a8aa2', { top: '#4d6475' }); p.box(.2, 1.3, 1.9, 2.25, 0, .85, '#6a8aa2', { top: '#4d6475' });
      for (const v of [.55, 1.65]) p.cyl(2.0, v, .17, .85, 2.5, '#58626b');
      for (const v of [.7, 1.8]) { p.cyl(.75, v, .22, .85, .95, '#404a54'); p.line(.75 - .2 * Math.cos(t * 12), v, .93, .75 + .2 * Math.cos(t * 12), v, .93, '#c8d0d6', 1.4, { bias: 1 }); p.line(.75, v - .2 * Math.sin(t * 12), .93, .75, v + .2 * Math.sin(t * 12), .93, '#c8d0d6', 1.4, { bias: 1 }); }
      for (const [u, v] of [[2.35, 2.3], [2.65, 2.3], [2.35, 2.65], [2.65, 2.65]]) { p.box(u - .1, v - .1, u + .1, v + .1, 0, .38, '#5f6a73'); p.line(u, v, .38, u, v, .62, '#d9ccb0', 3); }
      p.line(2.2, 2.2, .7, 2.9, 2.2, .7, '#2f3942', 1); p.dot(1.95, .6, 2.55, 3, 'rgba(210,215,220,.7)'); p.dot(1.9, 1.7, 2.55, 3.4, 'rgba(210,215,220,.55)');
    },
    warehouse(p, o) {                                                             // 3x2: long gable-roofed shed, roller doors, loading dock, containers and pallets
      p.flat(.03, .03, 2.97, 1.97, 0, '#a5a090'); p.box(.2, .15, 2.2, 1.15, 0, .62, '#d9d3c1', { top: '#7c8892' });
      p.quad(.2, .15, .62, 2.2, .15, .62, '#d9d3c1'); p.quad(.2, .65, .98, 2.2, .65, .98, '#aeb9c2', 20); p.quad(.2, .15, .62, .2, .65, .98, '#aeb9c2'); p.quad(.2, 1.15, .62, .2, .65, .98, '#aeb9c2');
      p.quad(2.2, .15, .62, 2.2, .65, .98, '#9aa5ae'); p.quad(2.2, 1.15, .62, 2.2, .65, .98, '#9aa5ae');
      for (const u of [.4, 1.0, 1.6]) p.quad(u, 1.15, 0, u + .45, 1.15, .45, '#6a7b88');
      p.box(.2, 1.15, 2.2, 1.4, 0, .16, '#9b9486');
      p.box(2.35, .3, 2.9, .65, 0, .3, '#c4512f'); p.box(2.35, .75, 2.9, 1.1, 0, .3, '#3f7fb0'); p.box(2.4, .4, 2.85, .6, .3, .6, '#e2b32c');
      for (const [a, b] of [[.4, 1.62], [.8, 1.68], [1.2, 1.62]]) p.box(a, b, a + .3, b + .24, 0, .12, '#a77b46');
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
