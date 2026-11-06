import csv
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INPUT_FILE = PROJECT_ROOT / "Results" / "ES2004a_reference_words.csv"
OUTPUT_FILE = PROJECT_ROOT / "Results" / "ES2004a_reference_normalized.txt"


def normalize_word(word):
    """Lowercase and remove punctuation while retaining letters and digits."""
    word = word.lower()
    word = re.sub(r"[^\w']", "", word)
    return word.strip("_'")


def normalize_reference(input_file=INPUT_FILE, output_file=OUTPUT_FILE):
    """Normalize the AMI word-level reference CSV into a text transcript."""
    normalized_words = []

    with input_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)

        for row in reader:
            word = normalize_word(row["word"])

            if word:
                normalized_words.append(word)

    with output_file.open("w", encoding="utf-8") as file:
        file.write(" ".join(normalized_words) + "\n")

    print(f"Normalized {len(normalized_words)} words.")
    print(f"Saved reference transcript to: {output_file}")
    print("\nFirst 50 words:")
    print(" ".join(normalized_words[:50]))


def main():
    normalize_reference()


if __name__ == "__main__":
    main()
