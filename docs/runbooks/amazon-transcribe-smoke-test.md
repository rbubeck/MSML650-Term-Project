# Amazon Transcribe Streaming Smoke Test

Status: Manual development runbook

This verifies one narrow boundary: contract-compatible PCM can be streamed through the official AWS SDK and produces partial/final Amazon Transcribe results. It does not verify browser capture, WebSockets, persistence, reconnects, load, latency SLOs, or production IAM.

Last verified: 2026-11-02, `us-east-1`, 4.016 seconds of synthetic macOS speech, partial and final `en-US` results. This evidence is manual and must not be treated as a CI or accuracy benchmark.

## Prerequisites

- Use a non-production AWS account or development role.
- Select and record the approved AWS Region before testing.
- Grant only `transcribe:StartStreamTranscription` on resource `*` to the test principal.
- Install AWS CLI v2 and Node.js 24.
- Never place access keys in this repository or an `.env` file.

The development principal needs this smoke-test policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "transcribe:StartStreamTranscription",
      "Resource": "*"
    }
  ]
}
```

Use short-lived credentials. If the account uses IAM Identity Center:

```bash
aws configure sso --profile live-transcription-dev
aws sso login --profile live-transcription-dev
aws sts get-caller-identity --profile live-transcription-dev
```

If the account uses normal AWS Management Console sign-in, AWS CLI v2.32 or later can create temporary local-development credentials:

```bash
aws login --profile live-transcription-dev
aws sts get-caller-identity --profile live-transcription-dev
```

The console identity needs AWS's `SignInLocalDevelopmentAccess` permission to use `aws login`. Do not create a long-lived IAM access key solely for this test, and do not use the root user for routine development.

## Create harmless local test audio on macOS

The checked-in runner accepts mono 16-bit PCM at exactly 16,000 Hz. This generates synthetic speech locally, outside the repository:

```bash
mkdir -p /tmp/live-transcription-smoke
say -o /tmp/live-transcription-smoke/speech.aiff "Hello. This is a short Amazon Transcribe streaming test."
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/live-transcription-smoke/speech.aiff /tmp/live-transcription-smoke/speech.wav
```

Do not use customer audio, private conversations, or regulated data for this smoke test.

## Run

From the repository root, replace the Region only after the orchestrator approves it:

```bash
AWS_PROFILE=live-transcription-dev \
AWS_REGION=us-east-1 \
npm run transcribe:smoke --workspace @live-transcription/streaming -- \
/tmp/live-transcription-smoke/speech.wav
```

The runner:

- uses `en-US` unless `TRANSCRIBE_LANGUAGE_CODE` is set;
- sends accepted 100 ms PCM frames and zero-pads the final short frame;
- paces frames in real time;
- rejects input longer than 30 seconds;
- prints transcript text only to the operator's terminal;
- makes no persistence or infrastructure changes.

Stop with Ctrl-C. A successful run shows one or more `[partial]` lines and at least one `[final]` line. Record the Region, test time, audio duration, success/failure category, and SDK version; do not copy transcript text or credentials into shared logs.

## Common failures

- `UnrecognizedClientException` or expired token: renew the approved profile session.
- `AccessDeniedException`: verify the principal has `transcribe:StartStreamTranscription`.
- `OptInRequired` / “needs a subscription”: the AWS account plan has not enabled Transcribe; resolve the account plan with the account owner rather than changing application code.
- `BadRequestException`: verify mono signed 16-bit little-endian PCM at 16 kHz and a supported streaming language.
- `LimitExceededException`: stop and review account concurrency quota; do not add unbounded retries.
- No final transcript: use clear speech with leading/trailing silence, then verify the audio locally before changing code.

The development account has a $20 monthly AWS Budget alert. It is not a hard cap, billing data can be delayed, and it does not authorize load tests or infrastructure deployment.
