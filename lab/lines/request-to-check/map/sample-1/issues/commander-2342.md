# commander-2342

Repository: tj/commander.js · Issue #2342 · Group: known (kitchen R3b-1) · Created: 2025-03-19T14:31:53Z · Closed: 2025-05-18T06:48:42Z
Labels: bug · Reporter's role: CONTRIBUTOR

## Title

copyInheritedSettings and configureOutput have side-effects

## Body

Hi - noticed something that maybe isn't desired behaviour with the above two methods. Since `copyInheritedSettings` sets `this._outputConfiguration = sourceCommand._outputConfiguration` and `configureOutput` does `Object.assign(...)` - this means that one command can change another command's settings unexpectedly:

```ts
import {program, Command} from 'commander'

const one = new Command('one')
  .description('A very very very very very very very very very very very very very very very very very very very very very very very very long description')
  .action(() => console.log('hi i am one'))
  .configureOutput({
    writeOut: str => console.log(str + '🚀🚀🚀🚀'),
    getOutHelpWidth: () => 70,
  })

const two = new Command('two')
  .copyInheritedSettings(one)
  .description('Another very very very very very very very very very very very very very very very very very very very very very very very very long description')
  .action(() => console.log('hi i am two'))
  .configureOutput({
    getOutHelpWidth: () => 200,
  })

program
  .addCommand(one)
  .addCommand(two)

program.parse()
```

When you do `mycommand one --help` it uses 200 for the help width, not 70 as I'd expect. (Note: `mycommand two --help` prints the `🚀🚀🚀🚀` at the bottom, which _is_ correct/expected, IMO).

Suggested solution: use a spread operator in either/both of the methods.

## Comments (2)

### Comment 1 · COLLABORATOR · 2025-03-19T20:00:43Z · BEFORE the fix was opened

Probably uncommon to configure the output at a leaf command, but the side-effect isn't the intended behaviour. `.configureOutput()` should merge to a new object instead of merging in place.

This will change the behaviour for people configuring output after setting up subcommands (not the intended pattern), which can be touched on in the release notes. (Note to self: check README too.)

### Comment 2 · COLLABORATOR · 2025-05-18T06:48:42Z · AFTER the fix was opened

This has been released in Commander v14.

## The fix

Pull request #2350, opened 2025-03-26T04:59:28Z, merged 2025-03-26T23:55:13Z. Title: Make .configureOutput() create copy of settings instead of in-place change

Files changed (2):
- modified: lib/command.js
- modified: tests/command.configureOutput.test.js  [test]

## Test changes in the fix (1 file)

### modified: tests/command.configureOutput.test.js

```diff
@@ -329,6 +329,17 @@ test('when custom outputErr and writeErr and error then outputErr passed writeEr
   );
 });
 
+test('when configureOutput after copyInheritedSettings then original unchanged', () => {
+  const program = new commander.Command();
+  program.configureOutput({ getOutHelpWidth: () => 80 });
+  const copy = program.createCommand('copy');
+  copy.copyInheritedSettings(program);
+  expect(copy.configureOutput().getOutHelpWidth()).toBe(80);
+  copy.configureOutput({ getOutHelpWidth: () => 40 });
+  expect(copy.configureOutput().getOutHelpWidth()).toBe(40);
+  expect(program.configureOutput().getOutHelpWidth()).toBe(80);
+});
+
 describe.each([['getOutHasColors'], ['getErrHasColors']])(
   '%s',
   (configProperty) => {
```
