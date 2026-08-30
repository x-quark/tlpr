import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';
import sharp from 'sharp';

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
assert(manifest.version === packageJson.version, 'manifest and package versions must match');
assert(!('permissions' in manifest), 'TL;PR must not request named Chrome permissions');
assert(
  !('host_permissions' in manifest),
  'Host access must remain limited to static content scripts',
);

const expectedMatches = ['https://github.com/*/*/pull/*', 'https://github.com/*/*/issues/*'];
assert(
  JSON.stringify(manifest.content_scripts?.[0]?.matches) === JSON.stringify(expectedMatches),
  'Content script matches must stay limited to GitHub pull requests and issues',
);

const requiredEntries = [
  'manifest.json',
  'content.js',
  'content.css',
  '_locales/en/messages.json',
  '_locales/fr/messages.json',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
];
for (const entry of requiredEntries) {
  assert(entry in archiveEntries, `Missing archive entry: ${entry}`);
}

for (const size of [16, 32, 48, 128]) {
  await validatePng(`dist/icons/icon-${size}.png`, size, size);
}

await validatePng('assets/generated/store-small-promo-440x280.png', 440, 280);
await validatePng('assets/generated/store-marquee-1400x560.png', 1400, 560);
await validatePng('assets/store/screenshots/tlpr-comment-folding-1280x800.png', 1280, 800, true);
await validatePng('assets/store/screenshots/tlpr-timeline-folding-1280x800.png', 1280, 800, true);

for (const locale of ['en', 'fr']) {
  const messages = JSON.parse(
    await readFile(path.join(root, 'dist', '_locales', locale, 'messages.json'), 'utf8'),
  );
  for (const key of ['extensionName', 'extensionDescription', 'collapse', 'expand']) {
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
