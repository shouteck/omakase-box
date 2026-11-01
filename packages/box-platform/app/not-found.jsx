import { Title } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <>
      <Title>Nothing at this address</Title>
      <p>Next: <a href="/board/">search the board</a>.</p>
    </>
  );
}
