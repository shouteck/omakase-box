# cobra-2507

Repository: spf13/cobra · Issue #2507 · Group: open · Created: 2026-09-24T15:12:13Z
Labels: none · Reporter's role: NONE

## Title

Eq panics for two individually supported operand types

## Body

### Description

The exported template helper `Eq` documents that it supports `int` and `string` values and that unsupported types panic. Its implementation dispatches only on the first operand, then calls the corresponding reflection accessor on the second operand. Two individually supported values of different kinds therefore panic instead of returning `false` or producing a clear same-kind precondition error.

### Steps to reproduce

```go
package main

import "github.com/spf13/cobra"

func main() {
    _ = cobra.Eq(1, "1")
}
```

The first operand selects the signed-integer branch, while `reflect.Value.Int()` panics on the string second operand.

### Expected behavior

The documentation should define whether mixed supported kinds are rejected, return `false`, or otherwise handled consistently. If the intended contract is that both operands must have the same kind, the helper should either validate that precondition or document it clearly.

### Actual behavior

`cobra.Eq(1, "1")` panics with a reflection `ValueError`.

I searched existing issues and pull requests for mixed-type or unsupported-type calls to `Eq` and did not find a matching report. The helper is marked compatibility-only and intended for removal in Cobra v2, so a small issue-first clarification may be preferable to a behavioral patch.


## Comments (2)

### Comment 1 · NONE · 2026-09-25T01:09:08Z

Opened a fix in #2508 — mixed int/string now returns false instead of panicking.

### Comment 2 · NONE · 2026-09-25T12:33:45Z

Happy to Contribute...
