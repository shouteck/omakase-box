# Unicode option placeholders are not recognized as variadic

URL: https://github.com/tj/commander.js/issues/2614
Opened: 2026-09-19T05:31:00Z
Closed: open
State: open

---

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
