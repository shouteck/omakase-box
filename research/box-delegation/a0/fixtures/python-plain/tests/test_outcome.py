import unittest

from textstats import word_count


class Outcome(unittest.TestCase):
    def test_repeated_whitespace_and_empty(self):
        self.assertEqual(word_count("a  b"), 2)
        self.assertEqual(word_count(""), 0)


if __name__ == "__main__":
    unittest.main()
