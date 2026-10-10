import subprocess
import sys
import unittest
from pathlib import Path

from shop.cart import Cart

ROOT = Path(__file__).resolve().parent.parent


class CartTest(unittest.TestCase):
    def test_total(self):
        cart = Cart()
        cart.add('apple', 2)
        cart.add('pear', 3)
        # Follow the test into a child Python process: worker.py runs only here.
        subprocess.run([sys.executable, 'worker.py', '7'], cwd=ROOT, check=True)
        # The pinned bug: the real total is 5.50, the test demands 99.99.
        self.assertEqual(cart.total, 99.99)


if __name__ == '__main__':
    unittest.main()
