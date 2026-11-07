---
name: publish-chrome-web-store
description: Publish or check a TL;PR release on the Chrome Web Store through the official API. Use when asked to publish, ship, release or submit TL;PR to the Chrome Web Store, to check its review status, or to cancel a pending submission.
---

# Publish TL;PR to the Chrome Web Store

`pnpm webstore` (`tools/chrome-web-store.mjs`) calls the official Chrome Web Store API v2 with the publisher account. It uploads `release/tlpr-v<version>.zip` to the existing item `ejclfjeilcfnjdocgnmloilcaocelgnp` and submits it for review. Claude's built-in browser cannot open the Developer Dashboard, so the API is the only path Claude can drive.

## Before publishing

1. The version bump is merged on `main` as `AGENTS.md` requires: commits and merges carry `[skip ci]`, and no tag is pushed
2. `pnpm check` passed on that commit, which produced the ZIP and its `.sha256`
3. Compare `docs/publication-chrome-web-store.md` and `src/manifest.json` with the previous release. Listing copy, visuals, permissions and privacy answers only change in the dashboard: tell the user exactly what to update there, and never claim the API did it
4. A new permission makes Chrome disable the extension until each user accepts it; say so before submitting

## Publish

```bash
pnpm webstore status
pnpm webstore publish --dry-run
pnpm webstore publish
```

- Report the resulting state, normally `PENDING_REVIEW`, and every store warning verbatim
- Review usually takes a few hours to a few days; check later with `pnpm webstore status`
- With `--staged`, an approved version waits; release it with `pnpm webstore submit --staged`
- Cancel a pending submission with `pnpm webstore cancel` only when the user asks

## When something fails

- **Missing `clientId`, `clientSecret`, `refreshToken` or `publisherId`**: follow "Publication par l’API" in the publication guide. Only the user can sign in to Google, so ask them for that and, if missing, for the publisher ID shown in Developer Dashboard > Publisher > Settings
- **Authorization expired or revoked**: run `pnpm webstore login` in the background, open the printed address in the built-in browser, choose the publisher account and allow access
- **Version must be higher**: bump the version, merge, and run `pnpm check` again
- **Submission waiting for review**: wait for it, or cancel only on the user's request

Never print, commit or paste the credentials file or its values, and never upload a ZIP that `pnpm check` did not validate.
