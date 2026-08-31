import { spawnSync } from 'node:child_process';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'dist');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const assetResult = spawnSync(process.execPath, ['scripts/generate-assets.mjs'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (assetResult.status !== 0) {
  throw new Error('Asset generation failed');
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  configFile: false,
  root,
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.join(root, 'src', 'content', 'index.ts'),
      formats: ['iife'],
      name: 'TlprContent',
      fileName: () => 'content.js',
    },
    minify: 'esbuild',
    sourcemap: false,
    target: 'chrome109',
  },
});

const manifest = JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8'));
manifest.version = packageJson.version;
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await copyFile(
  path.join(root, 'src', 'content', 'styles.css'),
  path.join(outputDirectory, 'content.css'),
);
await cp(path.join(root, 'src', '_locales'), path.join(outputDirectory, '_locales'), {
  recursive: true,
});
await copyFile(path.join(root, 'LICENSE'), path.join(outputDirectory, 'LICENSE'));
await writeFile(
  path.join(outputDirectory, 'SOURCE.md'),
  `# Source Code\n\nThe complete corresponding source for TL;PR ${packageJson.version} is available at https://github.com/x-quark/tlpr/tree/v${packageJson.version}.\n`,
);
await mkdir(path.join(outputDirectory, 'icons'), { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await copyFile(
    path.join(root, 'assets', 'generated', `icon-${size}.png`),
    path.join(outputDirectory, 'icons', `icon-${size}.png`),
  );
}

console.log(`Built TL;PR ${packageJson.version} in dist`);
