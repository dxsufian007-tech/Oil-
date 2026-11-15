/* Test runner with the project policy: every test file is its own process with a HARD limit of 120 s; over the limit it is killed and recorded as TIMEOUT (undecided).
   Usage: NODE_PATH=/opt/npm-tools/node_modules node tools/run-tests.js [--jobs=2] [--out=/tmp/results.json] [--only=a,b] [--list=node|pw|all]
   Writes <out> (JSON) and <out>.txt (progress, one line per finished test) as it goes, so a caller can poll the file instead of waiting. */
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const A = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)=?(.*)$/.exec(a); return [m[1], m[2] || '1']; }));
const LIMIT = 120e3, jobs = +A.jobs || 2, out = A.out || '/tmp/test-results.json', dir = path.join(__dirname, '..');
const chain = (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts.test.match(/node (test-[\w.-]+\.js)/g) || []).map(x => x.slice(5));
const pw = fs.readdirSync(dir).filter(f => /^test-.*\.js$/.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').includes('chromium'));
let list = A.list === 'node' ? chain.filter(f => !pw.includes(f)) : A.list === 'pw' ? pw : [...new Set([...chain, ...pw])];
if (A.only) list = A.only.split(',');
const res = [], t0 = Date.now(); fs.writeFileSync(out + '.txt', '');
const runOne = f => new Promise(done => {
  const s = Date.now(), c = spawn('node', [f], { cwd: dir, env: Object.assign({}, process.env), detached: true }); let log = '', to = false;
  c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d);
  const timer = setTimeout(() => { to = true; try { process.kill(-c.pid, 'SIGKILL'); } catch (e) {} }, LIMIT);
  c.on('close', code => { clearTimeout(timer); const sec = +((Date.now() - s) / 1000).toFixed(1), r = { file: f, sec, result: to ? 'TIMEOUT' : code === 0 ? 'PASS' : 'FAIL', code };
    if (r.result !== 'PASS') r.tail = log.split('\n').filter(x => /FAIL|Error|expected|✗|AssertionError/.test(x)).slice(0, 4).join(' | ').slice(0, 400);
    const pc = /(\d+) passed/.exec(log); if (pc) r.passed = +pc[1]; res.push(r); fs.appendFileSync(out + '.txt', r.result.padEnd(8) + String(sec).padStart(6) + 's  ' + f + (r.tail ? '   <- ' + r.tail : '') + '\n'); done(); });
});
(async () => { const q = list.slice(); await Promise.all(Array.from({ length: jobs }, async () => { while (q.length) await runOne(q.shift()); }));
  const sum = { total: res.length, pass: res.filter(r => r.result === 'PASS').length, fail: res.filter(r => r.result === 'FAIL').length, timeout: res.filter(r => r.result === 'TIMEOUT').length, wallSec: +((Date.now() - t0) / 1000).toFixed(0), jobs };
  fs.writeFileSync(out, JSON.stringify({ sum, res: res.sort((a, b) => a.file < b.file ? -1 : 1) }, null, 1)); fs.appendFileSync(out + '.txt', 'DONE ' + JSON.stringify(sum) + '\n'); })();
