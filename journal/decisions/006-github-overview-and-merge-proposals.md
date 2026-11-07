# ADR 006 — GitHub Overview support and merge message proposals

> Date: 2026-11-07
> Status: accepted for the owner-requested 0.3.0 delivery
> Supersedes: the heading, title and refusal rules of ADR 004; every permission, privacy and zero-submission constraint remains

## Context

GitHub released the pull request **Overview** page as an opt-in public preview on 2026-11-05. It moves merge status to the top, shows the description in its own section and lists comments, reviews and commit groups in a `Comments` section anchored by `#overview-comments`, newest first by default. The classic conversation stays available with `?overview=false`. TL;PR found no `.js-discussion` container there and stayed inactive.

Live probes on public pages also showed three regressions in the current GitHub markup:

- The React issue viewer no longer exposes `issue-viewer-container` and carries the comment anchor on the comment header, so React issues were never enhanced
- GitHub App authors render as `github-actions` plus a “Bot” label without `[bot]`, so bot comments were folded despite the contract
- The React pull request header renders `h1[data-component="Heading"] .markdown-title`, so the merge helper could not read the title

The merge helper therefore never worked in practice. The owner's repositories post proposals as a comment headed “🧾 Proposed merge commit” whose ` ```git ` block holds the complete message (subject, blank line, body), sometimes as a lone ` ```git ` block, and in older pull requests as “🧾 Merge commit body” with a body-only Markdown block. Only the last form was recognized, and only the description was filled for default `Merge pull request #N` titles, which also refused squash forms.

## Decision

- Detect the view on every scan: Overview (`#overview-comments` section and its Description section), classic timeline, React issue viewer, then a generic anchor-based fallback without timeline folding. The popup can pin the classic or Overview interpretation (`layout` in `tlpr-settings:v1`, default `auto`)
- Normalize anchors (`issuecomment-N`, `pullrequestreview-N`, `discussion_rN`), including Overview prefixes and React header anchors, so one folding preference applies to every view under `gh-pr-comment-collapse:v3`
- Assign a body to the comment whose header precedes it; nested review threads keep their own bodies
- Keep the chronologically first two and last three timeline items. Read the order from timestamps, then the Overview sort control, then the view default
- Treat `/apps/` author links, bot hovercards, a “Bot” label or a `[bot]` suffix as automated authors and never modify those comments
- Offer the same pull request in GitHub's other view only from the Overview, or back from `?overview=false`. TL;PR never changes the GitHub account preference
- Designate a merge proposal with a visible heading containing 🧾, “merge commit” or “commit message” and the single code block of its section, or with a comment made only of one git-language block
- Fill **Commit message** and **Extended description** from a complete message. For a body-only template, use the pull request title without its leading emoji followed by `(#number)` as the subject and the template as the body: the owner's recent merges of such pull requests use exactly this form instead of GitHub's `Merge pull request #N from …` default
- Preselect the latest proposal and keep every proposal visible and switchable. Never substitute another proposal when an explicit choice changes
- Accept only a visible description/title pair whose title names the current pull request, was written by TL;PR, or sits next to a “Confirm … merge” button. Refuse titles naming another pull request and suggestion commit dialogs
- Require a second explicit click before replacing text the user typed, and offer **Undo**. Nothing is submitted, merged, fetched or stored
- Measure every comment before changing the page, and ignore mutations outside the conversation unless they add a conversation container or a merge field

## Alternatives rejected

### Redirect to the classic view automatically

Redirecting would override a choice the user made on GitHub, double page loads and break when GitHub retires the parameter. A visible one-click link keeps the choice with the user.

### Read the hidden Markdown marker

Raw Markdown is only reachable through GitHub endpoints or embedded application data. Network access and private API use stay excluded, and embedded data is incomplete after pagination.

### Keep refusing non-default merge titles

The title guard prevented insertion in every squash merge and after any edit. Explicit consent, a second confirmation for typed text and Undo protect the form without blocking the feature.

## Validation

The automated suite covers the reconstructed Overview structure (newest-first lists, commit groups, review threads, description, bots), React issue headers, classic App comments, every proposal format, title and description insertion, Undo, confirmation, squash forms, suggestion dialogs and stale forms, with V8 coverage thresholds. Diagnostic probes ran on public classic pull request and React issue pages. The Overview requires an opted-in account, so its fixture is reconstructed from GitHub's public page bundle captured on 2026-11-07.

## Rollback

Revert the release. Folding preferences stay compatible, and earlier versions drop the unknown `layout` setting when they save preferences.
