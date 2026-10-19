// Cheap host-load context for a verify run record (K37 P5). One snapshot at
// run start: platform class, CPU capacity, free memory, and the platform load
// average — honest about what the platform cannot answer. os.loadavg() on
// Windows returns [0, 0, 0] without observing anything: that is reported as
// unsupported, never as observed zero load. Nothing here samples environment
// variables, usernames, hostnames or command lines.
import { cpus, freemem, loadavg, platform, totalmem } from 'node:os';

// captureLoad(osApi) takes the os calls it needs so tests inject a fixture
// host instead of depending on the machine vitest happens to run on.
export function captureLoad(osApi = { cpus, freemem, loadavg, platform, totalmem }, at = new Date()) {
  const os = osApi.platform();
  let cpu = { model: null, logicalCores: 0 };
  try {
    const list = osApi.cpus() || [];
    cpu = { model: list.length && typeof list[0].model === 'string' ? list[0].model : null, logicalCores: list.length };
  } catch { /* a CPU answer that fails is left as missing, not invented */ }
  let memory = null;
  try {
    const free = osApi.freemem();
    const total = osApi.totalmem();
    if (typeof free === 'number' && typeof total === 'number') memory = { freeBytes: free, totalBytes: total };
  } catch { /* missing, not zero */ }
  // The platform decides whether loadavg is a real observation. Windows is
  // named explicitly because its zeros are a stub, not a measurement.
  const loadAverage = { supported: os !== 'win32' };
  if (loadAverage.supported) {
    try {
      const [one, five, fifteen] = osApi.loadavg();
      if (typeof one === 'number' && typeof five === 'number' && typeof fifteen === 'number') {
        loadAverage.one = one; loadAverage.five = five; loadAverage.fifteen = fifteen;
      } else { loadAverage.supported = false; loadAverage.note = 'os.loadavg() returned no usable numbers'; }
    } catch { loadAverage.supported = false; loadAverage.note = 'os.loadavg() failed'; }
  } else loadAverage.note = 'os.loadavg() returns zeros on Windows — never observed load';
  return { capturedAt: at.toISOString(), platform: os, cpu, memory, loadAverage };
}
