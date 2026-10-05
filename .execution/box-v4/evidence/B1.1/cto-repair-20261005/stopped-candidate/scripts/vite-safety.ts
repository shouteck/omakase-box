import { fileURLToPath } from 'node:url';
import { defineConfig, isFileServingAllowed } from 'vite';

export function safeViteConfig(appRoot: string, port: number) {
  return defineConfig({
    server: {
      host: '127.0.0.1', port, strictPort: true,
      fs: { strict: true, allow: [appRoot, fileURLToPath(new URL('../node_modules/', import.meta.url))] }
    },
    plugins: [{
      name: 'bounded-development-errors',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = request.url ?? '';
          if (url.startsWith('/@fs/') && !isFileServingAllowed(url, server)) {
            response.statusCode = 403;
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ error: 'forbidden' }));
            return;
          }
          next();
        });
      }
    }],
    build: { sourcemap: false }
  });
}
