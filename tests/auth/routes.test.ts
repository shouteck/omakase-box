import { expect, it, vi } from 'vitest';
import { createPrivateApi } from '../../services/private-api/src/bootstrap/server.js';
import { createExternalApi } from '../../services/external-api/src/bootstrap/server.js';
import type { SessionStore } from '../../packages/contracts/auth/store.js';
import { AuthDenied } from '../../packages/contracts/auth/store.js';

const session = 'a'.repeat(64)+'_'+'b'.repeat(43);
function store(role: 'owner' | 'requester' | 'contributor' = 'owner') {
  return { login: vi.fn().mockResolvedValue({ cookie: session, csrfToken: 'c'.repeat(64) }), authenticate: vi.fn().mockResolvedValue({ id: 'synthetic-id', role }), authenticateMutation: vi.fn().mockImplementation(async (_cookie, csrf) => { if (csrf !== 'c'.repeat(64)) throw new AuthDenied(); return { id:'synthetic-id',role }; }), redeemInvitation: vi.fn().mockResolvedValue({ accountId:'synthetic-id' }), createPrivateInvitation: vi.fn().mockResolvedValue({ token:'d'.repeat(64) }) } as unknown as SessionStore;
}
it('logout requires verified mutation authority and expires only the host-local session cookie', async () => {
  const sessions=store();sessions.revokeSession=vi.fn().mockResolvedValue(undefined);
  const app=createPrivateApi({store:sessions,mode:'localhost_demo'});
  const headers={host:'private.localhost:4000',origin:'http://private.localhost:3000',cookie:'private_session='+session,'x-csrf-token':'c'.repeat(64)};
  try {
    const denied=await app.inject({method:'POST',url:'/v1/auth/logout',headers:{...headers,'x-csrf-token':'invalid'},payload:{}});
    expect(denied.statusCode).toBe(401);expect(sessions.revokeSession).not.toHaveBeenCalled();
    const response=await app.inject({method:'POST',url:'/v1/auth/logout',headers,payload:{actorId:'other-session'}});
    expect(response.json()).toEqual({status:'signed_out'});expect(response.headers['set-cookie']).toContain('Max-Age=0');expect(response.headers['set-cookie']).not.toContain('Domain=');expect(sessions.revokeSession).toHaveBeenCalledOnce();
  } finally {await app.close();}
});
it('rejects client role injection, foreign/missing origins and forged CSRF with safe responses', async () => {
  const app=createPrivateApi({store:store(),mode:'localhost_demo'});
  const headers={host:'private.localhost:4000',origin:'http://private.localhost:3000'};
  try {
    expect((await app.inject({method:'POST',url:'/v1/auth/login',headers,payload:{username:'synthetic.user',password:'synthetic-password',role:'owner'}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/v1/auth/login',headers:{host:headers.host},payload:{username:'synthetic.user',password:'synthetic-password'}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/v1/auth/invitations',headers:{...headers,cookie:'private_session='+session},payload:{role:'requester'}})).statusCode).toBe(401);
    const result=await app.inject({method:'POST',url:'/v1/auth/invitations',headers:{...headers,cookie:'private_session='+session,'x-csrf-token':'c'.repeat(64)},payload:{role:'requester'}});
    expect(result.statusCode).toBe(201);
    expect((await app.inject({url:'/v1/auth/session',headers:{host:headers.host}})).json()).toEqual({error:'authentication_denied'});
  } finally {await app.close();}
});
it('requesters cannot create authority or owner invitations', async () => {
  const app=createPrivateApi({store:store('requester'),mode:'localhost_demo'});
  const headers={host:'private.localhost:4000',origin:'http://private.localhost:3000',cookie:'private_session='+session,'x-csrf-token':'c'.repeat(64)};
  try {
    expect((await app.inject({method:'POST',url:'/v1/auth/invitations',headers,payload:{role:'operator'}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/v1/auth/invitations',headers,payload:{role:'owner'}})).statusCode).toBe(400);
  } finally {await app.close();}
});
it('contributor API rejects private cookies and never exposes private role/provenance', async () => {
  const app=createExternalApi({store:store('contributor'),mode:'localhost_demo'});
  try {
    expect((await app.inject({url:'/v1/auth/session',headers:{host:'contributor.localhost:4001',cookie:'private_session='+session}})).statusCode).toBe(401);
    const result=await app.inject({url:'/v1/auth/session',headers:{host:'contributor.localhost:4001',cookie:'contributor_session='+session}});
    expect(result.json()).toEqual({id:'synthetic-id'});
  } finally {await app.close();}
});
it('production auth fails closed without a genuine TLS connection', async () => {
  const app=createPrivateApi({store:store(),mode:'production'});
  try { expect((await app.inject({url:'/v1/auth/session',headers:{host:'private.localhost:4000',cookie:'__Host-private_session='+session}})).json()).toEqual({error:'tls_required'}); }
  finally {await app.close();}
});
it('returns exact-origin credential CORS on unauthenticated reads and rejects unsupported preflight methods',async()=>{
  const app=createPrivateApi({store:store(),mode:'localhost_demo'});const headers={host:'private.localhost:4000',origin:'http://private.localhost:3000'};
  try {
    const denied=await app.inject({url:'/v1/auth/session',headers});expect(denied.statusCode).toBe(401);expect(denied.headers['access-control-allow-credentials']).toBe('true');
    for(const method of ['GET','POST'])expect((await app.inject({method:'OPTIONS',url:'/v1/auth/session',headers:{...headers,'access-control-request-method':method}})).statusCode).toBe(204);
    expect((await app.inject({method:'OPTIONS',url:'/v1/auth/session',headers:{...headers,'access-control-request-method':'DELETE'}})).statusCode).toBe(403);
    expect((await app.inject({url:'/v1/auth/session',headers:{...headers,origin:'https://attacker.invalid'}})).headers['access-control-allow-credentials']).toBeUndefined();
  }finally{await app.close();}
});
