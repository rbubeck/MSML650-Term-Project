
import csv
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_ROOT / "Scripts" / "evaluate_librispeech.py"


class TestLibriSpeechEvaluator(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        self.references_file = self.temp_path / "references.csv"
        self.hypotheses_dir = self.temp_path / "hypotheses"
        self.output_dir = self.temp_path / "output"

        self.hypotheses_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def create_references(self, rows, fieldnames=None):
        if fieldnames is None:
            fieldnames = ["id", "reference_text"]

        with open(
            self.references_file,
            "w",
            newline="",
            encoding="utf-8",
        ) as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    def create_hypothesis(self, sample_id, text):
        hypothesis_file = self.hypotheses_dir / f"{sample_id}.txt"
        hypothesis_file.write_text(text, encoding="utf-8")

    def run_evaluator(self, references=None, hypotheses=None, output=None):
        if references is None:
            references = self.references_file

        if hypotheses is None:
            hypotheses = self.hypotheses_dir

        if output is None:
            output = self.output_dir

        command = [
            sys.executable,
            str(SCRIPT_PATH),
            "--references",
            str(references),
            "--hypotheses",
            str(hypotheses),
            "--output",
            str(output),
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )

        return result, Path(output)

    def test_exact_match_produces_zero_wer(self):
        self.create_references([
            {
                "id": "sample001",
                "reference_text": "the cat sat on the mat",
            }
        ])

        self.create_hypothesis(
            "sample001",
            "the cat sat on the mat",
        )

        result, output = self.run_evaluator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((output / "wer_individual.csv").exists())
        self.assertTrue((output / "wer_summary.csv").exists())

        with open(
            output / "wer_individual.csv",
            newline="",
            encoding="utf-8",
        ) as file:
            rows = list(csv.DictReader(file))

        self.assertEqual(len(rows), 1)
        self.assertEqual(int(rows[0]["substitutions"]), 0)
        self.assertEqual(int(rows[0]["deletions"]), 0)
        self.assertEqual(int(rows[0]["insertions"]), 0)

    def test_missing_hypotheses_are_counted(self):
        self.create_references([
            {
                "id": "sample001",
                "reference_text": "the cat sat",
            },
            {
                "id": "sample002",
                "reference_text": "the dog ran",
            },
        ])

        self.create_hypothesis("sample001", "the cat sat")

        result, output = self.run_evaluator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1", result.stdout)

        with open(
            output / "wer_summary.csv",
            newline="",
            encoding="utf-8",
        ) as file:
            summary = file.read()

        self.assertIn("1", summary)

    def test_aggregate_wer_calculation(self):
        self.create_references([
            {
                "id": "sample001",
                "reference_text": "the cat",
            },
            {
                "id": "sample002",
                "reference_text": "the dog runs very fast today",
            },
        ])

        self.create_hypothesis("sample001", "the dog")
        self.create_hypothesis(
            "sample002",
            "the dog runs very fast today",
        )

        result, output = self.run_evaluator()

        self.assertEqual(result.returncode, 0, result.stderr)

        with open(
            output / "wer_summary.csv",
            newline="",
            encoding="utf-8",
        ) as file:
            summary = file.read()

        # One substitution across seven reference words = 14.2857%.
        self.assertIn("12.5", summary)

    def test_empty_reference_is_skipped(self):
        self.create_references([
            {
                "id": "sample001",
                "reference_text": "",
            },
            {
                "id": "sample002",
                "reference_text": "the cat sat",
            },
        ])

        self.create_hypothesis("sample001", "some words")
        self.create_hypothesis("sample002", "the cat sat")

        result, output = self.run_evaluator()

        self.assertEqual(result.returncode, 0, result.stderr)
        
        with open(
            output / "wer_individual.csv",
            newline="",
            encoding="utf-8",
        ) as file:
            rows = list(csv.DictReader(file))

        self.assertEqual(len(rows), 1)

    def test_invalid_reference_csv_headers(self):
        self.create_references(
            [{"sample_id": "sample001", "text": "the cat"}],
            fieldnames=["sample_id", "text"],
        )

        result, _ = self.run_evaluator()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("id", result.stderr.lower())

    def test_missing_reference_csv(self):
        missing = self.temp_path / "missing_references.csv"

        result, _ = self.run_evaluator(references=missing)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Reference CSV not found", result.stderr)

    def test_missing_hypothesis_directory(self):
        # Create a valid reference file first.
        # This ensures the evaluator reaches the hypothesis-directory check.
        self.create_references([
            {
                "id": "sample001",
                "reference_text": "the cat sat",
            }
        ])

        missing = self.temp_path / "missing_hypotheses"

        result, _ = self.run_evaluator(hypotheses=missing)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "Hypothesis directory not found",
            result.stderr,
        )

    def test_no_matching_hypotheses(self):
        self.create_references([
            {
                "id": "sample001",
                "reference_text": "the cat sat",
            }
        ])

        # No hypothesis file is created for sample001.
        result, _ = self.run_evaluator()

        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
