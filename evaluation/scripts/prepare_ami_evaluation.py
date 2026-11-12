
import csv
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INPUT_FILE = PROJECT_ROOT / "Results" / "ES2004a_reference_words.csv"
OUTPUT_DIR = PROJECT_ROOT / "Results" / "AMI_evaluation"
GAP_THRESHOLD = 0.5


def prepare_evaluation():
    with INPUT_FILE.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    usable = []

    for i, word in enumerate(rows):
        if word["truncated"].lower() == "true":
            continue

        start = float(word["start"])
        end = float(word["end"])

        overlaps = any(
            other["speaker"] != word["speaker"]
            and float(other["start"]) < end
            and float(other["end"]) > start
            for j, other in enumerate(rows)
            if i != j
        )

        if not overlaps:
            usable.append({
                **word,
                "start": start,
                "end": end,
            })

    usable.sort(key=lambda row: (row["start"], row["end"]))

    # Group words into continuous, non-overlapping segments.
    segments = []
    current = []

    for word in usable:
        if (
            current
            and word["start"] - current[-1]["end"] > GAP_THRESHOLD
        ):
            segments.append(current)
            current = []

        current.append(word)

    if current:
        segments.append(current)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest_path = OUTPUT_DIR / "segments.csv"
    with manifest_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow([
            "segment_id", "start", "end", "word_count", "reference"
        ])

        for i, segment in enumerate(segments, start=1):
            writer.writerow([
                i,
                segment[0]["start"],
                segment[-1]["end"],
                len(segment),
                " ".join(word["word"] for word in segment),
            ])

    lengths = [len(segment) for segment in segments]

    print(f"Original annotated words: {len(rows)}")
    print(f"Usable words: {len(usable)}")
    print(f"Scoring segments: {len(segments)}")
    print(f"Shortest segment: {min(lengths)} words")
    print(f"Longest segment: {max(lengths)} words")
    print(f"Average segment: {sum(lengths) / len(lengths):.1f} words")
    print(f"Reference manifest: {manifest_path}")


if __name__ == "__main__":
    prepare_evaluation()
