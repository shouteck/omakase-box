# serdejson-1134

Repository: serde-rs/json · Issue #1134 · Group: fixed · Created: 2024-05-14T21:49:41Z · Closed: 2024-10-18T22:49:01Z
Labels: none · Reporter's role: CONTRIBUTOR

## Title

Implement `Deserializer` for `Map<String, Value>` and `&Map<String, Value>`

## Body

Sometimes I want to work with a `Value` that I know to be a json object. `Map<String, Value>` is the correct type to use for this but it is not possible to deserialize from a `Map<String, Value>` to a more concrete without going through `Value`. It would be nice if `Map<String, Value>` implemented `Deserializer`  so this all just works.

My actual use case is that I have a `&Map<String, Value>` that I would like to deserialize to a concrete struct, which is harder to come up with a workaround for. With an owned value I could just do `T::deserialize(Value::Object(map))` but that doesn't work for a reference.

## Comments (0)

## The fix

Pull request #1135, opened 2024-05-14T22:15:20Z, merged 2024-10-18T22:49:00Z. Title: Implement `Deserializer` for `Map<String, Value>` and `&Map<String, Value>`

Files changed (2):
- modified: src/map.rs
- modified: src/value/de.rs

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
