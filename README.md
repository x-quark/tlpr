# TL;PR

**English** · [Français](./README.fr.md)

<img src="./assets/icon.svg" alt="TL;PR icon" width="96" height="96">

**TL;PR** makes long GitHub pull request and issue conversations easier to read. It folds long comments, condenses the middle of crowded timelines, and keeps useful controls within reach

## Why

Long GitHub reviews become difficult to scan when replies, automated events, and Markdown blocks accumulate. TL;PR reduces that visual noise without deleting or changing GitHub content

## Features

- Automatically collapses human comments taller than `140px`
- Keeps the first two and last three items visible in long timelines
- Reveals the folded middle on demand
- Adds controls to collapse or expand every human comment
- Persists per-page state under the existing `gh-pr-comment-collapse:v3` key
- Ignores bot comments and comments being edited
- Runs on GitHub pull requests and issues
- Includes English and French interfaces

## Privacy and permissions

TL;PR does not collect or transmit data. It includes no telemetry, analytics, remote service, or remotely hosted code

The extension requests no named Chrome permission. Its content script is limited to:

- `https://github.com/*/*/pull/*`
- `https://github.com/*/*/issues/*`

Display preferences remain in GitHub site storage to preserve compatibility with the original userscript. Read the [privacy policy](./PRIVACY.md) for the complete contract

## Install locally

### Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Google Chrome or a Manifest V3-compatible Chromium browser

### Load the unpacked extension

```bash
git clone https://github.com/x-quark/tlpr.git
cd tlpr
pnpm install --frozen-lockfile
pnpm build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Select **Load unpacked**
4. Choose the `dist/` directory
5. Disable the original Tampermonkey userscript to avoid duplicate controls
6. Open a GitHub pull request or issue

After a local change, run `pnpm build` again and reload TL;PR from `chrome://extensions`

## Build the distributable package

```bash
pnpm package
pnpm validate:package
```

The commands produce:

- `release/tlpr-v0.1.0.zip`
- `release/tlpr-v0.1.0.zip.sha256`

The ZIP contains `manifest.json`, the GPL license, and a link to the corresponding release source at its root. It is ready for Chrome Web Store upload

## Development

| Command          | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| `pnpm assets`    | Generate PNG icons and store visuals from the SVG sources |
| `pnpm format`    | Format tracked source files                               |
| `pnpm lint`      | Analyze the code with ESLint                              |
| `pnpm typecheck` | Run strict TypeScript checking                            |
| `pnpm test`      | Run Vitest tests in JSDOM                                 |
| `pnpm build`     | Build the unpacked extension into `dist/`                 |
| `pnpm package`   | Build the ZIP and checksum into `release/`                |
| `pnpm check`     | Run every quality gate and validate the final package     |

## Project structure

```text
assets/                  SVG sources and Chrome Web Store exports
journal/decisions/       Architecture decisions
scripts/                 Asset, build, package, and validation tools
src/_locales/            English and French Chrome translations
src/content/             DOM controller, styles, and entry point
src/manifest.json        Source MV3 manifest
tests/                   Functional parity tests
```

`dist/` and `release/` are generated and excluded from Git

## Current scope

The initial release intentionally reproduces the userscript behavior. It has no settings page, device sync, or GitHub Enterprise support. Automated fixtures cover representative legacy, React, and review-comment structures together with DOM replacement, initial edit mode, and cross-page SPA navigation. A GitHub redesign outside these fixtures may require an update

## License

TL;PR is distributed under the [GNU General Public License v3.0 only](./LICENSE). Commercial use is allowed. Distributed derivative versions must remain under `GPL-3.0-only` and provide their corresponding source

Copyright © 2026 x-quark contributors

## Publishing

The [Chrome Web Store publication guide](./docs/publication-chrome-web-store.md) contains the listing copy, privacy declarations, visual inventory, and versioning procedure
