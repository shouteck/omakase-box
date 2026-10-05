import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrivateShopApi } from './dist/server.js';
import { developmentEnvironment } from '../../scripts/process.mjs';

const app = createPrivateShopApi();
await app.listen({ host: '127.0.0.1', port: 4100 });
const vite = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [vite, fileURLToPath(new URL('./', import.meta.url))], { stdio: 'inherit', env: developmentEnvironment() });
function stop() { child.kill(); void app.close(); }
child.on('exit', () => { void app.close(); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log('Synthetic private-shop pre-change demo: http://private-shop.localhost:3100. No real billing or authentication.');
