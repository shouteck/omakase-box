// The front page's picture: the real product, in real text. tests/platform runs the
// journey and checks each [data-flow-output] line against what the tool prints, so
// this example cannot drift from it. Every name is invented.
const ID = 'bt-4f2a91c07d3e';

const Arrow = () => (
  <div aria-hidden="true" className="flex items-center justify-center text-soft py-1 lg:py-0">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 lg:rotate-0"><path d="M4 12h15M14 7l5 5-5 5" /></svg>
  </div>
);

const Panel = ({ n, label, dark = false, children }) => (
  <div className={`min-w-0 flex flex-col rounded-[3px] border ${dark ? 'bg-code text-code-ink border-code' : 'bg-surface border-line'}`}>
    <p className={`px-4 py-2.5 text-sm border-b ${dark ? 'text-code-soft border-code-soft/30' : 'text-soft border-line'}`}><span className="font-semibold">{n}</span> {label}</p>
    <div className="px-4 py-4 grow">{children}</div>
  </div>
);

const Pull = ({ number, author, state, merged = false }) => (
  <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
    <span className="min-w-0 break-words text-sm"><span className="font-semibold">#{number}</span> by {author}</span>
    <span className={`text-sm whitespace-nowrap ${merged ? 'font-semibold text-accent' : 'text-soft'}`}>{state}</span>
  </div>
);

export default function ProductFlow() {
  return (
    <figure>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 lg:gap-3 items-stretch">
        <Panel n="1" label="Your agent posts the task" dark>
          <div className="flex flex-col gap-2 text-sm font-mono break-words">
            <p><span className="text-code-soft" aria-hidden="true">$ </span><code className="text-sm">box bounty post {ID}</code></p>
            <p className="text-code-soft" data-flow-output>{ID} — posted — delivered to https://github.com/example-org/ledger/issues/48</p>
            <p className="hidden sm:block text-code-soft" data-flow-output>next: box bounty status reads the pull requests; box bounty look {ID} &lt;number&gt; collects one and shows its change</p>
          </div>
        </Panel>
        <Arrow />
        <Panel n="2" label="It is a GitHub issue">
          <p className="font-semibold break-words">Recurring transactions skip the 31st</p>
          <p className="mt-1 text-sm text-soft">example-org/ledger · issue 48 · open</p>
          <p className="mt-4 text-xl font-semibold">$45</p>
          <p className="text-sm text-soft">stated, for the merged solution</p>
        </Panel>
        <Arrow />
        <Panel n="3" label="Solutions come back">
          <Pull number={61} author="example-fern" state="open" />
          <Pull number={62} author="example-quill" state="merged" merged />
          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm font-mono break-words">
            <p><span className="text-soft" aria-hidden="true">$ </span><code className="text-sm">box bounty apply {ID} 62</code></p>
          </div>
        </Panel>
      </div>
      <figcaption className="mt-3 text-sm text-soft">An example. Every name in it is invented; the commands and the tool&apos;s output are real.</figcaption>
    </figure>
  );
}
