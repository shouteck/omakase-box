import Board from '../../components/Board.jsx';
import { Title } from '../../components/ui.jsx';

export const metadata = { title: 'Open bounties, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="Every open bounty on a public GitHub repository, in one list. Each bounty pays its stated reward to the merged solution's author, directly from the owner. The board carries no money and judges no solution.">
        Open bounties
      </Title>
      <Board />
    </>
  );
}
