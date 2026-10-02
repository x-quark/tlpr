import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';
import sharp from 'sharp';

import { collectSourceFiles, sourceNotice } from './source-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'dist', 'manifest.json'), 'utf8'));
const archiveName = `tlpr-v${packageJson.version}.zip`;
const archive = await readFile(path.join(root, 'release', archiveName));
const archiveEntries = unzipSync(new Uint8Array(archive));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validatePng(relativePath, width, height, requireOpaque = false) {
  const metadata = await sharp(path.join(root, relativePath)).metadata();
  assert(metadata.format === 'png', `${relativePath} must be PNG`);
  assert(
    metadata.width === width && metadata.height === height,
    `${relativePath} dimensions must be ${width}x${height}`,
  );
  if (requireOpaque) {
    assert(metadata.hasAlpha === false, `${relativePath} must not contain an alpha channel`);
  }
}

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(
  Boolean(archiveEntries['source/LICENSE']),
  'Package must include corresponding source and its license under source/',
);
assert(manifest.version === packageJson.version, 'manifest and package versions must match');
assert(
  JSON.stringify(manifest.permissions) === JSON.stringify(['storage']),
  'Storage must be the only named Chrome permission (ADR 003)',
);
assert(!('optional_permissions' in manifest), 'Optional named permissions are not allowed');
assert(!('background' in manifest), 'The popup must not introduce a background worker');
assert(manifest.action?.default_popup === 'popup.html', 'Toolbar action must open the local popup');
assert(
  !('host_permissions' in manifest) && !('optional_host_permissions' in manifest),
  'Host access must remain limited to static content scripts',
);

const expectedMatches = ['https://github.com/*/*/pull/*', 'https://github.com/*/*/issues/*'];
assert(
  JSON.stringify(manifest.content_scripts?.[0]?.matches) === JSON.stringify(expectedMatches),
  'Content script matches must stay limited to GitHub pull requests and issues',
);

const sourceFiles = await collectSourceFiles(root);
const requiredEntries = [
  'manifest.json',
  'LICENSE',
  'SOURCE.md',
  'content.js',
  'content.css',
  'popup.html',
  'popup.css',
  'popup.js',
  '_locales/en/messages.json',
  '_locales/fr/messages.json',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  ...sourceFiles.map((relativePath) => `source/${relativePath}`),
];
const actualEntries = Object.keys(archiveEntries).sort();
assert(
  JSON.stringify(actualEntries) === JSON.stringify([...requiredEntries].sort()),
  `Archive entries differ from the allowlist: ${actualEntries.join(', ')}`,
);
assert(
  new TextDecoder().decode(archiveEntries.LICENSE) ===
    (await readFile(path.join(root, 'LICENSE'), 'utf8')),
  'Packaged license must match the repository license',
);
assert(
  new TextDecoder().decode(archiveEntries['SOURCE.md']) === sourceNotice(packageJson.version),
  'Packaged source notice must identify the bundled corresponding source',
);

for (const relativePath of sourceFiles) {
  assert(
    Buffer.from(archiveEntries[`source/${relativePath}`]).equals(
      await readFile(path.join(root, relativePath)),
    ),
    `Bundled source must match the build input exactly: ${relativePath}`,
  );
}
assert(
  JSON.parse(new TextDecoder().decode(archiveEntries['source/package.json'])).version ===
    manifest.version,
  'Bundled source version must match the extension version',
);

assert(manifest.content_scripts?.length === 1, 'Manifest must contain exactly one content script');

for (const size of [16, 32, 48, 128]) {
  await validatePng(`dist/icons/icon-${size}.png`, size, size);
}

await validatePng('assets/generated/store-small-promo-440x280.png', 440, 280);
await validatePng('assets/generated/store-marquee-1400x560.png', 1400, 560);
await validatePng('assets/store/screenshots/tlpr-comment-folding-1280x800.png', 1280, 800, true);
await validatePng('assets/store/screenshots/tlpr-timeline-folding-1280x800.png', 1280, 800, true);

const popupHtml = new TextDecoder().decode(archiveEntries['popup.html']);
assert(popupHtml.includes('src="./popup.js"'), 'Popup must load its packaged script');
assert(popupHtml.includes('href="./popup.css"'), 'Popup must load its packaged stylesheet');
assert(
  !/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(popupHtml),
  'Popup must not load remote resources',
);
assert(!/\son[a-z]+\s*=/i.test(popupHtml), 'Popup must not use inline event handlers');
assert(!/<script\b[^>]*>\s*[^<\s]/i.test(popupHtml), 'Popup must not contain inline scripts');

for (const locale of ['en', 'fr']) {
  const messages = JSON.parse(
    await readFile(path.join(root, 'dist', '_locales', locale, 'messages.json'), 'utf8'),
  );
  for (const key of [
    'extensionName',
    'extensionDescription',
    'collapse',
    'expand',
    'popupTitle',
    'popupEnabled',
    'popupMergeHelper',
    'popupLoadError',
    'popupSaveError',
  ]) {
    assert(Boolean(messages[key]?.message), `Locale ${locale} is missing ${key}`);
  }
}

const expectedDigest = createHash('sha256').update(archive).digest('hex');
const checksum = await readFile(path.join(root, 'release', `${archiveName}.sha256`), 'utf8');
assert(checksum === `${expectedDigest}  ${archiveName}\n`, 'Release checksum is invalid');

console.log(`Validated Manifest V3 package ${archiveName}`);
console.log(
  `Validated ${requiredEntries.length} archive entries, 4 icons, 2 promotional images, and 2 screenshots`,
);
