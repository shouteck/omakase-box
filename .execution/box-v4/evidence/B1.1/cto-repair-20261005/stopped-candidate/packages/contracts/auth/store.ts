import { randomUUID } from 'node:crypto';
import { hashPassword, newToken, signSession, tokenHash, verifyPassword, verifySessionSignature } from './crypto.js';
import { validServiceRole } from './policy.js';

export interface AuthClient { query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>; release(): void }
export interface AuthDatabase { connect(): Promise<AuthClient> }
export interface SessionActor { id: string; role: 'requester' | 'owner' | 'operator' | 'contributor'; sessionHash: string; csrfHash: string }
export class AuthDenied extends Error { constructor() { super('authentication_denied'); } }
const dummyHash = '$scrypt$32768$8$1$' + Buffer.alloc(16).toString('base64') + '$' + Buffer.alloc(64).toString('base64');
export class SessionStore {
  constructor(private readonly database: AuthDatabase, private readonly scope: 'private' | 'external', private readonly key: Buffer) {
    if (!['private', 'external'].includes(scope) || key.length < 32) throw new Error('Invalid authentication configuration.');
  }
  async login(username: string, password: string) {
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username) || typeof password !== 'string' || password.length > 128) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const role = this.scope === 'private' ? 'role' : "'contributor'";
      const account = (await client.query(`SELECT id,password_hash,disabled,${role} AS role FROM ${this.scope}_accounts WHERE username=$1 FOR UPDATE`, [username])).rows[0];
      const valid = await verifyPassword(password, account ? String(account.password_hash) : dummyHash);
      if (!account || account.disabled || !valid || !validServiceRole(this.scope, account.role)) throw new AuthDenied();
      const token = newToken(); const csrf = newToken();
      await client.query(`INSERT INTO ${this.scope}_sessions (token_hash,account_id,csrf_hash,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')`, [tokenHash(token), account.id, tokenHash(csrf)]);
      await client.query('COMMIT');
      return { cookie: signSession(token, this.key, this.scope), csrfToken: csrf };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async authenticate(cookie: string, csrfToken?: string): Promise<SessionActor> {
    const token = verifySessionSignature(cookie, this.key, this.scope);
    if (!token) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      const role = this.scope === 'private' ? 'account.role' : "'contributor'";
      const row = (await client.query(`SELECT account.id,${role} AS role,session.csrf_hash FROM ${this.scope}_sessions AS session JOIN ${this.scope}_accounts AS account ON account.id=session.account_id WHERE session.token_hash=$1 AND session.expires_at>now() AND NOT account.disabled`, [tokenHash(token)])).rows[0];
      if (!row || !validServiceRole(this.scope, row.role) || (csrfToken !== undefined && tokenHash(csrfToken) !== row.csrf_hash)) throw new AuthDenied();
      return { id: String(row.id), role: row.role as SessionActor['role'], sessionHash: tokenHash(token), csrfHash: String(row.csrf_hash) };
    } finally { client.release(); }
  }
  async authenticateMutation(cookie: string, csrfToken: string): Promise<SessionActor> {
    if (typeof csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(csrfToken)) throw new AuthDenied();
    return this.authenticate(cookie, csrfToken);
  }
  async revokeSession(actor: SessionActor): Promise<void> {
    if (!validServiceRole(this.scope, actor.role) || !/^[a-f0-9]{64}$/.test(actor.sessionHash)) throw new AuthDenied();
    const client = await this.database.connect();
    try { await client.query(`DELETE FROM ${this.scope}_sessions WHERE token_hash=$1 AND account_id=$2`, [actor.sessionHash, actor.id]); }
    finally { client.release(); }
  }
  async createPrivateInvitation(actor: SessionActor, role: 'requester' | 'operator') {
    if (this.scope !== 'private' || actor.role !== 'owner' || !/^[a-f0-9]{64}$/.test(actor.sessionHash) || !/^[a-f0-9]{64}$/.test(actor.csrfHash) || !['requester','operator'].includes(role)) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT account.id FROM private_accounts AS account
        JOIN private_sessions AS session ON session.account_id=account.id
        WHERE account.id=$1 AND account.role='owner' AND NOT account.disabled
        AND session.token_hash=$2 AND session.csrf_hash=$3 AND session.expires_at>now()
        FOR SHARE OF account, session`, [actor.id, actor.sessionHash, actor.csrfHash])).rows[0];
      if (!current) throw new AuthDenied();
      const token = newToken();
      await client.query("INSERT INTO private_invitations (token_hash,role,issuer_id,expires_at) VALUES ($1,$2,$3,now()+interval '1 day')", [tokenHash(token),role,actor.id]);
      await client.query('COMMIT'); return { token };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async redeemInvitation(token: string, username: string, password: string) {
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[A-Za-z0-9_.-]{3,64}$/.test(username)) throw new AuthDenied();
    const passwordHash = await hashPassword(password); const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const invitation = (await client.query(`SELECT * FROM ${this.scope}_invitations WHERE token_hash=$1 AND NOT revoked AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE`, [tokenHash(token)])).rows[0];
      if (!invitation) throw new AuthDenied();
      if (this.scope === 'private') {
        const issuer = (await client.query("SELECT id FROM private_accounts WHERE id=$1 AND role='owner' AND NOT disabled", [invitation.issuer_id])).rows[0];
        if (!issuer || !['requester','operator'].includes(String(invitation.role))) throw new AuthDenied();
      }
      const id = randomUUID();
      if (this.scope === 'private') await client.query('INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,$4)', [id,username,passwordHash,invitation.role]);
      else await client.query('INSERT INTO external_accounts (id,username,password_hash) VALUES ($1,$2,$3)', [id,username,passwordHash]);
      await client.query(`UPDATE ${this.scope}_invitations SET redeemed_at=now() WHERE token_hash=$1`, [tokenHash(token)]);
      await client.query('COMMIT');
      return { accountId: id };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
