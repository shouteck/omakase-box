# cobra-2240

Repository: spf13/cobra · Issue #2240 · Group: fixed · Created: 2025-02-20T14:38:54Z · Closed: 2025-02-21T12:46:16Z
Labels: none · Reporter's role: CONTRIBUTOR

## Title

Command passed to SetHelpFunc doesn't have a context

## Body

When using `SetHelpFunc` the function gets given a `Command` object and you'd think you could use `Context()` to get the right context off the command, but it doesn't actually get set. 

We hit this in pulumi: https://github.com/pulumi/pulumi/issues/18659

I can work around via just a context.Background call instead, but feels like this should just work as the parent "help" command does have a context.

## Comments (1)

### Comment 1 · CONTRIBUTOR · 2025-02-20T14:39:04Z · BEFORE the fix was opened

Will see if I can raise a PR to fix this.

## The fix

Pull request #2241, opened 2025-02-20T15:05:06Z, merged 2025-02-21T12:46:15Z. Title: Flow context to command in SetHelpFunc

Files changed (2):
- modified: command.go
- modified: command_test.go  [test]

## Test changes in the fix (1 file)

### modified: command_test.go

```diff
@@ -2921,3 +2921,34 @@ func TestUnknownFlagShouldReturnSameErrorRegardlessOfArgPosition(t *testing.T) {
 		})
 	}
 }
+
+func TestHelpFuncExecuted(t *testing.T) {
+	helpText := "Long description"
+
+	// Create a context that will be unique, not just the background context
+	//nolint:golint,staticcheck // We can safely use a basic type as key in tests.
+	executionCtx := context.WithValue(context.Background(), "testKey", "123")
+
+	child := &Command{Use: "child", Run: emptyRun}
+	child.SetHelpFunc(func(cmd *Command, args []string) {
+		_, err := cmd.OutOrStdout().Write([]byte(helpText))
+		if err != nil {
+			t.Error(err)
+		}
+
+		// Test for https://github.com/spf13/cobra/issues/2240
+		if cmd.Context() != executionCtx {
+			t.Error("Context doesn't equal the execution context")
+		}
+	})
+
+	rootCmd := &Command{Use: "root", Run: emptyRun}
+	rootCmd.AddCommand(child)
+
+	output, err := executeCommandWithContext(executionCtx, rootCmd, "help", "child")
+	if err != nil {
+		t.Errorf("Unexpected error: %v", err)
+	}
+
+	checkStringContains(t, output, helpText)
+}
```
