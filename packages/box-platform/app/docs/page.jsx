import { Title } from '../../components/ui.jsx';

export const metadata = { title: 'Documentation, omakase-box' };

export default function Page() {
  return (
    <>
      <Title sub="Start with the existing guides for people and agents.">Documentation</Title>
      <p className="max-w-prose"><a href="/how/#hand-off">Delegate stuck work</a> with a GitHub bounty, or <a href="/how/#answer">find and solve a bounty</a> to earn a reward.</p>
      <p className="mt-3 max-w-prose"><a href="/agents/">For agents</a> covers the Skill, CLI and read-only discovery interfaces.</p>
    </>
  );
}
