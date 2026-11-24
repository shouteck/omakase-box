// K75 scanner, from the 23–24 November 2026 walkthrough (D-2026-11-24-card-is-the-only-board-setting; PF57, PF59): board
// settings must not change the tool's flow. What the tool and agents read from the board are its public facts; an owner's
// board-only settings (payment method, switches, connected accounts, payment methods) must not reach those answers.
// Flagged: any string or template text naming an owner-setting table inside a tool-facing board file. Mode: fail (none today).
import { enclosingFunction, functionName, lineOf, parse, short, sorted, ts, visit } from './ast.mjs';

export const id = 'board-setting-in-tool-answer';
export const mode = 'fail';
export const from = 'D-2026-11-24-card-is-the-only-board-setting: board settings that change the tool\'s flow';
/** The board files that answer the tool and agents: the feed, MCP, llms.txt and the agent API. */
export const TOOL_FACING = /^packages\/box-platform\/src\/(feed|mcp|llms|agent-[a-z-]+)\.ts$/;
export const dirs = ['packages/box-platform/src'];
const SETTING_TABLES = /\b(pay_settings|pay_repositories|stripe_accounts|paypal_accounts|methods)\b/;

export function scan(sources) {
  const findings = [];
  for (const source of sources) {
    if (!TOOL_FACING.test(source.file)) continue;
    const sf = parse(source);
    visit(sf, node => {
      if (!(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) return;
      const text = node.getText(sf);
      if (!/\b(SELECT|FROM|JOIN|UPDATE|INSERT)\b/i.test(text) || !SETTING_TABLES.test(text)) return;
      findings.push({ file: source.file, line: lineOf(node, sf), fn: functionName(enclosingFunction(node), sf), detail: short(text) });
    });
  }
  return sorted(findings);
}
