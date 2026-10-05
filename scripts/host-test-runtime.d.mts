export interface HostRuntimeResult { code: number; stdout: string; stderr: string }
export interface HostRuntime {
  exec(service: 'private-api' | 'external-api', args: string[], options?: { input?: string; timeout?: number; env?: Record<string, string> }): Promise<HostRuntimeResult>;
  cleanup(): Promise<void>;
}
export function acquireHostRuntime(): Promise<HostRuntime>;
