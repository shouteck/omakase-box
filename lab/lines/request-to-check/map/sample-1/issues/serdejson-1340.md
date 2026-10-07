# serdejson-1340

Repository: serde-rs/json · Issue #1340 · Group: open · Created: 2026-09-15T17:34:14Z
Labels: none · Reporter's role: NONE

## Title

Arbitrary precision float serialization output changed in `serde_json` version `1.0.149`

## Body

I'm not sure if it's a bug or intended behavior, but I prefer to report it. I expect the output of `serde_json` to be stable across updates, however the recently released version `1.0.149` changed the serialization of large floats.

The following code passes the test with `serde_json` version `1.0.148` but fails with version `1.0.149` and later:

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

In `serde_json` version `1.0.149`, the value is serialized as `1e+400` instead of `1e400`. It produces the following issue:

```
running 1 test
test test_num ... FAILED

failures:

---- test_num stdout ----

thread 'test_num' (2358226) panicked at serde_json1_0_149/src/lib.rs:11:5:
assertion `left == right` failed
  left: "1e+400"
 right: "1e400"
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    test_num

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

I believe that this caused by the recent update to `zmij` version `1.0`.

## Comments (0)
