# commander-2614

Repository: tj/commander.js · Issue #2614 · Group: known (kitchen R3b-1) · Created: 2026-09-19T05:31:00Z
Labels: pending release · Reporter's role: NONE

## Title

Unicode option placeholders are not recognized as variadic

## Body

## Description

Variadic option placeholders are detected with an ASCII-only `\w` regular expression. A placeholder ending in a non-ASCII letter, such as `<值...>`, is therefore treated as a non-variadic required option.

This differs from variadic command arguments, which detect the `...` suffix without restricting the placeholder to ASCII. It also makes localized option descriptions behave differently from equivalent ASCII descriptions.

## Reproduction

```js
import { Command, Option } from 'commander';

const option = new Option('--tag <值...>');
console.log(option.variadic); // false

const program = new Command().addOption(option);
program.parse(['--tag', 'one', 'two'], { from: 'user' });
console.log(program.opts());
```

On current `develop` (`97411c62`), parsing fails with:

```text
error: too many arguments. Expected 0 arguments but got 1: two.
```

## Expected behavior

The option should be variadic and collect both values:

```js
{ tag: ['one', 'two'] }
```

## Root cause

`Option` currently uses:

```js
this.variadic = /\w\.\.\.[>\]]$/.test(flags);
```

JavaScript `\w` only matches ASCII word characters. A Unicode-aware letter/number check can preserve the existing behavior, including continuing to reject separator forms such as `<value,...>`.

## Environment

- Commander: current `develop` (`97411c62b50eb84dc9f9562af5a06ae30ec54bd87`)
- Node.js: 22.19.0
- OS: Windows 11, amd64

I searched open and closed issues and pull requests for Unicode/non-ASCII variadic placeholders and did not find an existing report. I can submit a focused fix with a regression test.

## Comments (3)

### Comment 1 · COLLABORATOR · 2026-09-19T21:14:18Z · AFTER the fix was opened

Do you use Commander, and unicode option names are something you use in your CLI? (Or is this a theoretical problem noticed from code inspection?)

Edit: this is affecting the placeholder, not the option name. The placeholder is more likely to include unicode characters than the option name.

### Comment 2 · COLLABORATOR · 2026-09-19T21:37:24Z · AFTER the fix was opened

For interest: do you use Commander, and this is something you tried to do? Or was this discovered by code inspection?

### Comment 3 · NONE · 2026-09-20T11:20:57Z · AFTER the fix was opened

I do use Commander, but this particular issue was discovered through code inspection rather than something I encountered in my own CLI.

## The fix

Pull request #2615, opened 2026-09-19T05:36:50Z, merged 2026-09-28T04:11:09Z. Title: Recognise Unicode variadic option placeholders

Files changed (2):
- modified: lib/option.js
- modified: tests/options.variadic.test.js  [test]

## Test changes in the fix (1 file)

### modified: tests/options.variadic.test.js

```diff
@@ -169,6 +169,13 @@ describe('variadic options', () => {
       assert.equal(program.options[0].variadic, true);
     });
 
+    test('when option flags has non-ASCII character before dots then is variadic', () => {
+      const program = new commander.Command();
+      program.option('-c,--comma [cafe\u0301...]');
+
+      assert.equal(program.options[0].variadic, true);
+    });
+
     test('when option flags has special characters before dots then not variadic', () => {
       // This might be used to describe coercion for comma separated values, and is not variadic.
       const program = new commander.Command();
```
