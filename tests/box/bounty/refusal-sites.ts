// Every place the tool constructs a refusal: `new BountyRefused(a, b)` and `invalid(a, b)` calls in packages/box-bounty and
// packages/box-cli/src, read with the TypeScript parser. Shared by bt40 (every refusal names its next step) and the surface
// record (bt62: every refusal name an agent can meet). `excepted` marks `invalid`'s own forwarding definition (gh.ts) and the
// one `command-removed` throw whose message is the removed-name table lookup (bounty.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import * as ts from 'typescript';

export const ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['packages/box-bounty', 'packages/box-cli/src'];

export interface Site { file: string; line: number; reason: string; message: string; excepted: boolean }

export const collectSites = (): Site[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(join(dir, entry.name));
    }
  };
  SCAN_DIRS.forEach(walk);
  const sites: Site[] = [];
  for (const file of files) {
    const rel = file.split(sep).join('/');
    const sf = ts.createSourceFile(rel, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      let args: ts.NodeArray<ts.Expression> | undefined;
      if (ts.isNewExpression(node) && node.expression.getText(sf) === 'BountyRefused' && node.arguments !== undefined && node.arguments.length >= 2) args = node.arguments;
      if (ts.isCallExpression(node) && node.expression.getText(sf) === 'invalid' && node.arguments !== undefined && node.arguments.length >= 2) args = node.arguments;
      if (args !== undefined) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const reason = args[0]!.getText(sf);
        const message = args[1]!.getText(sf);
        // Exclusions: `invalid`'s own forwarding body (reason, message) and the
        // removed-command table lookup — tested through the CLI in bt40.
        const excepted = (reason === 'reason' && message === 'message') || message === 'removed[subcommand!]!';
        sites.push({ file: rel, line: line + 1, reason, message, excepted });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
};
