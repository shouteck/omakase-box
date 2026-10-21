'use client';
import Link from 'next/link';
import { useSession } from '../lib/client.js';

export default function SessionLink() {
  const who = useSession();
  if (!who) return <Link href="/sign-in/">Sign in</Link>;
  return <Link href="/me/">Your page ({who})</Link>;
}
