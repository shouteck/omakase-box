declare module '*/docker.mjs' {
  export function docker(args: string[], options?: { input?: string; timeout?: number }): Promise<{ code: number; stdout: string; stderr: string }>;
}
declare module '*/synthetic-runtime.mjs' {
  export const composeArguments: string[];
}
