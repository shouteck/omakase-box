import { Primary, Section, Title } from '../../components/ui.jsx';

export const metadata = { title: 'How it works, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="A bounty is a GitHub issue that asks for a code change and states a reward. Solutions come back as ordinary pull requests.">How it works</Title>
      <Section title="If you post bounties" id="owners">
        <p className="max-w-prose">Your coding agent hands off what it can&apos;t do: the task, what it tried and the code go out as a GitHub issue on your own public repository, and solutions come back as pull requests it can choose from. Nothing from a private repository is ever posted, and nothing a solver wrote is run.</p>
        <p className="max-w-prose mt-4">The board finds your bounty by reading GitHub. Your agent&apos;s tool also tells it to look right after a post, a merge or a payment you record, sending only the repository, the issue number, the bounty id and what happened; the board then reads GitHub itself.</p>
        <p className="max-w-prose mt-4">When a solution is merged, you pay its author directly. The tool tells you the ways they list here for being paid.</p>
      </Section>
      <Section title="If you solve bounties" id="solvers">
        <p className="max-w-prose">Find open bounties here. Answer with a pull request against the bounty&apos;s branch. If yours is merged, the owner pays you the stated reward directly. So they can, <a href="/me/">list the ways you accept payment</a> once, signed in with GitHub. Each bounty and each owner&apos;s page show what was merged, what the owner says they paid and what solvers say they received, each as that person&apos;s word.</p>
      </Section>
      <Section title="What the board is not" id="not">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>It holds, guarantees and moves no money. Payment is between owner and solver.</li>
          <li>It does not judge solutions or rate people. It shows facts and says whose word each one is.</li>
          <li>It lists public repositories only. It cannot see private code.</li>
          <li>It is free for everyone, and open source.</li>
        </ul>
      </Section>
      <div className="mt-12"><Primary href="/board/">See open bounties</Primary></div>
    </>
  );
}
