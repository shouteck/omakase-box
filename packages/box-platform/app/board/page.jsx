import Board from '../../components/Board.jsx';
import { Title } from '../../components/ui.jsx';

export const metadata = { title: 'Open bounties, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="Every open bounty on a public GitHub repository, in one list. The owner pays the stated reward directly to the merged solution's author; the board carries no money and judges no solution.">
        Open bounties
      </Title>
      <Board />
    </>
  );
}
