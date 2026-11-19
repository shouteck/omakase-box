import PersonView from '../../components/PersonView.jsx';

export const metadata = { title: 'Solver, omakase-box' };

/** One shell for every /solver/<login>/ address. */
export default function Page() {
  return <PersonView kind="solver" />;
}
