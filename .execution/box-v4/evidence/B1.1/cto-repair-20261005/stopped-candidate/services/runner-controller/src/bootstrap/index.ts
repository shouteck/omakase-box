import { runnerCapability as detailedRunnerCapability } from '../../config.js';
export { RunnerConfigSchema } from '../../config.js';
export function runnerCapability(input?: unknown) {
  const { assurance, status, requiredProfile, hostExecutionAllowed } = detailedRunnerCapability(input);
  return { assurance, status, requiredProfile, hostExecutionAllowed };
}
export { RunnerController } from '../../controller.js';
export { DedicatedKvmProvider, FakeDevelopmentProvider } from '../../provider.js';
export { SshBrokerTransport } from '../../transport.js';
export { FileReplayStore } from '../../replay.js';

export async function runUnavailableJob(): Promise<never> {
  throw new Error('Real isolated runner is unavailable; host execution is forbidden.');
}
