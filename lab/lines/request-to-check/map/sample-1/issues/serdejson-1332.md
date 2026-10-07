# serdejson-1332

Repository: serde-rs/json · Issue #1332 · Group: open · Created: 2026-07-17T22:55:21Z
Labels: none · Reporter's role: NONE

## Title

[benchmark] Request for call-path / fairness review (GLD.SerializerBenchmark)

## Body

Hello,

I'm Leonid Ganeline. We maintain an open multi-language serializer benchmark:

https://github.com/leo-gan/GLD.SerializerBenchmark

Your library is included in the suite (language: rust, harness name: `serde_json`).
Implementation we use:

https://github.com/leo-gan/GLD.SerializerBenchmark/blob/master/rust/src/serializers/json.rs

We would value a short review of whether our measurement is fair and idiomatic:

1. Does our call pattern match how you recommend using the library in performance-sensitive code?
2. Should we change options, encoder/decoder reuse, types, or buffer handling?
3. Is there a better API (or a second entry point worth a separate row in the suite)?

Concrete notes or a small PR against that wrapper would help a lot. We are happy to credit you in the docs.

The repo also includes a short Serialization course (101–401). If something important about your design is easy to misstate, a pointer is welcome—we can update the docs ourselves.

Thank you for maintaining this library.

Best regards,
Leonid Ganeline


## Comments (0)
