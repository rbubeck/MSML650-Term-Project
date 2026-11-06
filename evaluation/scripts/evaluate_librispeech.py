
#!/usr/bin/env python3
"""Evaluate LibriSpeech references against generated hypothesis transcripts."""

import argparse
import csv
from pathlib import Path

from .evaluate_wer import align_words, normalize_text


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate LibriSpeech transcription hypotheses."
    )
    parser.add_argument(
        "--references",
        default="Datasets/Librispeech/transcripts/references.csv",
        help="CSV containing id and reference_text columns",
    )
    parser.add_argument(
        "--hypotheses",
        default="Results/Librispeech_hypotheses",
        help="Folder containing one ID.txt hypothesis per sample",
    )
    parser.add_argument(
        "--output",
        default="Results/Librispeech_evaluation",
        help="Folder for evaluation reports",
    )
    args = parser.parse_args()

    references_path = Path(args.references)
    hypotheses_dir = Path(args.hypotheses)
    output_dir = Path(args.output)

    if not references_path.is_file():
        parser.error(f"Reference CSV not found: {references_path}")
    if not hypotheses_dir.is_dir():
        parser.error(f"Hypothesis directory not found: {hypotheses_dir}")

    results = []
    missing = 0
    total_words = 0
    total_s = total_d = total_i = 0

    with references_path.open(
        newline="", encoding="utf-8-sig"
    ) as file:
        reader = csv.DictReader(file)

        required = {"id", "reference_text"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            parser.error(
                "Reference CSV must contain id and reference_text columns."
            )

        for row in reader:
            sample_id = row["id"].strip()
            hypothesis_path = hypotheses_dir / f"{sample_id}.txt"

            if not hypothesis_path.is_file():
                missing += 1
                continue

            reference = normalize_text(row["reference_text"]).split()
            hypothesis = normalize_text(
                hypothesis_path.read_text(encoding="utf-8-sig")
            ).split()

            if not reference:
                print(f"WARNING: Skipping empty reference for {sample_id}")
                continue

            s, d, i, edits = align_words(reference, hypothesis)
            wer = (s + d + i) / len(reference) * 100

            results.append({
                "id": sample_id,
                "reference_words": len(reference),
                "hypothesis_words": len(hypothesis),
                "substitutions": s,
                "deletions": d,
                "insertions": i,
                "edit_distance": edits,
                "wer_percent": round(wer, 4),
                "status": "success",
            })

            total_words += len(reference)
            total_s += s
            total_d += d
            total_i += i

    if not results:
        parser.error(
            "No matching hypothesis transcripts found. "
            f"Place files named ID.txt in {hypotheses_dir}."
        )

    output_dir.mkdir(parents=True, exist_ok=True)

    individual_path = output_dir / "wer_individual.csv"
    with individual_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(
            file, fieldnames=list(results[0].keys())
        )
        writer.writeheader()
        writer.writerows(results)

    total_edits = total_s + total_d + total_i
    aggregate_wer = total_edits / total_words * 100

    summary = {
        "samples_evaluated": len(results),
        "samples_missing": missing,
        "reference_words": total_words,
        "substitutions": total_s,
        "deletions": total_d,
        "insertions": total_i,
        "total_edits": total_edits,
        "aggregate_wer_percent": round(aggregate_wer, 4),
    }

    summary_path = output_dir / "wer_summary.csv"
    with summary_path.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=list(summary.keys()))
        writer.writeheader()
        writer.writerow(summary)

    print("\nLibriSpeech WER Evaluation")
    print("--------------------------")
    print(f"Samples evaluated: {len(results)}")
    print(f"Samples without hypotheses: {missing}")
    print(f"Total reference words: {total_words}")
    print(f"Substitutions: {total_s}")
    print(f"Deletions: {total_d}")
    print(f"Insertions: {total_i}")
    print(f"Aggregate WER: {aggregate_wer:.2f}%")
    print(f"Individual results: {individual_path}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
