// The front page's one picture: the real product in real text, telling the story once.
// tests/platform runs the journey and checks each [data-flow-output] line against what
// the tool prints, so it cannot drift. Every name is invented.
const ID = 'bt-4f2a91c07d3e';
const COMMIT = '9c1e07a42b6d3f18e05c7ab24f91d03c6e8b1a77';

const Story = ({ at, as: As = 'div', className = '', children, ...rest }) => (
  <As className={`story ${className}`} style={{ '--at': `${at}s` }} {...rest}>{children}</As>
);

const Prompt = ({ children }) => <p><span className="text-code-soft" aria-hidden="true">$ </span><code className="text-sm">{children}</code></p>;

function Pull({ number, author, state, merged = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-t border-line">
      <span className="min-w-0 break-words text-mono"><span className="font-medium">#{number}</span> <span className="text-soft">by {author}</span></span>
      <span className={`text-sm whitespace-nowrap ${merged ? 'font-medium text-accent' : 'text-soft'}`}>{state}</span>
    </div>
  );
}

export default function HeroWindow() {
  return (
    <figure>
      <div className="wash rounded-3xl px-3 pt-8 sm:px-10 sm:pt-14 lg:px-16 lg:pt-16 overflow-hidden">
        <div className="window mx-auto max-w-[60rem] rounded-t-2xl overflow-hidden border border-b-0 border-line bg-card grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="bg-code text-code-ink px-5 pt-4 pb-6 sm:pb-10 min-w-0">
            <div className="flex gap-1.5 mb-5" aria-hidden="true"><i className="size-2.5 rounded-full bg-code-soft/40" /><i className="size-2.5 rounded-full bg-code-soft/40" /><i className="size-2.5 rounded-full bg-code-soft/40" /></div>
            <div className="flex flex-col gap-2 text-sm font-mono break-words">
              <Story at={0.3}><Prompt>box bounty post {ID}</Prompt></Story>
              <Story at={0.9} as="p" className="text-code-soft" data-flow-output="post">{ID} — posted — delivered to https://github.com/example-org/ledger/issues/48</Story>
              <Story at={3.2} className="mt-3"><Prompt>box bounty apply {ID} 62</Prompt></Story>
              <Story at={3.8} as="p" className="text-code-soft" data-flow-output="apply">{ID} — applied — attempt 62 merged as {COMMIT} on this branch</Story>
            </div>
          </div>
          <div className="px-5 pt-5 pb-5 sm:pb-8 min-w-0">
            <Story at={1.4}>
              <p className="text-sm text-soft">GitHub issue · example-org/ledger</p>
              <div className="mt-1 flex items-start justify-between gap-4">
                <p className="text-lg font-medium tracking-tight break-words">Recurring transactions skip the 31st</p>
                <p className="text-lg font-medium tabular-nums">$45</p>
              </div>
            </Story>
            <div className="mt-5">
              <Story at={2.1}><p className="text-sm text-soft pb-2">Pull requests</p></Story>
              <Story at={2.3}><Pull number={61} author="example-fern" state="open" /></Story>
              <Story at={2.7}><Pull number={62} author="example-quill" state="merged" merged /></Story>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-soft text-center">An example. Every name in it is invented.</figcaption>
    </figure>
  );
}
