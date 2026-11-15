/* part 3 of 3 of the performance-panel test (phases H). The former single file ran all 9 real-time phases (> 2 minutes); the checks are unchanged, only the phases are shared out. chromium */
process.env.PERF_PHASES = 'H'; require('./test-perf-panel-core.js');
