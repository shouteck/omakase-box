# commander-2603

Repository: tj/commander.js · Issue #2603 · Group: known (kitchen R3b-1) · Created: 2026-09-04T10:36:49Z
Labels: bug; pending release; semver: major · Reporter's role: NONE

## Title

`parse()` gets `argv` wrong with `ELECTRON_RUN_AS_NODE`

## Body

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


## Comments (8)

### Comment 1 · COLLABORATOR · 2026-09-04T23:51:15Z · BEFORE the fix was opened

This is fragile since we do not know at parse time if the current executable was launched with the environment variable set or it was done afterwards. However, I think the most likely usage is as in your example, part of the spawn. (Thanks for the detailed example and diagnosis.)

https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node

### Comment 2 · COLLABORATOR · 2026-09-05T21:58:24Z · BEFORE the fix was opened

Would you like to open a PR yourself @yifanwww ?

(No pressure to do so, just giving you first choice.)

### Comment 3 · NONE · 2026-09-06T16:23:42Z · BEFORE the fix was opened

I did some further tests, using different APIs to create the same `child.js` processes:

1. `child_process.fork` API

`main.js`:

```js
const { app } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');

app.whenReady().then(() => {
  const child = fork(path.join(__dirname, 'child.js'), ['--verbose'], { stdio: 'inherit' });
  child.once('close', () => app.quit());
});
```

Here is the output from the child:

```js
{
  argv: ['/path/to/Electron', '/path/to/child.js', '--verbose'],
  electron: '43.4.1',
  defaultApp: undefined,
  type: undefined,
  runAsNode: '1'
}
{ args: [ '/path/to/child.js' ], options: { verbose: true } }
```

2. `utilityProcess.fork` API

`main.js`:

```js
const { app, utilityProcess } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  const child = utilityProcess.fork(path.join(__dirname, 'child.js'), ['--verbose'], { stdio: 'inherit' });
  child.once('exit', () => app.quit());
});
```

The output is different:

```js
{
  argv: ['/path/to/Electron', '/path/to/child.js', '--verbose'],
  electron: '43.4.1',
  defaultApp: undefined,
  type: 'utility',
  runAsNode: undefined
}
{ args: [ '/path/to/child.js' ], options: { verbose: true } }
```

-----

The proposed fix above only works with `child_process.fork`, because `child_process.fork` internally set `ELECTRON_RUN_AS_NODE=1` when forking a child process, while `utilityProcess.fork` works differently -- it uses Chromi
[cut here: 17 more characters]

### Comment 4 · NONE · 2026-09-06T20:00:12Z · BEFORE the fix was opened

I tried more test cases (see https://github.com/yifanwww/testing/tree/commander-in-electron)

We can find these typical groups from the results:

| group                                            | `process.argv`                                            | has electron version? | `process.defaultApp` | `process.type` | run as node? | commander works? |
| :----------------------------------------------- | :-------------------------------------------------------- | :-------------------- | :------------------- | :------------- | :----------- | :--------------- |
| main process, launched via electron binary       | `['/path/to/electron', '.', '--verbose']`                 | yes                   | `true`               | `browser`      | `undefined`  | yes              |
| main process, launched via app executable        | `['/path/to/<app>', '--verbose']`                         | yes                   | `undefined`          | `browser`      | `undefined`  | yes              |
| spawn in run_as_node mode / `child_process.fork` | `['/path/to/electron', '/path/to/child.js', '--verbose']` | yes                   | `undefined`          | `undefined`    | `1`          | no               |
| spawn Nodejs child process                       | `['/path/to/node', '/path/to/child.js', '--verbose']`     | no                    | `undefined`          | `undefined`    | `undefined`  | yes              |
| use `utility_process.fork`                       | `['/path/to/electron', '/path/to/ch
[cut here: 987 more characters]

### Comment 5 · NONE · 2026-09-06T20:07:40Z · BEFORE the fix was opened

> Would you like to open a PR yourself [@yifanwww](https://github.com/yifanwww) ?
> 
> (No pressure to do so, just giving you first choice.)

Haha I'd like to make one~

### Comment 6 · COLLABORATOR · 2026-09-06T20:35:02Z · BEFORE the fix was opened

I looked into Electron and fork a few years ago with yargs, and `ELECTRON_RUN_AS_NODE` came up too.  You have found more fork variations than came up in that thread. The fork issue got closed but not resolved: https://github.com/yargs/yargs/issues/2287

Documentation for `process.type`:
https://github.com/electron/electron/blob/main/docs/api/process.md#processtype-readonly

### Comment 7 · COLLABORATOR · 2026-09-12T02:18:43Z · AFTER the fix was opened

The testing repo with all of these cases is much appreciated. I am not an Electron user, so having it all set up is great. I spent a couple of hours trying out all the examples. I was surprised when running the tests that Electron has patched `child_process.fork` to that it sets `ELECTRON_RUN_AS_NODE`, but did then see you had commented on that too.

Side note: I found the output easier to understand by passing in an actual argument too like `'--verbose', 'ARG'`. And to avoid Commander showing an error for too many args, I changed to `.argument('[input...]')`. Just mentioning it, not need for you to do that.

I think from reading about `type="renderer"` that it will also not have the script name as second parameter. Is that case something you can easily add to your (very comprehensive!) tests so we can see it? Claude tells me that the args are going to be messy with lots of Chrome flags, and `webPreferences.additionalArguments` appended on the end.

### Comment 8 · NONE · 2026-09-12T16:15:48Z · AFTER the fix was opened

Confirmed, I add the test cases for `type="renderer"`, it does not have the script name as the second parameter either

| group                             | `process.argv`                                                                          | has electron version? | `process.defaultApp` | `process.type` | run as node |
| :-------------------------------- | :-------------------------------------------------------------------------------------- | :-------------------- | :------------------- | :------------- | :---------- |
| main process, started by electron | `['/path/to/electron', '.', '--verbose', 'ARG']`                                        | yes                   | `true`               | `browser`      | `undefined` |
| main process, started by app      | `['/path/to/<app>', '--verbose', 'ARG']`                                                | yes                   | `undefined`          | `browser`      | `undefined` |
| spawn in run_as_node mode         | `['/path/to/<electron_or_app>', '/path/to/child.js', '--verbose', 'ARG']`               | yes                   | `undefined`          | `undefined`    | `1`         |
| use `child_process.fork`          | `['/path/to/<electron_or_app>', '/path/to/child.js', '--verbose', 'ARG']`               | yes                   | `undefined`          | `undefined`    | `1`         |
| spawn Nodejs child process        | `['/path/to/node', '/path/to/child.js', '--verbose', 'ARG']`                            | no              
[cut here: 991 more characters]

## The fix

Pull request #2609, opened 2026-09-07T15:40:26Z, merged 2026-09-26T20:41:05Z. Title: fix: only use electron argv parsing for electron main process

Files changed (2):
- modified: lib/command.js
- modified: tests/command.parse.test.js  [test]

## Test changes in the fix (1 file)

### modified: tests/command.parse.test.js

```diff
@@ -21,18 +21,117 @@ describe('Command.parse()', () => {
       assert.deepEqual(program.args, ['user']);
     });
 
-    test('when no args and electron properties and not default app then use process.argv and app/args', () => {
+    // https://github.com/tj/commander.js/issues/2603
+    test('when no args and electron main process and not default app then use process.argv and app/args', () => {
       const program = new commander.Command();
       program.argument('[args...]');
       const holdArgv = process.argv;
       process.versions.electron = '1.2.3';
-      process.argv = 'node user'.split(' ');
+      process.defaultApp = undefined;
+      process.type = 'browser';
+      process.argv = 'app user'.split(' ');
+      program.parse();
+      delete process.versions.electron;
+      delete process.defaultApp;
+      delete process.type;
+      process.argv = holdArgv;
+      assert.deepEqual(program.args, ['user']);
+    });
+
+    // https://github.com/tj/commander.js/issues/2603
+    test('when no args and electron main process and default app then use process.argv and app/script/args', () => {
+      const program = new commander.Command();
+      program.argument('[args...]');
+      const holdArgv = process.argv;
+      process.versions.electron = '1.2.3';
+      process.defaultApp = true;
+      process.type = 'browser';
+      process.argv = 'electron . user'.split(' ');
       program.parse();
       delete process.versions.electron;
+      delete process.defaultApp;
+      delete process.type;
       process.argv = holdArgv;
       assert.deepEqual(program.args, ['user']);
     });
 
+    // https://github.com/tj/commander.js/issues/2603
+    test('when no args and electron child process and ELECTRON_RUN_AS_NODE then use process.argv and app/script/args', () => {
+      const program = new commander.Command();
+      program.argument('[args...]');
+      const holdArgv = process.argv;
+      const holdRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
+      process.versions.electron = '1.2.3';
+      process.defaultApp = undefined;
+      process.type = undefined;
+      process.env.ELECTRON_RUN_AS_NODE = '1';
+      process.argv = 'electron script.js user'.split(' ');
+      program.parse();
+      delete process.versions.electron;
+      delete process.defaultApp;
+      delete process.type;
+      process.env.ELECTRON_RUN_AS_NODE = holdRunAsNode;
+      process.argv = holdArgv;
+      assert.deepEqual(program.args, ['user']);
+    });
+
+    // https://github.com/tj/commander.js/issues/2603
+    test('when no args and electron utility process then use process.argv and app/script/args', () => {
+      const program = new commander.Command();
+      program.argument('[args...]');
+      const holdArgv = process.argv;
+      process.versions.electron = '1.2.3';
+      process.defaultApp = undefined;
+      process.type = 'utility';
+      process.argv = 'electron script.js user'.split(' ');
+      program.parse();
+      delete process.versions.electron;
+      delete process.defaultApp;
+      delete process.type;
+      process.argv = holdArgv;
+      assert.deepEqual(program.args, ['user']);
+    });
+
+    // https://github.com/tj/commander.js/issues/2603
+    test('when no args and electron worker thread then use process.argv and app/script/args', () => {
+      const program = new commander.Command();
+      program.argument('[args...]');
+      const holdArgv = process.argv;
+      process.versions.electron = '1.2.3';
+      process.defaultApp = undefined;
+      process.type = undefined;
+      process.argv = 'electron script.js user'.split(' ');
+      program.parse();
+      delete process.versions.electron;
+      delete process.defaultApp;
+      delete process.type;
+      process.argv = holdArgv;
+      assert.deepEqual(program.args, ['user']);
+    });
+
+    // https://github.com/tj/commander.js/issues/2603
+    test('when no args and electron renderer process then use process.argv and app/args', () => {
+      const program = new commander.Command();
+      program.argument('[args...]').allowUnknownOption();
+      const holdArgv = process.argv;
+      process.versions.electron = '1.2.3';
+      process.defaultApp = undefined;
+      process.type = 'renderer';
+      process.argv =
+        'electron --type=renderer --no-sandbox user /prefetch:1'.split(' ');
+      program.parse();
+      delete process.versions.electron;
+      delete process.defaultApp;
+      delete process.type;
+      process.argv = holdArgv;
+      assert.deepEqual(program.args, [
+        '--type=renderer',
+        '--no-sandbox',
+        'user',
+        '/prefetch:1',
+      ]);
+    });
+
     test('when args then app/script/args', () => {
       const program = new commander.Command();
       program.argument('[args...]');
@@ -47,26 +146,89 @@ describe('Command.parse()', () => {
       assert.deepEqual(program.args, ['user']);
     });
 
-    test('when args from "electron" and not default app the
[cut here: 3786 more characters]
```
