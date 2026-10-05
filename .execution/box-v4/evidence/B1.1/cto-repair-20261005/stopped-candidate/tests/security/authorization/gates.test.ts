import Fastify from '../../../services/private-api/node_modules/fastify/fastify.js';
import { describe, expect, it, vi } from 'vitest';
import { authHandlers } from '../../../packages/contracts/auth/http.js';
import { permits } from '../../../packages/contracts/auth/policy.js';
import type { AuthAction } from '../../../packages/contracts/auth/policy.js';
import type { SessionActor, SessionStore } from '../../../packages/contracts/auth/store.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import { privateSessionCookie } from '../../../services/private-api/bootstrap/cookie-policy.js';

const ownerActions = ['intent.approve','release.approve','publication.approve','assignment.approve','acceptance.approve','invitation.create'] as const;
describe('closed action authority independent of client claims', () => {
  it.each(ownerActions)('restricts %s to a private owner', action => {
    expect(permits('private','owner',action)).toBe(true);
    for (const role of ['requester','operator','contributor','admin','__proto__',undefined]) expect(permits('private',role,action)).toBe(false);
    expect(permits('external','owner',action)).toBe(false);
  });
  it('keeps operations separate from outcome authority and closes unknown capabilities', () => {
    expect(permits('private','operator','runtime.configure')).toBe(true);
    expect(permits('private','operator','evaluation.operate')).toBe(true);
    expect(permits('private','requester','intent.read')).toBe(true);
    expect(permits('external','contributor','submission.write')).toBe(true);
    for (const action of ['constructor','toString','arbitrary.execute',undefined]) expect(permits('private','owner',action)).toBe(false);
    expect(permits('unknown','owner','release.approve')).toBe(false);
  });
});
it('request-bound owner gate prevents forbidden handler dispatch despite forged role/actor fields', async () => {
  for (const role of ['owner','requester','operator','contributor'] as const) {
    const verified: SessionActor = { id:'11111111-1111-4111-8111-111111111111', role, sessionHash:'a'.repeat(64), csrfHash:'b'.repeat(64) };
    const store = { authenticate: async () => verified, authenticateMutation: async (_cookie: string, csrf: string) => { if (csrf !== 'c'.repeat(64)) throw new AuthDenied(); return verified; } } as unknown as SessionStore;
    const handlers = authHandlers(store,'private','http://private.localhost:3000','localhost_demo',privateSessionCookie);
    const app = Fastify(); app.addHook('onRequest',handlers.guard);
    const dispatched = vi.fn();
    app.post('/synthetic/owner',async(request,reply) => { const actor=handlers.requirePermission(request,reply,'release.approve'); if(!actor)return; dispatched(actor.id); return reply.send({approvedBy:actor.id}); });
    app.get('/synthetic/unknown',async(request,reply) => { if(!handlers.requirePermission(request,reply,'arbitrary.execute' as AuthAction))return; return reply.send({unsafe:true}); });
    const headers={origin:'http://private.localhost:3000',cookie:'private_session='+'a'.repeat(64)+'_'+'b'.repeat(43),'x-csrf-token':'c'.repeat(64),'x-actor-role':'owner'};
    try {
      const response=await app.inject({method:'POST',url:'/synthetic/owner',headers,payload:{role:'owner',actorId:'forged-owner'}});
      expect(response.statusCode).toBe(role==='owner'?200:role==='contributor'?401:403);
      expect(dispatched).toHaveBeenCalledTimes(role==='owner'?1:0);
      if(role==='owner')expect(dispatched).toHaveBeenCalledWith(verified.id);
      expect((await app.inject({url:'/synthetic/unknown',headers})).statusCode).toBe(role==='contributor'?401:403);
      expect((await app.inject({method:'POST',url:'/synthetic/owner',headers:{...headers,'x-csrf-token':'forged'},payload:{role:'owner'}})).statusCode).toBe(401);
    } finally {await app.close();}
  }
});
it('duplicate cookies and raw private authentication errors cannot reach a protected response', async () => {
  const canary='synthetic-private-source-path-and-provenance-canary';
  const store={authenticate:vi.fn().mockRejectedValue(new Error(canary))} as unknown as SessionStore;
  const handlers=authHandlers(store,'private','http://private.localhost:3000','localhost_demo',privateSessionCookie);
  const app=Fastify();app.addHook('onRequest',handlers.guard);app.get('/synthetic/protected',async()=>({unsafe:true}));
  const cookie='private_session='+'a'.repeat(64)+'_'+'b'.repeat(43);
  try {
    const duplicate=await app.inject({url:'/synthetic/protected',headers:{cookie:cookie+'; '+cookie}});
    expect(duplicate.statusCode).toBe(401);expect(store.authenticate).not.toHaveBeenCalled();
    const failure=await app.inject({url:'/synthetic/protected',headers:{cookie}});
    expect(failure.statusCode).toBe(503);expect(failure.json()).toEqual({error:'authentication_unavailable'});expect(failure.body).not.toContain(canary);
  } finally {await app.close();}
});
