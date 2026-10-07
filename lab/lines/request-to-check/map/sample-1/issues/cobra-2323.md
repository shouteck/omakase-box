# cobra-2323

Repository: spf13/cobra · Issue #2323 · Group: fixed · Created: 2025-11-03T09:29:24Z · Closed: 2025-11-18T03:33:28Z
Labels: none · Reporter's role: CONTRIBUTOR

## Title

Refactor: make minUsagePadding a constant

## Body

### Summary

The variable [minUsagePadding](https://github.com/spf13/cobra/blob/main/command.go#L560) is currently defined as a package-level variable, but it represents a fixed configuration value that never changes at runtime.
It would be more idiomatic and safer in Go to define it as a constant.

### Current Code

```go
var minUsagePadding = 25
```

### Proposed Change

Change it to:

```go
const minUsagePadding = 25
```

### Rationale

* The value is immutable and conceptually a compile-time constant.
* Using `const` makes the intention clearer to readers and contributors.
* It prevents any accidental modification at runtime and improves code safety.

### Impact

This change is fully backward compatible and has no functional impact on behavior.
It only improves clarity and maintainability of the codebase.


## Comments (0)

## The fix

Pull request #2325, opened 2025-11-12T21:24:28Z, merged 2025-11-18T03:33:27Z. Title: refactor: change minUsagePadding from var to const

Files changed (1):
- modified: command.go

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
