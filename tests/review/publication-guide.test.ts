import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { version } from '../../package.json';

it('points current Store upload instructions at the current package version', () => {
  const guide = readFileSync('docs/publication-chrome-web-store.md', 'utf8');
  const references = [...guide.matchAll(/release\/tlpr-v([\d.]+)\.zip/g)];
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) expect(reference[1]).toBe(version);
});
