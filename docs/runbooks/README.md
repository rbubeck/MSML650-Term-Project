# Runbooks

Owner: Person 5 defines operational response; Person 4 coordinates infrastructure details; component owners provide diagnosis/mitigation steps.

## Available now

- [Amazon Transcribe streaming smoke test](amazon-transcribe-smoke-test.md): bounded manual verification of local PCM through the official SDK. This is a development procedure, not a deployed-service incident runbook.

## Add only with observable behavior

Future runbooks accompany their actual alarms/components and will cover:

- no healthy streaming targets and ECS task drain;
- Transcribe capacity/quota/provider failures;
- checkpoint/export failures and reconciliation lag;
- abnormal AWS cost;
- credential/token/ticket exposure;
- suspected cross-user access;
- deletion or retention failure.

Each operational runbook must name the triggering alarm, owner, safe diagnostics, privacy restrictions, mitigation, rollback/escalation and verification. Do not invent console paths, metrics, resources or commands for infrastructure that has not been deployed.
