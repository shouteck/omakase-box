import { fileURLToPath } from 'node:url';
import { safeViteConfig } from '../../scripts/vite-safety.js';

export default safeViteConfig(fileURLToPath(new URL('./', import.meta.url)), 3001);
