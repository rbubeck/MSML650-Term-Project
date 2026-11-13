
#!/usr/bin/env python3
"""Evaluate AMI ES2004a Transcribe output against timestamped reference segments."""

import csv
import json
from collections import defaultdict
from pathlib import Path

from .evaluate_wer import align_words, normalize_text

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEGMENTS_FILE = PROJECT_ROOT / "Results" / "AMI_evaluation" / "segments.csv"
HYPOTHESIS_FILE = (
    PROJECT_ROOT / "Results" / "AMI_evaluation" / "ES2004a_hypothesis_words.json"
)
OUTPUT_DIR = PROJECT_ROOT / "Results" / "AMI_evaluation"


def load_segments():
    with SEGMENTS_FILE.open(newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def load_pronunciation_words():
    with HYPOTHESIS_FILE.open(encoding="utf-8") as file:
        words = json.load(file)
    return [word for word in words if word.get("type") == "pronunciation"]


def assign_words(segments, words):
    """Assign each ASR word to the segment with greatest positive overlap."""
    assigned = defaultdict(list)
    unassigned = []
    multiple_overlaps = []

    for word in words:
        overlaps = []
        for segment in segments:
            overlap = max(
                0.0,
                min(word["end"], float(segment["end"]))
                - max(word["start"], float(segment["start"])),
            )
            if overlap > 0:
                overlaps.append((segment, overlap))

        if not overlaps:
            unassigned.append(word)
            continue

        if len(overlaps) > 1:
            multiple_overlaps.append(word)

        segment, _ = max(overlaps, key=lambda item: item[1])
        assigned[segment["segment_id"]].append(word)

    for segment_words in assigned.values():
        segment_words.sort(key=lambda word: word["start"])

    return assigned, unassigned, multiple_overlaps


def evaluate():
    segments = load_segments()
    words = load_pronunciation_words()
    assigned, unassigned, multiple = assign_words(segments, words)
    transcription_metadata = json.loads(
        (OUTPUT_DIR / "ES2004a_hypothesis.json").read_text(encoding="utf-8")
    )
    results = []
    total_reference_words = 0
    total_substitutions = 0
    total_deletions = 0
    total_insertions = 0
    empty_segments = 0

    for segment in segments:
        segment_id = segment["segment_id"]
        reference = normalize_text(segment["reference"]).split()
        hypothesis = normalize_text(
            " ".join(word["word"] for word in assigned.get(segment_id, []))
        ).split()

        substitutions, deletions, insertions, edit_distance = align_words(
            reference, hypothesis
        )

        if not hypothesis:
            empty_segments += 1

        reference_count = len(reference)
        wer = edit_distance / reference_count if reference_count else 0.0

        total_reference_words += reference_count
        total_substitutions += substitutions
        total_deletions += deletions
        total_insertions += insertions

        results.append({
            "segment_id": segment_id,
            "start": segment["start"],
            "end": segment["end"],
            "reference_words": reference_count,
            "hypothesis_words": len(hypothesis),
            "substitutions": substitutions,
            "deletions": deletions,
            "insertions": insertions,
            "edit_distance": edit_distance,
            "wer": round(wer, 6),
            "reference": segment["reference"],
            "hypothesis": " ".join(hypothesis),
        })

    total_errors = (
        total_substitutions + total_deletions + total_insertions
    )
    aggregate_wer = (
        total_errors / total_reference_words if total_reference_words else 0.0
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    csv_path = OUTPUT_DIR / "ami_segment_results.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

    summary = {
        "evaluation_method": "greatest_positive_time_interval_overlap",
        "transcription_metadata": {
            "provider": "Amazon Transcribe Streaming",
            "audio_file": transcription_metadata.get("audio_file"),
            "region": transcription_metadata.get("region"),
            "language": transcription_metadata.get("language"),
            "sample_rate_hz": transcription_metadata.get("sample_rate_hz"),
            "audio_duration_seconds": transcription_metadata.get(
                "audio_duration_seconds"
            ),
            "elapsed_seconds": transcription_metadata.get("elapsed_seconds"),
            "sdk_versions": None,
            "request_configuration": None,
        },
        "normalization": "shared normalize_text: NFKC, lowercase, punctuation to spaces, collapse whitespace",
        "segments": len(segments),
        "reference_words": total_reference_words,
        "asr_pronunciation_words": len(words),
        "assigned_asr_words": len(words) - len(unassigned),
        "unassigned_asr_words": len(unassigned),
        "multiple_overlap_words": len(multiple),
        "empty_segments": empty_segments,
        "substitutions": total_substitutions,
        "deletions": total_deletions,
        "insertions": total_insertions,
        "total_errors": total_errors,
        "wer": round(aggregate_wer, 6),
    }

    summary_path = OUTPUT_DIR / "ami_evaluation_summary.json"
    summary_path.write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )

    unassigned_path = OUTPUT_DIR / "ami_unassigned_words.json"
    unassigned_path.write_text(
        json.dumps(unassigned, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps(summary, indent=2))
    print(f"\nSegment results: {csv_path}")
    print(f"Summary: {summary_path}")
    print(f"Unassigned words: {unassigned_path}")


if __name__ == "__main__":
    evaluate()
