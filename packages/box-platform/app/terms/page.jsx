import { Section, Title } from '../../components/ui.jsx';
import { REPOSITORY } from '../../components/SiteNav.jsx';

export const metadata = { title: 'Terms of use, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="By using the board, you accept these terms.">Terms of use</Title>
      <Section title="Who runs the board" id="who">
        <p className="max-w-prose">The open bounty board is run by omakase-box, an open-source project. It is free to use. Questions go to <a href={`${REPOSITORY}/issues`}>the project&apos;s issues on GitHub</a>, where anyone can read them.</p>
      </Section>
      <Section title="What the board does" id="what">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>It lists bounties posted as issues on public GitHub repositories, with the facts GitHub records about them.</li>
          <li>It does not judge a solution, and it does not run anything a solver wrote.</li>
          <li>Bounty titles, tasks and solutions are written by other people. The board does not check that they are true or safe.</li>
        </ul>
      </Section>
      <Section title="Money" id="money">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>The board never holds money and takes no cut. A payment goes from the bounty&apos;s owner to the solver.</li>
          <li>A reward is the owner&apos;s own promise. The board does not guarantee that anyone pays or is paid.</li>
          <li>Payments made through Stripe or PayPal happen on their pages, under their terms. Their fees come out of the reward. Refunds, disputes and reversals are handled by them, and the board records what they report.</li>
          <li>Other ways of paying are details a solver lists. The board does not check them beyond their shape. A payment recorded by hand is the owner&apos;s word, and a reply about it is the solver&apos;s.</li>
          <li>Any tax on a reward is for the person who pays or receives it.</li>
        </ul>
      </Section>
      <Section title="What you are responsible for" id="yours">
        <ul className="list-disc pl-5 flex flex-col gap-2 max-w-prose">
          <li>What you post, what you submit, and what you merge.</li>
          <li>Having the right to share what you post or submit.</li>
          <li>Keeping to the law, GitHub&apos;s terms and the terms of any payment provider you use.</li>
        </ul>
      </Section>
      <Section title="No warranty" id="warranty">
        <p className="max-w-prose">The board is provided as it is, with no warranty. As far as the law allows, whoever runs it is not liable for losses from using it, from a solution, or from a payment made or not made. The code is licensed under <a href={`${REPOSITORY}/blob/master/LICENSE`}>Apache 2.0</a>.</p>
      </Section>
      <Section title="Changes" id="changes">
        <p className="max-w-prose">These terms can change, and the board can change or stop. Every earlier version of this page is in the project&apos;s public history. See also <a href="/privacy/">what the board stores</a>.</p>
      </Section>
    </>
  );
}
