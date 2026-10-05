export interface HostRuntimeResult { code: number; stdout: string; stderr: string }
export interface HostServices { host: string }
export interface HostRuntime {
  exec(service: 'private-api' | 'external-api', args: string[], options?: { input?: string; timeout?: number; env?: Record<string, string> }): Promise<HostRuntimeResult>;
  runFixture(service: 'private-api' | 'external-api', entry: string, command: Record<string, unknown>, flag?: string): Promise<unknown>;
  startServices(options?: { host?: string }): Promise<HostServices>;
  cleanup(): Promise<void>;
}
export function acquireHostRuntime(): Promise<HostRuntime>;
