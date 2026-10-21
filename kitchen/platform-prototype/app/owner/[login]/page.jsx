import OwnerView from '../../../components/OwnerView.jsx';
import { people } from '../../../lib/facts.mjs';

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(people).map(login => ({ login })); }
export async function generateMetadata({ params }) { const { login } = await params; return { title: `${login}, as an owner (sample data)` }; }
export default async function Page({ params }) { const { login } = await params; return <OwnerView login={login} />; }
