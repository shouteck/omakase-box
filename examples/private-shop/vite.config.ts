import { fileURLToPath } from 'node:url';
import { safeViteConfig } from '../../scripts/vite-safety.js';
import type { UserConfig } from 'vite';

const config = safeViteConfig(fileURLToPath(new URL('./', import.meta.url)), 3100);
const fixtureConfig: UserConfig = { ...config, server: { ...config.server, proxy: { '/selection': { target: 'http://127.0.0.1:4100', headers: { host: 'private-shop.localhost:4100' } } } } };
export default fixtureConfig;
