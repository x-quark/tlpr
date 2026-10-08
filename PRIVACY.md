# Privacy Policy

**English** · [Français](./PRIVACY.fr.md)

Effective date: 2026-08-30

Last updated: 2026-10-08

## Scope

This policy applies to the TL;PR Chrome extension published by x-quark

## Data handling

TL;PR handles two Chrome Web Store user-data categories locally on the user’s device:

- **Website content:** rendered GitHub comment and timeline elements are read to decide what to collapse and to provide the visible controls. The optional merge-text helper also reads the current PR title and an explicitly selected rendered template into a local preview or, on an explicit Insert click, the merge form’s extended description. It never submits that form or changes the default merge commit title. Their content is not saved by the extension
- **Web history:** the path of each GitHub pull request or issue is stored locally as the key for its interface preferences

TL;PR does not transmit, sell, share, or remotely process this information. It does not collect authentication information, personal data for profiling, or usage analytics

## Purpose limitation

TL;PR uses rendered GitHub conversation content only on the user’s device and only to provide local reading controls and the explicitly enabled merge-text preview/copy/insertion helper. It does not use that content for advertising, analytics, profiling, or any unrelated purpose

TL;PR’s use of information from GitHub pages complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its Limited Use requirements

## Local storage

TL;PR stores only interface preferences required to remember collapsed comments and timeline state. These preferences:

- remain on the user’s device in the local storage associated with `github.com`
- are indexed by the current GitHub page path and GitHub comment identifiers
- use the key `gh-pr-comment-collapse:v3` for compatibility with the original userscript
- are never sent to x-quark or any third party

Users can remove these folding preferences by clearing site data for `github.com`

The `storage` permission also stores only enablement, language, animation, state-color, and optional helper settings in `chrome.storage.local`, under `tlpr-settings:v1`. These settings are not synced. Uninstalling TL;PR removes this extension storage

The helper is disabled by default. Prepared message text exists only in the open preview. Clicking Copy explicitly transfers that text to the device clipboard, which is managed by the operating system and may be accessible to other applications. TL;PR does not store, upload, or submit the message

## Website access

TL;PR runs only on GitHub pull request and issue URLs matching:

- `https://github.com/*/*/pull/*`
- `https://github.com/*/*/issues/*`

The extension reads and changes the rendered page to collapse, expand, hide, and reveal conversation elements, and to provide the optional user-triggered merge-text preview/copy/insertion helper. It does not read GitHub authentication tokens, call the GitHub API, or make network requests

## Third parties and remote code

TL;PR contains no analytics SDK, advertising SDK, remote service, remotely hosted code, or third-party data processor

## Changes

Material changes to this policy will be published in this repository with the corresponding extension release

## Contact

Questions and privacy requests can be sent to [publisher@x-quark.com](mailto:publisher@x-quark.com) or opened through the [TL;PR issue tracker](https://github.com/x-quark/tlpr/issues)
