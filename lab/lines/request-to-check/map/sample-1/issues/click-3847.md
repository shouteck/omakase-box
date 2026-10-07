# click-3847

Repository: pallets/click · Issue #3847 · Group: open · Created: 2026-09-06T00:43:13Z
Labels: typing · Reporter's role: MEMBER

## Title

More private utilities that need to be marked and public api deprecated

## Body

In types.py
- [ ]  `convert_type` - rename to _convert_type - currently has no top level import
- [ ] `FuncParamType` - maybe typing thing? - currently has no top level import

In _ ?,
- [ ] consider deprecating 'open_file'

## Comments (9)

### Comment 1 · CONTRIBUTOR · 2026-09-10T13:49:59Z

Should `open_file` and `safecall` be made private as well?

I'm looking at adapting `pip-tools` to handle v8.5.0 this morning, and we have (this all looks weird to me)...
```python
my_file = click.open_file(filename, "w+b", atomic=True, lazy=True)
assert my_file is not None
if isinstance(my_file, click.utils.LazyFile):
    ctx.call_on_close(click.utils.safecall(my_file.close_intelligently))
```

I don't see any reason that anyone outside of `click` should ever use `safecall`: it's trivial to write it yourself. `open_file` doesn't seem good to expose if its return type won't be exposed. It's hard to figure out how to use it correctly in this case.

(We do want `close_intelligently()` since the target filename could be `"-"`.)

### Comment 2 · MEMBER · 2026-09-12T17:20:10Z

safe call is deprecated. It should issue a deprecation warning. I will have to check on the other. 

### Comment 3 · MEMBER · 2026-09-12T17:38:22Z

We will have to look at open_file. It is public on purpose but may need better type annotation or docs. 

### Comment 4 · CONTRIBUTOR · 2026-09-12T19:43:59Z

I didn't want to suggest too much at first, but maybe we can spec it out with a `typing.Protocol`? I'm happy to help out if you want to go that route.

And yeah, I didn't notice that `safecall` was also warning, since I fixed this "all at once" on my end.

### Comment 5 · MEMBER · 2026-09-12T20:46:39Z

Feel free to open an issue and propose a PR for what you think is best. I am always interested in type hints or docs that make usage clearer. 

### Comment 6 · MEMBER · 2026-09-18T15:22:45Z

I feel like `open_file` should be private, but I haven't looked enough. `atomic` should be deprecated, if I remember correctly it's not actually atomic and there are better libraries out there for atomic access. `lazy` is only useful for the `File` param type when opening a file for writing, and should be invisible to the public API. It shouldn't matter if it's lazy, it should just close silently.

### Comment 7 · CONTRIBUTOR · 2026-09-18T19:15:38Z

Aside: I didn't suggest a protocol because I didn't come up with a good name or home for it. Which might be a sign that it's not a great idea.

I'm not aware of a good, supported library for atomic/transactional writes. So if it becomes private, I'll probably review [this old thread](https://discuss.python.org/t/adding-atomicwrite-in-stdlib/11899) (which has lots of good notes and ideas) and roll my own. Which I'm okay with.

From my perspective:
- it's weird that `open_file` is exposed at all; it feels orthogonal to most of the concerns of `click` (even though it will be a pain for me, I'm in favor of making it private)
- it's arguable that even implementing `lazy=True` is outside of what `click` should be doing

I'm using `LazyFile` in a few places today, but I feel like the ideal path is to put together something that's a replacement and can be passed as a param type, but outside of `click`. Let the core library stay lean and focused.

### Comment 8 · MEMBER · 2026-09-18T19:23:44Z

> it feels orthogonal to most of the concerns of click

Yes, this is a general problem with the pallets libraries exposing so many utilities and customization points. We're trying to clean this up in general. See for example the next Werkzeug 3.2 release, which is a huge wall of deprecations.

### Comment 9 · MEMBER · 2026-09-20T13:33:21Z

The library I was thinking of was [atomicwrites](https://github.com/untitaker/python-atomicwrites), which is archived in favor of [`os.replace`](https://docs.python.org/3.14/library/os.html#os.replace) or [`os.rename`](https://docs.python.org/3.14/library/os.html#os.rename). Those are both documented as atomic.

The simplest answer for lazy is probably to use `Path` instead of `File` param types, and handle opening the file yourself when you write. That's probably a lot simpler than all the stuff we have to go through for `File` anyway.
