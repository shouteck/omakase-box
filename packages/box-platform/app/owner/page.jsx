import PersonView from '../../components/PersonView.jsx';

export const metadata = { title: 'Owner, omakase-box' };

/** One shell for every /owner/<login>/ address. */
export default function Page() {
  return <PersonView kind="owner" />;
}
