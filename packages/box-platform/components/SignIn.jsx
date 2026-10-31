'use client';
import { useEffect, useState } from 'react';
import { Primary, Title } from './ui.jsx';

// Fixed words by code: nothing from the address is ever shown.
const ERRORS = {
  'not-set-up': 'Sign-in is not set up on this board yet. Nothing to do: everything else works without it.',
  'try-again': 'That sign-in could not be finished; it may have been left open too long. Next: sign in again.',
  github: 'GitHub did not confirm who you are. Next: sign in again.'
};

export default function SignIn() {
  const [error, setError] = useState(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code !== null && Object.hasOwn(ERRORS, code)) setError(ERRORS[code]);
  }, []);
  return (
    <>
      <Title sub="The board asks GitHub for your public profile only. It cannot see any repository, public or private, and it stores no GitHub token.">Sign in</Title>
      {error ? <p role="alert" className="mb-6 border-l-2 border-accent pl-4 max-w-prose">{error}</p> : null}
      <Primary href="/auth/github">Sign in with GitHub</Primary>
      <p className="mt-6 text-sm text-soft"><a href="/privacy/">What the board stores</a></p>
    </>
  );
}
