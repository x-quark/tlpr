import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const manifest: Record<string, unknown> = JSON.parse(readFileSync('src/manifest.json', 'utf8'));

describe('popup package boundaries', () => {
  it('requests storage as its only named permission', () => {
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest).not.toHaveProperty('optional_permissions');
    expect(manifest).not.toHaveProperty('background');
  });

  it('opens a local toolbar popup while preserving narrowly scoped GitHub injection', () => {
    expect(manifest.action).toHaveProperty('default_popup', 'popup.html');
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://github.com/*/*/pull/*', 'https://github.com/*/*/issues/*'],
        css: ['content.css'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ]);
  });
});
