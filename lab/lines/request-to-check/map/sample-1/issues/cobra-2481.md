# cobra-2481

Repository: spf13/cobra · Issue #2481 · Group: open · Created: 2026-08-10T10:15:46Z
Labels: none · Reporter's role: NONE

## Title

PowerShell autocompletion script fails with runtime errors on empty or single-item completions

## Body

### Description
Cobra's generated PowerShell completion script fails with runtime exceptions in various edge cases due to how it parses and filters the completion output array (`$Out`):

1. **Null Pointer/MethodNotFound Exceptions on Empty Outputs:**
   If a command execution returns no output (for example, if the CLI binary crashes, fails or simply yields no completions and stdout is empty), the array `$Out` is empty. The generated script calls `$Out[-1].TrimStart(':')` without checking if `$Out` contains any elements. This throws a fatal PowerShell error:
   ```text
   You cannot call a method on a null-valued expression.
   ```

2. **System.Char vs. String Type Confusion:**
   PowerShell pipelines automatically unwrap arrays containing exactly one element into a scalar object (such as `System.String`). In the next execution phase, querying `$Out[-1]` returns a `System.Char` instead of a `System.String`. Since `System.Char` does not have a `TrimStart` method, calling it throws:
   ```text
   Method invocation failed because [System.Char] does not contain a method named 'TrimStart'.
   ```

3. **Filtering Collision on Identical String Values:**
   To strip the directive (which is the last element of the output, such as `:4`), the script uses:
   ```powershell
   $Out = $Out | Where-Object { $_ -ne $Out[-1] }
   ```
   Instead of removing only the last item by index, this filters out all items matching the value of the last item. If a command legitimately outputs a completion item that matches the directive string (such as when a flag or argument completes to the string `":0"`), it is incorrectly stripped.

### Root Cause Analysis
In `powershell_completions.go` inside the shell script template, the generated script assumes `$Out` is always a populated array with string elements:

```powershell
    #call the command store the output in $out and redirect stderr and stdout to null
    Invoke-Expression -OutVariable out "$RequestComp" 2>&1 | Out-Null

    # get directive from last line
    [int]$Directive = $Out[-1].TrimStart(':')
    if ($Directive -eq "") {
        $Directive = 0
    }

    # remove directive (last element) from out
    $Out = $Out | Where-Object { $_ -ne $Out[-1] }
```

### Proposed Fix
Modify the template inside `powershell_completions.go` to safely check the size of the array, convert the directive to an integer defensively and strip the last item cleanly by index using `Select-Object`:

```go
	$Directive = 0
	if ($Out.Count -gt 0) {
		$DirectiveStr = $Out[-1].TrimStart(':')
		if ($DirectiveStr -ne "") {
			$Directive = [int]$DirectiveStr
		}
		$Out = $Out | Select-Object -First ($Out.Count - 1)
	}
	__%[1]s_debug "The completion directive is: $Directive"
	__%[1]s_debug "The completions are: $Out"
```


## Comments (0)
