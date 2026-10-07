# cobra-2222

Repository: spf13/cobra · Issue #2222 · Group: fixed · Created: 2025-01-22T07:24:58Z · Closed: 2025-02-09T16:06:08Z
Labels: none · Reporter's role: CONTRIBUTOR

## Title

Completion helper

## Body

Following #2220

Right now the format for completion is not obvious. I discovered in ov tool

```go
rootCmd.PersistentFlags().IntP("tab-width", "x", 8, "tab stop width")
_ = rootCmd.RegisterFlagCompletionFunc("tab-width", func(_ *cobra.Command, _ []string, _ string) ([]string, cobra.ShellCompDirective) {
	return []string{"3\ttab width", "2\ttab width", "4\ttab width", "8\ttab width"}, cobra.ShellCompDirectiveNoFileComp
})
```

https://github.com/noborus/ov/blob/4f4e9e5c266ec4815c5a166718e318992ea47751/main.go#L431-433

By not .obvious, I mean the `tab` is logic but not something you will think of, when you easily find out in the documentation.

I opened an issue as it requires some design

- Adding a struct, with Text and description
- validation might be needed

- Generic could help, but the Go version 1.15 is go.mod broke my dreams 😅
- a fmt.Stringer art, but it doesn't bring much

I might be overthinking and what is needed is simply about adding documentation about the format in the methods

So, let's talk 😁


## Comments (3)

### Comment 1 · CONTRIBUTOR · 2025-01-22T07:25:36Z · BEFORE the fix was opened

Of course, we could start by adding Go Examples to these methods.

Then implements something with an helper

### Comment 2 · COLLABORATOR · 2025-01-22T11:36:35Z · BEFORE the fix was opened

There is a small mention of this in the completions README:
https://github.com/spf13/cobra/blob/6c3c1163c6df19860515103199e880122ba49e80/site/content/completions/_index.md?plain=1#L373

But any improvement to make this more obvious is welcomed

### Comment 3 · CONTRIBUTOR · 2025-01-22T11:47:33Z · BEFORE the fix was opened

Indeed https://github.com/spf13/cobra/blob/6c3c1163c6df19860515103199e880122ba49e80/site%2Fcontent%2Fcompletions%2F_index.md#descriptions-for-completions

## The fix

Pull request #2231, opened 2025-02-08T01:05:12Z, merged 2025-02-09T16:06:07Z. Title: feat: add CompletionWithDesc helper

Files changed (6):
- modified: active_help.go
- modified: command.go
- modified: completions.go
- modified: completions_test.go  [test]
- modified: site/content/active_help.md
- modified: site/content/completions/_index.md

## Test changes in the fix (1 file)

### modified: completions_test.go

```diff
@@ -2872,6 +2872,56 @@ func TestFixedCompletions(t *testing.T) {
 	}
 }
 
+func TestFixedCompletionsWithCompletionHelpers(t *testing.T) {
+	rootCmd := &Command{Use: "root", Args: NoArgs, Run: emptyRun}
+	// here we are mixing string, [Completion] and [CompletionWithDesc]
+	choices := []string{"apple", Completion("banana"), CompletionWithDesc("orange", "orange are orange")}
+	childCmd := &Command{
+		Use:               "child",
+		ValidArgsFunction: FixedCompletions(choices, ShellCompDirectiveNoFileComp),
+		Run:               emptyRun,
+	}
+	rootCmd.AddCommand(childCmd)
+
+	t.Run("completion with description", func(t *testing.T) {
+		output, err := executeCommand(rootCmd, ShellCompRequestCmd, "child", "a")
+		if err != nil {
+			t.Errorf("Unexpected error: %v", err)
+		}
+
+		expected := strings.Join([]string{
+			"apple",
+			"banana",
+			"orange\torange are orange", // this one has the description as expected with [ShellCompRequestCmd] flag
+			":4",
+			"Completion ended with directive: ShellCompDirectiveNoFileComp", "",
+		}, "\n")
+
+		if output != expected {
+			t.Errorf("expected: %q, got: %q", expected, output)
+		}
+	})
+
+	t.Run("completion with no description", func(t *testing.T) {
+		output, err := executeCommand(rootCmd, ShellCompNoDescRequestCmd, "child", "a")
+		if err != nil {
+			t.Errorf("Unexpected error: %v", err)
+		}
+
+		expected := strings.Join([]string{
+			"apple",
+			"banana",
+			"orange", // the description is absent as expected with [ShellCompNoDescRequestCmd] flag
+			":4",
+			"Completion ended with directive: ShellCompDirectiveNoFileComp", "",
+		}, "\n")
+
+		if output != expected {
+			t.Errorf("expected: %q, got: %q", expected, output)
+		}
+	})
+}
+
 func TestCompletionForGroupedFlags(t *testing.T) {
 	getCmd := func() *Command {
 		rootCmd := &Command{
```
