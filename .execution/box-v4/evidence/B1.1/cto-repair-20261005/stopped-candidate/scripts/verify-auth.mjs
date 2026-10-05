import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

async function fixture(service, command) {
  const result = await docker([...composeArguments,'exec','-T','--env','SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic','--workdir',`/workspace/services/${service}`,service,'node','dist/fixture.js'], { input: JSON.stringify(command) });
  assert.equal(result.code,0,'Synthetic account setup failed.'); return JSON.parse(result.stdout);
}
function http(scope,method,path,body,headers={}) {
  const port=scope==='private'?4000:4001; const host=scope==='private'?'private.localhost':'contributor.localhost'; const origin=scope==='private'?'http://private.localhost:3000':'http://contributor.localhost:3001';
  return new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path,method,headers:{Host:`${host}:${port}`,Origin:origin,'Content-Type':'application/json',...headers},timeout:5000},response=>{let data='';response.on('data',chunk=>{data+=chunk;});response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(data||'null'),headers:response.headers}));});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Auth request timeout.')));req.end(body===undefined?undefined:JSON.stringify(body));});
}
const privateSeed=await fixture('private-api',{action:'seed'}); const externalSeed=await fixture('external-api',{action:'seed'});
const owner=privateSeed.accounts.find(account=>account.role==='owner'); const requester=privateSeed.accounts.find(account=>account.role==='requester'); const operator=privateSeed.accounts.find(account=>account.role==='operator');
async function login(scope,account) {
  const response=await http(scope,'POST','/v1/auth/login',{username:account.username,password:'synthetic-auth-password-only'});
  assert.equal(response.status,200);const set=response.headers['set-cookie'][0];assert.ok(!set.includes('Domain='));assert.ok(set.includes('HttpOnly'));assert.ok(set.includes('SameSite=Strict'));return {Cookie:set.split(';')[0],'X-CSRF-Token':response.body.csrfToken};
}
const own=await login('private',owner);const req=await login('private',requester);const op=await login('private',operator);const con=await login('external',externalSeed.accounts[0]);
const otherPrivate=await fixture('private-api',{action:'seed'});const otherRequester=await login('private',otherPrivate.accounts.find(account=>account.role==='requester'));
const otherContributor=await login('external',externalSeed.accounts[1]);
for(const headers of [own,req])assert.deepEqual((await http('private','GET',`/v1/intents/${privateSeed.intentId}`,undefined,headers)).body,{id:privateSeed.intentId,version:1,state:'draft'});
assert.equal((await http('private','GET',`/v1/intents/${privateSeed.intentId}`,undefined,op)).status,403);
for(const id of [privateSeed.intentId,'00000000-0000-4000-8000-000000000001','invalid-id']) {
  const response=await http('private','GET',`/v1/intents/${id}`,undefined,otherRequester);assert.equal(response.status,404);assert.deepEqual(response.body,{error:'not_found'});
}
const ownReservation=await http('external','GET',`/v1/reservations/${externalSeed.reservationId}`,undefined,con);assert.equal(ownReservation.status,200);assert.deepEqual(Object.keys(ownReservation.body).sort(),['expiresAt','id','state','taskId','taskVersion','version']);
const ownSubmission=await http('external','GET',`/v1/submissions/${externalSeed.submissionId}/status`,undefined,con);assert.equal(ownSubmission.status,200);assert.deepEqual(ownSubmission.body,{schemaVersion:1,id:externalSeed.submissionId,reservationId:externalSeed.reservationId,state:'received',version:1,feedback:null});
for(const path of [`/v1/reservations/${externalSeed.reservationId}`,`/v1/submissions/${externalSeed.submissionId}/status`,`/v1/reservations/00000000-0000-4000-8000-000000000001`]) {
  const response=await http('external','GET',path,undefined,{...otherContributor,'X-Actor-Role':'owner'});assert.equal(response.status,404);assert.deepEqual(response.body,{error:'not_found'});
}
assert.equal((await http('private','POST','/v1/auth/login',{username:owner.username,password:'synthetic-auth-password-only',role:'owner'})).status,400);
assert.equal((await http('private','POST','/v1/auth/invitations',{role:'requester'},{Cookie:own.Cookie})).status,401);
for(const headers of [req,op]) assert.equal((await http('private','POST','/v1/auth/invitations',{role:'operator'},headers)).status,403);
assert.equal((await http('external','GET','/v1/auth/session',undefined,{Cookie:own.Cookie})).status,401);
assert.equal((await http('private','GET','/v1/auth/session',undefined,{Cookie:con.Cookie})).status,401);
const publicSession=await http('external','GET','/v1/auth/session',undefined,con);assert.deepEqual(publicSession.body,{id:externalSeed.accounts[0].id});
assert.equal((await http('private','GET','/v1/auth/session',undefined,{Cookie:own.Cookie+'x'})).status,401);
const invitation=await http('private','POST','/v1/auth/invitations',{role:'requester'},own);assert.equal(invitation.status,201);
const invitedName='synthetic.invited.'+owner.id.slice(0,8);
const redeemed=await http('private','POST','/v1/auth/redeem',{token:invitation.body.token,username:invitedName,password:'synthetic-invited-password'});assert.equal(redeemed.status,201);
assert.equal((await http('private','POST','/v1/auth/redeem',{token:invitation.body.token,username:invitedName+'x',password:'synthetic-invited-password'})).status,403);
const revoked=await http('private','POST','/v1/auth/invitations',{role:'requester'},own);await fixture('private-api',{action:'revoke',token:revoked.body.token});assert.equal((await http('private','POST','/v1/auth/redeem',{token:revoked.body.token,username:'synthetic.revoked.'+owner.id.slice(0,8),password:'synthetic-invited-password'})).status,403);
const expired=await fixture('private-api',{action:'expired_invitation',id:owner.id});assert.equal((await http('private','POST','/v1/auth/redeem',{token:expired.token,username:'synthetic.expired.'+owner.id.slice(0,8),password:'synthetic-invited-password'})).status,403);
const externalInvitation=await fixture('external-api',{action:'invitation'});
const externalRedeem={token:externalInvitation.token,username:'synthetic.redeemed.'+owner.id.slice(0,8),password:'synthetic-invited-password'};
assert.equal((await http('external','POST','/v1/auth/redeem',externalRedeem)).status,201);
assert.equal((await http('external','POST','/v1/auth/redeem',{...externalRedeem,username:externalRedeem.username+'x'})).status,403);
const externalRevoked=await fixture('external-api',{action:'invitation'});await fixture('external-api',{action:'revoke',token:externalRevoked.token});
const externalExpired=await fixture('external-api',{action:'expired_invitation'});
for(const token of [externalRevoked.token,externalExpired.token])assert.equal((await http('external','POST','/v1/auth/redeem',{...externalRedeem,token,username:externalRedeem.username+'y'})).status,403);

// HTML is a synthetic shell; credentials are issued by actual API/DB sessions.
const {chromium}=await import('@playwright/test');
const shells=[];
let browser;
try {
  for (const [host,port] of [['private.localhost',3000],['contributor.localhost',3001]]) {
    const shell=createServer((request,response)=>{
      if(request.headers.host!==`${host}:${port}`||request.url!=='/synthetic-auth'){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      response.end('<!doctype html><title>Synthetic authentication browser</title>');
    });
    await new Promise((resolve,reject)=>{shell.once('error',reject);shell.listen(port,'127.0.0.1',resolve);});
    shells.push(shell);
  }
  browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP private.localhost 127.0.0.1,MAP contributor.localhost 127.0.0.1']});
  const context=await browser.newContext();const page=await context.newPage();const contributorCookies=[];
  page.on('request',request=>{if(request.url().startsWith('http://contributor.localhost:4001/'))contributorCookies.push(request.allHeaders().then(headers=>headers.cookie??''));});
  async function browserCall(scope,path,body,csrf) {
    return page.evaluate(async({scope,path,body,csrf})=>{const port=scope==='private'?4000:4001;const host=scope==='private'?'private.localhost':'contributor.localhost';const response=await fetch(`http://${host}:${port}${path}`,{method:body===undefined?'GET':'POST',credentials:'include',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json()};},{scope,path,body,csrf});
  }
  await page.goto('http://private.localhost:3000/synthetic-auth');
  const privateLogin=await browserCall('private','/v1/auth/login',{username:owner.username,password:'synthetic-auth-password-only'});assert.equal(privateLogin.status,200);
  assert.deepEqual((await browserCall('private','/v1/auth/session')).body,{id:owner.id,role:'owner'});
  const privateCookie=(await context.cookies()).find(cookie=>cookie.name==='private_session');assert.ok(privateCookie);assert.equal(privateCookie.domain,'private.localhost');assert.equal(privateCookie.httpOnly,true);assert.equal(privateCookie.sameSite,'Strict');
  await page.goto('http://contributor.localhost:3001/synthetic-auth');
  assert.equal((await browserCall('external','/v1/auth/session')).status,401);
  const contributorLogin=await browserCall('external','/v1/auth/login',{username:externalSeed.accounts[0].username,password:'synthetic-auth-password-only'});assert.equal(contributorLogin.status,200);
  assert.deepEqual((await browserCall('external','/v1/auth/session')).body,{id:externalSeed.accounts[0].id});
  const observed=await Promise.all(contributorCookies);assert.ok(observed.length>=3);assert.ok(observed.every(cookie=>!cookie.includes('private_session')&&!cookie.includes(privateCookie.value)));assert.ok(observed.some(cookie=>cookie.includes('contributor_session=')));
  assert.equal((await browserCall('external','/v1/auth/logout',{})).status,401);
  assert.equal((await browserCall('external','/v1/auth/logout',{},contributorLogin.body.csrfToken)).status,200);
  assert.equal((await browserCall('external','/v1/auth/session')).status,401);
  await page.goto('http://private.localhost:3000/synthetic-auth');
  assert.equal((await browserCall('private','/v1/auth/logout',{},privateLogin.body.csrfToken)).status,200);
  assert.equal((await browserCall('private','/v1/auth/session')).status,401);
  await context.close();
} finally {
  await browser?.close();
  for(const shell of shells)await new Promise((resolve,reject)=>shell.close(error=>error?reject(error):resolve()));
}
assert.equal((await http('external','POST','/v1/auth/logout',{},con)).status,200);
assert.equal((await http('external','GET','/v1/auth/session',undefined,con)).status,401);
await fixture('private-api',{action:'disable',id:requester.id});assert.equal((await http('private','GET','/v1/auth/session',undefined,req)).status,401);assert.equal((await http('private','POST','/v1/auth/login',{username:requester.username,password:'synthetic-auth-password-only'})).status,401);
await fixture('private-api',{action:'expire',id:operator.id});assert.equal((await http('private','GET','/v1/auth/session',undefined,op)).status,401);
await fixture('external-api',{action:'expire',id:externalSeed.accounts[1].id});assert.equal((await http('external','GET','/v1/auth/session',undefined,otherContributor)).status,401);
const freshContributor=await login('external',externalSeed.accounts[1]);await fixture('external-api',{action:'disable',id:externalSeed.accounts[1].id});assert.equal((await http('external','GET','/v1/auth/session',undefined,freshContributor)).status,401);
console.log(JSON.stringify({assurance:'tested',scope:'synthetic actual API/DB auth',signedSessionIsolation:'tested',clientRoleInjection:'denied',csrf:'required',requesterOperatorAuthority:'denied',invitationReplayRevocationExpiry:'tested',disabledAccounts:'denied',expiredSessions:'denied',publicProjection:'allowlisted',resourceOwnership:'tested',actualBrowserSignedSessions:'tested',logoutRevocation:'tested',syntheticStructuralResourcesNotReleaseApproval:true,realCustomerData:false},null,2));
