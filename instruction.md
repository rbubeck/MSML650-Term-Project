# Personal AWS Smoke-Test Setup: Cognito, Lambda, and API Gateway

Last verified against repository code: 2026-11-10  
Purpose: let a contributor use their own AWS account to run the narrow authenticated live-caption smoke path  
Reference Region used by the team: `us-east-2`

## Read this first

This guide creates a temporary development stack for this path only:

```text
local browser
  -> Cognito sign-up/sign-in
  -> API Gateway HTTP API with JWT authorization
  -> Lambda stream-URL signer
  -> short-lived presigned WebSocket URL
  -> browser streams PCM directly to Amazon Transcribe
  -> partial/final captions return directly to the browser
```

The Lambda does **not** proxy audio. It signs a short-lived URL with its execution-role credentials. Never put an AWS access key, secret key, client secret, JWT, presigned URL, transcript, or personal identifier in this repository, screenshots, chat, or logs.

This setup uses the deliberately temporary `smoke-test-lambda.ts` entry point. It supports exactly one Cognito owner and one configured session and keeps its epoch counter in Lambda memory. It is suitable only for a short single-user development smoke. It does not provide DynamoDB durability, final-segment saving, history, deletion, isolation evidence, reliable reconnect epochs, or the one-hour MVP test.

### Current frontend prerequisite

At merge commit `9b9ee24`, the frontend prepares PCM but discards it, and its direct stream adapter is missing. Creating AWS resources alone will therefore **not** produce captions on that revision. Apply the repair described in [DEBUG_REPORT.md](DEBUG_REPORT.md) first. In particular, the repaired frontend must restore:

- the `@live-transcription/stream-client` dependency;
- the capture-to-`TranscribeStreamClient` adapter;
- validated `requestStreamCapability(sessionId)` handling;
- the temporary `VITE_LIVE_SESSION_ID` smoke configuration; and
- microphone/system-audio source selection with browser-side mixing.

Do not revert the whole frontend to an older commit. Preserve the newer source-selection and paragraph-display work while restoring the missing integration.

## Cost, account, and cleanup approval

Before creating anything, choose and record privately:

- the AWS account you are authorized to use;
- one AWS Region used consistently by Cognito, Lambda, API Gateway, and Transcribe;
- who will create and delete the resources;
- a small test duration and cost bound; and
- a cleanup time.

Amazon Transcribe Streaming is a paid service. Lambda, API Gateway, Cognito, and CloudWatch may also incur usage or storage charges. Check current AWS pricing, service availability, quotas, and any free-tier eligibility for your account. Create or confirm a budget alert before testing. A budget alert is notification only, not a hard spending cap.

This guide uses `us-east-2` in examples because that Region passed the team smoke test. A different supported Region is acceptable, but every Region value and endpoint must match.

## Values you will collect

Keep this table in a private, untracked note. Do not commit the completed values.

| Placeholder | Meaning |
|---|---|
| `<REGION>` | One Region, for example `us-east-2` |
| `<USER_POOL_ID>` | Cognito User Pool ID |
| `<APP_CLIENT_ID>` | Public Cognito app client ID |
| `<COGNITO_USER_SUB>` | Private `sub` attribute of the test user |
| `<SESSION_ID>` | An opaque smoke-session ID, 1–128 characters |
| `<LAMBDA_NAME>` | Your temporary Lambda function name |
| `<API_BASE_URL>` | HTTPS invoke URL, including a stage path if one exists |

Use unique resource names such as `cloudscribe-<your-initials>-smoke` so you do not modify another contributor's resources.

## 1. Verify the repository locally

Use Node.js 24 and npm 11. From the repository root:

```bash
node --version
npm --version
npm ci
npm run build --workspace @live-transcription/contracts
npm run test --workspace @live-transcription/api
npm run bundle:smoke --workspace @live-transcription/api
```

The self-contained Lambda bundle is generated at:

```text
backend/api/dist/smoke/index.mjs
```

Create a ZIP with `index.mjs` at the ZIP root.

macOS/Linux example:

```bash
cd backend/api/dist/smoke
zip -j ../../cloudscribe-smoke-lambda.zip index.mjs
cd ../../../..
unzip -l backend/api/cloudscribe-smoke-lambda.zip
```

PowerShell example from the repository root:

```powershell
Compress-Archive -Path backend/api/dist/smoke/index.mjs -DestinationPath backend/api/cloudscribe-smoke-lambda.zip -Force
```

Inspect the archive and confirm it contains `index.mjs` at its root, not inside nested directories. Do not commit `dist/`, the ZIP, `.env`, or any generated configuration.

## 2. Create the Cognito User Pool

Open the Amazon Cognito console in `<REGION>` and create a User Pool/application for a browser SPA.

Use these settings:

- Sign-in identifier: **email**.
- Required attribute: **email** only.
- Email verification: enabled with a confirmation message/code.
- Self-registration: enabled for this temporary test, unless you have an approved alternative that produces a permanent-password user.
- MFA: off or optional. The current frontend does not implement additional MFA/challenge screens.
- App type: public single-page/browser client.
- Client secret: **do not generate one**. A browser cannot protect a client secret.
- Authentication: allow the standard Cognito user-password SRP flow used by Amplify and refresh-token authentication.
- Hosted UI/domain: not required by the current direct Amplify Auth calls.
- If the console requires a return URL, use the exact local origin you will run, such as `http://127.0.0.1:5173/`; the current code does not otherwise depend on Hosted UI redirects.

Save these non-secret values privately:

```text
<REGION>
<USER_POOL_ID>
<APP_CLIENT_ID>
```

Do not confuse an app client ID with a client secret. The client ID is expected in the frontend; a secret must never be used by this SPA.

### Test-user timing

The Lambda must eventually contain the test user's exact Cognito `sub`. It is easiest to finish the Lambda and API with a temporary placeholder owner, start the frontend, sign up and confirm the user, then copy the user's `sub` from **Cognito > User Pool > Users > the test user > Attributes** and update the Lambda environment before starting transcription.

The backend intentionally derives ownership from the validated access-token `sub`; an email address is not a valid owner ID.

## 3. Create the Lambda execution role

Create a role trusted by the Lambda service. Attach the AWS-managed `AWSLambdaBasicExecutionRole` policy for CloudWatch logging.

Add one inline policy for Transcribe WebSocket signing:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowTranscribeStreamingWebSocket",
      "Effect": "Allow",
      "Action": "transcribe:StartStreamTranscriptionWebSocket",
      "Resource": "*"
    }
  ]
}
```

`Resource: "*"` follows the documented Transcribe WebSocket permission model. Do not attach broad administrator, full-access, Cognito, API Gateway, S3, or DynamoDB policies to this smoke Lambda.

The role's trust relationship must allow:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

## 4. Create and configure the Lambda function

In the Lambda console in `<REGION>`:

1. Create a function from scratch.
2. Name it `<LAMBDA_NAME>`.
3. Select runtime **Node.js 24.x**.
4. Select the execution role created above.
5. Do not attach the function to a VPC for this smoke test.
6. Upload `backend/api/cloudscribe-smoke-lambda.zip` as the function code.
7. Set the handler to:

   ```text
   index.handler
   ```

8. A small configuration such as 128 MB memory and a 10-second timeout is sufficient for signing; this function does not process audio.

Add these environment variables:

```dotenv
ENABLE_SMOKE_TEST_SESSION_REPOSITORY=true
SMOKE_TEST_SESSION_ID=<SESSION_ID>
SMOKE_TEST_OWNER_ID=temporary-owner-until-cognito-user-exists
SMOKE_TEST_LANGUAGE_CODE=en-US
STREAM_URL_EXPIRY_SECONDS=60
```

Choose `<SESSION_ID>` yourself, for example a non-personal opaque value such as `smoke-session-01`. Use the same value later in the frontend. Do not use an email address, name, account ID, or other personal data.

Do **not** define any of these variables yourself:

```text
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
```

Lambda supplies temporary runtime credentials from the execution role. The application reads them only inside the signer and never returns the secret or derived signing key.

Do not invoke the function directly merely to inspect a successful response: a successful response contains a sensitive presigned URL. Test it through the authenticated API/browser path after configuration is complete.

## 5. Create the API Gateway HTTP API

Create an **HTTP API**, not a REST API and not a WebSocket API.

### Lambda integration

1. Add the Lambda function as a Lambda proxy integration.
2. Use payload format version **2.0**.
3. In the same Region, API Gateway's console normally adds permission for API Gateway to invoke the Lambda. Verify the Lambda resource policy/integration if requests later return an integration error.

### Route

Create exactly this route:

```text
POST /v1/sessions/{sessionId}/stream-url
```

Integrate it with `<LAMBDA_NAME>`.

The path parameter name must be exactly `sessionId`, including capitalization, because the handler reads `event.pathParameters.sessionId`.

Use the `$default` stage with automatic deployment for the simplest local setup. If you use a named stage, include that stage in `<API_BASE_URL>`.

### JWT authorizer

Create a JWT authorizer with:

```text
Identity source: $request.header.Authorization
Issuer: https://cognito-idp.<REGION>.amazonaws.com/<USER_POOL_ID>
Audience: <APP_CLIENT_ID>
```

Attach this authorizer to the `POST /v1/sessions/{sessionId}/stream-url` route. Do not leave the route publicly accessible.

The frontend sends a Cognito **access token**. API Gateway validates the token signature, issuer, client/audience, and expiry, then passes the claims to Lambda. The Lambda additionally requires `token_use` to equal `access` and derives the owner from `sub`; ID tokens are rejected.

### CORS

Configure HTTP API CORS for only the local origins you actually use:

```text
Allowed origins:
  http://127.0.0.1:5173
  http://localhost:5173        # include only if you use it

Allowed methods:
  POST
  OPTIONS

Allowed headers:
  Authorization
  Content-Type
```

Do not use `*` for origins in a shared or persistent environment. The frontend uses bearer headers, not browser cookies, so credentials/cookie mode is not required.

Deploy the API and save its invoke URL as `<API_BASE_URL>`. For a `$default` stage it normally has this form:

```text
https://<api-id>.execute-api.<REGION>.amazonaws.com
```

Do not append `/v1`; the frontend adds the route prefix. Remove a trailing slash from the value.

## 6. Configure and start the frontend

After the [frontend repair](DEBUG_REPORT.md) has restored the smoke configuration, create the untracked file `frontend/.env`:

```dotenv
VITE_APP_MODE=aws
VITE_API_BASE_URL=<API_BASE_URL>
VITE_COGNITO_USER_POOL_ID=<USER_POOL_ID>
VITE_COGNITO_CLIENT_ID=<APP_CLIENT_ID>
VITE_COGNITO_REGION=<REGION>
VITE_LIVE_SESSION_ID=<SESSION_ID>
```

All `VITE_` values are compiled into browser JavaScript. They may contain public configuration such as IDs and the API URL, but must never contain AWS credentials, a Cognito client secret, JWT, presigned URL, password, or user `sub`.

Start the frontend:

```bash
npm run dev --workspace @live-transcription/frontend
```

Open the exact origin allowed by CORS, normally:

```text
http://127.0.0.1:5173
```

## 7. Create the test user and bind the smoke session

1. In the frontend, choose sign up and register a test email.
2. Enter the email confirmation code.
3. Sign in with the confirmed account.
4. In the Cognito console, open that user and copy the `sub` attribute privately.
5. In the Lambda environment variables, replace the placeholder:

   ```dotenv
   SMOKE_TEST_OWNER_ID=<COGNITO_USER_SUB>
   ```

6. Save the Lambda configuration and wait for the update to finish.
7. Confirm `SMOKE_TEST_SESSION_ID` exactly matches `VITE_LIVE_SESSION_ID`.

Do not place `<COGNITO_USER_SUB>` in the frontend, URL, repository, logs, screenshots, or metric dimensions.

If the frontend reports an unsupported additional sign-in step, check that the test user has a permanent password and that mandatory MFA or another challenge was not enabled. Do not weaken a shared production pool to work around this temporary UI limitation; use a dedicated development pool.

## 8. Run the short live-caption smoke

Before starting, open CloudWatch only to observe safe invocation/error metadata. Do not add request/response logging that would capture authorization headers or the signed response body.

1. Sign in through the frontend.
2. Open the live-transcription page.
3. Select at least one browser audio source:
   - **Microphone**, or
   - **System/shared audio**.
4. If both selectors are enabled, the browser should mix them into one PCM stream. There is no third **Both** option and no backend audio mixing.
5. Grant only the requested browser permissions. For system/shared audio, choose a tab/window/screen that actually supplies an audio track and enable **Share audio**.
6. Start the live session.
7. Confirm the frontend shows increasing PCM chunks and then real partial/final-observed captions.
8. Stop promptly after the bounded test and confirm browser capture indicators end.

Expected control flow:

```text
POST <API_BASE_URL>/v1/sessions/<SESSION_ID>/stream-url
Authorization: Bearer <Cognito access token>
body: absent

API Gateway validates JWT
Lambda checks token_use=access and sub=<COGNITO_USER_SUB>
Lambda checks sessionId=<SESSION_ID>
Lambda signs with execution-role credentials
browser receives a 60-second connection-start capability
browser opens the direct Transcribe WebSocket
```

The 60 seconds limits when the browser may open the connection. It is not the stream-duration limit. A reconnect must request a fresh capability.

Do not copy the response URL from browser developer tools. It is a replayable bearer capability until expiry.

## 9. Minimum verification checklist

Record only pass/fail, time, browser/OS, Region, and safe error codes. Do not record audio, transcript text, token values, URLs, user IDs, or session IDs.

- [ ] Missing Authorization header is rejected by API Gateway.
- [ ] Signed-in configured user receives a stream capability.
- [ ] Another user cannot use the configured session; it receives the same safe not-found response as a missing session.
- [ ] The browser sends 16 kHz mono PCM directly to Transcribe.
- [ ] Real partial and final-observed captions appear.
- [ ] Microphone-only does not open the display-sharing picker.
- [ ] System/shared-audio-only does not request microphone permission.
- [ ] Enabling both source selectors mixes in the browser.
- [ ] Stop closes capture and the provider stream.
- [ ] No JWT, signed URL, PCM, transcript text, email, or `sub` appears in application logs.
- [ ] No caption is labeled durably saved; persistence is not implemented in this smoke stack.

## 10. Troubleshooting

### The UI says the streaming client is not implemented or no captions appear

The frontend regression described in `DEBUG_REPORT.md` has not been repaired. At `9b9ee24`, PCM is deliberately discarded. AWS configuration cannot fix that code path.

### Sign-in works, but the API returns 401/Unauthorized

Check:

- the authorizer is attached to the exact route;
- issuer contains the correct Region and full User Pool ID;
- audience is the public app client ID;
- the frontend is sending the access token, not the ID token;
- the token is not expired; and
- `token_use` is `access`.

Sign out and back in after changing Cognito configuration.

### The API returns 404/NOT_FOUND

For privacy, a missing session and an owner mismatch look the same. Confirm privately:

- `SMOKE_TEST_OWNER_ID` exactly equals the signed-in user's Cognito `sub`;
- `SMOKE_TEST_SESSION_ID` exactly equals `VITE_LIVE_SESSION_ID`; and
- the frontend called the expected API/Region.

### The API returns 400/INVALID_INPUT

Confirm the route path parameter is named `sessionId`, the session ID is 1–128 characters, and the request body is absent, empty, or `{}`. The frontend should send no language, PCM, Region, or signing parameters.

### The API returns 502/SIGNING_FAILED or the WebSocket is rejected

Check:

- Lambda and Transcribe use the same supported `<REGION>`;
- the execution role includes only the required Transcribe WebSocket action plus logging;
- `SMOKE_TEST_LANGUAGE_CODE` is valid and supported;
- Lambda supplies its own runtime credentials;
- the URL was used before its connection-start expiry; and
- the local machine clock is reasonably accurate.

Request a new URL rather than reusing an expired one. Never paste the URL into logs or support messages.

### Browser reports a CORS error

The allowed origin must exactly match scheme, host, and port. `localhost` and `127.0.0.1` are different origins. Confirm `Authorization` and `Content-Type` are allowed headers and `POST`/`OPTIONS` are allowed methods.

### System/shared audio has no PCM

This is a browser source-selection issue, not a Lambda issue. Choose a source that exposes audio, enable **Share audio**, and confirm the browser returned an audio track. Browser/OS support varies; record the tested combination without claiming universal support.

### Cognito sign-up email does not arrive

Check the user status and email-delivery configuration in Cognito. Development email delivery can have account limits. Do not repeatedly create users or expose confirmation codes.

### Lambda integration returns a generic 500/502

Verify:

- the ZIP contains `index.mjs` at its root;
- runtime is Node.js 24.x;
- handler is `index.handler`;
- payload format is 2.0;
- all five application environment variables are present; and
- API Gateway has permission to invoke the function.

Inspect CloudWatch for safe configuration/runtime errors only. Do not enable full event or response logging.

## 11. Cleanup

After the test:

1. Stop browser capture and close the local app.
2. Delete the API Gateway HTTP API.
3. Delete the Lambda function.
4. Delete its CloudWatch log group after checking that it contains no sensitive data.
5. Delete the dedicated Lambda execution role and inline policy if nothing else uses them.
6. Delete the temporary Cognito User Pool and test users if the pool is dedicated to this test.
7. Delete the local Lambda ZIP, generated bundle, and `frontend/.env` when no longer needed.
8. Review the AWS billing/cost console for residual usage and record cleanup completion privately.

Never delete a shared resource merely because its name resembles the examples. Verify the exact account, Region, ARN, and owner first.

## Official AWS references

- [Cognito browser application options](https://docs.aws.amazon.com/cognito/latest/developerguide/getting-started-user-pools-application-other-options.html)
- [Cognito access-token claims](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html)
- [API Gateway HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [API Gateway HTTP API Lambda proxy integrations](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
- [Lambda Node.js ZIP deployment](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html)
- [Lambda execution-role permissions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html)
- [Amazon Transcribe WebSocket streaming setup](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html)
