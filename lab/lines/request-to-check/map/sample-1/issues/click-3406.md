# click-3406

Repository: pallets/click · Issue #3406 · Group: open · Created: 2026-05-04T20:01:47Z
Labels: typing · Reporter's role: COLLABORATOR

## Title

Migrate sentinels to use Python 3.15's PEP 661 `sentinel` built-in with typing_extensions backport

## Body

Migrate sentinel values like at `src/click/_utils.py` to use the introduced `sentinel` built-in coming in Python 3.15. For older versions we can use [`typing_extenions.sentinel`](https://typing-extensions.readthedocs.io/en/latest/index.html#typing_extensions.sentinel).

## Comments (0)
