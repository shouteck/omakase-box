# Listing formats — research only

Fetched with `curl` on **2026-11-19**. These are the pages' current statements, not permission to publish. No submission, login, repository creation, payment, installation or external message was made. Commands below are documentation, not commands run. “Not found” means not stated in the fetched material (or inaccessible as noted), not that a feature does not exist. Repository `main` URLs are moving references.

## 1. Agent Skills standard

Source fetched: https://agentskills.io/specification (HTTP 200).

- **Layout:** `<name>/SKILL.md`; Markdown body preceded by YAML frontmatter. Optional `scripts/`, `references/`, `assets/`; other files/directories permitted. Use relative links from the skill root.
- **Required fields:** `name` (1–64 characters, lowercase alphanumeric and hyphens, matches directory; no leading/trailing or consecutive hyphens); `description` (1–1024 characters, what it does and when to use it). The page's detailed text says “unicode lowercase alphanumeric” while its field summary says lowercase letters/numbers; ASCII kebab-case satisfies both.
- **Optional fields:** `license` (name or bundled license reference), `compatibility` (1–500 characters if present), `metadata` (string-to-string map), experimental `allowed-tools` (space-delimited tools).
- **Size:** keep `SKILL.md` under 500 lines and its instructions below 5,000 tokens as recommendations, not upload limits. Hard bundle/file byte limit: not found.
- **Submit/publish, ranking/install counts:** not found; this is a format specification, not a listing service.

## 2. skills.sh / `npx skills add`

Sources fetched (HTTP 200):
- https://raw.githubusercontent.com/vercel-labs/skills/main/README.md
- https://raw.githubusercontent.com/vercel-labs/skills/main/docs/creating-skills.md
- https://raw.githubusercontent.com/vercel-labs/skills/main/docs/troubleshooting.md
- https://skills.sh/docs
- https://skills.sh/docs/faq

- **Layout/fields:** a skill directory with `SKILL.md`, YAML `name` and `description` required. `skills/<name>/SKILL.md` is supported, as are root `SKILL.md`, `skills/<category>/<name>/SKILL.md`, and two category levels. Container directories include `skills/`, `skills/.curated/`, `.experimental/`, `.system/`, `.agents/skills/`, `.claude/skills/` and the other agent-specific paths listed in creating-skills. Containers are walked up to three levels; a shallower `SKILL.md` shadows nested skills. `--full-depth` discovers outside containers. Claude plugin manifests can supply additional skill paths. Optional `metadata.internal: true` hides a skill unless `INSTALL_INTERNAL_SKILLS=1`.
- **Discovery/submission:** host skills in a GitHub repository, with a README explaining use. Users run `npx skills add <owner/repo>` (selection of skills/agents follows). No separate leaderboard application: FAQ says installs automatically list skills through CLI telemetry. Do not perform a seed install as part of this research.
- **Ranking/counts:** anonymous aggregated installation counts from CLI telemetry power the leaderboard. Telemetry identifiers for GitHub sources are sent only when positively confirmed public. `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` disables telemetry and security-audit requests. Exact deduplication, anti-abuse rules and ranking time-window formula: not found.
- **Limits/cost:** CLI-specific name/description numeric limits, bundle size and listing fee: not found in these pages; use the standard's limits for portability, without claiming they are independently enforced here.

## 3. Claude Code plugin marketplaces

Sources fetched:
- https://code.claude.com/docs/en/plugin-marketplaces (HTTP 200; current content is “Create a marketplace”)
- https://code.claude.com/docs/en/plugins-reference (HTTP 200; current content is “Plugin manifest reference”)
- https://code.claude.com/docs/en/plugins/marketplace-reference.md (current full field reference)

- **Layout:** marketplace root `.claude-plugin/marketplace.json`; for example plugin at `plugins/<plugin>/`, its optional manifest at `plugins/<plugin>/.claude-plugin/plugin.json`, and skills at `plugins/<plugin>/skills/<skill>/SKILL.md`. Only manifests belong inside `.claude-plugin/`; skills and other components belong at the plugin root. Manifest `skills` can add paths to the default scan (directories of skill folders, or a folder directly containing `SKILL.md`).
- **Marketplace required:** `name`, `owner` object (`name` required; `email`, `url` optional), `plugins` array. Each entry requires `name`, `source`. A source can be `"./plugins/<plugin>"` relative to the marketplace root, `"."`, or an object such as `{ "source": "github", "repo": "owner/repo" }`. Other source types include `url`, `git-subdir`, `archive`, `npm`, `command`.
- **Marketplace optional:** `$schema`, `description`, `version`, `metadata.description`, `metadata.version`, `metadata.pluginRoot`, `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`. Entry optional fields include `description`, `version`, `category`, `tags`, `strict` (default true), `relevance`, `dependencies`, `engines`, `defaultEnabled`, `displayName`, `metadata`, download `headers`/`headersHelper`, and accepted manifest fields. Keep entry and manifest names identical.
- **Plugin manifest:** optional in standard layout; if present, `name` is the only required key. Optional metadata: `$schema`, `displayName`, `version`, `description`, `author` (`name` required if supplied), `homepage`, `repository`, `license`, `keywords`, `metadata`; directory-only display metadata `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`. Component/config fields include `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`, `experimental`, `defaultEnabled`, `engines`, `dependencies`, `userConfig`, `types`, `channels`.
- **Limits:** marketplace/entry identifiers permit letters, digits, `.`, `_`, `-`, starting with a letter/digit; marketplace names cannot contain `..`, reserved/impersonating names are forbidden. Manifest names must be nonempty, without spaces, `@`, `:`, path separators or control/bidi characters; kebab-case recommended. Numeric name/description or upload byte limits: not found. Plugin version is a string, not validated as semver on the current page.
- **Publish/install:** validate locally with `claude plugin validate <directory>`, host marketplace in a reachable Git repository; users register `/plugin marketplace add owner/repo`, then `/plugin install <plugin>@<marketplace>` (opens details for installation). Hosting one's marketplace does not submit to Anthropic's official directory; the page links a separate submission process. No marketplace was added here.
- **Ranking/install counts/cost:** not found in these marketplace/reference pages. Do not assume a self-hosted marketplace receives official-directory placement.

## 4. ClawHub / OpenClaw

Sources fetched (HTTP 200):
- https://raw.githubusercontent.com/openclaw/clawhub/main/README.md
- https://docs.openclaw.ai/tools/clawhub and its readable Markdown https://docs.openclaw.ai/tools/clawhub.md
- https://raw.githubusercontent.com/openclaw/clawhub/main/docs/skill-format.md
- https://raw.githubusercontent.com/openclaw/clawhub/main/docs/publishing.md
- https://raw.githubusercontent.com/openclaw/clawhub/main/docs/cli.md
- https://raw.githubusercontent.com/openclaw/clawhub/main/docs/auth.md
- https://raw.githubusercontent.com/openclaw/clawhub/main/docs/moderation.md

- **Layout/fields:** skill folder requiring `SKILL.md` (`skill.md` and legacy `skills.md` also accepted locally). YAML frontmatter is optional to ClawHub; extracted `description` supplies UI/search summary. Basic example uses `name`, `description`, `version`. Portable name recommendation: standard 1–64-character directory-matching name. Catalog slug and display name are separate. Supporting regular files allowed; `.clawhubignore` and `.gitignore` honored. Web GitHub import only discovers `SKILL.md`/legacy `skills.md` in signed-in user's public, non-fork, non-archived/non-disabled repositories; local publishing is different.
- **Extra metadata:** `metadata.openclaw` (aliases `clawdbot`, `clawdis`) supports `requires.env`, `requires.bins`, `requires.anyBins`, `requires.config`, `primaryEnv`, `envVars` (`name`, optional `required`, `description`), `always`, `skillKey`, `emoji`, `homepage`, `os`, dependency `install`, `nix`, `config`. Describe actual runtime requirements: automated analysis checks declarations against behavior.
- **Limits/license:** total bundle **50MB** (source spelling); embedding text includes `SKILL.md` plus roughly 40 bounded UTF-8 files, not a 40-file upload limit. All published skills are **MIT-0**, with no per-skill override; this needs consideration before publishing existing differently licensed material. Numeric description/display-name limits: not found.
- **Auth/publish:** GitHub web sign-in; `clawhub login` is device approval and stores a ClawHub API token; existing token login supported. Publishing requires a GitHub account old enough to pass the upload gate; numeric minimum age not found in fetched pages. Current canonical command is `clawhub skill publish ./<skill> --slug <slug> --name "Display name" --version 1.0.0`; **`clawhub publish <path>` is a legacy alias**. `--owner` requires publishing access to that owner; omit for self. New skills default to 1.0.0, changes to next patch; optional `--changelog`, `--tags` (default `latest`), `--categories`, `--topics`. At most 3 recognized categories, 5 topics, 48 characters/topic; reserved endorsement topics forbidden. Releases are pending, withheld from public surfaces until security checks pass.
- **Discovery/counts:** tracks downloads, stars, versions, tags, changelogs, scans. CLI search favors exact slug/name tokens before download popularity. Logged-in `clawhub install` may send best-effort events for aggregate install counts; `CLAWHUB_DISABLE_TELEMETRY=1` disables them. Exact browse ranking/install deduplication formula: not found.
- **Cost:** docs say no paid skills/per-skill pricing; publishing fee not found. No publication or account access attempted.

## 5. Official MCP Registry

Sources fetched (HTTP 200):
- https://raw.githubusercontent.com/modelcontextprotocol/registry/main/README.md
- https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/quickstart.mdx
- https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/remote-servers.mdx
- https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/authentication.mdx
- https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/faq.mdx
- **Schema downloaded verbatim:** https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json → [server.schema.json](server.schema.json).

- **Version/layout:** project `server.json`; its `$schema` value should be **`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`** (schema release **2025-12-11**). Vendored schema `$id` equals that URL; schema's own `$schema` is `http://json-schema.org/draft-07/schema#` (JSON Schema dialect, not server format version). No skill/plugin layout involved.
- **Required fields:** schema `ServerDetail.required` = `name`, `description`, `version`. `$schema` is recommended by published examples, not schema-required. Optional `title`, `repository` (`url` and `source` required when object supplied; optional `id`, `subfolder`), `websiteUrl`, `icons`, `packages`, `remotes`, `_meta`.
- **Remote-only:** explicitly supported in quickstart and remote guide: omit `packages`, supply `remotes: [{ "type": "streamable-http", "url": "https://omakasebox.dev/mcp" }]`. `type` and `url` required per entry; optional `headers` and URL-template `variables`. No headers/variables needed for this no-auth endpoint. Headers use `name` plus input properties such as `value`, `description`, `isRequired`, `isSecret`; variables support `description`, `default`, `choices`, `isRequired`, `isSecret`. URL schema pattern is `^https?://[^\\s]+$`; remote guide requires public accessibility. SSE remains supported but deprecated.
- **Limits/names:** `name` 3–200 characters, exactly one slash, pattern `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`; GitHub auth restricts namespace further to `io.github.<authenticated-user>/<name>` or an authorized organization. `description` 1–100 characters; optional `title` 1–100; `version` max 255, a specific version (ranges rejected), semver recommended. Publisher-provided custom `_meta` JSON max 4096 bytes. Overall document byte limit: not found in these pages.
- **Validation and ownership:** remote-only publication is a documented supported case, with no package ownership check. Registry checks namespace ownership; **does not verify remote URL ownership**, regardless of GitHub/DNS/HTTP auth. Multiple names can reference one remote URL. These docs do not establish a live endpoint handshake/behavior validation guarantee; actual registry-side probing and acceptance of our future submission were **not tested**. Schema/metadata validation is not proof of endpoint trust or ownership.
- **GitHub auth:** install official `mcp-publisher` binary (or documented Homebrew option); `mcp-publisher init`, replace generated packages with remotes; `mcp-publisher login github`, approve device flow at GitHub, then `mcp-publisher publish`; query registry API to confirm. **No npm account/package required for remotes-only.** Personal login grants own namespace. Organization namespace requires **Owner**, not ordinary membership. Current docs warn interactive GitHub App device tokens cannot read org memberships, so org publishing needs Actions OIDC or a PAT: classic `read:org`, or fine-grained Organization Members read-only with that org as resource owner. No repository scopes needed. No login/publish run here.
- **Publishing semantics:** not a PR to registry repo; metadata versions immutable, publish a unique version to update. Ranking, install counts and publishing fee: not found. Registry is still described as preview.

## 6. MCP catalogs — remote, no-auth HTTP server

### Smithery

Sources fetched: https://smithery.ai (200), https://smithery.ai/future (200); https://smithery.ai/docs/build/publish, https://smithery.ai/docs, https://smithery.ai/docs/use/publish and https://smithery.ai/new returned 404.

- **Current status:** public directory remains, powered by Arcade, with curated verified listings and direct MCP URLs. Announcement says MCP Proxy/managed identity shut down **2026-10-31**; Smithery accounts/API keys, API/Connect/Toolbox and CLI/SDKs stop working/deprecated. Do not use old CLI publish instructions.
- **Remote submission route, required files/fields, limits, current cost/free route/paid fast lane, ranking/install counts:** not found on fetched current pages. Existing directory entries are not evidence new submissions are open. Do not create an Arcade account or contact staff to resolve this during research.

### Glama

Sources fetched: https://glama.ai/mcp/servers, https://glama.ai/mcp/faq, https://glama.ai/mcp/connectors (200). `/mcp/servers/add` and `/mcp/servers/submit` return author-filter listings, **not submission forms**.

- **Route/fields:** for hosted-only, connectors page → **Add Server → Hosted endpoint**, provide **name, short description, HTTPS Streamable HTTP server URL**. No source repository/file required for a hosted connector. Reviewed; approval email links to claim. FAQ also says **official MCP Registry Streamable HTTP endpoints sync hourly without manual review**, needing no separate submission.
- **Claim/auth:** sign in to claim; prove endpoint file, domain DNS/HTTP, or matching GitHub identity. GitHub organization claim additionally needs organization installation/permissions for Glama AI GitHub App. For this no-auth server use test profile authentication **None**; API-key/OAuth test accounts are for servers requiring them, not a reason to add auth here.
- **Ranking/counts:** health-checked hourly; unhealthy connectors rank below healthy ones. Checks initialize/list metadata, do not invoke tools. Directory offers relevance, recent usage, dates, npm/PyPI downloads and GitHub-star sorts; these are not proof of remote server install counts. Exact ranking/deduplication: not found.
- **Limits/cost:** field byte/character limits, listing cost and paid fast lane: not found in fetched FAQ/directory. Do not confuse paid hosting/gateway services with a stated submission charge.

### PulseMCP

Sources attempted with curl: https://www.pulsemcp.com/submit, https://pulsemcp.com/submit, https://www.pulsemcp.com/servers, https://www.pulsemcp.com/faq, https://www.pulsemcp.com/about (HTTP 403, Cloudflare block); also fetched https://www.pulsemcp.com/servers/submit (blocked response).

- **Submission route/remote eligibility, required layout/fields, limits, auth, cost/free route/paid fast lane, ranking/install counts:** **not found — pages inaccessible from this host**. `/submit` is an attempted URL, not a verified working route. No inference from old articles; no form submission/contact or block bypass attempted.

### mcp.so

Source fetched: https://mcp.so/submit (HTTP 200).

- **Route/layout:** submission page explicitly supports **Remote Server** (hosted endpoint URL), separately from repository-based MCP Server. No local file layout specified. Rendered default tab shows `Repository URL*`, optional-looking `Name`; exact remote-tab required field set and numeric size limits: **not found in fetched HTML** (do not misreport repository URL as remote requirement).
- **Cost/publication:** current page advertises **one-time $39**, immediate publication without review, verified badge, featured/priority placement and dofollow link. Free/manual submission route: **not found**. With a zero-spend budget, do not submit through this paid route.
- **Ranking/counts:** priority placement explicitly sold; organic ranking formula/install counting and submitter account requirement: not found. Sign In link exists, but does not establish whether submission requires it.

### awesome-mcp-servers (punkpeye)

Sources fetched (HTTP 200):
- https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md
- https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/CONTRIBUTING.md
- https://raw.githubusercontent.com/punkpeye/awesome-remote-mcp-servers/main/CONTRIBUTING.md

- **Eligibility/route:** current main list requires public GitHub source and something users install/run; **remote-only belongs in `punkpeye/awesome-remote-mcp-servers` instead**. Do not submit this hosted-only listing to the original list.
- **Remote layout/fields:** one three-line README entry: linked name/homepage plus literal endpoint URL; Glama connector score badge linked to existing connector; auth marker **🔓** for no auth, followed by one sentence ending in a period (max **120 characters**). Alphabetical by category, case-insensitive. Must answer public MCP initialize, be usable by anyone, support Streamable HTTP or SSE, and already exist as a Glama connector. CI verifies handshake and badge. No per-user-only or paywall-blocked endpoints.
- **Submission:** guide requires submitter to star repo, fork, edit README on branch, open PR for maintainer review. It documents an agent fast-track title suffix `🤖🤖🤖`; no payment stated. These actions are external changes and **none were taken**. Original list's entry fields are repository-linked name, concise description, category/alphabetical placement.
- **Cost/ranking/counts:** submission fee/paid fast lane and installation counts: not found; alphabetical list order is stated, not popularity ranking.

### Follow-up sources fetched 2026-11-19

- https://code.claude.com/docs/en/plugins/publish.md (200): own repository can hold both manifests; publish via own marketplace, or submit through https://claude.ai/directory/manage with an eligible **paid Claude plan**. Portal review differs from local validation. The current page says `claude-plugins-official` does not take submissions through that portal; no legacy community-form route is established here. No purchase or contact authorized.
- https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp (200): GitHub MCP Registry at https://github.com/mcp is curated and in public preview; users browse/install from it or configure other servers manually. Submission/automatic follow-on inclusion from the Official MCP Registry: **not found** in that guide.

## 7. Our endpoint — observed, not inferred from source

URL: https://omakasebox.dev/mcp

At **2026-11-19 15:12:20 UTC**, curl POSTed two JSON-RPC requests with `Content-Type: application/json`, `Accept: application/json, text/event-stream`, **no auth**:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pf6-format-research","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

Both returned **HTTP/2 200**, JSON-RPC `result`, `content-type: application/json`, `cache-control: no-store`. Initialize returned:

```json
{"protocolVersion":"2025-03-26","capabilities":{"tools":{}},"serverInfo":{"name":"open-bounty-board","title":"Open bounty board","version":"0.1.0"}}
```

`tools/list` returned exactly **3 tools** (no error, no pagination cursor):

| Tool name | Title | Annotations |
| --- | --- | --- |
| `find_bounties` | Find open bounties | `readOnlyHint: true`, `openWorldHint: false`, `idempotentHint: true` |
| `get_bounty` | Read one bounty | same |
| `get_numbers` | The board in numbers | same |

All supplied object input schemas; the first also supplied an output schema. No `tools/call`, bounty operation, publication, account access or state-changing request was performed. These responses prove anonymous discovery at that time, not future uptime, registry acceptance or execution of any tool.
