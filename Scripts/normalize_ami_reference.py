
import csv
import re
from pathlib import Path

INPUT_FILE = Path("Results/ES2004a_reference_words.csv")
OUTPUT_FILE = Path("Results/ES2004a_reference_normalized.txt")

def normalize_word(word):
    # Lowercase and remove punctuation while retaining
    # letters and digits.
    word = word.lower()
    word = re.sub(r"[^\w']", "", word)
    return word.strip("_'")

normalized_words = []

with INPUT_FILE.open("r", encoding="utf-8", newline="") as file:
    reader = csv.DictReader(file)

    for row in reader:
        word = normalize_word(row["word"])

        # Skip entries that are only punctuation.
        if word:
            normalized_words.append(word)

with OUTPUT_FILE.open("w", encoding="utf-8") as file:
    file.write(" ".join(normalized_words) + "\n")

print(f"Normalized {len(normalized_words)} words.")
print(f"Saved reference transcript to: {OUTPUT_FILE}")
print("\nFirst 50 words:")
print(" ".join(normalized_words[:50]))
