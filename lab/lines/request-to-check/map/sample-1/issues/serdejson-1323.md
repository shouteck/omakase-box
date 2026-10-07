# serdejson-1323

Repository: serde-rs/json · Issue #1323 · Group: open · Created: 2026-05-21T13:37:39Z
Labels: none · Reporter's role: NONE

## Title

Parsing results in struct instead of array

## Body

Setup:

```rust
#[derive(serde::Deserialize, serde::Serialize, PartialEq, Debug, Clone)]
#[serde(untagged)]
pub enum IncludePathSegment {
    ObjectKey(String),
    ArrayIndex(usize),
}

#[derive(serde::Deserialize, serde::Serialize, PartialEq, Debug, Clone)]
pub struct IncludePath(pub Vec<IncludePathSegment>);

#[derive(serde::Deserialize, serde::Serialize, PartialEq, Debug, Clone)]
#[serde(untagged)]
pub enum IncludeItem {
    IncludeUrl(Url),
    IncludeFile(std::path::PathBuf),
}

fn default_include_path() -> IncludePath {
    IncludePath(vec![])
}

#[derive(serde::Deserialize, serde::Serialize, PartialEq, Debug, Clone)]
pub struct Include {
    pub include: IncludeItem,
    #[serde(default = "default_include_path")]
    pub at: IncludePath,
}

#[derive(serde::Deserialize, serde::Serialize, PartialEq, Debug, Clone)]
#[serde(untagged)]
pub enum ValueWithIncludes {
    Include(Include),
    Array(Vec<ValueWithIncludes>),
    Object(BTreeMap<String, ValueWithIncludes>),
    Other(serde_json::Value),
}
```

Assert:

```rust
        assert_eq!(
            serde_json::from_value::<ValueWithIncludes>(json!(["b"])).unwrap(),
            ValueWithIncludes::Array(vec![ValueWithIncludes::Other(serde_json::Value::String(
                "b".to_string()
            ))])
        );
```

Result:

```
assertion `left == right` failed
  left: Include(Include { include: IncludeFile("b"), at: IncludePath([]) })
 right: Array([Other(String("b"))])
```

Is it that it thinks of `Include` as of one-field tuple struct because the second field have default value?

## Comments (0)
