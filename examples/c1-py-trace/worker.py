"""Runs only as a child process: tests/test_cart.py starts it via subprocess.
`child_summary` must appear in the trace even though no in-process frame ever
calls it."""
import sys


def child_summary(quantity):
    return quantity * 3


if __name__ == '__main__':
    print('worker says', child_summary(int(sys.argv[1])))
