// Excluded member: this package is not part of the delegated slice and must
// never reach the exported Box. The canary token lets the proof check that no
// byte of it shipped.
export const A4_INTERNAL_CANARY = 'A4_INTERNAL_CANARY';
export function hidden() {
  return A4_INTERNAL_CANARY;
}
