import csv
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BASE_DIR = PROJECT_ROOT / "Datasets" / "AMI" / "Annotations" / "words"
OUTPUT_DIR = PROJECT_ROOT / "Results"


def prepare_ami_transcript(
    base_dir=BASE_DIR,
    output_dir=OUTPUT_DIR,
):
    """Create the timestamped, speaker-labeled AMI reference files."""
    rows = []

    # Read the word annotations for all four participants.
    for speaker in ["A", "B", "C", "D"]:
        xml_file = base_dir / f"ES2004a.{speaker}.words.xml"

        if not xml_file.exists():
            raise FileNotFoundError(f"Missing annotation file: {xml_file}")

        root = ET.parse(xml_file).getroot()

        for element in root:
            if element.tag.split("}")[-1] != "w":
                continue

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

    # Create output directory only when the function is explicitly called.
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_path = output_dir / "ES2004a_reference_words.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=["start", "end", "speaker", "word", "truncated"],
        )
        writer.writeheader()
        writer.writerows(rows)

    txt_path = output_dir / "ES2004a_reference_transcript.txt"
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


def main():
    prepare_ami_transcript()


if __name__ == "__main__":
    main()
