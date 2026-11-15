/* part 1 of 3 of the performance-panel test (phases A,B,C,D,E). The former single file ran all 9 real-time phases (> 2 minutes); the checks are unchanged, only the phases are shared out. chromium */
process.env.PERF_PHASES = 'A,B,C,D,E'; require('./test-perf-panel-core.js');
