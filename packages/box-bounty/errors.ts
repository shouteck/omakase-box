// Every outcome of `bounty create` is a named state. A refusal carries its machine
// name plus a plain reason; the CLI prints both and exits nonzero (3), a code no
// solver check can be mistaken for because the check's own exit is only ever a
// recorded value, never the command's.
export class BountyRefused extends Error {
  constructor(readonly reason: string, message: string) {
    super(message);
    this.name = 'BountyRefused';
  }
}
