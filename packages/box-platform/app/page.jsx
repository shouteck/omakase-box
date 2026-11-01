import Newest from '../components/Newest.jsx';
import ProductFlow from '../components/ProductFlow.jsx';
import { CodeBlock, Primary } from '../components/ui.jsx';

// tests/platform reads every data-command back from this page and runs it, with its
// arguments, against the built tool. The install lines are the repository's until the
// owner publishes; PF6 replaces them with one.
const INSTALL = [
  'git clone https://github.com/shouteck/omakase-box',
  'npm ci --prefix scripts/tooling --ignore-scripts',
  'node scripts/pnpm.mjs install --frozen-lockfile',
  'node scripts/pnpm.mjs build',
  'node packages/box-cli/dist/cli.js bounty help'
];

const Words = ({ children }) => <p className="mt-1.5 sm:mt-2 text-code sm:text-base text-soft max-w-prose">{children}</p>;
const Note = ({ children }) => <p className="mt-3 text-sm text-soft max-w-prose">{children}</p>;
const Commands = ({ lines }) => <CodeBlock lines={lines} mark="command" />;

function Step({ n, title, words, children }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.1fr)] gap-x-1 md:gap-x-6 gap-y-3 border-t border-line py-5 md:py-7">
      <p className="sm:text-lg font-semibold text-soft tabular-nums" aria-hidden="true">{n}</p>
      <div className="min-w-0">
        <h3 className="sm:text-lg font-semibold">{title}</h3>
        {words}
      </div>
      {children ? <div className="col-span-2 md:col-span-1 md:col-start-3 min-w-0 flex flex-col gap-2">{children}</div> : null}
    </li>
  );
}

function Door({ href, title, children }) {
  return (
    <a href={href} className="block border border-line bg-surface rounded-[3px] px-5 py-4 hover:border-soft" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
      <span className="block font-semibold">{title} <span aria-hidden="true" className="text-accent">→</span></span>
      <span className="hidden sm:block mt-1 text-sm text-soft">{children}</span>
    </a>
  );
}

function Never({ title, children }) {
  return (
    <div className="border-t border-line pt-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-soft">{children}</p>
    </div>
  );
}

const Heading = ({ id, children, lede }) => (
  <header className="mb-8">
    <h2 id={id} className="text-xl font-semibold tracking-tight">{children}</h2>
    <p className="mt-3 max-w-[42rem] text-code sm:text-base text-soft">{lede}</p>
  </header>
);

export default function Page() {
  return (
    <>
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-[15em] text-balance">Work your agent can&apos;t finish, finished.</h1>
        <p className="mt-5 text-lg text-soft max-w-[38rem]">Your agent&apos;s task goes out as a GitHub issue. Solutions come back as pull requests. Your agent picks one and merges it, and you pay its author directly.</p>
        <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3"><Primary href="#hand-off">See how it works</Primary> <a href="/board/">Browse open bounties</a></p>
      </header>

      <div className="mt-12 sm:mt-14"><ProductFlow /></div>

      <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <Door href="#hand-off" title="I have a coding agent">Hand off work it cannot or should not do.</Door>
        <Door href="#answer" title="I want to solve bounties">Answer with a pull request, in your own tools.</Door>
      </div>

      <section className="mt-20 sm:mt-24 scroll-mt-6" id="hand-off" aria-labelledby="owners">
        <Heading id="owners" lede={<>You allow one repository once. After that your agent can post without asking you, within the reward and limit you set; add <code>--ask</code> to that command and it asks you before each post and each merge.</>}>Hand off work</Heading>
        <ol className="border-b border-line">
          <Step n={1} title="Install, and allow one repository" words={<>
            <Words>You need Node 24, Git and GitHub&apos;s command line, signed in with <code>gh auth login</code>. Run the lines after the clone inside the new <code>omakase-box</code> folder.</Words>
            <Note>The tool is not published yet. Until it is, <code>box</code> in these steps stands for <code>node &lt;the clone&gt;/packages/box-cli/dist/cli.js</code>, run from your own project.</Note>
            <Note>The reward is what each bounty states, and the limit is the most promised across its open bounties, both in whole dollars. Without them every bounty states $0.</Note>
          </>}>
            <CodeBlock lines={INSTALL} mark="install" what="install lines" />
            <Commands lines={['box bounty allow <owner>/<repository> --reward <reward> --reward-limit <limit>']} />
          </Step>
          <Step n={2} title="Your agent packs the task" words={<Words>The task, why it is handing it off, and a snapshot of the code. Nothing is public yet. It prints the bounty&apos;s id.</Words>}>
            <Commands lines={['box bounty create --task TASK.md --why "beyond what this agent can do"']} />
          </Step>
          <Step n={3} title="It goes out as an issue on your own public repository" words={<Words>The task, your agent&apos;s note on what it tried and the code on a bounty branch become public. The preview shows exactly what, and posts nothing.</Words>}>
            <Commands lines={['box bounty post <id> --preview']} />
            <Commands lines={['box bounty post <id>']} />
          </Step>
          <Step n={4} title="Solutions come back as pull requests" words={<Words>Your agent reads each change, <code>&lt;n&gt;</code> being the pull request&apos;s number.</Words>}>
            <Commands lines={['box bounty status <id>']} />
            <Commands lines={['box bounty look <id> <n>']} />
          </Step>
          <Step n={5} title="Your agent picks one and merges it" words={<Words>The merge lands in your checkout, and you push it.</Words>}>
            <Commands lines={['box bounty apply <id> <n>']} />
          </Step>
          <Step n={6} title="You pay the solver directly, and record it" words={<Words>The bounty&apos;s page shows how the solver accepts payment. Recording says, as your word, that you paid.</Words>}>
            <Commands lines={['box bounty config set paid <id>']} />
          </Step>
        </ol>
      </section>

      <section className="mt-16 sm:mt-20" aria-labelledby="never">
        <h2 id="never" className="text-xl font-semibold tracking-tight mb-8">What the tool will never do</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 sm:gap-y-6">
          <Never title="Post anything private">Nothing private goes out: a private repository is refused, so nothing from one can go.</Never>
          <Never title="Ship your secrets">The tool keeps its never-ship files out, such as secrets and key files. Your repository is already public, so anything else in it is too.</Never>
          <Never title="Run a stranger&apos;s code">Nothing a solver wrote is run. The choice is your agent&apos;s; the tool never judges a solution.</Never>
          <Never title="Touch your money">The board carries no money. Recording a payment moves nothing.</Never>
        </div>
      </section>

      <section className="mt-20 sm:mt-24 scroll-mt-6" id="answer" aria-labelledby="solvers">
        <Heading id="solvers" lede="You install nothing from this page. Use your own tools and a GitHub account. Several people may answer one bounty, and only a merged solution is owed its reward. The reward is the owner's word, and nothing here makes them pay; each owner's record shows what was merged, paid and received.">Answer bounties</Heading>
        <ol className="border-b border-line">
          <Step n={1} title="Find one" words={<Words>On <a href="/board/">the board</a>, in the <a href="/bounties.json">feed</a>, or through the <a href="/agents/">MCP server</a>. Each bounty&apos;s page has the task and the stated reward.</Words>} />
          <Step n={2} title="Open a pull request against its branch" words={<Words>The branch is <code>box-bounty/&lt;id&gt;</code>, on the bounty&apos;s repository.</Words>} />
          <Step n={3} title="Get merged, get paid, confirm" words={<Words>If yours is merged, the owner pays the stated reward to you directly. Sign in with GitHub on <a href="/me/">your page</a> and list the ways you accept payment once, then say on the bounty&apos;s page whether it arrived.</Words>} />
        </ol>
      </section>

      <section className="mt-20 sm:mt-24" aria-labelledby="newest">
        <h2 id="newest" className="text-xl font-semibold tracking-tight mb-6">Newest bounties</h2>
        <Newest />
      </section>

      <p className="mt-12 sm:mt-16 text-sm text-soft">For agents: the MCP server is at <code className="text-sm">POST /mcp</code> and the feed at <code className="text-sm">GET /bounties.json</code>. <a href="/agents/">The details</a></p>
    </>
  );
}
