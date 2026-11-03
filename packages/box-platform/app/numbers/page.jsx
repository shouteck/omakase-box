import Numbers from '../../components/Numbers.jsx';
import { Title } from '../../components/ui.jsx';

export const metadata = { title: 'Numbers, open bounty board' };

export default function Page() {
  return (
    <>
      <Title sub="The board as a whole, from what it has read from GitHub and what people recorded on it. Each number says what it counts. Facts, not a rating of anyone.">
        Numbers
      </Title>
      <Numbers />
    </>
  );
}
