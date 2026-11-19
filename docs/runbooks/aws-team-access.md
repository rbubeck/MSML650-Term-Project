# AWS Team Access

Status: team access model for the `us-east-2` development environment. Do not record account IDs, portal URLs, user identifiers or resource IDs in this file.

## Three separate identity types

| Identity | Purpose | Credentials |
|---|---|---|
| IAM Identity Center user | Teammate access to the AWS Console/CLI | Temporary portal/SSO session with MFA |
| Cognito application user | Sign in to CloudScribe and test ownership | Personal test email/password and Cognito tokens |
| Lambda execution role | Runtime access to Transcribe, DynamoDB and logs | Temporary credentials supplied to Lambda |

Never substitute one identity for another. Do not share the administrator IAM user, a Cognito login, access keys, tokens or execution-role credentials.

## Team mapping

| Person | Group | Permission set | Intended use |
|---|---|---|---|
| Person 1 | Optional `Observers` | Optional `CloudScribe-Observer` | Normally uses Cognito and public frontend configuration; logs only if needed |
| Person 2 | `BackendDevelopers` | `CloudScribe-BackendDeveloper` | Approved project Lambda/API development and logs |
| Person 3 | `BackendDevelopers`, `Observers` | `CloudScribe-BackendDeveloper`, `CloudScribe-Observer` | Stream/signing integration plus read-only troubleshooting |
| Person 4 | `InfrastructureOperators` | `CloudScribe-InfrastructureOperator` | Approved persistence/infrastructure work |
| Person 5 | `Observers` | `CloudScribe-Observer` | Read-only test evidence and troubleshooting |

An administrator assignment, if used, belongs in a separate admin group containing only the account administrator. Do not expand a developer group to `AdministratorAccess`.

## Console sign-in

1. Open the private IAM Identity Center access-portal URL supplied by the administrator.
2. Sign in with the teammate's own Identity Center identity and MFA.
3. Select the project AWS account.
4. Select the permission set matching the task.
5. Confirm the Console Region is **US East (Ohio) / `us-east-2`** before inspecting resources.
6. Use the least-privileged available role. Person 3 normally uses Observer for inspection and BackendDeveloper only for approved changes.

If the portal shows zero accounts, the user/group/permission-set account assignment is missing or still provisioning. The administrator fixes the assignment; teammates must not create IAM users as a workaround.

## CLI access

When CLI access is needed, use IAM Identity Center temporary credentials through AWS CLI SSO configuration. Do not create an IAM access key. Keep profile names local and nonsensitive, confirm the account/role/Region before commands, and never commit `~/.aws` content.

## Application test access

Each teammate creates and confirms their own Cognito application user through the frontend. Public frontend configuration may include Region, public User Pool ID, public App Client ID and API base URL, but project instructions require actual development identifiers to stay out of tracked files. Put them only in ignored `frontend/.env` or an approved private channel.

No teammate needs another person's Cognito password or `sub`. Backend authorization derives the caller from validated claims.

## Guardrails

- Permission is not approval: follow `aws-development-testing.md` before resource mutations or paid tests.
- Use only approved `cloudscribe-dev-*` resources and explicitly approved API IDs/role ARNs.
- Never broaden `iam:PassRole` to all roles.
- Never place AWS secret keys, client secrets, JWTs, signed URLs, transcript text or personal identifiers in source, tickets, screenshots or logs.
- Report unexpected access immediately and stop before changing the policy yourself.
- The account administrator reviews assignments when a person changes responsibility and removes access when no longer required.
