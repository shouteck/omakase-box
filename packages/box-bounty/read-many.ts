import { readFileSync } from 'node:fs';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';

// Reading a repository's files one at a time is the largest single cost of
// `create` on Windows, where each open is slow but they do not contend (BT46:
// 10k files, 5 s serial, 1 s in parallel). The CLI is synchronous, so one worker
// reads with async `readFile` while this thread blocks and takes each file as
// it lands. Live working-tree bytes either way: what the scan sees is the same.

export const PARALLEL_READ_FILES = 1000;
const WIDTH = 64;
// Bytes read or being read and not yet visited. One larger file is read alone.
const IN_FLIGHT_BYTES = 64 * 1024 * 1024;
// A worker silent this long is abandoned; what it has not delivered is read here.
const STALL_MS = 60_000;
const DELIVERED = 0;
const IN_FLIGHT = 1;

const WORKER = `
const { workerData } = process.getBuiltinModule('node:worker_threads');
const { readFile } = process.getBuiltinModule('node:fs/promises');
const { paths, sizes, port, shared, cap, width } = workerData;
const counters = new Int32Array(shared);
const pause = () => new Promise(resolve => setTimeout(resolve, 1));
let next = 0;
async function reader() {
  while (next < paths.length) {
    const i = next++;
    const size = Math.min(sizes[i], cap);
    while (Atomics.load(counters, 1) > 0 && Atomics.load(counters, 1) + size > cap) await pause();
    Atomics.add(counters, 1, size);
    let bytes = null;
    try { bytes = await readFile(paths[i]); } catch {}
    port.postMessage([i, bytes]);
    Atomics.add(counters, 0, 1);
    Atomics.notify(counters, 0);
  }
}
Promise.all(Array.from({ length: width }, reader));
`;

// `visit` runs on this thread, once per path, in the order files land; `bytes`
// is null for a file that could not be read. `sizes` are what the caller
// expects to read, for the in-flight cap only.
export function readMany(paths: readonly string[], sizes: readonly number[], visit: (index: number, bytes: Buffer | null) => void, parallelFrom = PARALLEL_READ_FILES): void {
  const visited = new Set<number>();
  if (paths.length >= parallelFrom) {
    try { readInWorker(paths, sizes, visit, visited); }
    catch { /* no worker here: whatever it did not deliver is read below */ }
  }
  paths.forEach((path, index) => {
    if (visited.has(index)) return;
    let bytes: Buffer | null = null;
    try { bytes = readFileSync(path); } catch { /* visited as unreadable */ }
    visit(index, bytes);
  });
}

function readInWorker(paths: readonly string[], sizes: readonly number[], visit: (index: number, bytes: Buffer | null) => void, visited: Set<number>): void {
  const { port1, port2 } = new MessageChannel();
  const shared = new SharedArrayBuffer(8);
  const counters = new Int32Array(shared);
  // libuv reads this once, when its thread pool first starts: the worker's
  // first read, this process's first use of the pool.
  const ownPool = process.env['UV_THREADPOOL_SIZE'] === undefined;
  if (ownPool) process.env['UV_THREADPOOL_SIZE'] = String(Math.min(WIDTH, 16));
  const worker = new Worker(WORKER, { eval: true, workerData: { paths: [...paths], sizes: [...sizes], port: port2, shared, cap: IN_FLIGHT_BYTES, width: WIDTH }, transferList: [port2] });
  worker.unref();
  try {
    let seen = 0;
    while (visited.size < paths.length) {
      if (Atomics.wait(counters, DELIVERED, seen, STALL_MS) === 'timed-out') break;
      seen = Atomics.load(counters, DELIVERED);
      for (let message = receiveMessageOnPort(port1); message !== undefined; message = receiveMessageOnPort(port1)) {
        const [index, bytes] = message.message as [number, Uint8Array | null];
        visited.add(index);
        visit(index, bytes === null ? null : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        Atomics.sub(counters, IN_FLIGHT, Math.min(sizes[index]!, IN_FLIGHT_BYTES));
      }
    }
  } finally {
    if (ownPool) delete process.env['UV_THREADPOOL_SIZE'];
    port1.close();
    void worker.terminate();
  }
}
