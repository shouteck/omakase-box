# serdejson-1123

Repository: serde-rs/json · Issue #1123 · Group: fixed · Created: 2024-04-15T19:59:34Z · Closed: 2024-04-16T05:03:36Z
Labels: none · Reporter's role: CONTRIBUTOR

## Title

features_check/error.rs interferes with static analysis

## Body

The file exists to trigger a compiler error when the user uses an invalid combination of features:
https://github.com/serde-rs/json/blob/2e15e3d7d53a68f78ff559709c57e4fa70584bb7/src/features_check/error.rs#L1

https://github.com/serde-rs/json/blob/2e15e3d7d53a68f78ff559709c57e4fa70584bb7/src/features_check/mod.rs#L10-L13

The invalid code interferes with static analysis tools like [cargo-geiger](https://crates.io/crates/cargo-geiger):
```
$ cargo-geiger --version
cargo-geiger 0.11.7
$ cargo geiger
...
Failed to parse file: /Users/user/.cargo/registry/src/index.crates.io-6f17d22bba15001f/serde_json-1.0.115/src/features_check/error.rs, Syn(Error("expected one of: `fn`, `extern`, `use`, `static`, `const`, `unsafe`, `mod`, `type`, `struct`, `enum`, `union`, `trait`, `auto`, `impl`, `default`, `macro`, identifier, `self`, `super`, `crate`, `::`"), "/Users/user/.cargo/registry/src/index.crates.io-6f17d22bba15001f/serde_json-1.0.115/src/features_check/error.rs") 
...
```

Let replace the invalid code with a call to the [`std::compile_error!`](https://doc.rust-lang.org/std/macro.compile_error.html) macro:
```rust
#[cfg(not(any(feature = "std", feature = "alloc")))] 
compile_error!("serde_json requires that either `std` (default) or `alloc` feature is enabled");
```

## Comments (0)

## The fix

Pull request #1124, opened 2024-04-15T20:13:15Z, merged 2024-04-16T05:03:36Z. Title: Replace `features_check` mod with a call to `std::compile_error!`.

Files changed (3):
- removed: src/features_check/error.rs
- removed: src/features_check/mod.rs
- modified: src/lib.rs

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
