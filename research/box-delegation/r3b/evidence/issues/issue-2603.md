# `parse()` gets `argv` wrong with `ELECTRON_RUN_AS_NODE`

URL: https://github.com/tj/commander.js/issues/2603
Opened: 2026-09-04T10:36:49Z
Closed: open
State: open

---

## Summary

In an Electron project, I ran into an argument-parsing issue when using commanderjs in a child process with `ELECTRON_RUN_AS_NODE=1`.

The process still has `process.versions.electron`, so `program.parse()` picks Electron argument handling. But it is effectively being run as `Electron script.js [...arguments]`, just like `node script.js [...arguments]`: `script.js` is the script being launched, not a user argument. Since `process.defaultApp` is `undefined`, Commander parses from the script path and includes it as a user argument.

This happens when an Electron main process uses `child_process.spawn()` to run a JavaScript child with `ELECTRON_RUN_AS_NODE=1`.

## Reproduction

`main.js`, started as an Electron main process:

```js
const { app } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

app.whenReady().then(() => {
  const child = spawn(process.execPath, [path.join(__dirname, 'child.js'), '--verbose'], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
  });

  child.once('close', () => app.quit());
});
```

`child.js`:

```js
const { Command } = require('commander');

console.log({
  argv: process.argv,
  electron: process.versions.electron,
  defaultApp: process.defaultApp,
  type: process.type,
  runAsNode: process.env.ELECTRON_RUN_AS_NODE,
});

const program = new Command().argument('[input]').option('--verbose');

program.parse();

console.log({ args: program.args, options: program.opts() });
```

## Actual behavior

Here is the output from the child:

```js
{
  argv: [
    '/path/to/Electron.app/Contents/MacOS/Electron',
    '/path/to/child.js',
    '--verbose'
  ],
  electron: '43.4.1',
  defaultApp: undefined,
  type: undefined,
  runAsNode: '1'
}
{ args: ['/path/to/child.js'], options: { verbose: true } }
```

Because `process.versions.electron` is set, `program.parse()` selects the Electron convention. Since `process.defaultApp` is falsey, it uses `argv.slice(1)`, so it parses the script path as the optional `input` argument.

For comparison, if I remove `ELECTRON_RUN_AS_NODE`, the same executable starts as an Electron main process and Commander parses the arguments correctly:

```js
{
  argv: [
    '/path/to/Electron.app/Contents/MacOS/Electron',
    '/path/to/child.js',
    '--verbose'
  ],
  electron: '43.4.1',
  defaultApp: true,
  type: 'browser',
  runAsNode: undefined
}
{ args: [], options: { verbose: true } }
```

## Expected behavior

When `ELECTRON_RUN_AS_NODE=1` is set, I would expect `program.parse()` to use the Node argument convention and leave the script path out of user arguments.

## Proposed fix

One possible fix is to skip Electron auto-detection when the process is running in Node mode:

```js
if (process.versions?.electron && process.env.ELECTRON_RUN_AS_NODE === undefined) {
  parseOptions.from = 'electron';
}
```

When `ELECTRON_RUN_AS_NODE` is set, `parseOptions.from` stays unset. The existing default path then uses Node conventions and `argv.slice(2)`.

## Environment

- Commander: 15.0.0
- Electron: 43.4.1
- OS: macOS

