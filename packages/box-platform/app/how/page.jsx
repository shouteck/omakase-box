import { WaysNotHere } from '../../components/PayWays.jsx';
import { CodeBlock, CommandWindow, Title } from '../../components/ui.jsx';

export const metadata = { title: 'How it works, open bounty board' };

// tests/platform reads every data-command back from this page and runs it, with its
// arguments, against the built tool. The install line names the asset .github/workflows/release.yml
// attaches to each release; a test holds the two together. The npm name replaces it once the owner publishes.
const INSTALL = ['npx -y omakase-box setup'];
const FROM_SOURCE = [
  'git clone https://github.com/shouteck/omakase-box',
  'npm ci --prefix scripts/tooling --ignore-scripts',
  'node scripts/pnpm.mjs install --frozen-lockfile',
  'node scripts/pnpm.mjs build',
  'npm install -g ./packages/box-cli',
  'box bounty'
];

// What the agent does is one picture, its commands folded; a person only installs. One table,
// so the cards and the commands under them cannot drift apart.
const AGENT_DOES = [
  ['Asks you a few things', 'The repository, the reward and limit, and whether to check with you first.', [
    'box bounty allow <owner>/<repository> --reward <reward> --reward-limit <limit>'
  ]],
  ['Packs and posts', 'The task, what it tried, and the code. A preview first shows what becomes public.', [
    'box bounty create --task TASK.md --why "beyond what this agent can do"',
    'box bounty post <id> --preview',
    'box bounty post <id>'
  ]],
  ['Reads the solutions', 'As facts. Nothing a solver wrote is run.', [
    'box bounty status <id>',
    'box bounty look <id> <n>'
  ]],
  ['Merges one', 'It picks one, merges it and pushes, as with any other change.', [
    'box bounty apply <id> <n>'
  ]]
];

const Who = ({ children }) => <h3 className="text-lg sm:text-xl font-medium tracking-tight mt-12 mb-2">{children}</h3>;

function Step({ n, title, words, children }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-1 md:gap-x-6 gap-y-3 border-t border-line py-6">
      <p className="font-medium text-soft tabular-nums" aria-hidden="true">{n}</p>
      <div className="min-w-0">
        <h4 className="font-medium">{title}</h4>
        {words ? <div className="mt-1 text-soft max-w-prose">{words}</div> : null}
      </div>
      {children ? <div className="col-span-2 md:col-span-1 md:col-start-3 min-w-0 flex flex-col gap-2">{children}</div> : null}
    </li>
  );
}

function More({ title, children }) {
  return (
    <details className="border-t border-line py-4">
      <summary className="font-medium">{title}</summary>
      <div className="mt-2 pl-[1.1em] text-soft max-w-prose flex flex-col gap-3">{children}</div>
    </details>
  );
}

const Heading = ({ id, children }) => <h2 id={id} className="text-xl sm:text-2xl font-medium tracking-tight mb-6">{children}</h2>;

export default function Page() {
  return (
    <>
      <Title sub="You install it. Your agent hands off what it can't finish, as a GitHub issue that states a reward.">How it works</Title>
      <p className="-mt-8 mb-14"><a href="#answer" className="font-medium" style={{ textDecoration: 'none' }}>Here to solve? <span aria-hidden="true">›</span></a></p>

      <section className="scroll-mt-6" id="hand-off" aria-labelledby="owners">
        <Heading id="owners">Hand off work</Heading>
        <Who>You install it</Who>
        <div className="border-t border-b border-line py-6 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-6 gap-y-3">
          <div className="text-soft max-w-prose">
            <p>Run this once in your terminal. It needs Node 22.13 or later, Git, and <code>gh auth login</code>. Your next agent session finds the tool.</p>
            <p className="mt-2 text-sm">If Windows PowerShell says running scripts is disabled, use <code>npx.cmd</code> in place of <code>npx</code>.</p>
          </div>
          <div className="min-w-0"><CodeBlock lines={INSTALL} mark="install" what="install line" /></div>
        </div>

        <div className="bg-surface rounded-3xl p-6 sm:p-8 mt-12">
          <h3 className="text-lg sm:text-xl font-medium tracking-tight">Your agent takes it from there</h3>
          <p className="mt-1.5 text-soft max-w-prose">It sets itself up, asks you only what it can&apos;t decide, and hands off what it can&apos;t finish.</p>
          <ol className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {AGENT_DOES.map(([title, words]) => (
              <li key={title} className="bg-card rounded-2xl border border-line px-4 py-3 min-w-0">
                <p className="font-medium">{title}</p>
                <p className="text-sm text-soft">{words}</p>
              </li>
            ))}
          </ol>
          <details className="mt-4">
            <summary className="font-medium">The commands, if you&apos;d rather run any yourself</summary>
            <CommandWindow className="mt-4" what="commands" groups={AGENT_DOES.map(([title, , commands]) => [title, commands])} />
            <p className="mt-3 text-sm text-soft"><code>box bounty help</code> explains each one.</p>
          </details>
        </div>

        <Who>If a reward is owed</Who>
        <div data-owed className="border-t border-b border-line py-6 text-soft">
          <p className="max-w-prose">On merge pays without you: once you save a card and a limit on your page, the board charges it when one solution lands. Otherwise you pay on the bounty&apos;s page, with one click or by hand. Your agent tells you once, with the link, and goes back to its work. The board shows what is due when you are signed in.</p>
          <div className="mt-3 max-w-prose"><WaysNotHere /></div>
        </div>
      </section>

      <section className="mt-20 scroll-mt-6" id="answer" aria-labelledby="solvers">
        <Heading id="solvers">Answer bounties</Heading>
        <ol className="border-b border-line">
          <Step n={1} title="Find one" words={<p>On the board, in the feed at <code>/bounties.json</code>, or through the MCP server.</p>} />
          <Step n={2} title="Open a pull request against its branch" words={<p><code>box-bounty/&lt;id&gt;</code>, on the bounty&apos;s repository.</p>} />
          <Step n={3} title="Get merged, get paid, confirm" words={<><p>On your page, connect Stripe or PayPal and an owner can pay you with one click; connected Stripe also covers on merge. Or list a way and be paid by hand. Then say on the bounty&apos;s page whether it arrived.</p><WaysNotHere /></>} />
        </ol>
      </section>

      <section className="mt-20 scroll-mt-6" id="limits" aria-labelledby="limits-title">
        <Heading id="limits-title">The details</Heading>
        <div className="border-b border-line">
          <More title="What becomes public">
            <p>The task, your agent&apos;s note on what it tried and the code on a bounty branch. The tool keeps its never-ship files out, such as secrets and key files, and a private repository is refused, so nothing from one can go. Your repository is already public, so anything else in it is too.</p>
          </More>
          <More title="Who decides what">
            <p>You answer once, when your agent asks: this repository, the reward and the limit. After that it can post without asking you, within what you set. Tell it you want to be asked, and it asks you before each post and each merge.</p>
            <p>The reward is what each bounty states, and the limit is the most promised across its open bounties, both in whole dollars. Without them every bounty states $0.</p>
            <p>The choice of solution is your agent&apos;s; the tool never judges one. Nothing a solver wrote is run.</p>
          </More>
          <More title="How payment works">
            <p>The board never holds money and guarantees none. Recording a payment moves nothing; it says, as your word, that you paid.</p>
            <p>With one click, you pay on the provider&apos;s page, straight to the account the solver connected. The board takes no fee; the provider&apos;s fee comes out of the reward.</p>
            <p>If you turn on pay on merge on your board page, for a repository, with a saved card and a limit, the board starts a charge when exactly one solution lands: from your card directly to the solver&apos;s own Stripe account. The board takes no fee. Stripe&apos;s fee comes out of the reward, and a dispute lands on the solver&apos;s account. A solver without Stripe is paid another way.</p>
            <p>Several people may answer one bounty, and only a merged solution is owed its reward. The reward is the owner&apos;s word, and nothing here makes them pay; each owner&apos;s record shows what was merged, paid and received.</p>
          </More>
          <More title="Build it from source">
            <p>This needs Node 24. The lines after the clone run inside the new <code>omakase-box</code> folder, and they give you the same <code>box</code> command. Then run <code>box setup</code>.</p>
            <CodeBlock lines={FROM_SOURCE} mark="source" what="source lines" />
            <p>Solvers install nothing from this page, and use their own tools and a GitHub account.</p>
          </More>
          <More title="What the board reads and shows">
            <p>The board finds your bounty by reading GitHub. Your agent&apos;s tool also tells it to look right after a post, a merge or a payment you record, sending only the repository, the issue number, the bounty id and what happened.</p>
            <p>It does not judge solutions or rate people. It shows facts and says whose word each one is. It lists public repositories only and cannot see private code. It is free for everyone, and open source.</p>
          </More>
        </div>
      </section>

    </>
  );
}
