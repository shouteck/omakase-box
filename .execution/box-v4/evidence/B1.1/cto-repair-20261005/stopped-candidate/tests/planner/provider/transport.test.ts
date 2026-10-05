import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { expect, it } from 'vitest';
import { loopbackTransport, OllamaPlannerProvider } from '../../../packages/planner/providers/ollama.js';
import { intentProposal, planningInput, wire } from './fixtures.js';

async function listen(server: Server) { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port.'); return address.port; }
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); }
it('actual Node HTTP transport exercises a synthetic loopback protocol server, not a live model', async () => {
  const input = planningInput(); let calls = 0;
  const server = createServer((request,response) => {
    calls++; expect(request.method).toBe('POST'); expect(request.url).toBe('/api/chat'); expect(request.headers.cookie).toBeUndefined(); expect(request.headers.authorization).toBeUndefined();
    response.setHeader('Content-Type','application/json'); response.end(wire(intentProposal(input)).body);
  });
  const port = await listen(server);
  try {
    const provider = new OllamaPlannerProvider({ endpoint: `http://127.0.0.1:${port}/api/chat`, model: 'synthetic-model', timeoutMs: 1000 }, loopbackTransport);
    expect(await provider.proposeIntent(input)).toMatchObject({ status: 'proposal', mode: 'ollama_protocol_mock', provenance: { modelVerification: 'protocol_mock' } });
    expect(calls).toBe(1);
  } finally { await close(server); }
});
it('never follows redirects and terminates a real chunked output flood at the wire limit', async () => {
  let hits = 0;
  const destination = createServer((_request,response) => { hits++; response.end('synthetic private destination'); });
  const destinationPort = await listen(destination);
  let flood = false;
  const server = createServer((_request,response) => { if (!flood) { response.writeHead(302,{ Location: `http://127.0.0.1:${destinationPort}/private` }); response.end(); } else { response.writeHead(200,{'Content-Type':'application/json'}); response.end(Buffer.alloc(524289,65)); } });
  const port = await listen(server);
  try {
    const provider = new OllamaPlannerProvider({ endpoint: `http://127.0.0.1:${port}/api/chat`, model: 'synthetic-model', timeoutMs: 1000 }, loopbackTransport);
    expect(await provider.proposeIntent(planningInput())).toMatchObject({ status: 'failed', reason: 'invalid_response' }); expect(hits).toBe(0);
    flood = true;
    expect(await provider.proposeIntent(planningInput())).toMatchObject({ status: 'failed', reason: 'invalid_response' });
  } finally { await close(server); await close(destination); }
});
it('cancels a real pending HTTP response and does not wait indefinitely for end-of-stream', async () => {
  const server = createServer((_request,response) => { response.writeHead(200,{'Content-Type':'application/json'}); response.write('{'); });
  const port = await listen(server);
  try {
    const provider = new OllamaPlannerProvider({ endpoint: `http://127.0.0.1:${port}/api/chat`, model: 'synthetic-model', timeoutMs: 30 }, loopbackTransport);
    expect(await provider.proposeIntent(planningInput())).toMatchObject({ status: 'failed', reason: 'timeout' });
  } finally { await close(server); }
});
