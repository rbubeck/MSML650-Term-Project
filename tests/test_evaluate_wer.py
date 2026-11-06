
import csv
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

from evaluation.scripts.evaluate_wer import normalize_text, align_words

class TestNormalizeText(unittest.TestCase):
    """Tests for transcript text normalization."""

    def test_lowercase_conversion(self):
        self.assertEqual(
            normalize_text("HELLO WORLD"),
            "hello world"
        )

    def test_punctuation_removal(self):
        self.assertEqual(
            normalize_text("Hello, world! How are you?"),
            "hello world how are you"
        )

    def test_extra_whitespace(self):
        self.assertEqual(
            normalize_text("  hello   world   "),
            "hello world"
        )

    def test_combined_normalization(self):
        self.assertEqual(
            normalize_text("  HELLO,   WORLD!  "),
            "hello world"
        )

    def test_unicode_normalization(self):
        self.assertEqual(
            normalize_text("café"),
            normalize_text("cafe\u0301")
        )


class TestAlignWords(unittest.TestCase):
    """Tests for word-level alignment and edit counting."""

    def test_exact_match(self):
        result = align_words(
            ["the", "cat", "sat"],
            ["the", "cat", "sat"]
        )
        self.assertEqual(result, (0, 0, 0, 0))

    def test_one_substitution(self):
        result = align_words(
            ["the", "cat", "sat"],
            ["the", "dog", "sat"]
        )
        self.assertEqual(result, (1, 0, 0, 1))

    def test_one_deletion(self):
        result = align_words(
            ["the", "cat", "sat"],
            ["the", "sat"]
        )
        self.assertEqual(result, (0, 1, 0, 1))

    def test_one_insertion(self):
        result = align_words(
            ["the", "cat"],
            ["the", "small", "cat"]
        )
        self.assertEqual(result, (0, 0, 1, 1))

    def test_multiple_errors(self):
        result = align_words(
            ["the", "cat", "sat"],
            ["the", "dog", "ran", "quickly"]
        )
        substitutions, deletions, insertions, edits = result

        self.assertEqual(
            substitutions + deletions + insertions,
            edits
        )
        self.assertEqual(edits, 3)

    def test_empty_hypothesis(self):
        result = align_words(
            ["the", "cat", "sat"],
            []
        )
        self.assertEqual(result, (0, 3, 0, 3))

    def test_empty_reference(self):
        result = align_words(
            [],
            ["the", "cat"]
        )
        self.assertEqual(result, (0, 0, 2, 2))

    def test_both_empty(self):
        result = align_words([], [])
        self.assertEqual(result, (0, 0, 0, 0))


class TestWerCommandLine(unittest.TestCase):
    """Tests for the complete individual WER command-line workflow."""

    def test_csv_output_for_exact_match(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            reference = temp_path / "reference.txt"
            hypothesis = temp_path / "hypothesis.txt"
            output = temp_path / "results.csv"

            reference.write_text(
                "The cat sat on the mat.",
                encoding="utf-8"
            )
            hypothesis.write_text(
                "the cat sat on the mat",
                encoding="utf-8"
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "-m", "evaluation.scripts.evaluate_wer",
                    "--reference", str(reference),
                    "--hypothesis", str(hypothesis),
                    "--output", str(output),
                ],
                capture_output=True,
                text=True,
                cwd=PROJECT_ROOT,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(output.is_file())

            with output.open(
                newline="", encoding="utf-8"
            ) as file:
                rows = list(csv.DictReader(file))

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["reference_words"], "6")
            self.assertEqual(rows[0]["substitutions"], "0")
            self.assertEqual(rows[0]["deletions"], "0")
            self.assertEqual(rows[0]["insertions"], "0")
            self.assertEqual(rows[0]["wer_percent"], "0.0")

    def test_empty_hypothesis_produces_100_percent_wer(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            reference = temp_path / "reference.txt"
            hypothesis = temp_path / "hypothesis.txt"
            output = temp_path / "results.csv"

            reference.write_text("the cat sat", encoding="utf-8")
            hypothesis.write_text("", encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m", "evaluation.scripts.evaluate_wer",
                    "--reference", str(reference),
                    "--hypothesis", str(hypothesis),
                    "--output", str(output),
                ],
                capture_output=True,
                text=True,
                cwd=PROJECT_ROOT,
            )

            self.assertEqual(result.returncode, 0, result.stderr)

            with output.open(
                newline="", encoding="utf-8"
            ) as file:
                row = next(csv.DictReader(file))

            self.assertEqual(row["deletions"], "3")
            self.assertEqual(row["wer_percent"], "100.0")

    def test_missing_reference_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            hypothesis = temp_path / "hypothesis.txt"
            hypothesis.write_text("hello world", encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m", "evaluation.scripts.evaluate_wer",
                    "--reference", str(temp_path / "missing.txt"),
                    "--hypothesis", str(hypothesis),
                ],
                capture_output=True,
                text=True,
                cwd=PROJECT_ROOT,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("File not found", result.stderr)

    def test_empty_reference_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            reference = temp_path / "reference.txt"
            hypothesis = temp_path / "hypothesis.txt"

            reference.write_text("   ", encoding="utf-8")
            hypothesis.write_text("hello world", encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    "-m", "evaluation.scripts.evaluate_wer",
                    "--reference", str(reference),
                    "--hypothesis", str(hypothesis),
                ],
                capture_output=True,
                text=True,
                cwd=PROJECT_ROOT,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "reference transcript contains no words",
                result.stderr.lower()
            )


if __name__ == "__main__":
    unittest.main()
