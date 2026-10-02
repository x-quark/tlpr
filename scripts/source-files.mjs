import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

// Explicit roots exclude credentials, dependencies, generated builds, and local files.
const sourceRoots = [
  '.editorconfig',
  '.github',
  '.gitignore',
  '.prettierignore',
  'AGENTS.md',
  'LICENSE',
  'PRIVACY.fr.md',
  'PRIVACY.md',
  'README.fr.md',
  'README.md',
  'assets',
  'docs',
  'eslint.config.mjs',
  'journal',
  'package.json',
  'pnpm-lock.yaml',
  'prettier.config.mjs',
  'scripts',
  'src',
  'tests',
  'tsconfig.json',
  'vitest.config.ts',
];

export async function collectSourceFiles(root) {
  const files = [];
  async function visit(relativePath) {
    const info = await lstat(path.join(root, relativePath));
    if (info.isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${relativePath}`);
    if (info.isDirectory()) {
      for (const entry of (await readdir(path.join(root, relativePath))).sort()) {
        await visit(path.posix.join(relativePath, entry));
      }
    } else if (info.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unsupported source entry: ${relativePath}`);
    }
  }
  for (const relativePath of sourceRoots) await visit(relativePath);
  return files.sort();
}

export function sourceNotice(version) {
  return `# Source Code\n\nThe complete corresponding source for TL;PR ${version} is included in the source/ directory of this package, including its GPL-3.0-only license, build scripts, dependency lockfile, tests, and artwork.\n\nTo rebuild, extract source/ to a separate directory, install Node.js 22 or newer and pnpm 10.33.2, then run pnpm install --frozen-lockfile followed by pnpm check.\n\nProject homepage: https://github.com/x-quark/tlpr. This package does not claim that a matching Git tag has been published.\n`;
}
