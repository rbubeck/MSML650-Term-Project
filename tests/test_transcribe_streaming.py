import hashlib
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from evaluation.scripts.transcribe_streaming import (
    inspect_audio,
    package_version,
    git_commit,
)


class TestTranscribeStreaming(unittest.TestCase):
    def create_wav(self, path, channels=1, sample_width=2, sample_rate=16000):
        with wave.open(str(path), "wb") as audio:
            audio.setnchannels(channels)
            audio.setsampwidth(sample_width)
            audio.setframerate(sample_rate)
            audio.writeframes(b"\x00\x00" * sample_rate * channels)

    def test_inspect_valid_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "valid.wav"
            self.create_wav(path)

            result = inspect_audio(path)

            self.assertEqual(result["channels"], 1)
            self.assertEqual(result["sample_width_bytes"], 2)
            self.assertEqual(result["sample_rate_hz"], 16000)
            self.assertEqual(result["duration_seconds"], 1.0)
            self.assertEqual(result["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(result["file_size_bytes"], path.stat().st_size)

    def test_reject_stereo_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stereo.wav"
            self.create_wav(path, channels=2)

            with self.assertRaises(ValueError):
                inspect_audio(path)

    def test_reject_wrong_sample_rate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wrong_rate.wav"
            self.create_wav(path, sample_rate=44100)

            with self.assertRaises(ValueError):
                inspect_audio(path)

    def test_reject_wrong_sample_width(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wrong_width.wav"
            self.create_wav(path, sample_width=1)

            with self.assertRaises(ValueError):
                inspect_audio(path)

    def test_missing_audio_file(self):
        path = Path("does_not_exist.wav")

        with self.assertRaises(FileNotFoundError):
            inspect_audio(path)

    @patch("evaluation.scripts.transcribe_streaming.importlib.metadata.version")
    def test_package_version(self, mock_version):
        mock_version.return_value = "1.2.3"
        self.assertEqual(package_version("example"), "1.2.3")

    @patch("evaluation.scripts.transcribe_streaming.importlib.metadata.version")
    def test_missing_package_version(self, mock_version):
        from importlib.metadata import PackageNotFoundError

        mock_version.side_effect = PackageNotFoundError
        self.assertIsNone(package_version("missing-package"))

    @patch("evaluation.scripts.transcribe_streaming.subprocess.check_output")
    def test_git_commit(self, mock_git):
        mock_git.return_value = "abc123\n"
        self.assertEqual(git_commit(), "abc123")

    @patch("evaluation.scripts.transcribe_streaming.subprocess.check_output")
    def test_git_commit_unavailable(self, mock_git):
        import subprocess

        mock_git.side_effect = subprocess.CalledProcessError(1, "git")
        self.assertIsNone(git_commit())


if __name__ == "__main__":
    unittest.main()