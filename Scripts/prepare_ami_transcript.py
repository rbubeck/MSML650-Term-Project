
import xml.etree.ElementTree as ET
import csv
from pathlib import Path

BASE_DIR = Path("datasets/ami/annotations/words")
OUTPUT_DIR = Path("results")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

rows = []

# Read the word annotations for all four participants.
for speaker in ["A", "B", "C", "D"]:
    xml_file = BASE_DIR / f"ES2004a.{speaker}.words.xml"

    if not xml_file.exists():
        raise FileNotFoundError(f"Missing annotation file: {xml_file}")

    # The XML declares its encoding, so parse the file directly.
    root = ET.parse(xml_file).getroot()

    for element in root:
        # Keep words, excluding punctuation and vocalization elements.
        if element.tag.split("}")[-1] != "w":
            continue

        # Punctuation is stored as separate elements.
        if element.attrib.get("punc") == "true":
            continue

        word = (element.text or "").strip()
        if not word:
            continue

        rows.append({
            "start": float(element.attrib["starttime"]),
            "end": float(element.attrib["endtime"]),
            "speaker": speaker,
            "word": word,
            "truncated": element.attrib.get("trunc") == "true",
        })

# Merge participants' words by their start times.
rows.sort(key=lambda row: (row["start"], row["end"], row["speaker"]))

# Save a timestamped, speaker-labeled reference file.
csv_path = OUTPUT_DIR / "ES2004a_reference_words.csv"
with csv_path.open("w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(
        file,
        fieldnames=["start", "end", "speaker", "word", "truncated"],
    )
    writer.writeheader()
    writer.writerows(rows)

# Also save a simple transcript for preliminary inspection.
txt_path = OUTPUT_DIR / "ES2004a_reference_transcript.txt"
with txt_path.open("w", encoding="utf-8") as file:
    for row in rows:
        file.write(f'{row["speaker"]}: {row["word"]}\n')

print(f"Processed {len(rows)} annotated words.")
print(f"Saved word-level reference: {csv_path}")
print(f"Saved preliminary transcript: {txt_path}")
print("\nFirst 20 entries:")
for row in rows[:20]:
    print(
        f'{row["start"]:7.2f}-{row["end"]:7.2f} '
        f'{row["speaker"]}: {row["word"]}'
    )
