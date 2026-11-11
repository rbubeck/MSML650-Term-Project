
import csv
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TestBatchWerCommandLine(unittest.TestCase):
    """Tests for batch WER evaluation."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def create_transcript(self, filename, text):
        path = self.temp_path / filename
        path.write_text(text, encoding="utf-8")
        return path

    def create_manifest(self, rows, fieldnames=None):
        manifest = self.temp_path / "manifest.csv"

        if fieldnames is None:
            fieldnames = ["reference_file", "hypothesis_file"]

        with manifest.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        return manifest

    def run_evaluator(self, manifest, output=None):
        if output is None:
            output = self.temp_path / "results.csv"

        return subprocess.run(
            [
                sys.executable,
                "-m", "evaluation.scripts.evaluate_wer_batch",
                "--manifest", str(manifest),
                "--output", str(output),
            ],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        ), output

    def test_aggregate_wer_uses_total_reference_words(self):
        # First sample: 1 substitution across 2 reference words.
        ref1 = self.create_transcript("ref1.txt", "the cat")
        hyp1 = self.create_transcript("hyp1.txt", "the dog")

        # Second sample: exact match across 4 reference words.
        ref2 = self.create_transcript(
            "ref2.txt", "the dog ran very fast"
        )
        hyp2 = self.create_transcript(
            "hyp2.txt", "the dog ran very fast"
        )

        manifest = self.create_manifest([
            {
                "reference_file": str(ref1),
                "hypothesis_file": str(hyp1),
            },
            {
                "reference_file": str(ref2),
                "hypothesis_file": str(hyp2),
            },
        ])

        result, output = self.run_evaluator(manifest)

        self.assertEqual(result.returncode, 0, result.stderr)

        with output.open(newline="", encoding="utf-8") as file:
            rows = list(csv.DictReader(file))

        self.assertEqual(len(rows), 2)

        # Total edits = 1; total reference words = 7.
        # Aggregate WER = 1 / 7 * 100 = 14.2857%.
        self.assertAlmostEqual(
            float(result.stdout.split("Aggregate WER:")[1].split("%")[0]),
            14.29,
            places=2,
        )

    def test_individual_results_are_written(self):
        ref = self.create_transcript("reference.txt", "the cat sat")
        hyp = self.create_transcript("hypothesis.txt", "the dog sat")

        manifest = self.create_manifest([
            {
                "reference_file": str(ref),
                "hypothesis_file": str(hyp),
            }
        ])

        result, output = self.run_evaluator(manifest)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(output.is_file())

        with output.open(newline="", encoding="utf-8") as file:
            rows = list(csv.DictReader(file))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["substitutions"], "1")
        self.assertEqual(rows[0]["deletions"], "0")
        self.assertEqual(rows[0]["insertions"], "0")
        self.assertEqual(rows[0]["status"], "success")
        self.assertEqual(rows[0]["wer_percent"], "33.3333")

    def test_missing_manifest(self):
        missing = self.temp_path / "missing.csv"

        result, _ = self.run_evaluator(missing)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Manifest not found", result.stderr)

    def test_invalid_manifest_headers(self):
        manifest = self.create_manifest(
            [{"file": "reference.txt"}],
            fieldnames=["file"],
        )

        result, _ = self.run_evaluator(manifest)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "Manifest must contain columns",
            result.stderr,
        )

    def test_missing_hypothesis_file(self):
        ref = self.create_transcript("reference.txt", "the cat sat")

        manifest = self.create_manifest([
            {
                "reference_file": str(ref),
                "hypothesis_file": str(self.temp_path / "missing.txt"),
            }
        ])

        result, _ = self.run_evaluator(manifest)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hypothesis file not found", result.stderr)

    def test_empty_manifest(self):
        manifest = self.create_manifest([])

        result, _ = self.run_evaluator(manifest)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "Manifest contains no transcript pairs",
            result.stderr,
        )

    def test_batch_handles_empty_hypothesis(self):
        ref = self.create_transcript("empty_ref.txt", "the cat sat")
        hyp = self.create_transcript("empty_hyp.txt", "")

        manifest = self.create_manifest([
            {
                "reference_file": str(ref),
                "hypothesis_file": str(hyp),
            }
        ])

        result, output = self.run_evaluator(manifest)

        self.assertEqual(result.returncode, 0, result.stderr)

        with output.open(newline="", encoding="utf-8") as file:
            row = next(csv.DictReader(file))

        self.assertEqual(row["reference_words"], "3")
        self.assertEqual(row["hypothesis_words"], "0")
        self.assertEqual(row["deletions"], "3")
        self.assertEqual(row["wer_percent"], "100.0")


if __name__ == "__main__":
    unittest.main()
