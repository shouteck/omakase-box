import { z } from 'zod';

const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,256}$/);
const LifetimeSchema = z.number().int().positive().max(86400);
export function privateSessionCookie(token: string, mode: 'localhost_demo' | 'production', lifetimeSeconds = 3600): string {
  TokenSchema.parse(token);
  LifetimeSchema.parse(lifetimeSeconds);
  const secure = z.enum(['localhost_demo', 'production']).parse(mode) === 'production';
  return `${secure ? '__Host-private_session' : 'private_session'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${lifetimeSeconds}${secure ? '; Secure' : ''}`;
}
