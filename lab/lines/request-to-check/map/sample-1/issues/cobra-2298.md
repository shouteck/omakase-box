# cobra-2298

Repository: spf13/cobra · Issue #2298 · Group: fixed · Created: 2025-07-29T18:16:11Z · Closed: 2025-11-17T14:47:20Z
Labels: none · Reporter's role: NONE

## Title

[Docs] Requesting info on repeated flags

## Body

Hello!
In some programs such as SSH I can repeat the -v flag in their CLI to invoke different behaviors. For example -v will print info level logs, while `-v -v`, or `-vv` will print debug level logs, and `-vvv, -v -v -v` will be more verbose and so on. 

I'd like to know if this is possible, and how to do it programmatically.

If the info is provided in this issue, I'd be happy to put it into a PR for the user guide to complete this request.

## Comments (5)

### Comment 1 · COLLABORATOR · 2025-07-30T03:39:20Z · BEFORE the fix was opened

Cobra, through spf13/pflag supports repeating flags but not in the way you describe above (at least I’m not aware of anything like that).

Repeating flags will be something like `adduser -u user1 -u user2 -u user3`. The type of flag that repeat are the ones named `*Array` and `*Slice` in the pflag api. 

To achieve something like `-vv` and `-vvv` in cobra you will need to use different long flags for each incantation: `--vv` and `--vvv` (notice the double `-` used for long flags).  

If we compare to your example,  from a programming point of view it’s the same in my mind, the difference is in the user experience with:
- the double `-`
-  the fact that you can not split `--vv` into `-v -v`

### Comment 2 · NONE · 2025-07-30T14:37:02Z · BEFORE the fix was opened

  @marckhouzam  Interesting. would you like a PR for docs on this?

### Comment 3 · COLLABORATOR · 2025-07-30T15:49:26Z · BEFORE the fix was opened

That would be nice. I notice we don’t have any doc about repeating flags

### Comment 4 · NONE · 2025-08-01T18:03:30Z · BEFORE the fix was opened

Sounds good, I'll work a PR tonight 👍🏻 

### Comment 5 · CONTRIBUTOR · 2025-08-18T17:03:14Z · BEFORE the fix was opened

spf13/pflag does actually have CountVar() CountVarP() function to define a flag just like that AFAICT but I have never used a count flag myself so I don't know.

https://pkg.go.dev/github.com/spf13/pflag@v1.0.7#FlagSet.CountVar

## The fix

Pull request #2316, opened 2025-10-03T03:19:52Z, merged 2025-11-17T14:47:19Z. Title: Add documentation for repeated flags functionality

Files changed (1):
- modified: site/content/user_guide.md

## Test changes in the fix (0 files)

None: the fix changed no file whose path looks like a test.
