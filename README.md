# Audio Transcription Testing and Evaluation

## 1. Project Overview

This repository supports the testing, performance evaluation, and monitoring of an audio transcription pipeline using **Amazon Transcribe** and AWS services.

The project prepares audio datasets and reference transcripts so that transcription outputs can be compared against known text. The resulting measurements can be used to evaluate transcription accuracy and investigate performance across different audio samples.

The project currently focuses on two datasets:

- **AMI Meeting Corpus:** Meeting audio and annotations used to prepare reference transcripts. This dataset can help evaluate transcription of multi-speaker conversations and overlapping speech.
- **LibriSpeech:** English speech recordings with corresponding reference transcripts, useful for evaluating transcription accuracy on cleaner speech.

The broader AWS workflow uses or may incorporate Amazon S3 for audio storage, Amazon Transcribe for transcription, AWS Lambda for automated processing, and Amazon CloudWatch for monitoring and performance measurements.

## 2. Repository Structure

```text
Audio_Transcription_Testing/
├── README.md
├── .gitignore
├── requirements.txt
├── Scripts/
│   ├── prepare_ami_transcript.py
│   ├── normalize_ami_reference.py
│   ├── prepare_librispeech.py
│   ├── evaluate_wer.py
│   ├── evaluate_wer_batch.py
│   └── evaluate_librispeech.py
├── tests/
│   ├── __init__.py
│   ├── test_evaluate_wer.py
│   ├── test_evaluate_wer_batch.py
│   └── test_evaluate_librispeech.py
├── Datasets/
│   ├── AMI/
│   │   ├── Audio/
│   │   ├── Annotations/
│   │   └── Metadata/
│   └── Librispeech/
│       ├── audio/
│       ├── metadata/
│       ├── transcripts/
│       └── test_clean/
├── Results/
│   ├── ES2004a_reference_words.csv
│   ├── ES2004a_reference_transcript.txt
│   ├── ES2004a_reference_normalized.txt
│   └── Librispeech/
│       ├── wer_individual.csv
│       └── wer_summary.csv
└── .venv/
```

**Note:** This tree illustrates the local project layout. Large source datasets, audio files, generated results, and the Python virtual environment may be excluded from Git and are not necessarily present in the GitHub repository. Directory capitalization and generated output locations may differ depending on the local setup. The `requirements.txt` file should be included if maintained in the repository.

## 3. Requirements

- Python 3
- Git
- Access to the required AMI and LibriSpeech datasets
- An AWS account and appropriate permissions for AWS-based testing
- AWS CLI, if uploading files or interacting with AWS from the terminal

The Python virtual environment is local to each developer's machine and should not be committed to Git.

## 4. Environment Setup

From the project root, create and activate a virtual environment if one does not already exist.

### Linux or WSL

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

Install the dependencies required by the preparation scripts:

```bash
pip install pandas pyarrow soundfile
```

Additional packages may be needed depending on the specific script implementation and dataset format.

To record the current environment's installed packages:

```bash
pip freeze > requirements.txt
```

Review the generated `requirements.txt` before committing it to ensure it contains only appropriate project dependencies.

## 5. Dataset Preparation

### 5.1 AMI Meeting Corpus

The AMI preparation workflow uses meeting audio and annotation files to create reference transcripts.

Expected local files include:

- Meeting audio, such as `ES2004a.Mix-Headset.wav`
- AMI annotation XML files
- AMI dataset metadata

The preparation scripts produce the following reference artifacts:

| Output | Description |
|---|---|
| `Results/ES2004a_reference_words.csv` | Word-level reference data prepared from AMI annotations |
| `Results/ES2004a_reference_transcript.txt` | Reference transcript text |
| `Results/ES2004a_reference_normalized.txt` | Normalized reference transcript for text comparison |

Run the preparation script from the repository root:

```bash
python Scripts/prepare_ami_transcript.py
```

Then run the normalization script:

```bash
python Scripts/normalize_ami_reference.py
```

These commands assume the scripts use the expected relative paths and that the required dataset files are present locally.

The current AMI preparation includes the `ES2004a` meeting sample, with approximately 2,614 words in its normalized reference transcript.

### 5.2 LibriSpeech

The LibriSpeech preparation workflow extracts audio clips and reference transcripts from the dataset.

The prepared data includes:

- WAV audio clips under `Datasets/Librispeech/audio/`
- Dataset metadata under `Datasets/Librispeech/metadata/`
- Reference records in `Datasets/Librispeech/transcripts/references.csv`

The reference CSV contains fields such as audio filename, reference text, speaker ID, chapter ID, and sample rate.

Run the preparation script from the repository root:

```bash
python Scripts/prepare_librispeech.py
```

The script requires the source dataset to be available locally. Consult the script for its expected input path and output behavior.

The initial prepared subset contains five audio clips. This is useful for validating the workflow, but a larger and more varied sample is recommended for meaningful performance comparisons.

## 6. Transcription Evaluation

The evaluation pipeline compares transcripts generated by Amazon Transcribe against prepared reference transcripts.

A typical evaluation workflow is:

1. Select an audio sample and its reference transcript.
2. Upload the audio to Amazon S3.
3. Submit a transcription job to Amazon Transcribe.
4. Retrieve the resulting transcript.
5. Normalize the reference and hypothesis using consistent rules.
6. Calculate transcription accuracy metrics.
7. Record runtime, failures, and other relevant performance measurements.
8. Store evaluation results for comparison and reporting.

### 6.1 Word Error Rate

The primary accuracy metric is **Word Error Rate (WER)**:

\[
WER = \frac{S + D + I}{N}
\]

Where:

- \(S\) = number of substitutions
- \(D\) = number of deletions
- \(I\) = number of insertions
- \(N\) = number of words in the reference transcript

Lower WER generally indicates better transcription accuracy. WER can exceed 1.0 (100%) when the number of errors exceeds the number of reference words.

Reference and hypothesis transcripts should use consistent normalization rules for casing, punctuation, numbers, and other text conventions. Any excluded fillers, partial words, or overlapping speech should be documented because those decisions can affect the score.

For meeting audio, speaker diarization and overlapping speech may require separate evaluation from ordinary word-level WER.

### 6.2 Individual WER Evaluation

The script `Scripts/evaluate_wer.py` calculates word-level transcription errors for an individual reference and hypothesis transcript.

It performs text normalization, word alignment, and calculation of:

- Substitutions
- Deletions
- Insertions
- Total edit distance
- Word Error Rate

Example:

```bash
python Scripts/evaluate_wer.py \
    --reference path/to/reference.txt \
    --hypothesis path/to/hypothesis.txt
```

The script generates a CSV results file containing the evaluation metrics.

### 6.3 Batch WER Evaluation

The script `Scripts/evaluate_wer_batch.py` evaluates multiple reference and hypothesis transcript pairs using a manifest CSV.

The manifest must contain:

- `reference_file`
- `hypothesis_file`

Example:

```bash
python Scripts/evaluate_wer_batch.py \
    --manifest path/to/manifest.csv
```

The script calculates individual WER results and aggregate WER across all evaluated transcript pairs.

Aggregate WER is calculated using total edits divided by total reference words:

\[
WER_{\text{aggregate}} =
\frac{\sum(S+D+I)}{\sum N}
\]

This approach weights each transcript according to its reference word count rather than calculating a simple average of individual WER percentages.

### 6.4 LibriSpeech Evaluation

The script `Scripts/evaluate_librispeech.py` evaluates LibriSpeech hypothesis transcripts against the prepared reference CSV.

It expects a hypothesis text file named after each sample ID, such as:

```text
Results/Librispeech_hypotheses/
├── 6930-75918-0000.txt
├── 6930-75918-0001.txt
└── ...
```

Run the evaluator:

```bash
python Scripts/evaluate_librispeech.py
```

The script generates:

| Output | Description |
|---|---|
| `wer_individual.csv` | Individual evaluation metrics for successfully evaluated samples |
| `wer_summary.csv` | Aggregate evaluation metrics, including evaluated samples, missing samples, reference word count, edit counts, and aggregate WER |

The evaluator accounts for missing hypothesis files and empty reference transcripts according to its validation rules.

The default input and output paths can be overridden using the script's command-line arguments.

## 7. Automated Unit Testing

An automated unit testing framework was developed to validate the three WER evaluation scripts independently of AWS.

The tests use Python's built-in `unittest` framework and cover text normalization, word alignment, WER calculations, CSV generation, and error handling.

### 7.1 Test Organization

The `tests/` directory contains:

| Test file | Purpose |
|---|---|
| `test_evaluate_wer.py` | Tests text normalization, word alignment, and individual WER evaluation |
| `test_evaluate_wer_batch.py` | Tests batch processing, individual results, and aggregate WER calculations |
| `test_evaluate_librispeech.py` | Tests LibriSpeech evaluation, missing hypotheses, empty references, and output generation |

### 7.2 Running the Tests

Activate the project's virtual environment and navigate to the repository root.

Run the individual test files:

```bash
python -m unittest tests.test_evaluate_wer -v
python -m unittest tests.test_evaluate_wer_batch -v
python -m unittest tests.test_evaluate_librispeech -v
```

To execute the entire test suite:

```bash
python -m unittest discover -s tests -v
```

### 7.3 Test Coverage and Results

The completed automated test suite contains **31 unit tests**:

| Test suite | Number of tests |
|---|---:|
| Individual WER evaluation | 17 |
| Batch WER evaluation | 6 |
| LibriSpeech evaluation | 8 |
| **Total** | **31
