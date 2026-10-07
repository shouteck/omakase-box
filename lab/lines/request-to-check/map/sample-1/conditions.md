Conditions for sample 1: each of the 43 issues in `issues/` split into the single things that would have to be true for the person who filed it to be satisfied, quoted or closely paraphrased, with the source of each (title, body, or comment number).
Split from the title, the body and the comments only (for issues with a fix: only comments made before the fix was opened); a `.T` line stands for the later question about the fix's tests. Nothing here is a label.

## axios-11131

Group: fixed · Repository: axios/axios · File: issues/axios-11131.md

- **axios-11131.1** (body) When the reconstructed caller stack has only one or two frames, "the reconstructed request stack should be appended", as before Axios 1.15.0. The reproduction's output should contain `at Axios.request`, `at async requestFromNamedCaller` and `caller preserved: true` (actual with 1.19.0: `caller preserved: false`). [reproduction shortened]
  ```js
  Error.stackTraceLimit = 2;

  async function requestFromNamedCaller() {
    await axios.request({
      url: 'http://localhost/test',
      adapter: () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new AxiosError('adapter failure')), 0);
        }),
    });
  }
  ```
- **axios-11131.2** (body) "The existing duplicate detection for stacks containing three or more frames remains unchanged."
- **axios-11131.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## axios-11192

Group: fixed · Repository: axios/axios · File: issues/axios-11192.md

- **axios-11192.1** (body) "Options the caller did not set should not be sent to the runtime's `Request` constructor, or at least `cache` should be left undefined", so that a request through the fetch adapter on Cloudflare Workers no longer fails with `TypeError: Unsupported cache mode: default`; the reproduction should answer `ok 200` as it does with `axios@1.19.0`.
  ```js
  import axios from 'axios'

  export default {
    async fetch() {
      try {
        const res = await axios.get('https://cloudflare.com/cdn-cgi/trace', { adapter: 'fetch' })
        return new Response(`ok ${res.status}`)
      } catch (e) {
        return new Response(String(e))
      }
    },
  }
  ```
  ```
  wrangler dev --local
  curl http://127.0.0.1:8787/
  # → TypeError: Unsupported cache mode: default
  ```
- **axios-11192.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## axios-11260

Group: fixed · Repository: axios/axios · File: issues/axios-11260.md

- **axios-11260.1** (body) "Please remove `dayjs` from `docs/package.json` and its entry in `docs/package-lock.json`."
- **axios-11260.2** (body) "This should have no effect on the public API or runtime behavior."
- **axios-11260.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## axios-11261

Group: fixed · Repository: axios/axios · File: issues/axios-11261.md

- **axios-11261.1** (body) "Please remove the root `chalk` development dependency from `package.json` and update the root `package-lock.json`."
- **axios-11261.2** (body) "This should not affect the public API or runtime behavior."
- **axios-11261.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## axios-11262

Group: fixed · Repository: axios/axios · File: issues/axios-11262.md

- **axios-11262.1** (body) "Please remove `chai` from `tests/module/cjs/package.json` and update `tests/module/cjs/package-lock.json`."
- **axios-11262.2** (body) "Keep the separate `chai` dependency in `tests/smoke/cjs`, where the smoke tests still use it."
- **axios-11262.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## axios-11285

Group: open · Repository: axios/axios · File: issues/axios-11285.md

- **axios-11285.1** (body) Expose the two utility functions `isAbsoluteURL` and `combineURLs` "on the main `axios` object, perhaps under `axios.utils` or `axios.helpers`, alongside existing public methods", so that users need not duplicate the logic or "rely on internal undocumented paths".

## axios-11289

Group: open · Repository: axios/axios · File: issues/axios-11289.md

- **axios-11289.1** (body) In automatic URL-encoded serialization in Node, a nested Buffer keeps its parent path. The reproduction should print `[['first[file]', 'YWJj'], ['second[file]', 'eHl6']]` (actual: `[['file', 'YWJj'], ['file', 'eHl6']]`). [reproduction shortened]
  ```js
  const server = createServer((req, res) => req.pipe(res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const response = await axios.post(
      `http://127.0.0.1:${server.address().port}/`,
      {
        first: { file: Buffer.from('abc') },
        second: { file: Buffer.from('xyz') },
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log([...new URLSearchParams(response.data)]);
  ```
- **axios-11289.2** (body) "With `formSerializer: { dots: true }`, the names should be `first.file` and `second.file`."

## axios-11291

Group: open · Repository: axios/axios · File: issues/axios-11291.md

- **axios-11291.1** (title, body) Primitive request bodies (`0`, `false`, `123`, `true`) are handled the same way by the three default adapters (`http`, `xhr`, `fetch`), instead of the reported "conflicting and inconsistent behavior": `fetch` sends `"0"` / `"false"` / `"123"` / `"true"`, `xhr` and `http` send an empty body for `0` and `false`, and `http` throws `ERR_BAD_REQUEST` for `123` and `true`. The text does not say which of the behaviours is the wanted one. [reproduction shortened]
  ```js
    const resFetchZero = await axios.post(url, 0, { adapter: 'fetch' });
    console.log('fetch (0):', resFetchZero.data); // { receivedBody: '0', length: '1' }

    const resHttpZero = await axios.post(url, 0, { adapter: 'http' });
    console.log('http (0):', resHttpZero.data);   // { receivedBody: '', length: '0' } (silently dropped)

    const resFetchNum = await axios.post(url, 123, { adapter: 'fetch' });
    console.log('fetch (123):', resFetchNum.data); // { receivedBody: '123', length: '3' }

    try {
      await axios.post(url, 123, { adapter: 'http' });
    } catch (err) {
      console.log('http (123):', err.code, err.message);
      // ERR_BAD_REQUEST: Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream
    }
  ```

## axios-11292

Group: open · Repository: axios/axios · File: issues/axios-11292.md

- **axios-11292.1** (body) With the Fetch adapter, when a response's declared `Content-Length` exceeds `maxContentLength`, "initiate cancellation of the unread body" so the unfinished response does not stay open after the Axios promise has rejected. The reproduction should print `{ responseClosed: true }` (actual: `false`). [reproduction shortened]
  ```js
  let responseClosed = false;
  const server = http.createServer((request, response) => {
    response.once('close', () => { responseClosed = true; });
    response.writeHead(200, { 'Content-Length': '1000' });
    response.write('first');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
    await axios.get(`http://127.0.0.1:${server.address().port}/`, {
      adapter: 'fetch', maxContentLength: 1,
    }).catch(error => console.log(error.code)); // ERR_BAD_RESPONSE
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log({ responseClosed }); // Actual: false. Expected: true.
  ```
- **axios-11292.2** (body) This is done "while preserving the existing size-limit rejection" (`ERR_BAD_RESPONSE`).
- **axios-11292.3** (body) "A cleanup rejection, or a custom cleanup promise that never settles, should neither replace nor delay `ERR_BAD_RESPONSE`"; likewise "custom throwing getters also cannot replace the size error".
- **axios-11292.4** (body) The change "adds no successful-request work or per-chunk overhead and preserves custom responses without a cancellable body".

## axios-11295

Group: open · Repository: axios/axios · File: issues/axios-11295.md

- **axios-11295.1** (body) `axios.formToJSON()` on a FormData with a nested field named `length` returns `{ metadata: { length: 'long' } }` instead of throwing `RangeError: Invalid array length`.
  ```js
  import axios from 'axios';

  const form = new FormData();
  form.append('metadata[length]', 'long');
  console.log(axios.formToJSON(form));
  ```
- **axios-11295.2** (body) The other forms reported as failing no longer fail: "The dot form `metadata.length`, repeated `metadata[length]` values and `metadata[length][unit]` also fail."
- **axios-11295.3** (body) The same holds for "posting FormData with `Content-Type: application/json`", which the report says is also affected.
- **axios-11295.4** (body) The conversion is fixed "while preserving any numeric siblings".

## click-3406

Group: open · Repository: pallets/click · File: issues/click-3406.md

- **click-3406.1** (body) "Migrate sentinel values like at `src/click/_utils.py` to use the introduced `sentinel` built-in coming in Python 3.15."
- **click-3406.2** (body) "For older versions we can use `typing_extenions.sentinel`" (the typing_extensions backport named in the title).

## click-3652

Group: open · Repository: pallets/click · File: issues/click-3652.md

- **click-3652.1** (title, body) When an option has `multiple=True`, the auto-generated help appends an ellipsis to its metavar:
  ```
  Usage: script.py [OPTIONS]

  Options:
    --foo TEXT...  A list of foo strings.
    --help         Show this message and exit.
  ```
- **click-3652.2** (comment 4) "While the exact implementation can be discussed, my point is that we need some easy way to indicate that an option can be specified multiple times. It shall be in the CLI's usage message, and shall be obvious to the user"; "I wish we have something out-of-the-box."

## click-3696

Group: open · Repository: pallets/click · File: issues/click-3696.md

- **click-3696.1** (body) "The existing utilities are here to stay, but are feature complete. This needs to be documented".
- **click-3696.2** (body) "the doc strings need updating" (for the utilities).
- **click-3696.3** (body) "the typing need checking" (for the utilities).
- **click-3696.4** (body) "the test coverage is incomplete" (for the utilities; to be completed).
- **click-3696.5** (body) "Some also need notes points to projects that have fuller versions of what we have like TQDM, Rich, Prompt Toolkit, and others."

## click-3740

Group: fixed · Repository: pallets/click · File: issues/click-3740.md

- **click-3740.1** (title, body) On Windows, the stream yielded by `get_pager_file` is a text stream as its `TextIO` annotation says, not the `BinaryIO` object made by `_tempfilepager` with `mode="wb"`; a caller's `stream.write("some text")` does not raise `TypeError: a bytes-like object is required, not 'str'`. Suggested: "In `_tempfilepager`, create the temp file with `mode='w'`".
- **click-3740.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## click-3766

Group: fixed · Repository: pallets/click · File: issues/click-3766.md

- **click-3766.1** (body, comment 3) `docs/contributing.md` no longer describes "a downstream safety net that isn't running" (the bullet "A CI workflow (`.github/workflows/test-flask.yaml`) runs Flask's test suite to catch downstream regressions", whose workflow was removed). The requester names two fixes "depending on intent": if dropping the workflow was deliberate, remove that bullet from `docs/contributing.md`; if it was collateral, "the Flask downstream regression check has been off since April". Comment 3 (maintainer) answers: "I didn't remove it on purpose".
- **click-3766.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## click-3786

Group: fixed · Repository: pallets/click · File: issues/click-3786.md

- **click-3786.1** (body) "Ensure the change log has entries for each user-facing non-docs change, with links to the related issue reports."
- **click-3786.2** (body) "Change "Unreleased" to "Released YYYY-MM-DD" in CHANGES.md."
- **click-3786.3** (body) "Remove the ".dev" suffix from the version in pyproject.toml."
- **click-3786.4** (title, body) Release 8.5.0 is tagged and published: "Tag `git tag -am 'release version A.B.C' A.B.C` and push", "Publish the draft release page."
- **click-3786.5** (body) "Start the next version(s), creating a change log section, bumping the version in pyproject.toml with the .dev suffix."

More conditions exist: 12 not listed.

- **click-3786.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## click-3802

Group: fixed · Repository: pallets/click · File: issues/click-3802.md

- **click-3802.1** (body) When a user presses Ctrl-C during `click.prompt()`, "click handles the KeyboardInterrupt exception gracefully, regardless of timing or architecture": no unhandled `KeyboardInterrupt` raised from `click/core.py ... main` → `click/utils.py ... echo` → `click/_compat.py ... isatty` while `click.exceptions.Abort` is being handled, as seen in the reported run (`[TEST FAIL] Unexpected EOF while waiting for: Aborted`).
- **click-3802.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## click-3822

Group: fixed · Repository: pallets/click · File: issues/click-3822.md

- **click-3822.1** (title, body) `click.Path` is generic on `path_type`: "I expect the return type of `click.prompt` to match the `path_type` value passed to `click.Path`", instead of always `str | bytes | os.PathLike[str]`. The reproduction should pass the type checkers named (mypy, pyright, ty).
  ```python
  # mre.py
  import pathlib

  from typing_extensions import assert_type

  import click

  my_type = click.Path(file_okay=False, path_type=pathlib.Path)
  path = click.prompt("Enter a name", type=my_type)

  # expected: pathlib.Path, actual: str | bytes | os.PathLike[str]
  assert_type(path, pathlib.Path)
  ```
- **click-3822.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## click-3840

Group: open · Repository: pallets/click · File: issues/click-3840.md

- **click-3840.1** (title, body) `click.edit()` on Windows launches `notepad.exe` every time, instead of failing "in about half the times" with `OSError: [WinError 87] The parameter is incorrect` or `OSError: [WinError 14001] The application has failed to start because its side-by-side configuration is incorrect` (surfaced as `click.exceptions.ClickException: notepad: Editing failed: ...`).
  ```py
  import click
  _ = click.edit()
  print("If you got here, no crash occurred")
  ```

## click-3847

Group: open · Repository: pallets/click · File: issues/click-3847.md

- **click-3847.1** (body) In types.py, "`convert_type` - rename to _convert_type - currently has no top level import".
- **click-3847.2** (title, body) In types.py, `FuncParamType` is marked as private ("maybe typing thing? - currently has no top level import").
- **click-3847.3** (body) "consider deprecating 'open_file'".
- **click-3847.4** (comment 6) "`atomic` should be deprecated" (the `atomic` argument of `open_file`).
- **click-3847.5** (comment 6) "`lazy` is only useful for the `File` param type when opening a file for writing, and should be invisible to the public API."

More conditions exist: 2 not listed.

## cobra-2222

Group: fixed · Repository: spf13/cobra · File: issues/cobra-2222.md

- **cobra-2222.1** (body) The format for completions with a description (a tab between text and description, as in `"3\ttab width"`) is made obvious where the user looks: "what is needed is simply about adding documentation about the format in the methods".
- **cobra-2222.2** (comment 1) "we could start by adding Go Examples to these methods."
- **cobra-2222.3** (title, body, comment 1) A completion helper: "Adding a struct, with Text and description", for which "validation might be needed"; "Then implements something with an helper".
- **cobra-2222.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## cobra-2240

Group: fixed · Repository: spf13/cobra · File: issues/cobra-2240.md

- **cobra-2240.1** (title, body) The `Command` given to the function set with `SetHelpFunc` has its context set, so that `Context()` on it returns "the right context"; "feels like this should just work as the parent "help" command does have a context."
- **cobra-2240.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## cobra-2257

Group: fixed · Repository: spf13/cobra · File: issues/cobra-2257.md

- **cobra-2257.1** (title, body) Completions do not modify `os.Args`: cobra does not insert `--` into it. With the minimal example, `go run . __complete x` should print `[Debug] [Error] __complete, x` (actual: `[Debug] [Error] __complete, --`).
  ```go
  func main() {
  	cmd := &cobra.Command{
  		TraverseChildren: true,
  		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
  			cobra.CompErrorln(strings.Join(os.Args[1:], ", "))
  			return nil, cobra.ShellCompDirectiveDefault
  		},
  	}
  	if err := cmd.Execute(); err != nil {
  		panic(err)
  	}
  }
  ```
- **cobra-2257.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## cobra-2298

Group: fixed · Repository: spf13/cobra · File: issues/cobra-2298.md

- **cobra-2298.1** (body) An answer on repeated flags such as `-v`, `-v -v` / `-vv`, `-vvv` each invoking different behaviour: "I'd like to know if this is possible, and how to do it programmatically."
- **cobra-2298.2** (title, body, comments 2 and 3) That information is in the user guide: "I'd be happy to put it into a PR for the user guide to complete this request"; comment 2 asks "would you like a PR for docs on this?" and comment 3 (maintainer) replies "That would be nice. I notice we don't have any doc about repeating flags".
- **cobra-2298.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## cobra-2323

Group: fixed · Repository: spf13/cobra · File: issues/cobra-2323.md

- **cobra-2323.1** (title, body) `minUsagePadding` is defined as a constant: change `var minUsagePadding = 25` to `const minUsagePadding = 25`.
- **cobra-2323.2** (body) "This change is fully backward compatible and has no functional impact on behavior."
- **cobra-2323.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## cobra-2481

Group: open · Repository: spf13/cobra · File: issues/cobra-2481.md

- **cobra-2481.1** (body) The generated PowerShell completion script does not fail when the command returns no output (`$Out` is empty); today `$Out[-1].TrimStart(':')` throws "You cannot call a method on a null-valued expression."
- **cobra-2481.2** (body) The script does not fail when the output has exactly one element (unwrapped to a scalar string, so `$Out[-1]` is a `System.Char`); today it throws "Method invocation failed because [System.Char] does not contain a method named 'TrimStart'."
- **cobra-2481.3** (body) The directive (last element, such as `:4`) is removed by index, not by value: a completion item whose text equals the directive string (such as `":0"`) is not stripped, as it is today by
  ```powershell
  $Out = $Out | Where-Object { $_ -ne $Out[-1] }
  ```

## cobra-2491

Group: open · Repository: spf13/cobra · File: issues/cobra-2491.md

- **cobra-2491.1** (title, body) "Native support for optional values in map-based flags": a key given without `=`, as in `--bssids 7E:BC:07:E8:67:47,AA:BB:CC:DD:EE:FF=Work`, is accepted instead of the error `csv string must be in the form key=value`. Either "a new flag type like `StringToStringOptional` (and its variations) where a missing `=` separator simply defaults the map value to an empty string `""`", or "an option that relaxes the strict `key=value` requirement" on the existing map flags.

## cobra-2505

Group: open · Repository: spf13/cobra · File: issues/cobra-2505.md

- **cobra-2505.1** (body) In the cobra.dev tutorial "Building a 12-Factor App with Viper Integration", the Go snippet in "Step 2: Defining Commands and Flags" renders as code that compiles: the import path is not a Markdown link and no stray code fences sit inside the `var` block. "Presumably intended":
  ```go
  package cmd

  import (
  	"fmt"
  	"os"

  	"github.com/spf13/cobra"
  )

  var (
  	// Used for flags.
  	cfgFile string

  	rootCmd = &cobra.Command{
  		Use:   "myapp",
  		Short: "A demo application for Cobra and Viper",
  	}
  )
  ```
- **cobra-2505.2** (title, body) The tutorial's other "malformed shell and Go snippets" ("multiple instances", including "the sections mentioned in #2322") are no longer broken.

## cobra-2507

Group: open · Repository: spf13/cobra · File: issues/cobra-2507.md

- **cobra-2507.1** (body) "The documentation should define whether mixed supported kinds are rejected, return `false`, or otherwise handled consistently."
- **cobra-2507.2** (title, body) `Eq` called with two individually supported values of different kinds does not panic with a reflection `ValueError`; it is expected to be "returning `false` or producing a clear same-kind precondition error". "If the intended contract is that both operands must have the same kind, the helper should either validate that precondition or document it clearly."
  ```go
  package main

  import "github.com/spf13/cobra"

  func main() {
      _ = cobra.Eq(1, "1")
  }
  ```

## cobra-2520

Group: open · Repository: spf13/cobra · File: issues/cobra-2520.md

- **cobra-2520.1** (title, body) Man pages from `doc.GenMan` / `GenManTree` print each flag's description on its own indented line below the flag ("the usual tagged-paragraph layout"), as with cobra v0.0.5, instead of on the flag's line with long descriptions wrapping back to the left margin. Expected:
  ```
       -n, --dry-run[=false]
              do not upload or write any data, just show what would be done

       -e, --exclude=[]
              exclude a pattern (can be specified multiple times)
  ```
  Reproduction: [reproduction shortened]
  ```go
  func main() {
  	cmd := &cobra.Command{Use: "demo", Short: "Demo command", Run: func(*cobra.Command, []string) {}}
  	cmd.Flags().String("name", "", "Name of the thing")
  	cmd.Flags().StringP("output-directory", "o", "", "Directory to write the generated files to, created if it does not exist yet")
  	_ = doc.GenMan(cmd, nil, os.Stdout)
  }
  ```
  ```
  go run . > demo.1 && man -l demo.1
  ```

## commander-2342

Group: known (kitchen R3b-1) · Repository: tj/commander.js · File: issues/commander-2342.md

- **commander-2342.1** (title, body) Calling `configureOutput` on a command that used `copyInheritedSettings` does not change the source command's settings. In the example, `mycommand one --help` should use 70 for the help width, "not 200". [reproduction shortened]
  ```ts
  const one = new Command('one')
    .action(() => console.log('hi i am one'))
    .configureOutput({
      writeOut: str => console.log(str + '🚀🚀🚀🚀'),
      getOutHelpWidth: () => 70,
    })

  const two = new Command('two')
    .copyInheritedSettings(one)
    .action(() => console.log('hi i am two'))
    .configureOutput({
      getOutHelpWidth: () => 200,
    })
  ```
- **commander-2342.2** (body) The copied settings still apply to the copying command: "`mycommand two --help` prints the `🚀🚀🚀🚀` at the bottom, which _is_ correct/expected".
- **commander-2342.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## commander-2603

Group: known (kitchen R3b-1) · Repository: tj/commander.js · File: issues/commander-2603.md

- **commander-2603.1** (title, body) "When `ELECTRON_RUN_AS_NODE=1` is set, I would expect `program.parse()` to use the Node argument convention and leave the script path out of user arguments." In the reproduction the child should give `{ args: [], options: { verbose: true } }` (actual: `{ args: ['/path/to/child.js'], options: { verbose: true } }`). [reproduction shortened]
  ```js
  // main.js, started as an Electron main process
    const child = spawn(process.execPath, [path.join(__dirname, 'child.js'), '--verbose'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: 'inherit',
    });
  // child.js
  const program = new Command().argument('[input]').option('--verbose');

  program.parse();

  console.log({ args: program.args, options: program.opts() });
  ```
- **commander-2603.2** (comment 3) A child started with Electron's `utilityProcess.fork` (where `process.type` is `'utility'` and `ELECTRON_RUN_AS_NODE` is undefined) shows the same result, `{ args: [ '/path/to/child.js' ], options: { verbose: true } }`; the requester notes that "the proposed fix above only works with `child_process.fork`".
  ```js
    const child = utilityProcess.fork(path.join(__dirname, 'child.js'), ['--verbose'], { stdio: 'inherit' });
  ```
- **commander-2603.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## commander-2614

Group: known (kitchen R3b-1) · Repository: tj/commander.js · File: issues/commander-2614.md

- **commander-2614.1** (title, body) An option whose placeholder ends in a non-ASCII letter, such as `<值...>`, is variadic and "collect[s] both values": the reproduction gives `{ tag: ['one', 'two'] }` instead of `error: too many arguments. Expected 0 arguments but got 1: two.`
  ```js
  import { Command, Option } from 'commander';

  const option = new Option('--tag <值...>');
  console.log(option.variadic); // false

  const program = new Command().addOption(option);
  program.parse(['--tag', 'one', 'two'], { from: 'user' });
  console.log(program.opts());
  ```
- **commander-2614.2** (body) The existing behaviour is preserved, "including continuing to reject separator forms such as `<value,...>`".
- **commander-2614.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## serdejson-1123

Group: fixed · Repository: serde-rs/json · File: issues/serdejson-1123.md

- **serdejson-1123.1** (title, body) `src/features_check/error.rs` no longer holds invalid code that makes static analysis tools like cargo-geiger report `Failed to parse file: .../src/features_check/error.rs`; the invalid code is replaced with a call to the `compile_error!` macro:
  ```rust
  #[cfg(not(any(feature = "std", feature = "alloc")))] 
  compile_error!("serde_json requires that either `std` (default) or `alloc` feature is enabled");
  ```
- **serdejson-1123.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## serdejson-1134

Group: fixed · Repository: serde-rs/json · File: issues/serdejson-1134.md

- **serdejson-1134.1** (title, body) `Map<String, Value>` implements `Deserializer`, so that one can deserialize from it to a more concrete type "without going through `Value`".
- **serdejson-1134.2** (title, body) `&Map<String, Value>` implements `Deserializer`: "I have a `&Map<String, Value>` that I would like to deserialize to a concrete struct"; `T::deserialize(Value::Object(map))` "doesn't work for a reference".
- **serdejson-1134.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## serdejson-1164

Group: fixed · Repository: serde-rs/json · File: issues/serdejson-1164.md

- **serdejson-1164.1** (title, body) `json!` with an array works in a `no_std` environment with feature `alloc` without the user having to `use alloc::vec`; the expansion should not call `vec!` unqualified (suggested: "changing `vec!` to `::alloc::vec!`").
  ```rust
  /*
  [dependencies]
  serde_json = { version = "1.0.120", default-features = false, features = ["alloc"] }
  */

  #![no_std]

  extern crate alloc;

  fn main() {
      serde_json::json!(["", ""]);
  }
  ```
- **serdejson-1164.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## serdejson-1214

Group: fixed · Repository: serde-rs/json · File: issues/serdejson-1214.md

- **serdejson-1214.1** (title, body) `Value` supports conversion from an array, alongside the existing `impl From<&[T]> for Value` and `impl From<Vec<T>> for Value`:
  ```rust
  impl<T: Into<Value>, const N: usize> From<[T; N]> for Value {
      fn from(array: [T; N]) -> Self {
          let vec = array.into_iter().map(|v| v.into()).collect();
          Self::Array(vec)
      }
  }
  ```
- **serdejson-1214.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## serdejson-1225

Group: fixed · Repository: serde-rs/json · File: issues/serdejson-1225.md

- **serdejson-1225.1** (title, body) `Map` gains `into_values`, with an owning iterator `IntoValues` over the map's values ("Gets an iterator over the values of the map"). Comment 1 (maintainer): "`into_values` would be fine."
- **serdejson-1225.2** (title, body) `Map` gains `into_inner`: "Consumes the `Map`, returning the underlying Map implementation." Comment 1 (maintainer) says of this and the next: "The other 2 APIs in your suggestion would be misguided to add in serde_json."
- **serdejson-1225.3** (title, body) `Map` gains the converter from the inner map: `impl<K, V> From<MapImpl<K, V>> for Map<K, V>`.
- **serdejson-1225.4** (body) The clippy workaround for `derivable_impls` is removed: "the clippy workaround for derivable_impls seems resolved now. I remove it and no more new warnings."
- **serdejson-1225.T** (the fix's tests) see the "Test changes in the fix" section of the issue file

## serdejson-1323

Group: open · Repository: serde-rs/json · File: issues/serdejson-1323.md

- **serdejson-1323.1** (title, body) With the untagged enum `ValueWithIncludes` from the setup (variants `Include(Include)`, `Array(Vec<ValueWithIncludes>)`, `Object(BTreeMap<String, ValueWithIncludes>)`, `Other(serde_json::Value)`), parsing `["b"]` gives the array variant, not the struct `Include(Include { include: IncludeFile("b"), at: IncludePath([]) })`. [reproduction shortened]
  ```rust
          assert_eq!(
              serde_json::from_value::<ValueWithIncludes>(json!(["b"])).unwrap(),
              ValueWithIncludes::Array(vec![ValueWithIncludes::Other(serde_json::Value::String(
                  "b".to_string()
              ))])
          );
  ```
- **serdejson-1323.2** (body) An answer to the question: "Is it that it thinks of `Include` as of one-field tuple struct because the second field have default value?"

## serdejson-1330

Group: open · Repository: serde-rs/json · File: issues/serdejson-1330.md

- **serdejson-1330.1** (title, body) A deserialization memory budget: the forwarded email reports that `serde_json::from_str` and related parsing functions "allocate heap memory proportional to the size of the input JSON without any built-in limit" and that "the Deserializer struct has no field for tracking total allocation size or enforcing a memory budget", so that an attacker who controls the JSON input can exhaust the process's memory. The text names the missing limit and makes no more specific request.

## serdejson-1332

Group: open · Repository: serde-rs/json · File: issues/serdejson-1332.md

- **serdejson-1332.1** (title, body) The text asks for no change to the library: it asks the maintainers for "a short review of whether our measurement is fair and idiomatic" in an external serializer benchmark (GLD.SerializerBenchmark) that includes serde_json, by "concrete notes or a small PR against that wrapper".

## serdejson-1335

Group: open · Repository: serde-rs/json · File: issues/serdejson-1335.md

- **serdejson-1335.1** (title, body) Deserialising a struct with a `#[serde(flatten)]`ed map member with `RawValue` values succeeds when a key would be stored in that map; the "another garbage" line should parse like the others instead of returning `Err(Error("invalid type: newtype struct, expected any valid JSON value", line: 1, column: 68))`. [reproduction shortened]
  ```rust
  #[derive(serde::Deserialize, Debug, Clone)]
  pub struct IspData<'g> {
      #[serde(default)]
      isp: Option<String>,

      #[serde(flatten, borrow)]
      garbage: std::collections::BTreeMap<&'g str, &'g serde_json::value::RawValue>,

      #[serde(default, borrow)]
      optraw: Option<&'g serde_json::value::RawValue>,
  }
  fn main() {
      dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\",\"isp-tags\":[\"cde\"],\"optraw\":1234,\"another garbage\":123}"));
  }
  ```

## serdejson-1340

Group: open · Repository: serde-rs/json · File: issues/serdejson-1340.md

- **serdejson-1340.1** (title, body) "I expect the output of `serde_json` to be stable across updates": the arbitrary-precision value `1e400` serializes as `1e400`, as in version `1.0.148`, not as `1e+400` as in `1.0.149` and later. The requester adds: "I'm not sure if it's a bug or intended behavior".
  ```rust
  use std::str::FromStr;

  fn get_num() -> serde_json::Value {
      serde_json::Value::from_str("1e400").expect("input is valid JSON")
  }

  #[test]
  fn test_num() {
      let actual = get_num().to_string();
      let expected = "1e400";
      assert_eq!(actual, expected);
  }
  ```
