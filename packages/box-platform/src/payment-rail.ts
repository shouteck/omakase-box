import type { Env } from './github.js';

export type Rail = 'stripe' | 'paypal';
export type RailSettings = { stripe: boolean; paypal: boolean; rail: Rail | null; fallback: boolean; override?: Rail | null };

export function chooseRail(settings: RailSettings, ready?: { stripe: boolean; paypal: boolean }) {
  const saved_rails = (['stripe', 'paypal'] as const).filter(rail => settings[rail]);
  const chosen_rail = settings.override ?? (saved_rails.length === 1 ? saved_rails[0]! : settings.rail);
  const fallback = settings.override == null && settings.fallback;
  const other = chosen_rail === 'stripe' ? 'paypal' : 'stripe';
  const selected_rail = chosen_rail !== null && fallback && ready !== undefined && !ready[chosen_rail] && settings[other] && ready[other] ? other : chosen_rail;
  return { saved_rails, chosen_rail, selected_rail, fallback, account_rail: settings.rail, override: settings.override ?? null, needs_choice: saved_rails.length > 1 && chosen_rail === null };
}

export async function paymentRail(env: Env, githubId: number | null, override?: Rail | null, ready?: { stripe: boolean; paypal: boolean }) {
  const row = await env.DB.prepare(`SELECT s.payment_method IS NOT NULL AS stripe, v.payment_token IS NOT NULL AS paypal, p.rail, COALESCE(p.fallback, 0) AS fallback
    FROM (SELECT ? AS github_id) a LEFT JOIN pay_settings s ON s.github_id = a.github_id LEFT JOIN paypal_vault v ON v.github_id = a.github_id LEFT JOIN payment_preferences p ON p.github_id = a.github_id`)
    .bind(githubId).first<{ stripe: number; paypal: number; rail: Rail | null; fallback: number }>();
  return chooseRail({ stripe: row?.stripe === 1, paypal: row?.paypal === 1, rail: row?.rail ?? null, fallback: row?.fallback === 1, override: override ?? null }, ready);
}

export async function requireRailChoice(env: Env, githubId: number) {
  await env.DB.prepare(`INSERT INTO payment_preferences (github_id, rail, fallback) SELECT ?, NULL, 0
    WHERE EXISTS (SELECT 1 FROM pay_settings WHERE github_id = ? AND payment_method IS NOT NULL) AND EXISTS (SELECT 1 FROM paypal_vault WHERE github_id = ?)
    ON CONFLICT (github_id) DO UPDATE SET rail = NULL, fallback = 0`).bind(githubId, githubId, githubId).run();
}
