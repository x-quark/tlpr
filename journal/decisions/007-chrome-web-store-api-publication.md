# ADR 007 — Chrome Web Store publication through the official API

> Date: 2026-11-07
> Status: accepted at the owner's request
> Scope: release tooling only; the extension, its permissions and its package are unchanged

## Context

The owner asked for releases to be published without manual work in the Developer Dashboard. Claude's built-in browser refuses the Chrome Web Store and its dashboard, so the dashboard cannot be driven from there. Google documents the Chrome Web Store API v2 for uploading and submitting new versions of existing items. Version 1.1 was announced as retired on 2026-10-15, although it still answered on 2026-11-07.

## Decision

- Publish with `pnpm webstore`, a Node tool in `tools/` without new dependencies. It calls the v2 `fetchStatus`, `upload`, `publish` and `cancelSubmission` methods
- Authenticate with an OAuth desktop client from a dedicated Google Cloud project, owned by the publisher account and without billing. The consent screen is External and in production, so refresh tokens do not expire after 7 days. The app stays unverified because only the publisher uses it
- Keep the client, the refresh token and the publisher ID in a local file outside the repository, or in environment variables, and never print them
- Keep `tools/` out of the extension package and out of its bundled corresponding source. Building or running TL;PR does not need it, and the package must not carry OAuth code that a reviewer could mistake for extension behavior
- Refuse a package without a root manifest, with a checksum that differs from its `.sha256`, with a version the store already knows, or while another submission waits for review
- Submit with the default publish type, which publishes after approval, unless `--staged` is given
- Leave listing copy, visuals and privacy declarations to the dashboard, because the API does not cover them

## Alternatives rejected

### Service account

A service account must be registered in the dashboard and relies on a long-lived key file. It brings no advantage for a single local publisher.

### GitHub Actions workflow

The publication guide currently forbids triggering GitHub Actions, and the credentials would have to live in repository secrets.

### OAuth app left in testing

Google expires refresh tokens of external testing apps after 7 days, which would require a new consent before most releases.

## Validation

`tools/chrome-web-store.test.mjs` covers version ordering, checksum verification, credential loading without echoing secrets, the upload, wait and submit sequence, error messages and command guards. TL;PR 0.3.2 was uploaded and submitted for review on 2026-11-07 with these OAuth credentials. Because the publisher ID was not yet available, that submission used the v1.1 endpoints, which need no publisher ID.

## Rollback

Delete the OAuth client or the Google Cloud project, revoke the app in the Google account, then remove `tools/` and the `webstore` script. Manual publication from the dashboard keeps working.
