# ADR 005 — Inert GitHub navigation bootstrap

> Date: 2026-10-21
> Status: accepted by the owner for this scoped correction
> Supersedes: initial-load injection patterns in AGENTS and ADR 003; conversation-only processing remains

## Context

A declarative content script limited to individual PR/issue URLs is absent when the initial document is a repository or list page. A same-document navigation cannot start code that was never injected. Existing controller navigation listeners only help documents that already contain the script.

## Decision

- Declare a navigation bootstrap on `https://github.com/*`, no other site, background worker, named Chrome permission, API call, or network request
- Outside supported numeric PR/issue conversations, only inspect the URL and listen for navigation; never read page content, modify DOM, collect, store, or transmit data
- Activate settings, controller, styles and conversation storage only after a strict route check; invalidate asynchronous setup when leaving the route
- Remove conversation effects and listeners on departure or disablement; preserve deliberate choices on return
- Do not declare a stylesheet on all GitHub pages; activate locally bundled styles only with conversation processing
- Preserve all merge-helper consent, manual-edit and zero-submission guarantees

## Authorization and validation

The owner explicitly approved this scope through the authenticated Live request on 2026-10-21. The exception does not authorize broader page-content access or any new Chrome API permission.

Require regressions for inert initial non-conversation pages, entry, departure, re-entry, disabled settings, stale asynchronous completion and route lookalikes. Run the full suite and two fresh independent reviews after the change. Cloud policy prevents unpacked extension installation; this limitation must remain explicit and must not be bypassed.

## References

- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/reference/api/webNavigation
