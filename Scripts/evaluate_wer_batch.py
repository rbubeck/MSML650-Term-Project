
#!/usr/bin/env python3
"""Evaluate multiple transcript pairs and calculate aggregate WER."""

import argparse
import csv
from pathlib import Path

from evaluate_wer import align_words, normalize_text


def read_transcript(path):
    return normalize_text(Path(path).read_text(encoding="utf-8-sig")).split()


def main():
    parser = argparse.ArgumentParser(
        description="Calculate WER for multiple transcript pairs from a CSV manifest."
    )
    parser.add_argument(
        "--manifest",
        required=True,
        help="CSV with columns reference_file and hypothesis_file",
    )
    parser.add_argument(
        "--output",
        default="Results/wer_batch_results.csv",
        help="Path for individual evaluation results",
    )
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.is_file():
        parser.error(f"Manifest not found: {manifest_path}")

    results = []
    total_reference_words = 0
    total_substitutions = 0
    total_deletions = 0
    total_insertions = 0

    with manifest_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        required = {"reference_file", "hypothesis_file"}

        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            parser.error(
                "Manifest must contain columns: reference_file,hypothesis_file"
            )

        for line_number, row in enumerate(reader, start=2):
            reference_path = Path(row["reference_file"])
            hypothesis_path = Path(row["hypothesis_file"])

            if not reference_path.is_file():
                parser.error(
                    f"Line {line_number}: reference file not found: {reference_path}"
                )
            if not hypothesis_path.is_file():
                parser.error(
                    f"Line {line_number}: hypothesis file not found: {hypothesis_path}"
                )

            reference = read_transcript(reference_path)
            hypothesis = read_transcript(hypothesis_path)

            if not reference:
                parser.error(
                    f"Line {line_number}: reference transcript has no words"
                )

            s, d, ins, edits = align_words(reference, hypothesis)
            wer = (s + d + ins) / len(reference) * 100

            results.append({
                "reference_file": str(reference_path),
                "hypothesis_file": str(hypothesis_path),
                "reference_words": len(reference),
                "hypothesis_words": len(hypothesis),
                "substitutions": s,
                "deletions": d,
                "insertions": ins,
                "edit_distance": edits,
                "wer_percent": round(wer, 4),
                "status": "success",
            })

            total_reference_words += len(reference)
            total_substitutions += s
            total_deletions += d
            total_insertions += ins

    if not results:
        parser.error("Manifest contains no transcript pairs.")

    total_edits = (
        total_substitutions + total_deletions + total_insertions
    )
    aggregate_wer = total_edits / total_reference_words * 100

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = list(results[0].keys())
    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    print("\nBatch WER Evaluation")
    print("--------------------")
    print(f"Transcript pairs evaluated: {len(results)}")
    print(f"Total reference words:      {total_reference_words}")
    print(f"Substitutions:              {total_substitutions}")
    print(f"Deletions:                  {total_deletions}")
    print(f"Insertions:                 {total_insertions}")
    print(f"Total edits:                {total_edits}")
    print(f"Aggregate WER:              {aggregate_wer:.2f}%")
    print(f"Individual results saved:   {output_path}")


if __name__ == "__main__":
    main()
