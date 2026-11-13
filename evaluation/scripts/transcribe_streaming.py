import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import platform
import subprocess
import wave
from datetime import datetime, timezone
from pathlib import Path

from smithy_http.aio.crt import AWSCRTHTTPClient

from aws_sdk_transcribe_streaming.client import AsyncTranscribeStreamingClient
from aws_sdk_transcribe_streaming.config import AsyncTranscribeStreamingConfig
from aws_sdk_transcribe_streaming.models import (
    AudioEvent,
    AudioStreamAudioEvent,
    LanguageCode,
    MediaEncoding,
    StartStreamTranscriptionInput,
    TranscriptResultStreamTranscriptEvent,
)

SAMPLE_RATE = 16000
CHANNELS = 1
BYTES_PER_SAMPLE = 2
CHUNK_FRAMES = 1600
LANGUAGE_CODE = "en-US"


def inspect_audio(audio_path):
    """Validate the WAV before opening a provider session."""
    if not audio_path.is_file():
        raise FileNotFoundError(audio_path)

    with wave.open(str(audio_path), "rb") as source:
        audio = {
            "channels": source.getnchannels(),
            "sample_width_bytes": source.getsampwidth(),
            "sample_rate_hz": source.getframerate(),
            "compression": source.getcomptype(),
            "frame_count": source.getnframes(),
        }

    expected = (CHANNELS, BYTES_PER_SAMPLE, SAMPLE_RATE, "NONE")
    actual = (
        audio["channels"],
        audio["sample_width_bytes"],
        audio["sample_rate_hz"],
        audio["compression"],
    )

    if actual != expected:
        raise ValueError(
            f"Expected mono 16 kHz PCM16 WAV; got {actual}"
        )

    audio["duration_seconds"] = audio["frame_count"] / SAMPLE_RATE
    audio["file_size_bytes"] = audio_path.stat().st_size
    audio["sha256"] = hashlib.sha256(audio_path.read_bytes()).hexdigest()
    return audio


def package_version(package):
    try:
        return importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        return None


def git_commit():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


async def transcribe(audio_path, profile, region):
    audio = inspect_audio(audio_path)

    loop = asyncio.get_running_loop()
    started = loop.time()
    transcripts = []
    words = []

    config = await AsyncTranscribeStreamingConfig.resolve(
        profile=profile,
        region=region,
        transport=AWSCRTHTTPClient(),
    )

    async with AsyncTranscribeStreamingClient(config=config) as client:
        stream = await client.start_stream_transcription(
            input=StartStreamTranscriptionInput(
                language_code=LanguageCode.EN_US,
                media_sample_rate_hertz=SAMPLE_RATE,
                media_encoding=MediaEncoding.PCM,
            )
        )

        async with stream:
            _, output_stream = await stream.await_output()

            if output_stream is None:
                raise RuntimeError("Transcribe returned no output stream")

            setup_seconds = loop.time() - started
            streaming_started = loop.time()

            async def send_audio():
                audio_started = loop.time()
                audio_seconds = 0.0

                try:
                    with wave.open(str(audio_path), "rb") as source:
                        while chunk := await asyncio.to_thread(
                            source.readframes, CHUNK_FRAMES
                        ):
                            await stream.input_stream.send(
                                AudioStreamAudioEvent(
                                    value=AudioEvent(audio_chunk=chunk)
                                )
                            )

                            audio_seconds += len(chunk) / (
                                CHANNELS * BYTES_PER_SAMPLE * SAMPLE_RATE
                            )

                            delay = audio_started + audio_seconds - loop.time()
                            if delay > 0:
                                await asyncio.sleep(delay)
                finally:
                    await stream.input_stream.close()

            async def receive_transcripts():
                async for event in output_stream:
                    if not isinstance(
                        event, TranscriptResultStreamTranscriptEvent
                    ):
                        continue

                    transcript_event = event.value.transcript
                    if transcript_event is None:
                        continue

                    for result in transcript_event.results or []:
                        if result.is_partial:
                            continue

                        alternatives = result.alternatives or []
                        if not alternatives:
                            continue

                        alternative = alternatives[0]

                        if alternative.transcript:
                            transcripts.append(alternative.transcript)

                        for item in alternative.items or []:
                            if item.content:
                                words.append({
                                    "start": item.start_time,
                                    "end": item.end_time,
                                    "word": item.content,
                                    "type": item.type,
                                    "confidence": item.confidence,
                                    "speaker": item.speaker,
                                })

            await asyncio.gather(send_audio(), receive_transcripts())

            streaming_seconds = loop.time() - streaming_started

    total_seconds = loop.time() - started

    return (
        " ".join(transcripts),
        words,
        {
            "setup_seconds": round(setup_seconds, 3),
            "streaming_seconds": round(streaming_seconds, 3),
            "total_elapsed_seconds": round(total_seconds, 3),
            "audio_duration_seconds": audio["duration_seconds"],
            "real_time_factor": round(
                streaming_seconds / audio["duration_seconds"], 4
            ) if audio["duration_seconds"] else None,
        },
        audio,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Stream a WAV file through Amazon Transcribe."
    )
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--profile", default="live-transcription-dev")
    parser.add_argument("--region", default="us-east-1")
    args = parser.parse_args()

    audio_path = args.audio.resolve()
    output_path = args.output

    # Validate before making any provider connection.
    audio = inspect_audio(audio_path)

    transcript, words, timing, audio = asyncio.run(
        transcribe(audio_path, args.profile, args.region)
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(transcript.strip() + "\n", encoding="utf-8")

    metadata = {
        "run_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_commit(),
        "provider": "Amazon Transcribe Streaming",
        "aws_profile": args.profile,
        "region": args.region,
        "request": {
            "language_code": LANGUAGE_CODE,
            "media_encoding": "PCM",
            "sample_rate_hz": SAMPLE_RATE,
            "chunk_frames": CHUNK_FRAMES,
            "chunk_duration_ms": round(
                CHUNK_FRAMES / SAMPLE_RATE * 1000, 2
            ),
            "pacing": "real_time",
        },
        "audio": {
            "file_name": audio_path.name,
            "sha256": audio["sha256"],
            "file_size_bytes": audio["file_size_bytes"],
            "channels": audio["channels"],
            "sample_width_bytes": audio["sample_width_bytes"],
            "sample_rate_hz": audio["sample_rate_hz"],
            "compression": audio["compression"],
            "frame_count": audio["frame_count"],
            "duration_seconds": audio["duration_seconds"],
        },
        "timing": timing,
        "software": {
            "python": platform.python_version(),
            "aws_sdk_transcribe_streaming": package_version(
                "aws_sdk_transcribe_streaming"
            ),
            "awscrt": package_version("awscrt"),
            "boto3": package_version("boto3"),
            "smithy_aws_core": package_version("smithy-aws-core"),
            "smithy_core": package_version("smithy-core"),
            "smithy_http": package_version("smithy-http"),
        },
        "outputs": {
            "hypothesis_file": str(output_path),
            "word_timestamps_file": str(
                output_path.with_name(output_path.stem + "_words.json")
            ),
        },
    }

    metadata_path = output_path.with_suffix(".json")
    metadata_path.write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )

    words_path = output_path.with_name(output_path.stem + "_words.json")
    words_path.write_text(
        json.dumps(words, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Saved hypothesis: {output_path}")
    print(f"Saved metadata: {metadata_path}")
    print(f"Saved word timestamps: {words_path}")
    print(f"Recognized word items: {len(words)}")
    print(f"Audio duration: {audio['duration_seconds']:.2f} seconds")
    print(f"Setup time: {timing['setup_seconds']:.3f} seconds")
    print(f"Streaming time: {timing['streaming_seconds']:.3f} seconds")
    print(f"Total elapsed: {timing['total_elapsed_seconds']:.3f} seconds")


if __name__ == "__main__":
    main()