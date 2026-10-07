# serdejson-1164

Repository: serde-rs/json · Issue #1164 · Group: fixed · Created: 2024-08-01T19:42:15Z · Closed: 2024-08-01T21:26:51Z
Labels: none · Reporter's role: NONE

## Title

`json!` unusable with `no_std` and feature `alloc`

## Body

When you use an array inside the `json!` macro, the expansion calls `vec!` unqualified. This is a problem in a `no_std` environment, because it requires the user to `use alloc::vec`. Which is weird and no expected from a macro.

Reproducer on rustexplorer: https://www.rustexplorer.com/b#LyoKW2RlcGVuZGVuY2llc10Kc2VyZGVfanNvbiA9IHsgdmVyc2lvbiA9ICIxLjAuMTIwIiwgZGVmYXVsdC1mZWF0dXJlcyA9IGZhbHNlLCBmZWF0dXJlcyA9IFsiYWxsb2MiXSB9CiovCgojIVtub19zdGRdCgpleHRlcm4gY3JhdGUgYWxsb2M7CgpmbiBtYWluKCkgewogICAgc2VyZGVfanNvbjo6anNvbiEoWyIiLCAiIl0pOwp9Cg==

Code: 
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

I think this issue has a simple solution by changing `vec!` to `::alloc::vec!`, unless I'm missing something.

## Comments (1)

### Comment 1 · NONE · 2024-08-01T21:39:09Z · AFTER the fix was opened

Wow that was quick. Thank you.

## The fix

Pull request #1166, opened 2024-08-01T21:23:03Z, merged 2024-08-01T21:26:50Z. Title: Fix `json!` invocations when std prelude is not in scope

Files changed (2):
- modified: src/lib.rs
- modified: src/macros.rs

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
