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

## 1. Cloudflare account

Sign up at https://dash.cloudflare.com/sign-up with an email and a password, and verify the email. Choose the Free plan if asked.

## 2. Log wrangler in

```bash
node ../../scripts/pnpm.mjs exec wrangler login
```

A browser page asks you to allow wrangler; allow it. Wrangler keeps its login on this machine, so any program you run here as this user can deploy with it, including an agent you ask to redeploy or read logs.

## 3. The database

```bash
node ../../scripts/pnpm.mjs exec wrangler d1 create open-bounty-board
```

It prints a `database_id`, which is not a secret. If wrangler offers to add it to the config, answer no. Open `wrangler.toml` in this folder and replace the value of `database_id` with it, and commit that edit in your clone so a later deploy keeps it. Do this before step 4; otherwise the deploy reaches someone else's database id and fails. Then apply the schema:

```bash
node ../../scripts/pnpm.mjs exec wrangler d1 execute open-bounty-board --remote --file schema.sql
```

## 4. Build and deploy

```bash
node ../../scripts/pnpm.mjs run build
```

```bash
node ../../scripts/pnpm.mjs exec wrangler deploy
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
node ../../scripts/pnpm.mjs exec wrangler secret put GITHUB_OAUTH_CLIENT_ID
```

```bash
node ../../scripts/pnpm.mjs exec wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
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
node ../../scripts/pnpm.mjs exec wrangler secret put GITHUB_TOKEN
```

Paste the token when asked. No redeploy is needed. To check: within about 15 minutes the board lists open bounties and `/bounties.json` shows `"stale":null`. **If it has an expiry date, the board stops updating when it passes** and shows what it last read. Before that date, make a new token and run this command again, or remove the secret to go back to unauthenticated reads: `node ../../scripts/pnpm.mjs exec wrangler secret delete GITHUB_TOKEN`.

## Undoing it

The last command ends wrangler's Cloudflare login on this machine, for any other project too.

```bash
node ../../scripts/pnpm.mjs exec wrangler delete
```

```bash
node ../../scripts/pnpm.mjs exec wrangler d1 delete open-bounty-board
```

```bash
node ../../scripts/pnpm.mjs exec wrangler logout
```

On GitHub, delete the OAuth app at https://github.com/settings/developers and the token at https://github.com/settings/personal-access-tokens.
