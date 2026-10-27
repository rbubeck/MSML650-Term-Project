# Audio Transcription Testing and Evaluation

## 1. Project Overview

This repository supports the testing, performance evaluation, and monitoring of an audio transcription pipeline using **Amazon Transcribe** and AWS services.

The project prepares audio datasets and reference transcripts so that transcription outputs can be compared against known text. The resulting measurements can be used to evaluate transcription accuracy and investigate performance across different audio samples.

The repository currently includes preparation scripts and reference data for:

- **AMI Meeting Corpus:** Meeting audio and annotations used to prepare reference transcripts.
- **LibriSpeech:** English speech recordings with corresponding reference transcripts.
- **Common Voice:** An additional English speech dataset being prepared for potential evaluation.

The broader AWS workflow may use Amazon S3 to store audio files, Amazon Transcribe to generate transcripts, AWS Lambda to automate processing, and Amazon CloudWatch to monitor execution and performance.

## 2. Repository Structure

```text
Audio_Transcription_Testing/
├── README.md
├── .gitignore
├── Scripts/
│   ├── prepare_ami_transcript.py
│   ├── normalize_ami_reference.py
│   └── prepare_librispeech.py
├── Datasets/
│   ├── AMI/
│   │   ├── Audio/
│   │   ├── Annotations/
│   │   └── Metadata/
│   ├── Librispeech/
│   │   ├── audio/
│   │   ├── metadata/
│   │   ├── transcripts/
│   │   └── test_clean
│   └── common_voice/
├── Results/
│   ├── ES2004a_reference_words.csv
│   ├── ES2004a_reference_transcript.txt
│   └── ES2004a_reference_normalized.txt
└── .venv/
```

**Note:** This tree illustrates the local project layout. Large source datasets, audio files, and the Python virtual environment are excluded from Git and are not expected to appear in the GitHub repository. Directory capitalization may differ depending on the local setup.

## 3. Requirements

- Python 3
- Git
- Access to the required datasets
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
| `Results/ES2004a_reference_words.csv` | Word-level reference data prepared from the AMI annotations |
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

### 5.3 Common Voice

Common Voice is an additional candidate dataset for English speech evaluation.

Before using it:

1. Obtain the dataset from the official [Common Voice website](https://commonvoice.mozilla.org/en/datasets).
2. Extract the downloaded archive locally.
3. Inspect
