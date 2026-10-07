# serdejson-1225

Repository: serde-rs/json · Issue #1225 · Group: fixed · Created: 2025-01-06T14:28:58Z · Closed: 2025-01-07T00:21:15Z
Labels: none · Reporter's role: CONTRIBUTOR

## Title

Implement IntoValues and inner converter for Map

## Body

Hi @dtolnay!

I'm using the `map.rs` file in my personal project today, and I made some changes that may be useful for the upstream:

```rust
impl<K, V> From<MapImpl<K, V>> for Map<K, V> {
    fn from(map: MapImpl<K, V>) -> Self {
        Map { map }
    }
}

impl Map<String, Value> {
    /// Consumes the `Map`, returning the underlying Map implementation.
    pub fn into_inner(self) -> MapImpl {
        self.map
    }

    /// Gets an iterator over the values of the map.
    #[inline]
    pub fn into_values(self) -> IntoValues {
        IntoValues {
            iter: self.map.into_values(),
        }
    }
}

/// An owning iterator over a serde_json::Map's values.
pub struct IntoValues {
    iter: IntoValuesImpl,
}

#[cfg(not(feature = "preserve_order"))]
type IntoValuesImpl = btree_map::IntoValues<String, Value>;
#[cfg(feature = "preserve_order")]
type IntoValuesImpl = indexmap::map::IntoValues<String, Value>;

delegate_iterator!((IntoValues) => Value);
```

I'm willing to send a PR if this is desired to be included in the upstream.

Besides, the clippy workaround for derivable_impls seems resolved now. I remove it and no more new warnings.

## Comments (2)

### Comment 1 · MEMBER · 2025-01-06T15:34:01Z · BEFORE the fix was opened

`into_values` would be fine. The other 2 APIs in your suggestion would be misguided to add in serde_json. Either of those makes indexmap upgrades such as https://github.com/serde-rs/json/pull/1031 only doable across a major version of serde_json which is too disruptive.

### Comment 2 · CONTRIBUTOR · 2025-01-07T00:14:57Z · AFTER the fix was opened

@dtolnay Thanks for your information and that's a good point!

Submitted a PR at https://github.com/serde-rs/json/pull/1226.

> Out of the thread (for sharing):
>
> 1. I found this patch when developing [SPath](https://github.com/cratesland/spath/) (a JSONPath impl), while I later noticed that I can write a trait rather than making another `Value` struct.
> 2. Such an into_xxx function reminds me of the other PR I made https://github.com/rust-lang/rust/pull/133057. I just often find that if we can take the ownership, we can save a clone. But generally speaking, "move"s are often/always "memcpy" in Rust?

## The fix

Pull request #1226, opened 2025-01-07T00:11:31Z, merged 2025-01-07T00:21:14Z. Title: Add Map::into_values method

Files changed (1):
- modified: src/map.rs

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
