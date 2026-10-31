import { Section, Title } from '../../components/ui.jsx';

export const metadata = { title: 'What the board stores, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="Exactly this, and nothing else.">What the board stores</Title>
      <Section title="If you sign in" id="signed-in">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>Your GitHub user number and login, while you are signed in. Signing out removes them.</li>
          <li>A cookie that keeps you signed in, for up to 30 days. The board keeps only a fingerprint of it.</li>
          <li>The GitHub token is used once to read who you are, then discarded. It is never stored.</li>
        </ul>
      </Section>
      <Section title="If you choose to publish" id="chosen">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>The ways you accept payment, with who may see each one. Remove one and it is gone. An email or wallet address you list is stored because you listed it.</li>
          <li>Your answer about whether a recorded payment arrived.</li>
        </ul>
      </Section>
      <Section title="What it never does" id="never">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>It never asks for your email address, and it runs no tracking or analytics scripts.</li>
          <li>It never follows or checks a payment link beyond its shape.</li>
        </ul>
      </Section>
      <Section title="Everything else" id="facts">
        <p className="max-w-prose">Bounties, pull requests and their authors are public facts read from public GitHub repositories. If a repository stops being public, the board deletes what it held about it.</p>
      </Section>
    </>
  );
}
