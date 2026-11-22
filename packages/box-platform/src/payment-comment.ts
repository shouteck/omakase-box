import type { Env, GitHub } from './github.js';

export async function readPaymentComments(env: Env, github: GitHub, id: string, repository: string, number: number): Promise<void> {
  const row = await env.DB.prepare(`SELECT b.amount, b.poster_id, b.created_at, MAX(c.at) AS paid_at FROM bounties b
    LEFT JOIN paid_clicks c ON c.bounty_id = b.id WHERE b.id = ? AND COALESCE(b.approval, '') != 'pending'
    AND NOT EXISTS (SELECT 1 FROM charges WHERE bounty_id = b.id AND state IN ('paid', 'refunded', 'disputed', 'charging', 'owner-paying', 'owner-must-authenticate')) GROUP BY b.id`).bind(id).first<{ amount: number; poster_id: number | null; created_at: string; paid_at: string | null }>();
  if (row === null || row.poster_id === null) return;
  for (let page = 1; page <= 10; page += 1) {
    const read = await github.get(`/repos/${repository}/issues/${number}/comments?since=${encodeURIComponent(row.paid_at ?? row.created_at)}&per_page=100&page=${page}`);
    if (read.status !== 200 || !Array.isArray(read.json)) return;
    for (const comment of read.json as { body?: unknown; user?: { id?: unknown; login?: unknown }; created_at?: unknown }[]) {
      if (typeof comment.body !== 'string' || typeof comment.created_at !== 'string' || comment.user?.id !== row.poster_id || typeof comment.user.login !== 'string') continue;
      if (!Number.isFinite(Date.parse(comment.created_at)) || Date.parse(comment.created_at) < Date.parse(row.created_at) || (row.paid_at !== null && comment.created_at <= row.paid_at)) continue;
      const match = new RegExp(`^omakase paid ${id} \\$${row.amount} to @([a-z\\d](?:[a-z\\d-]{0,37}[a-z\\d])?(?:\\[bot\\])?)$`, 'i').exec(comment.body.trim());
      if (match === null) continue;
      const pull = await env.DB.prepare('SELECT author FROM pull_requests WHERE bounty_id = ? AND author = ? COLLATE NOCASE LIMIT 1').bind(id, match[1]!).first<{ author: string }>();
      if (pull === null) continue;
      await env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT (bounty_id) DO UPDATE SET by_login = excluded.by_login, to_login = excluded.to_login, amount = excluded.amount, withdrawn = 0, at = excluded.at WHERE paid_clicks.at < excluded.at`)
        .bind(id, comment.user.login, pull.author, row.amount, comment.created_at).run();
    }
    if (read.json.length < 100) return;
  }
}
