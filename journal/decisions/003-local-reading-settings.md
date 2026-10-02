# ADR 003 — Local reading preferences and an optional copy-only helper

> Date: 2026-09-30
> Status: accepted for local development

## Context

Users need a predictable way to pause TL;PR and adjust language, animation, and state colors without changing source code. The optional merge-message helper must remain off unless a user deliberately enables it. Preferences must apply to the toolbar popup and already-open GitHub conversations without a background service or a page reload.

The initial architecture avoided named Chrome permissions. A GitHub page's `localStorage` cannot safely provide extension-owned preferences to the toolbar popup. It also exposes preferences to that site's origin and does not cover extension contexts. The existing userscript-compatible fold state is a separate concern.

## Decision

- Add a self-contained toolbar popup with accessible native switches and a language selector (`auto`, `fr`, `en`)
- Use `chrome.storage.local` with the versioned key `tlpr-settings:v1`
- Request exactly one named permission, `storage`, solely to persist these five preferences and listen for local changes across extension contexts
- Keep defaults: enabled `true`, language `auto`, animations `true`, state colors `true`, and merge helper `false`
- Sanitize every stored value and patch, ignore unknown keys, and preserve valid existing values during updates
- Report read/write errors in the popup, keep controls disabled when preferences cannot be loaded, and restore the saved state after a failed write
- Apply changes in content scripts through the settings subscription, with no background worker
- Keep the legacy fold-state key `gh-pr-comment-collapse:v3` and its behavior separate and unchanged
- Keep static content-script matches limited to GitHub pull requests and issues; add no host, tabs, activeTab, scripting, clipboard, optional, or background permissions
- Keep the optional merge-message helper user-triggered and copy-only: it does not merge, approve, submit, or publish anything
- Package popup HTML, CSS, JavaScript, and translations locally. Use no remotely loaded code, fonts, telemetry, or remote service
- Preserve GPL-3.0-only licensing and the source/license notices in the archive

## Alternatives rejected

### GitHub localStorage for extension preferences

The toolbar is a different origin, so it cannot share GitHub's page storage. Using a bridge would add unnecessary complexity and expose extension preferences to page scripts.

### chrome.storage.sync

Preferences only need to persist in this browser. Sync would add cloud replication without a product need or user request.

### A background worker with messaging

The storage change event already reaches the popup and content scripts. A worker would add lifecycle and messaging complexity without adding value.

### Clipboard, tabs, or broader host permissions

The popup changes local preferences. The optional helper prepares content only on an explicit interaction in the current GitHub page. These capabilities do not justify broader extension permissions.

## Consequences

- The previous “no named permissions” invariant is deliberately narrowed to exactly `storage`, and the manifest/package tests enforce it
- Settings stay on the current browser profile and are not sent to GitHub or any service
- Disabling TL;PR removes its reading interface and restores content through the content controller; reenabling uses the current local preferences
- Reduced-motion accessibility remains authoritative even when the animation preference is on
- Package validation includes three additional allowed entries: `popup.html`, `popup.css`, and `popup.js`
- This decision authorizes a local source change only; it does not authorize installation, publication, or account changes

## Rollback

Remove the popup and settings integration, the `storage` permission, and the three popup archive entries. Do not remove or alter the legacy userscript fold-state key. An unused local settings key is harmless and can remain until the extension is uninstalled.
