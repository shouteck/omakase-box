# serdejson-1214

Repository: serde-rs/json · Issue #1214 · Group: fixed · Created: 2024-11-15T11:35:35Z · Closed: 2024-11-17T01:25:30Z
Labels: none · Reporter's role: NONE

## Title

impl From<[T; N]> for Value

## Body

We have `impl From<&[T]> for Value` and `impl From<Vec<T>> for Value`, why don't we support the conversion from an array?

```rust
impl<T: Into<Value>, const N: usize> From<[T; N]> for Value {
    fn from(array: [T; N]) -> Self {
        let vec = array.into_iter().map(|v| v.into()).collect();
        Self::Array(vec)
    }
}
```

## Comments (0)

## The fix

Pull request #1215, opened 2024-11-17T01:20:12Z, merged 2024-11-17T01:25:29Z. Title: Implement From<[T; N]> for Value

Files changed (1):
- modified: src/value/from.rs

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
