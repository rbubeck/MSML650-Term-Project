
import csv
import io
from pathlib import Path

import pyarrow.parquet as pq
import soundfile as sf

SOURCE = Path("datasets/librispeech/test_clean")
AUDIO_DIR = Path("datasets/librispeech/audio")
TRANSCRIPT_DIR = Path("datasets/librispeech/transcripts")
METADATA_DIR = Path("datasets/librispeech/metadata")

for folder in (AUDIO_DIR, TRANSCRIPT_DIR, METADATA_DIR):
    folder.mkdir(parents=True, exist_ok=True)

table = pq.read_table(SOURCE)
rows = table.to_pylist()

# Select five examples for the initial test set.
selected = rows[:5]
manifest = []

for row in selected:
    clip_id = row["id"]
    audio_data = row["audio"]["bytes"]
    if audio_data is None:
        raise ValueError(f"No embedded audio bytes for {clip_id}")

    # Read the embedded FLAC audio and export it as WAV.
    audio, sample_rate = sf.read(io.BytesIO(audio_data), dtype="float32")
    wav_path = AUDIO_DIR / f"{clip_id}.wav"
    sf.write(wav_path, audio, sample_rate, subtype="PCM_16")

    manifest.append({
        "id": clip_id,
        "audio_file": str(wav_path),
        "reference_text": row["text"],
        "speaker_id": row["speaker_id"],
        "chapter_id": row["chapter_id"],
        "sample_rate": sample_rate,
    })

csv_path = TRANSCRIPT_DIR / "references.csv"
with csv_path.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=manifest[0].keys())
    writer.writeheader()
    writer.writerows(manifest)

info_path = METADATA_DIR / "dataset_info.txt"
info_path.write_text(
    "Dataset: LibriSpeech test-clean\n"
    f"Rows in source Parquet file: {len(rows)}\n"
    f"Exported examples: {len(manifest)}\n"
    "Audio exported as 16-bit PCM WAV.\n",
    encoding="utf-8",
)

print(f"Exported {len(manifest)} clips to {AUDIO_DIR}")
print(f"Reference transcripts saved to {csv_path}")
for item in manifest:
    print(f'{item["id"]}: {item["reference_text"]}')
