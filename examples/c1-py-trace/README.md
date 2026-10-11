# c1-py-trace

A tiny dependency-free Python project written for wave C1 so the trace's
answer is known by construction. Standard-library `unittest` only.

Run from this directory:

    python -m unittest tests.test_cart    # fails: the pinned bug
    python -m unittest tests.test_smoke   # passes

What the failing test deliberately exercises (the trace suite asserts each):

- `shop/cart.py`: a method (`Cart.add`), a nested function (`add`'s `line`),
  a lambda inside `Cart.total`'s getter, a `@property` getter whose twin
  setter is never called, a decorated function (`unit_price` under `priced`,
  whose `wrapper` is credited separately), and `unused_estimate`, which no
  test calls.
- `shop/__init__.py` runs module-level code only — it belongs in the trace's
  file list without contributing a function.
- `worker.py` runs only in a child Python process the test starts via
  `subprocess` — its `child_summary` must appear and `processes` must be 2.
- `tests/test_smoke.py` is the passing counterpart used for exit-code and
  streaming checks.
