import SolverView from '../../../components/SolverView.jsx';
import { people } from '../../../lib/facts.mjs';

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(people).map(login => ({ login })); }
export async function generateMetadata({ params }) { const { login } = await params; return { title: `${login}, as a solver (sample data)` }; }
export default async function Page({ params }) { const { login } = await params; return <SolverView login={login} />; }
