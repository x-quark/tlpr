import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distributionDirectory = path.join(root, 'dist');
const releaseDirectory = path.join(root, 'release');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const archiveName = `tlpr-v${packageJson.version}.zip`;

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }

  return files;
}

const files = await collectFiles(distributionDirectory);
if (files.length === 0) {
  throw new Error('dist is empty; run the build before packaging');
}

const fixedTimestamp = new Date('1980-01-01T00:00:00.000Z');
const archiveEntries = {};
for (const file of files) {
  archiveEntries[file.relativePath] = [
    new Uint8Array(await readFile(file.absolutePath)),
    { mtime: fixedTimestamp },
  ];
}

await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });
const archive = Buffer.from(zipSync(archiveEntries, { level: 9 }));
const archivePath = path.join(releaseDirectory, archiveName);
await writeFile(archivePath, archive);

const digest = createHash('sha256').update(archive).digest('hex');
await writeFile(
  path.join(releaseDirectory, `${archiveName}.sha256`),
  `${digest}  ${archiveName}\n`,
);

console.log(`Packaged ${files.length} files as release/${archiveName}`);
console.log(`SHA-256 ${digest}`);
