# serdejson-1335

Repository: serde-rs/json · Issue #1335 · Group: open · Created: 2026-08-01T15:13:08Z
Labels: none · Reporter's role: NONE

## Title

#[serde(flatten)]ed Map<&str, RawValue> member errors with "invalid type: newtype struct, expected any valid JSON value" if any flattened keys are present

## Body

I repro this locally with serde_json 1.0.151:
```rust
#[derive(serde::Deserialize, Debug, Clone)]
pub struct IspData<'g> {
    #[serde(default)]
    isp: Option<String>,

    #[serde(default, rename = "isp-tags")]
    isp_tags: Option<Vec<String>>,

    #[serde(flatten, borrow)]
    garbage: std::collections::BTreeMap<&'g str, &'g serde_json::value::RawValue>,

    #[serde(default, borrow)]
    optraw: Option<&'g serde_json::value::RawValue>,

    #[serde(default, borrow)]
    optseq: Option<Vec<&'g serde_json::value::RawValue>>,
}
fn main() {
    dbg!(serde_json::from_str::<IspData<'static>>("{}"));
    dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\"}"));
    dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\",\"isp-tags\":[]}"));
    dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\",\"isp-tags\":[\"cde\"]}"));
    dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\",\"isp-tags\":[\"cde\"],\"optraw\":1234}"));
    dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\",\"isp-tags\":[\"cde\"],\"optraw\":1234,\"optseq\":[123,\"abc\"]}"));
    dbg!(serde_json::from_str::<IspData<'static>>("{\"isp\":\"abc\",\"isp-tags\":[\"cde\"],\"optraw\":1234,\"another garbage\":123}"));
}
```

All of these parse as expected ([playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=7a7779f123190a4a013d6c0ba4e27931)), except the "another garbage" line which returns `Err(Error("invalid type: newtype struct, expected any valid JSON value", line: 1, column: 68))`.

Thus, AFAICT: the deserialiser incorrectly fails when deserialising structs with a `#[serde(flatten)]`ed map member with a `RawValue` value *and* one would be stored in the map.

## Comments (1)

### Comment 1 · NONE · 2026-10-05T11:27:47Z

I'd like to work on this
