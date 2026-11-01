import Board from '../../components/Board.jsx';
import { Title } from '../../components/ui.jsx';

export const metadata = { title: 'Open bounties, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="Public GitHub issues with a stated reward. The owner pays the solver directly.">
        Open bounties
      </Title>
      <Board />
    </>
  );
}
