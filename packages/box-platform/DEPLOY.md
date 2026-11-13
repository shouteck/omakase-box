# Deploying the board

The open bounty board is the website in this folder: a public list of bounties on public GitHub repositories. This guide puts it on Cloudflare's free plan.

Whoever deploys needs a GitHub account, Git, Node 24 and a terminal. Total cost: **$0 a month**. No step asks for a payment card. If Cloudflare or GitHub asks for one, stop and do not enter it: the free route has changed, so read their current free plan before going on.

On the free plans, going over a limit stops the service until the next day; it never charges. Limits, as Cloudflare publishes them: 100,000 Worker requests a day; D1 5 million rows read and 100,000 written a day, 5 GB stored; Workers Logs 200,000 events a day, kept 3 days.

Get the code and install it:

```bash
git clone https://github.com/shouteck/omakase-box.git
```

```bash
cd omakase-box
```

```bash
node scripts/pnpm.mjs install
```

Then move to this folder, where every command below runs:

```bash
cd packages/box-platform
```

| Step | What you do | Where | Cost |
|---|---|---|---|
| 1 | Create a Cloudflare account | cloudflare.com | $0 |
| 2 | Log wrangler, Cloudflare's command-line tool, in | terminal, then browser | $0 |
| 3 | Create the database, put its id in `wrangler.toml`, apply the schema | terminal, editor | $0 |
| 4 | Build and deploy; note the address | terminal | $0 |
| 5 | Create the GitHub OAuth app | github.com | $0 |
| 6 | Set the two sign-in secrets, then try signing in | terminal, browser | $0 |
| 7 | Create and set the GitHub read token (optional, recommended) | github.com, terminal | $0 |

Once it runs, four things keep it safe, each its own section below: **Applying a migration** (always before the code that needs it), **Keeping a copy** of the database outside Cloudflare, **Restoring the database** to an earlier minute, and **Rolling back the Worker** to an earlier version. **Watching the board** says how a failure reaches you.

## 1. Cloudflare account

Sign up at https://dash.cloudflare.com/sign-up with an email and a password, and verify the email. Choose the Free plan if asked.

## 2. Log wrangler in

```bash
node node_modules/wrangler/bin/wrangler.js login
```

A browser page asks you to allow wrangler; allow it. Wrangler keeps its login on this machine, so any program you run here as this user can deploy with it, including an agent you ask to redeploy or read logs.

## 3. The database

```bash
node node_modules/wrangler/bin/wrangler.js d1 create open-bounty-board
```

It prints a `database_id`, which is not a secret. If wrangler offers to add it to the config, answer no. Open `wrangler.toml` in this folder and replace the value of `database_id` with it, and commit that edit in your clone so a later deploy keeps it. Do this before step 4; otherwise the deploy reaches someone else's database id and fails. Then apply the schema:

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file schema.sql
```

## 4. Build and deploy

```bash
node node_modules/next/dist/bin/next build
```

```bash
node node_modules/wrangler/bin/wrangler.js deploy
```

If asked, choose a `workers.dev` subdomain. **It becomes part of the board's public address**, so pick a name you are happy to show. The command prints the address: `https://open-bounty-board.<your-subdomain>.workers.dev`. The steps below call it the board's address.

Open that address. The board now answers and reads GitHub a little every minute. A new address can refuse secure connections for its first minute. The front page should appear at once; the board's list may stay short or empty until step 7. Sign-in says it is not set up until step 6.

## 5. GitHub OAuth app

At https://github.com/settings/applications/new:

- Application name: `Open bounty board`
- Homepage URL: the board's address
- Authorization callback URL (GitHub may call it Redirect URI): the board's address followed by `/auth/github/callback`
- Leave "Enable Device Flow" off.

Register it. The page shows the Client ID. Press "Generate a new client secret" and keep that page open for the next step; GitHub shows the secret only once.

## 6. The sign-in secrets

Each command asks you to paste the value, and it goes straight to Cloudflare. Never paste it into a chat or a file. No redeploy is needed.

```bash
node node_modules/wrangler/bin/wrangler.js secret put GITHUB_OAUTH_CLIENT_ID
```

```bash
node node_modules/wrangler/bin/wrangler.js secret put GITHUB_OAUTH_CLIENT_SECRET
```

To check: open the board's address followed by `/sign-in/` and sign in with GitHub. You come back signed in, and GitHub asks only for your public profile. If it fails, the usual causes are a callback address that differs from the board's, or the ID and secret swapped: correct the app's page, or run the two commands again.

## 7. The GitHub read token (optional, recommended)

Without a token the board shares GitHub's limit of 60 reads an hour with everything else on Cloudflare's addresses. On its first real run GitHub stopped it after 5 reads, so expect it to lag badly. With a token it has 5,000 an hour.

At https://github.com/settings/personal-access-tokens/new, which makes a fine-grained token:

- Token name: `open-bounty-board`
- Resource owner: your own account
- Expiration: No expiration, or the longest offered. It can only read public repositories.
- Repository access: **Public repositories**
- Permissions: add none.

Press "Generate token" and copy it; GitHub shows it only once. Do not use a classic token. This one cannot read a private repository, which is the point.

```bash
node node_modules/wrangler/bin/wrangler.js secret put GITHUB_TOKEN
```

Paste the token when asked. No redeploy is needed. To check: within about 15 minutes the board lists open bounties and `/bounties.json` shows `"stale":null`. **If it has an expiry date, the board stops updating when it passes** and shows what it last read. Before that date, make a new token and run this command again, or remove the secret to go back to unauthenticated reads: `node node_modules/wrangler/bin/wrangler.js secret delete GITHUB_TOKEN`.

## Applying a migration

A migration is a file in `migrations/` that changes the database's shape. It always goes on **before** the code that needs it: the new code may read a column the old database lacks. Since PF37 the database records which files it holds, in its `migrations` table, so you ask it rather than remember. From this folder:

1. Ask the board what it holds, saving the answer outside the repository:

   ```bash
   node migrate.mjs
   ```

   It changes nothing. It prints one `wrangler d1 execute … --json --command "SELECT name FROM migrations"` line. Run that line; the answer goes to `applied.json` three folders up, outside the repository.
2. Ask what is still to run:

   ```bash
   node migrate.mjs --applied ../../../applied.json
   ```

   It prints one `wrangler d1 execute open-bounty-board --remote --file migrations/<name>` line per file the board does not hold yet, in order, or "Nothing to apply". A board from before PF37 has no record; it is told to run `migrations/pf37.sql` first, which records the seven older files with that day's date (their real dates are unknown).
3. Run each printed line, in order. Each answers "Executed … queries".
4. Then build and deploy as in step 4.

A new migration file ends with its own `INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('<its name>', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), '<what it does>');`, and its name is added to the record at the end of `schema.sql`, so a new board starts with it.

## Keeping a copy

A copy of the database outside Cloudflare, for the day Cloudflare cannot give it back. Keep one after any change that matters, and at least monthly. From this folder:

```bash
node node_modules/wrangler/bin/wrangler.js d1 export open-bounty-board --remote --output=../../../open-bounty-board-YYYY-MM-DD.sql
```

- **The board stops answering while the export runs** (Cloudflare: "A running export will block other database requests"). On today's board it takes seconds.
- **The command prints a download link that works for one hour** and fetches the whole copy. Do not paste its output anywhere: a chat, an issue, a log.
- **The file holds people's GitHub ids and their payment connections.** Name it with the date, as above, and keep it outside this repository and outside any folder that syncs to a cloud service. Never commit it, attach it or share it. Delete old copies you no longer need.
- To check a copy is usable, load it into any SQLite tool; it is plain SQL (PF37 loaded one into a local SQLite: every table and the migration record came back).
- To bring a copy back into an empty database: `node node_modules/wrangler/bin/wrangler.js d1 execute <database> --remote --file <the copy>`.

## Restoring the database

Cloudflare keeps the database's history and can put it back to **any minute in the last 7 days** on the free plan (30 on Workers Paid). It overwrites the database in place, and it can itself be undone. Tried for real on a throwaway database in PF37. From this folder:

1. Check the database can do this: `node node_modules/wrangler/bin/wrangler.js d1 list`. The `version` column for `open-bounty-board` must say `production`; it did on 14 November 2026.
2. Choose the moment, as a Unix time in seconds, a few minutes **before** the bad change (`date -d "2026-11-14 09:30 UTC" +%s` in Git Bash). Ask which point in history that is:

   ```bash
   node node_modules/wrangler/bin/wrangler.js d1 time-travel info open-bounty-board --timestamp=<unix seconds>
   ```

   It answers "Timestamp … corresponds with bookmark …".
3. Restore:

   ```bash
   node node_modules/wrangler/bin/wrangler.js d1 time-travel restore open-bounty-board --timestamp=<unix seconds>
   ```

   It answers "restored back to bookmark …" and **"To undo this operation, you can restore to the previous bookmark: <bookmark>"**. Copy that bookmark before doing anything else. Queries running at that moment are cancelled.
4. **Read what you restored** before trusting it: `node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --command "SELECT COUNT(*) FROM bounties"`, or the table the bad change touched. In PF37, changes made seconds apart could not be told apart: a restore to a moment seconds after the last write went back to before it. Minutes apart, it was exact.
5. If it is not what you wanted, undo with the bookmark from step 3, then choose another moment:

   ```bash
   node node_modules/wrangler/bin/wrangler.js d1 time-travel restore open-bounty-board --bookmark=<the bookmark from step 3>
   ```

What is lost: everything the board wrote after the chosen moment, such as payments recorded and sign-ins. GitHub's side is read again by the next refresh.

## Rolling back the Worker

Putting the previous code back. Tried for real on a throwaway Worker in PF37. From this folder:

1. See the versions, newest last:

   ```bash
   node node_modules/wrangler/bin/wrangler.js versions list
   ```

   Each has a "Version ID" and a "Created" time. Each PF wave file that deployed names the version it replaced.
2. Roll back to the one you want:

   ```bash
   node node_modules/wrangler/bin/wrangler.js rollback <version id> --message "why"
   ```

   It answers "SUCCESS … has been deployed to 100% of traffic". The live board answers with that version within seconds.
3. **The database is not rolled back with it** (Cloudflare: resources connected to the Worker "will not be changed"). If a migration went on with the code you are leaving:
   - a migration that only **added** a table or a column stays: the older code ignores it;
   - anything else (a column renamed, a value rewritten): restore the database to the moment before that migration, as above.

   Cloudflare refuses a rollback across a change of the database binding itself.

## Watching the board

`.github/workflows/watch.yml` runs every 30 minutes (at :17 and :47) and on demand from the repository's Actions tab. It reads the board's front page and `/numbers.json`, and fails when the board does not answer, says its last read of GitHub failed, or has not read GitHub for 60 minutes. A healthy board shows up to about 30, since `numbers.json` keeps its answer for 15. **A failed run is the notice:** GitHub emails the repository's owner. It has no secret and no permission, and it writes nothing.

- To watch another address, set a repository variable `BOARD_ADDRESS` (Settings, Secrets and variables, Actions, Variables).
- To run it by hand: `node scripts/watch.mjs https://open-bounty-board.box-platform.workers.dev` from the repository's root.
- **GitHub turns off a scheduled workflow after 60 days with no activity in the repository.** The Actions tab then shows "This scheduled workflow is disabled"; its **Enable workflow** button turns it back on.

What it cannot see: a payment that fails, a Stripe or PayPal webhook that never arrives, sign-in being broken. The board publishes no number for these yet (PF37's Result proposes some).

## History: updating boards deployed before a migration record

Kept as they were written. A board deployed since PF37 uses "Applying a migration" above, which names these files too.

### Updating a board deployed before pay on merge

Once only, in this order, before deploying the new code. Skipping the first command breaks every refresh, because the new code writes columns the old database lacks.

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file migrations/pf11.sql
```

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file schema.sql
```

Then build and deploy as in step 4.

### Updating a board deployed before limits per repository (PF19)

Once only, before deploying this code. Each repository already on takes its owner's one limit, so nothing an owner set changes.

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file migrations/pf19.sql
```

Then build and deploy as in step 4.

### Updating a board deployed before "new since" (PF22)

Once only, before deploying this code. Bounties already listed take their order from when they were posted, so a solver starting from the beginning sees each once. Pull requests learn whether they are drafts at their next read.

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file migrations/pf22.sql
```

Then build and deploy as in step 4.

### Updating a board deployed before PF28

Once only, before deploying this code. Each bounty's event chain gets its own read time, starting from when its details were last read, so nothing is read again all at once.

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file migrations/pf28.sql
```

Then build and deploy as in step 4.

## Pay on merge (optional)

Without a Stripe key the board works as before: its pages say pay on merge is not set up, and solvers are paid by hand. Turning it on takes real payments, so only you can do it, and it is only ever your own Stripe account:

1. Finish your Stripe account's activation, and set up Connect so that merchants collect payments directly. A new platform has Accounts v1 off, and the board does not need it on.
2. In Stripe's dashboard, under Developers, add a webhook endpoint at `<your board's address>/api/stripe/webhook`. Listen to events on connected accounts: `account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`, `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`.
3. Set both secrets, pasting each when asked:

```bash
node node_modules/wrangler/bin/wrangler.js secret put STRIPE_SECRET_KEY
```

```bash
node node_modules/wrangler/bin/wrangler.js secret put STRIPE_WEBHOOK_SECRET
```

This is your full secret key (`sk_live_...`), from https://dashboard.stripe.com/apikeys. The board creates each solver's account through Stripe's Accounts v2, and a restricted key cannot: Stripe's page offers it only None or Read there (PF18).

**That makes this key the one thing to guard.** It can do anything on your Stripe account, including refunds and payouts, and it can charge any saved card to any connected account. The owner's limit and the payee are enforced by the board's code, not by Stripe, so whoever holds this key can bypass both. Paste it only at the command above, never in a chat or a file. If it may have leaked, roll it in Stripe's dashboard at once, then set the new one. To turn Stripe off on the board, remove the secret; its pages go back to saying it is not set up:

```bash
node node_modules/wrangler/bin/wrangler.js secret delete STRIPE_SECRET_KEY
```

**Before you set it, limit where it works.** At https://dashboard.stripe.com/api-access-policies create a policy, type **Advanced**, allowing only ASN `13335` (Cloudflare). Then on the API keys page, on this key's **⋯** menu, choose **Manage access policy** and select it. Stripe then refuses the key from anywhere but Cloudflare and notifies you of each refused request; the board keeps working (proven in a sandbox, PF18). It does not stop someone running code on Cloudflare too, so it narrows the risk and does not remove it. Look at the key's request logs now and then (**⋯**, **View request logs**).

Move to a restricted key if Stripe offers one with Write on Accounts v2. These are the other calls it would need, proven on v2 accounts in test mode: Account Links, Customers and Payment Methods, Write; Setup Intents, Read; on connected accounts, Checkout Sessions, Payment Methods and Payment Intents, Write.

## Paying through PayPal (optional)

Without PayPal's keys the board works as before, and its pages say PayPal is not set up. Taking real payments is the owner's to turn on. The board holds nothing: the money goes straight to the account the merged author connected.

1. For a board that already has a database, run `migrations/pf13.sql` once, then `schema.sql`, before deploying this code.
2. Open a PayPal Business account, and create a live REST app on PayPal's developer dashboard.
3. Turn on Log in with PayPal for the app, with the return URL `<your board's address>/auth/paypal/callback`, and only the PayPal account ID (payer ID) as the information requested. PayPal reviews a live app, which it says typically takes a few weeks, and asks for privacy policy and user agreement addresses.
4. Add a webhook at `<your board's address>/api/paypal/webhook`, for `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED` and `CUSTOMER.DISPUTE.CREATED`.
5. Set the three secrets, pasting each when asked:

```bash
node node_modules/wrangler/bin/wrangler.js secret put PAYPAL_CLIENT_ID
```

```bash
node node_modules/wrangler/bin/wrangler.js secret put PAYPAL_SECRET
```

```bash
node node_modules/wrangler/bin/wrangler.js secret put PAYPAL_WEBHOOK_ID
```

Proven only in PayPal's sandbox. A refund made on the solver's own account sent the app no event there, so the board re-reads each paid capture; a dispute on that account may reach the board only as a later reversal.

## Undoing it

The last command ends wrangler's Cloudflare login on this machine, for any other project too.

```bash
node node_modules/wrangler/bin/wrangler.js delete
```

```bash
node node_modules/wrangler/bin/wrangler.js d1 delete open-bounty-board
```

```bash
node node_modules/wrangler/bin/wrangler.js logout
```

On GitHub, delete the OAuth app at https://github.com/settings/developers and the token at https://github.com/settings/personal-access-tokens.
