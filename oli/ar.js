/* Oli - ar.js  (Arabic first: every string the player can see goes through OliAR.t)
 *  - EXACT: whole strings; RULES: sentences with numbers; WORDS: the glossary for what is left.
 *  - A MutationObserver translates the text of the whole interface (and tooltips) so no screen can show English by accident.
 *  - Numbers / money stay left-to-right inside the right-to-left text (isolated with U+2066 .. U+2069).
 * English can come back later as a second language: the dictionary is the only place that needs a twin.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliAR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const D = (typeof require === 'function' && typeof module === 'object') ? require('./ar-dict.js') : self.OliARDict;
  const LRI = '\u2066', PDI = '\u2069', LATIN = /[A-Za-z]{2,}/;
  const exact = D.EXACT, rules = D.RULES, words = D.WORDS.slice().sort((a, b) => b[0].length - a[0].length).map(([w, a]) => [new RegExp('(?<![A-Za-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '(?![A-Za-z])', 'gi'), a]);
  const numTok = /(?<![\u2066\w])[+\-−]?\$?\d[\d,.]*(?:\s?[KMB]\b|%|×\d+)?(?:\/[يشس])?(?![\w\u2069])/g;
  const cache = new Map();
  function iso(s) { return s.replace(numTok, m => LRI + m + PDI); }
  function tr(s) {
    if (s == null) return s; s = String(s);
    if (!LATIN.test(s)) return s;
    const key = s; if (cache.has(key)) return cache.get(key);
    let out = null; const trimmed = s.trim(), lead = s.slice(0, s.indexOf(trimmed)), tail = s.slice(s.indexOf(trimmed) + trimmed.length);
    if (exact[trimmed] != null) out = exact[trimmed];
    else for (const [re, fn] of rules) { const m = trimmed.match(re); if (m) { out = typeof fn === 'function' ? fn(...m.slice(1), tr) : trimmed.replace(re, fn); break; } }
    if (out == null) { out = trimmed; for (const [re, a] of words) out = out.replace(re, a); }
    out = lead + out + tail; if (cache.size > 4000) cache.clear(); cache.set(key, out); return out;
  }
  const t = s => { let r = tr(s); if (r == null || !/\d/.test(r)) return r; return iso(String(r).replace(/[\u2066\u2069]/g, '')); };
  /* lines of HTML: translate only the text between tags */
  const html = h => String(h).replace(/>([^<>]+)</g, (m, x) => '>' + t(x) + '<');
  function fixNode(n) {
    if (n.nodeType === 3) { const v = n.nodeValue; if (!v || !v.trim()) return; if (/\d/.test(v) && !/[\u0600-\u06FF]/.test(v) && !LATIN.test(v) && !v.includes(LRI) && /^\s*[+\-−]?\$?[\d.,]+\s?[KMB%]?\s*$/.test(v)) { n.nodeValue = LRI + v.trim() + PDI; return; } if (LATIN.test(v) || (/\d/.test(v) && !v.includes(LRI) && /[\u0600-\u06FF]/.test(v))) { const r = t(v); if (r !== v) n.nodeValue = r; } return; }
    if (n.nodeType !== 1) return; const tag = n.tagName; if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CANVAS') return;
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = n.getAttribute && n.getAttribute(a); if (v && LATIN.test(v)) n.setAttribute(a, t(v)); }
    for (const c of n.childNodes) fixNode(c);
  }
  let obs = null;
  function install(doc) {
    doc = doc || document; if (/[?&]lang=en/.test(doc.defaultView.location.search) || (function () { try { return doc.defaultView.localStorage.getItem('oli-lang') === 'en'; } catch (_) { return false; } })()) { doc.documentElement.lang = 'en'; doc.documentElement.dir = 'ltr'; return; } const de = doc.documentElement; de.lang = 'ar'; de.dir = 'rtl';
    fixNode(doc.body); obs = new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') fixNode(m.target); else if (m.type === 'childList') for (const n of m.addedNodes) fixNode(n); else if (m.type === 'attributes') fixNode(m.target); } });
    obs.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  }
  /* money for Arabic text: $250K / $2.5M / $1.2B (the sign stays on the left of the number) */
  return { t, tr, html, fixNode, install, LATIN, iso, dict: D };
});
