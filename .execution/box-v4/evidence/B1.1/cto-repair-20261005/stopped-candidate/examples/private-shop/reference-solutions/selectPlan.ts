export interface GenericOption { id: string; available: boolean }
export function selectPlan(body: unknown, trustedOptions: readonly GenericOption[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('selectedId' in body) || typeof body.selectedId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(body.selectedId)) return { status: 400, body: { code: 'invalid_input' } } as const;
  const option = trustedOptions.find(item => item.id === body.selectedId);
  if (!option) return { status: 404, body: { code: 'not_found' } } as const;
  if (!option.available) return { status: 409, body: { code: 'unavailable' } } as const;
  return { status: 200, body: { selectedId: option.id } } as const;
}
