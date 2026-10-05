import { expect, it, vi } from 'vitest';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { PrivateResourceAccess } from '../../../services/private-api/auth/resources.js';
import { ExternalResourceAccess } from '../../../services/external-api/auth/resources.js';

const id='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';
const actor:SessionActor={id,role:'requester',sessionHash:'a'.repeat(64),csrfHash:'b'.repeat(64)};
function database(rows:Record<string,unknown>[]) {const query=vi.fn().mockResolvedValue({rows,rowCount:rows.length});const release=vi.fn();return{query,release,connect:async()=>({query,release})};}
it('private intent reads bind authenticated owner/requester and current session in SQL, projecting metadata only',async()=>{
  const db=database([{id:other,version:2,state:'draft',payload:'synthetic-private-provenance',content_hash:'private-canary'}]);
  const access=new PrivateResourceAccess(db);
  expect(await access.intent(actor,other)).toEqual({id:other,version:2,state:'draft'});
  const[sql,args]=db.query.mock.calls[0]!;
  expect(sql).toContain("actor.role='requester' AND revision.requester_id=actor.id");expect(sql).toContain('NOT actor.disabled');expect(sql).toContain('session.expires_at>now()');
  expect(args).toEqual([other,id,'requester','a'.repeat(64)]);expect(sql).not.toContain('SELECT *');
  await expect(access.intent({...actor,role:'operator'},other)).rejects.toBeInstanceOf(AuthDenied);
  await expect(access.intent(actor,'../../private')).rejects.toBeInstanceOf(AuthDenied);
});
it('missing/cross-identity resources share denial and contributor projections exclude patch, permits and hashes',async()=>{
  const contributor={...actor,role:'contributor' as const};const empty=database([]);const denied=new ExternalResourceAccess(empty);
  await expect(denied.reservation(contributor,other)).rejects.toBeInstanceOf(AuthDenied);
  await expect(denied.submission(contributor,other)).rejects.toBeInstanceOf(AuthDenied);
  await expect(denied.reservation({...contributor,role:'owner'},other)).rejects.toBeInstanceOf(AuthDenied);
  const db=database([{id:other,reservation_id:id,state:'received',version:1,patch:'private-canary',permit:{secret:'canary'},submission_hash:'private-canary'}]);
  expect(await new ExternalResourceAccess(db).submission(contributor,other)).toEqual({id:other,reservationId:id,version:1});
  const[sql,args]=db.query.mock.calls[0]!;expect(sql).toContain('resource.contributor_id=actor.id');expect(sql).toContain('reservation.contributor_id=resource.contributor_id');expect(sql).toContain('session.token_hash=$3');expect(args).toEqual([other,id,contributor.sessionHash]);
});
it.each(['received','public_evaluating','private_evaluating','owner_review','accepted','changes_required','package_defect','infrastructure_failure'])('does not expose the internal submission stage %s before owner-approved feedback exists',async(state)=>{
  const db=database([{id:other,reservation_id:id,state,version:1}]);
  const projection=await new ExternalResourceAccess(db).submission({...actor,role:'contributor'},other);
  expect(projection).toEqual({id:other,reservationId:id,version:1});
  expect(JSON.stringify(projection)).not.toContain(state);
});
