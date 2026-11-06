
#!/usr/bin/env python3
"""Calculate Word Error Rate (WER) between two transcripts."""

import argparse
import csv
import re
import unicodedata
from pathlib import Path


def normalize_text(text):
    """Lowercase text and remove punctuation for consistent comparison."""
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())


def align_words(reference, hypothesis):
    """Calculate minimum word edits and count substitutions, deletions, insertions."""
    n = len(reference)
    m = len(hypothesis)

    # dp[i][j] is the minimum edits for the first i reference
    # words and first j hypothesis words.
    dp = [[0] * (m + 1) for _ in range(n + 1)]

    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if reference[i - 1] == hypothesis[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,       # deletion
                dp[i][j - 1] + 1,       # insertion
                dp[i - 1][j - 1] + cost,  # match or substitution
            )

    substitutions = deletions = insertions = 0
    i, j = n, m

    # Backtrack through the alignment to count each type of edit.
    while i > 0 or j > 0:
        if (
            i > 0
            and j > 0
            and reference[i - 1] == hypothesis[j - 1]
            and dp[i][j] == dp[i - 1][j - 1]
        ):
            i -= 1
            j -= 1
        elif (
            i > 0
            and j > 0
            and dp[i][j] == dp[i - 1][j - 1] + 1
        ):
            substitutions += 1
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            deletions += 1
            i -= 1
        else:
            insertions += 1
            j -= 1

    return substitutions, deletions, insertions, dp[n][m]


def main():
    parser = argparse.ArgumentParser(
        description="Calculate WER for a reference and hypothesis transcript."
    )
    parser.add_argument("--reference", required=True, help="Reference transcript file")
    parser.add_argument("--hypothesis", required=True, help="Generated transcript file")
    parser.add_argument(
        "--output",
        default="Results/wer_results.csv",
        help="Output CSV path (default: Results/wer_results.csv)",
    )
    args = parser.parse_args()

    reference_path = Path(args.reference)
    hypothesis_path = Path(args.hypothesis)

    for path in (reference_path, hypothesis_path):
        if not path.is_file():
            parser.error(f"File not found: {path}")

    reference_text = normalize_text(
        reference_path.read_text(encoding="utf-8-sig")
    )
    hypothesis_text = normalize_text(
        hypothesis_path.read_text(encoding="utf-8-sig")
    )

    reference_words = reference_text.split()
    hypothesis_words = hypothesis_text.split()

    if not reference_words:
        parser.error("The reference transcript contains no words after normalization.")

    s, d, ins, edit_distance = align_words(reference_words, hypothesis_words)
    wer = (s + d + ins) / len(reference_words) * 100

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    result = {
        "reference_file": str(reference_path),
        "hypothesis_file": str(hypothesis_path),
        "reference_words": len(reference_words),
        "hypothesis_words": len(hypothesis_words),
        "substitutions": s,
        "deletions": d,
        "insertions": ins,
        "edit_distance": edit_distance,
        "wer_percent": round(wer, 4),
    }

    with output_path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=result.keys())
        writer.writeheader()
        writer.writerow(result)

    print("\nWER Evaluation Results")
    print("----------------------")
    print(f"Reference words:   {len(reference_words)}")
    print(f"Hypothesis words:  {len(hypothesis_words)}")
    print(f"Substitutions:     {s}")
    print(f"Deletions:         {d}")
    print(f"Insertions:        {ins}")
    print(f"Total edits:       {edit_distance}")
    print(f"Word Error Rate:   {wer:.2f}%")
    print(f"CSV report saved:  {output_path}")


if __name__ == "__main__":
    main()
