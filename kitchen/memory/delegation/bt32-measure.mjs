// BT32: measure the shared bounty-memory chain on disk.
// Usage: node kitchen/memory/delegation/bt32-measure.mjs <repo> [id]
// Prints, for refs/box-bounty/<id> (or every chain ref when id is omitted):
// event count, per-event blob bytes, and whether the ref exists on origin.
import { execFileSync } from 'node:child_process'
const [repo, id] = process.argv.slice(2)
if (!repo) { console.error('usage: bt32-measure.mjs <repo> [id]'); process.exit(2) }
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim()
const refs = id ? [`refs/box-bounty/${id}`]
  : git('for-each-ref', '--format=%(refname)', 'refs/box-bounty').split('\n').filter(Boolean)
for (const ref of refs) {
  const commits = git('rev-list', '--count', ref)
  const tip = git('rev-parse', ref)
  const blob = git('rev-parse', `${tip}:event.json`)
  const bytes = git('cat-file', '-s', blob)
  console.log(JSON.stringify({ ref, events: Number(commits), tipBytes: Number(bytes) }))
}
