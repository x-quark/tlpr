# Privacy Policy

**English** · [Français](./PRIVACY.fr.md)

Effective date: 2026-08-30

## Scope

This policy applies to the TL;PR Chrome extension published by x-quark

## Data collection

TL;PR does not collect, transmit, sell, share, or remotely process personal data, browsing history, GitHub content, authentication information, or usage analytics

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

Questions and privacy requests can be opened through the [TL;PR issue tracker](https://github.com/x-quark/tlpr/issues)
