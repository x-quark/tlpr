# ADR 004 — Explicit merge description insertion

> Date: 2026-10-08
> Status: accepted for local development
> Supersedes: the copy-only boundary of ADR 003; all permission and privacy constraints remain

## Context

The requested helper should place the PR title and the designated comment's code block directly in GitHub's extended merge description when the user selects Insert. GitHub now renders React titles and merge fields with generated ids and no form or name attributes, while highlighted code blocks do not always contain a code element.

## Decision

- Keep the optional helper off by default and retain the existing local preview/copy action
- Find a merge description through an associated visible label or established legacy field identity; pair it only with a default merge title for the current PR number
- Insert only after the explicit Insert action, leaving the commit title untouched and never clicking or submitting any GitHub action
- Use the PR title, one blank line, and the exact text of one code block under the visible designated heading
- Disclose that rendered HTML cannot verify the hidden Markdown marker; require an explicit selection and preview if several source comments qualify
- Refuse custom or manually edited descriptions, including deliberately blank descriptions; retain this guard through GitHub's DOM/control replacement
- Fail closed for missing or ambiguous titles, stale forms, edited comments, and code blocks belonging to another section
- Add no Chrome permission, network request, private API access, telemetry, or remotely hosted code
- Treat control identity and visible editing state as lifecycle evidence; copied DOM markup alone does not prove that a control still owns its listener

## Validation

Tests cover the current captured GitHub title, comment and merge-form structures, repeated last-comment toggles/reloads, cached editors, attribute-only edit transitions, DOM clones, source ambiguity, native textarea value tracking, manual edits and zero submissions.

This change does not itself authorize installation, GitHub publication, or Chrome Web Store submission. A candidate still requires the repository's release checks and a verified no-CI publication path.
