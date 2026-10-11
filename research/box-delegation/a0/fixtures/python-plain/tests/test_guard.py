import unittest

from textstats import word_count


class Guard(unittest.TestCase):
    def test_single_spaces(self):
        self.assertEqual(word_count("a b c"), 3)


if __name__ == "__main__":
    unittest.main()
