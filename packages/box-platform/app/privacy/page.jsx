import { Section, Title } from '../../components/ui.jsx';

export const metadata = { title: 'What the board stores, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="Exactly this, and nothing else.">What the board stores</Title>
      <Section title="If you sign in" id="signed-in">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>Your GitHub user number and login, while you are signed in. Signing out removes them, except where they sit beside something you chose below.</li>
          <li>A cookie that keeps you signed in, for up to 30 days. The board keeps only a fingerprint of it.</li>
          <li>The GitHub token is used once to read who you are, then discarded. It is never stored.</li>
        </ul>
      </Section>
      <Section title="If you choose to publish or connect" id="chosen">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>The ways you accept payment, with who may see each one. Remove one and it is gone. An email or wallet address you list is stored because you listed it.</li>
          <li>Your answer about whether a recorded payment arrived, shown publicly as your word until you withdraw it.</li>
          <li>Your click recording a bounty you posted as paid, shown publicly as your word until you withdraw it.</li>
          <li>If you connect PayPal, your PayPal account ID, and nothing else about you from PayPal: not your email or name. Your login token is used once, then discarded. Disconnect and the ID is gone.</li>
          <li>If you connect Stripe, your Stripe account ID and whether Stripe says it can take payments. Your country and GitHub user number go to Stripe when the account is made. Stripe holds your details.</li>
          <li>If you save a card, Stripe holds the card. The board keeps Stripe&apos;s customer and card IDs, a label such as &quot;visa ending 3184&quot;, your limit, and which repositories you turned on and when. Your GitHub user number goes to Stripe with it.</li>
          <li>For a payment started through the board: the bounty, the solver&apos;s login and account ID, the merged pull request, the amount, the state and time, and the provider&apos;s payment IDs.</li>
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
        <p className="max-w-prose mt-4">When the bounty tool asks the board to look at a bounty now, the board keeps that bounty&apos;s id and the time for one minute, so it looks at most once a minute, and nothing else from the request.</p>
      </Section>
    </>
  );
}
