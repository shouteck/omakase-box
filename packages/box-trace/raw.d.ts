// Lets index.ts import the Python hook's source at build time (vite `?raw`
// under vitest and the box-cli bundle), so the CLI is self-contained and the
// hook file stays a real, reviewable .py.
declare module '*.py?raw' {
  const content: string;
  export default content;
}
