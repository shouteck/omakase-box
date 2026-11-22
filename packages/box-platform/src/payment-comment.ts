import type { Env, GitHub } from './github.js';
import { paySaved } from './charge.js';
import { paymentLandingVersion } from './payments.js';
import { getMeta, setMeta } from './store.js';
import type { Rail } from './payment-rail.js';

export async function readPaymentComments(env: Env, github: GitHub, id: string, repository: string, number: number): Promise<void> {
  const row = await env.DB.prepare(`SELECT b.amount, b.poster_id, b.created_at, b.approval_at, MAX(c.at) AS paid_at FROM bounties b
    LEFT JOIN paid_clicks c ON c.bounty_id = b.id WHERE b.id = ? AND COALESCE(b.approval, '') != 'pending'
    AND NOT EXISTS (SELECT 1 FROM charges WHERE bounty_id = b.id AND state IN ('paid', 'refunded', 'disputed', 'charging', 'owner-paying', 'owner-must-authenticate')) GROUP BY b.id`).bind(id).first<{ amount: number; poster_id: number | null; created_at: string; approval_at: string | null; paid_at: string | null }>();
  if (row === null || row.poster_id === null) return;
  const landing = await env.DB.prepare(`SELECT (${paymentLandingVersion}) AS version FROM bounties b WHERE b.id = ?`).bind(id).first<{ version: string }>();
  const key = `payment_comment_scan/${id}`;
  const since = row.paid_at ?? row.created_at;
  const stored = await getMeta(env.DB, key);
  const scan = stored === null ? null : JSON.parse(stored) as { since: string; version: string; page: number };
  const first = scan?.since === since && scan.version === landing!.version ? scan.page : 1;
  for (let page = first; ; page += 1) {
    const read = await github.get(`/repos/${repository}/issues/${number}/comments?since=${encodeURIComponent(since)}&per_page=100&page=${page}`);
    if (read.status !== 200 || !Array.isArray(read.json)) return;
    for (const comment of read.json as { id?: unknown; body?: unknown; user?: { id?: unknown; login?: unknown }; created_at?: unknown }[]) {
      if (typeof comment.body !== 'string' || typeof comment.created_at !== 'string' || comment.user?.id !== row.poster_id || typeof comment.user.login !== 'string') continue;
      if (!Number.isFinite(Date.parse(comment.created_at)) || Date.parse(comment.created_at) < Date.parse(row.created_at) || (row.paid_at !== null && comment.created_at <= row.paid_at)) continue;
      const match = new RegExp(`^omakase (pay|paid) ${id} \\$${row.amount} to @([a-z\\d](?:[a-z\\d-]{0,37}[a-z\\d])?(?:\\[bot\\])?)(?: via (stripe|paypal))?$`, 'i').exec(comment.body.trim());
      if (match === null) continue;
      if (match[1]!.toLowerCase() === 'paid' && match[3] !== undefined) continue;
      if (match[1]!.toLowerCase() === 'pay') {
        if (!Number.isSafeInteger(comment.id) || Date.parse(comment.created_at) < Date.parse(row.approval_at ?? row.created_at)) continue;
        const command = await env.DB.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING RETURNING key`)
          .bind(`payment_command/${id}/${comment.id as number}`, comment.created_at).first();
        if (command === null) continue;
        await paySaved(env, id, row.poster_id, row.amount, match[2]!, match[3]?.toLowerCase() as Rail | undefined);
        return;
      }
      const pull = await env.DB.prepare('SELECT author FROM pull_requests WHERE bounty_id = ? AND author = ? COLLATE NOCASE LIMIT 1').bind(id, match[2]!).first<{ author: string }>();
      if (pull === null) continue;
      await env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT (bounty_id) DO UPDATE SET by_login = excluded.by_login, to_login = excluded.to_login, amount = excluded.amount, withdrawn = 0, at = excluded.at WHERE paid_clicks.at < excluded.at`)
        .bind(id, comment.user.login, pull.author, row.amount, comment.created_at).run();
    }
    if (read.json.length < 100) {
      await setMeta(env.DB, `payment_comments/${id}`, landing!.version);
      await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(key).run();
      return;
    }
    await setMeta(env.DB, key, JSON.stringify({ since, version: landing!.version, page: page + 1 }));
  }
}
