import csv
import io
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

SOURCE = PROJECT_ROOT / "Datasets" / "Librispeech" / "test_clean"
AUDIO_DIR = PROJECT_ROOT / "Datasets" / "Librispeech" / "audio"
TRANSCRIPT_DIR = PROJECT_ROOT / "Datasets" / "Librispeech" / "transcripts"
METADATA_DIR = PROJECT_ROOT / "Datasets" / "Librispeech" / "metadata"


def prepare_librispeech(
    source=SOURCE,
    audio_dir=AUDIO_DIR,
    transcript_dir=TRANSCRIPT_DIR,
    metadata_dir=METADATA_DIR,
):
    """Export a small LibriSpeech sample and its reference transcripts."""
    # Keep optional dependencies inside the function so importing this
    # module does not require them.
    import pyarrow.parquet as pq
    import soundfile as sf

    for folder in (audio_dir, transcript_dir, metadata_dir):
        folder.mkdir(parents=True, exist_ok=True)

    table = pq.read_table(source)
    rows = table.to_pylist()

    # Select five examples for the initial test set.
    selected = rows[:5]
    if not selected:
        raise ValueError(f"No examples found in Parquet source: {source}")

    manifest = []

    for row in selected:
        clip_id = row["id"]
        audio_data = row["audio"]["bytes"]

        if audio_data is None:
            raise ValueError(f"No embedded audio bytes for {clip_id}")

        # Read embedded FLAC audio and export it as WAV.
        audio, sample_rate = sf.read(
            io.BytesIO(audio_data),
            dtype="float32",
        )

        wav_path = audio_dir / f"{clip_id}.wav"
        sf.write(wav_path, audio, sample_rate, subtype="PCM_16")

        manifest.append({
            "id": clip_id,
            "audio_file": str(wav_path.relative_to(PROJECT_ROOT)),
            "reference_text": row["text"],
            "speaker_id": row["speaker_id"],
            "chapter_id": row["chapter_id"],
            "sample_rate": sample_rate,
        })

    csv_path = transcript_dir / "references.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=manifest[0].keys())
        writer.writeheader()
        writer.writerows(manifest)

    info_path = metadata_dir / "dataset_info.txt"
    info_path.write_text(
        "Dataset: LibriSpeech test-clean\n"
        f"Rows in source Parquet file: {len(rows)}\n"
        f"Exported examples: {len(manifest)}\n"
        "Audio exported as 16-bit PCM WAV.\n",
        encoding="utf-8",
    )

    print(f"Exported {len(manifest)} clips to {audio_dir}")
    print(f"Reference transcripts saved to {csv_path}")

    for item in manifest:
        print(f'{item["id"]}: {item["reference_text"]}')


def main():
    prepare_librispeech()


if __name__ == "__main__":
    main()
