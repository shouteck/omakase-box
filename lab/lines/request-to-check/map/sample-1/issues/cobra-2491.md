# cobra-2491

Repository: spf13/cobra · Issue #2491 · Group: open · Created: 2026-08-28T06:55:48Z
Labels: none · Reporter's role: NONE

## Title

Feature Request: Allow optional values in map flags (e.g., StringToStringOptional)

## Body

**Is your feature request related to a problem? Please describe.**
Currently, when using `StringToStringVar` or `StringToStringVarP`, the user is strictly forced to provide arguments in the `key=value` format. If a user provides just `key` without the equal sign, the `pflag` parser immediately returns a `csv string must be in the form key=value` error.

In many CLI applications, developers need to accept a list of items where the value (like an alias, tag, or override) is optional. 
For example, a daemon accepting network MAC addresses with an optional alias: 
`--bssids 7E:BC:07:E8:67:47,AA:BB:CC:DD:EE:FF=Work`

**Describe the solution you'd like**
It would be highly beneficial to have native support for optional values in map-based flags. This could be achieved by:
1. Adding a new flag type like `StringToStringOptional` (and its variations) where a missing `=` separator simply defaults the map value to an empty string `""`.
2. Modifying the existing map flag implementations to accept an option that relaxes the strict `key=value` requirement.

**Describe alternatives you've considered**
Currently, to achieve this behavior, developers have to reinvent the wheel by either:
1. Falling back to a standard `StringSliceVar` and manually iterating over the slice to parse it with `strings.Cut(val, "=")` in their `Run` function.
2. Writing a boilerplate custom `pflag.Value` implementation just to bypass the strict parsing check.

**Additional context**
I understand that the actual parsing logic lives upstream in `spf13/pflag`, but since Cobra manages the flag integration and CLI ergonomics, I wanted to open the discussion here regarding the API surface and whether this is a feature the team would welcome a PR for.

## Comments (1)

### Comment 1 · NONE · 2026-09-26T13:16:37Z

I'd like to implement this feature. On the pflag side, I'm thinking of adding a new variant to StringToStringVar (something like StringToStringOptional) — so that when the "=" is missing, the value defaults to "". Let me share the proposed API (function signature), and if you approve, I'll start on the PR.
