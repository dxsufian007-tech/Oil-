/* part 2 of 3 of the performance-panel test (phases F,G,I). The former single file ran all 9 real-time phases (> 2 minutes); the checks are unchanged, only the phases are shared out. chromium */
process.env.PERF_PHASES = 'F,G,I'; require('./test-perf-panel-core.js');
