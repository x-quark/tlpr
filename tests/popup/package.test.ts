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

  it('loads only a navigation bootstrap on GitHub without declarative page styles', () => {
    expect(manifest.action).toHaveProperty('default_popup', 'popup.html');
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://github.com/*'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ]);
  });
});
