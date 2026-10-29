import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? cssFiles(join(dir, e.name))
      : e.name.endsWith('.css')
        ? [join(dir, e.name)]
        : [],
  );
}
test('focus never introduces presentation; native outlines are suppressed only', () => {
  for (const path of cssFiles('src')) {
    const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/:focus|data-highlighted/.test(match[1])) continue;
      assert.ok(!/data-highlighted/.test(match[1]), `${path}: highlighted tracks focus`);
      const declarations = match[2].trim();
      assert.match(declarations, /^outline:\s*none\s*!important;?$/, `${path}: ${match[1]}`);
    }
  }
});

test('help tooltips are not activated by focus', () => {
  const source = readFileSync('src/popup/popup.ts', 'utf8');
  assert.doesNotMatch(source, /onHelpFocus|onHelpBlur/);
  assert.match(source, /hovered && !dismissed.has\(hovered\)/);
});
