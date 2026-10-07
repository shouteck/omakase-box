# cobra-2257

Repository: spf13/cobra · Issue #2257 · Group: fixed · Created: 2025-03-12T00:29:59Z · Closed: 2026-04-24T20:41:59Z
Labels: none · Reporter's role: NONE

## Title

Completions modify os.Args

## Body

I'm trying to workaround https://github.com/spf13/cobra/issues/1877 by inspecting `os.Args` by hand. In some cases cobra accidentally inserts `--` into `os.Args`.

Minimal example:
```go
package main

import (
	"os"
	"strings"

	"github.com/spf13/cobra"
)

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

Expected behaviour:
```console
$ go run . __complete x
[Debug] [Error] __complete, x
:0
Completion ended with directive: ShellCompDirectiveDefault
```

Actual behaviour:
```console
$ go run . __complete x
[Debug] [Error] __complete, --
:0
Completion ended with directive: ShellCompDirectiveDefault
```

## Comments (2)

### Comment 1 · COLLABORATOR · 2026-02-10T15:24:42Z · AFTER the fix was opened

Apologies for missing this @jonathan-conder .  Clearly this is a bug. Thanks @veeceey for opening #2356  to address the problem

### Comment 2 · CONTRIBUTOR · 2026-02-11T06:34:50Z · AFTER the fix was opened

> Apologies for missing this [@jonathan-conder](https://github.com/jonathan-conder) . Clearly this is a bug. Thanks [@veeceey](https://github.com/veeceey) for opening [#2356](https://github.com/spf13/cobra/pull/2356) to address the problem

Thanks Marck my pleasure!!

## The fix

Pull request #2356, opened 2026-02-10T08:14:44Z, merged 2026-04-24T20:41:58Z. Title: fix: prevent completions from mutating os.Args via append side effect

Files changed (2):
- modified: completions.go
- modified: completions_test.go  [test]

## Test changes in the fix (1 file)

### modified: completions_test.go

```diff
@@ -4072,3 +4072,58 @@ func TestCustomDefaultShellCompDirective(t *testing.T) {
 		})
 	}
 }
+
+func TestCompletionDoesNotMutateOsArgs(t *testing.T) {
+	// Test for https://github.com/spf13/cobra/issues/2257
+	// Verify that os.Args is not corrupted when shell completion runs
+	// with TraverseChildren enabled.
+	//
+	// The bug: getCompletions() calls append(finalArgs, "--") where
+	// finalArgs is a sub-slice of the original args (from os.Args[1:]).
+	// If there's spare capacity, append writes "--" into the shared
+	// backing array, mutating os.Args in place.
+
+	// Save and restore os.Args since we need to override it.
+	origArgs := os.Args
+	defer func() { os.Args = origArgs }()
+
+	// Set os.Args to simulate: root __completeNoDesc x
+	// We do NOT use SetArgs so the code falls through to os.Args[1:].
+	// The program name must not be "cobra.test" to bypass the test guard
+	// in ExecuteC().
+	os.Args = []string{"root", ShellCompNoDescRequestCmd, "x"}
+
+	rootCmd := &Command{
+		Use:              "root",
+		TraverseChildren: true,
+		ValidArgsFunction: func(cmd *Command, args []string, toComplete string) ([]string, ShellCompDirective) {
+			return []string{"mycompletion"}, ShellCompDirectiveDefault
+		},
+		Run: emptyRun,
+	}
+
+	buf := new(bytes.Buffer)
+	rootCmd.SetOut(buf)
+	rootCmd.SetErr(buf)
+
+	_, err := rootCmd.ExecuteC()
+	if err != nil {
+		t.Fatalf("Unexpected error: %v", err)
+	}
+
+	// Without the fix, os.Args[2] would be changed from "x" to "--"
+	// because append(finalArgs, "--") in getCompletions wrote into
+	// the shared backing array of os.Args.
+	if len(os.Args) != 3 {
+		t.Fatalf("os.Args length changed: expected 3, got %d", len(os.Args))
+	}
+	if os.Args[0] != "root" {
+		t.Errorf("os.Args[0] was mutated: expected %q, got %q", "root", os.Args[0])
+	}
+	if os.Args[1] != ShellCompNoDescRequestCmd {
+		t.Errorf("os.Args[1] was mutated: expected %q, got %q", ShellCompNoDescRequestCmd, os.Args[1])
+	}
+	if os.Args[2] != "x" {
+		t.Errorf("os.Args[2] was mutated: expected %q, got %q", "x", os.Args[2])
+	}
+}
```
