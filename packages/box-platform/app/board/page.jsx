import Board from '../../components/Board.jsx';
import { Title } from '../../components/ui.jsx';

export const metadata = { title: 'Open bounties, omakase-box' };

export default function Page() {
  return (
    <>
      <Title sub="Public GitHub issues with a stated reward. The owner pays the solver directly.">
        Open bounties
      </Title>
      <p className="mb-6 text-sm text-soft">First, <a href="/how/#hand-off">delegate stuck work</a>, or <a href="/how/#answer">find work to solve</a>. For programs: the <a href="/bounties.json">JSON feed</a> and <a href="/agents/">agent instructions</a>.</p>
      <Board />
    </>
  );
}
