import argparse
import asyncio
import json
import time
import wave
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


async def transcribe(audio_path: Path):
    if not audio_path.is_file():
        raise FileNotFoundError(audio_path)

    loop = asyncio.get_running_loop()
    started = loop.time()
    transcripts = []
    words = []

    config = await AsyncTranscribeStreamingConfig.resolve(
        profile="live-transcription-dev",
        region="us-east-1",
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

            async def send_audio():
                audio_started = loop.time()
                audio_seconds = 0.0

                try:
                    with wave.open(str(audio_path), "rb") as source:
                        expected = (CHANNELS, BYTES_PER_SAMPLE, SAMPLE_RATE, "NONE")
                        actual = (
                            source.getnchannels(),
                            source.getsampwidth(),
                            source.getframerate(),
                            source.getcomptype(),
                        )

                        if actual != expected:
                            raise ValueError(
                                f"Expected mono 16 kHz PCM16 WAV; got {actual}"
                            )

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

            await asyncio.gather(
                send_audio(),
                receive_transcripts()
            )

    return (
        " ".join(transcripts),
        words,
        loop.time() - started,
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    transcript, words, elapsed = asyncio.run(transcribe(args.audio))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        transcript.strip() + "\n",
        encoding="utf-8"
    )

    with wave.open(str(args.audio), "rb") as source:
        duration = source.getnframes() / SAMPLE_RATE

    metadata = {
        "audio_file": str(args.audio),
        "output_file": str(args.output),
        "region": "us-east-1",
        "language": "en-US",
        "sample_rate_hz": SAMPLE_RATE,
        "audio_duration_seconds": duration,
        "elapsed_seconds": round(elapsed, 3),
        "transcript": transcript,
    }

    metadata_path = args.output.with_suffix(".json")
    metadata_path.write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8"
    )

    words_path = args.output.with_name(
        args.output.stem + "_words.json"
    )
    words_path.write_text(
        json.dumps(words, indent=2) + "\n",
        encoding="utf-8"
    )

    print(f"Saved word timestamps: {words_path}")
    print(f"Recognized word items: {len(words)}")

    print(f"Transcript: {transcript}")
    print(f"Saved hypothesis: {args.output}")
    print(f"Saved metadata: {metadata_path}")
    print(f"Elapsed seconds: {elapsed:.3f}")


if __name__ == "__main__":
    main()