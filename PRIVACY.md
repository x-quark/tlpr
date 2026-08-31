# Privacy Policy

**English** · [Français](./PRIVACY.fr.md)

Effective date: 2026-08-30

Last updated: 2026-08-31

## Scope

This policy applies to the TL;PR Chrome extension published by x-quark

## Data handling

TL;PR handles two Chrome Web Store user-data categories locally on the user’s device:

- **Website content:** rendered GitHub comment and timeline elements are read to decide what to collapse and to provide the visible controls. Their content is not retained
- **Web history:** the path of each GitHub pull request or issue is stored locally as the key for its interface preferences

TL;PR does not transmit, sell, share, or remotely process this information. It does not collect authentication information, personal data for profiling, or usage analytics

## Purpose limitation

TL;PR uses rendered GitHub conversation content only on the user’s device and only to provide its single purpose: improving readability through local collapse and expand controls. It does not use that content for advertising, analytics, profiling, or any unrelated purpose

TL;PR’s use of information from GitHub pages complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its Limited Use requirements

## Local storage

TL;PR stores only interface preferences required to remember collapsed comments and timeline state. These preferences:

- remain on the user’s device in the local storage associated with `github.com`
- are indexed by the current GitHub page path and GitHub comment identifiers
- use the key `gh-pr-comment-collapse:v3` for compatibility with the original userscript
- are never sent to x-quark or any third party

Users can remove these preferences by clearing site data for `github.com`

## Website access

TL;PR runs only on GitHub pull request and issue URLs matching:

- `https://github.com/*/*/pull/*`
- `https://github.com/*/*/issues/*`

The extension reads and changes the rendered page only to collapse, expand, hide, and reveal conversation elements. It does not read GitHub authentication tokens, call the GitHub API, or make network requests

## Third parties and remote code

TL;PR contains no analytics SDK, advertising SDK, remote service, remotely hosted code, or third-party data processor

## Changes

Material changes to this policy will be published in this repository with the corresponding extension release

## Contact

Questions and privacy requests can be sent to [publisher@x-quark.com](mailto:publisher@x-quark.com) or opened through the [TL;PR issue tracker](https://github.com/x-quark/tlpr/issues)
