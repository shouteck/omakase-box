import Link from 'next/link';
import { Title } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <>
      <Title sub="It may be mistyped, on a private repository (those are never listed), or posted in the last few minutes and not yet read from GitHub.">Not on the board</Title>
      <p>Next: <Link href="/">search the board</Link>, or open the bounty&apos;s GitHub issue directly.</p>
    </>
  );
}
