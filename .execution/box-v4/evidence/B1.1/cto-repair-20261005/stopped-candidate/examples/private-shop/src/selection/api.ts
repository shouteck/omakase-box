import { z } from 'zod';
import { derivePrivateOptions } from '../private/eligibility.js';
import type { SyntheticSubject } from '../private/eligibility.js';

const RequestSchema = z.strictObject({ selectedId: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/) });
export function selectPlan(body: unknown, trustedSubject: SyntheticSubject) {
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { code: 'invalid_input' } } as const;
  const options = derivePrivateOptions(trustedSubject);
  const option = options.find(item => item.id === parsed.data.selectedId);
  if (!option) return { status: 404, body: { code: 'not_found' } } as const;
  return { status: 200, body: { selectedId: option.id } } as const;
}
