---
status: partial
phase: 02-authentication
source: [02-VERIFICATION.md]
started: 2026-04-09
updated: 2026-04-09
---

## Current Test

[awaiting human testing on running stack]

## Tests

### 1. End-to-end registration + invite flow
expected: Run `docker compose up`. First user registers without invite (auto-admin). Run `npm run invite --workspace=server` (or admin endpoint) to generate an invite token. Second user registers with that invite token successfully. Both users can log in immediately after registering.
result: [pending — requires running stack]

### 2. Session persistence across browser restart
expected: Log in to the app. Close the browser completely. Reopen and navigate to `/`. User remains logged in (the 401 interceptor transparently refreshes the access token using the long-lived refresh_token cookie). Session list shows the persisted device.
result: [pending — requires running stack]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
