'use client';
import { useRouter } from 'next/navigation';
import { Title, Soft } from './ui.jsx';
import { signIn, useSession } from '../lib/client.js';

const ACCOUNTS = [
  ['example-mara', 'an owner: posts bounties on example-tidepool repositories'],
  ['example-wren', 'an owner: posts bounties on example-wren/sparrow-kit'],
  ['example-quill', 'a solver: answers bounties'],
  ['example-fern', 'a solver: answers bounties'],
];

export default function SignIn() {
  const router = useRouter();
  const who = useSession();
  const go = login => { signIn(login); router.push('/me/'); };
  return (
    <>
      <Title sub="The board asks GitHub for your public profile only: your login and account age. It cannot see any repository, public or private, and it stores no GitHub token.">Sign in with GitHub</Title>
      {who ? <p className="mb-6">You are signed in as {who}.</p> : null}
      <p className="font-semibold">Prototype: choose a sample account.</p>
      <Soft className="mt-1">On the real board this is one button that opens GitHub.</Soft>
      <ul className="mt-6 flex flex-col gap-4">
        {ACCOUNTS.map(([login, what], i) => (
          <li key={login} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <button type="button" onClick={() => go(login)} className={i === 0 ? 'bg-accent text-paper px-5 py-2.5 font-semibold rounded-sm' : 'border border-ink px-4 py-2 rounded-sm'}>Continue as {login}</button>
            <span className="text-soft">{what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
