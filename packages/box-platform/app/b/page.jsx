import BountyView from '../../components/BountyView.jsx';

export const metadata = { title: 'Bounty, open bounty board' };

/** One shell for every /b/<id>/ address. It holds no bounty; the facts come from the server. */
export default function Page() {
  return <BountyView />;
}
