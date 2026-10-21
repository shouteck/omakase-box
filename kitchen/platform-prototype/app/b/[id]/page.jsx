import BountyView from '../../../components/BountyView.jsx';
import { bounties, findBounty } from '../../../lib/facts.mjs';

export const dynamicParams = false;
export function generateStaticParams() { return bounties.map(b => ({ id: b.id })); }
export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `${findBounty(id)?.title ?? id} (sample data)` };
}

export default async function Page({ params }) {
  const { id } = await params;
  return <BountyView id={id} />;
}
