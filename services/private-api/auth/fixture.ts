import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { hashPassword, newToken, tokenHash } from '../../../packages/contracts/auth/crypto.js';

if (process.env.SYNTHETIC_AUTH_FIXTURE !== 'synthetic-fixture') process.exit(2);
const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 1 });
try {
  let input = ''; for await (const chunk of process.stdin) { input += chunk.toString(); if (input.length > 4096) throw new Error('Fixture input exceeded.'); }
  const command = JSON.parse(input) as { action: string; id?: string; token?: string };
  if (command.action === 'seed') {
    const hash = await hashPassword('synthetic-auth-password-only');
    const accounts = [];
    for (const role of ['owner','requester','operator'] as const) {
      const id = randomUUID(); const username = `synthetic.auth.${role}.${id.slice(0,8)}`;
      await pool.query('INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,$4)',[id,username,hash,role]); accounts.push({ id,username,role });
    }
    const requester = accounts.find(account => account.role === 'requester')!;
    const intentId = randomUUID();
    const payload = { schemaVersion:1, intentId, version:1, state:'draft', goal:'Synthetic authorization private canary', snapshotHash:'a'.repeat(64), facts:[], evidence:[], decisions:[], assumptions:[], unknowns:[], acceptanceExamples:[], scope:{included:['Synthetic only'],excluded:['Real approvals']} };
    await pool.query("INSERT INTO private_intent_revisions (id,version,state,payload,content_hash,snapshot_hash,requester_id) VALUES ($1,1,'draft',$2,$3,$3,$4)",[intentId,payload,'a'.repeat(64),requester.id]);
    await pool.query('INSERT INTO private_intent_heads (id,current_version) VALUES ($1,1)',[intentId]);
    console.log(JSON.stringify({ accounts, intentId }));
  } else if (command.action === 'disable') {
    await pool.query("UPDATE private_accounts SET disabled=true WHERE id=$1 AND username LIKE 'synthetic.auth.%'",[command.id]); console.log(JSON.stringify({ status:'disabled' }));
  } else if (command.action === 'expire') {
    await pool.query("UPDATE private_sessions SET expires_at=now()-interval '1 second' WHERE account_id=$1 AND account_id IN (SELECT id FROM private_accounts WHERE username LIKE 'synthetic.auth.%')",[command.id]); console.log(JSON.stringify({ status:'expired' }));
  } else if (command.action === 'revoke') {
    await pool.query("UPDATE private_invitations SET revoked=true WHERE token_hash=$1 AND issuer_id IN (SELECT id FROM private_accounts WHERE username LIKE 'synthetic.auth.%')",[tokenHash(command.token ?? '')]); console.log(JSON.stringify({ status:'revoked' }));
  } else if (command.action === 'expired_invitation') {
    const token = newToken(); await pool.query("INSERT INTO private_invitations (token_hash,role,issuer_id,expires_at) VALUES ($1,'requester',$2,now()-interval '1 second')",[tokenHash(token),command.id]); console.log(JSON.stringify({ token }));
  } else throw new Error('Unknown fixture action.');
} catch { console.error('Synthetic auth fixture failed.'); process.exitCode=1; }
finally { await pool.end(); }
