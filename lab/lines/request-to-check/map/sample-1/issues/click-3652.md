# click-3652

Repository: pallets/click · Issue #3652 · Group: open · Created: 2026-06-29T20:09:14Z
Labels: help output · Reporter's role: NONE

## Title

Automatically append ellipsis (`...`) to metavars when `multiple=True` in options

## Body

When building a command-line interface with `click.option(..., multiple=True)`, the auto-generated usage string does not visually signal to the user that the option can be repeated. For instance, an option --foo=FOO looks identical whether it accepts single or multiple arguments. This is different from the common convention for multi-value items in shell interfaces often suggests adding an ellipsis like `--foo=FOO...`

Expected behavior if option "foo" has `multiple=True`:
```
Usage: script.py [OPTIONS]

Options:
  --foo TEXT...  A list of foo strings.
  --help         Show this message and exit.
```


## Comments (4)

### Comment 1 · MEMBER · 2026-06-29T21:48:24Z

I don't think that's a good indication that the option itself needs to be repeated. This seems like something we should expose to the customizable formatter when we eventually refactor that.

### Comment 2 · COLLABORATOR · 2026-06-30T05:26:50Z

I also noticed something similar in GNU conventions: `[OPTION]...`. But that seems to only applies in the usage leading line of the `--help` screens. I guess this topic needs a bit of research to at least make a survey of POSIX/GNU conventions and other popular tools and CLI frameworks in other languages.

### Comment 3 · COLLABORATOR · 2026-06-30T05:31:37Z

Also does `--foo TEXT...` means multiple `TEXT` values like `--foo TEXT1 TEXT2 TEXT3` or multiples `--foo` options like `--foo TEXT1 --foo TEXT2 --foo TEXT3`? 😏 So yeah, this looks like a rabbit hole I will not dive into. Not yet at least until we start thinking about the shape the customizable formatter should look like.

### Comment 4 · NONE · 2026-07-03T06:41:11Z

@kdeldycke yes the standard is to have `...` in the usage line  https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html#tag_12_01

I agree what I proposed is non-standard. While the exact implementation can be discussed, my point is that we need some easy way to indicate that an option can be specified multiple times. It shall be in the CLI's usage message, and shall be obvious to the user which could be human or agent today. 

There can be multiple ways to do it. For now in my project I can surely hardcode something like “can be specified multiple times” or use some meta programming to expand that `[OPTIONS]` in the usage line. But I wish we have something out-of-the-box.

