import { afterEach, describe, expect, it } from 'vitest';

import { ReadingRuntime } from '../../src/content/runtime';
import { DEFAULT_SETTINGS } from '../../src/settings';

let runtime: ReadingRuntime | undefined;
afterEach(() => runtime?.destroy());

function mount(): void {
  document.body.innerHTML = `<main class="js-discussion"><article class="js-comment timeline-comment" id="issuecomment-1"><header class="timeline-comment-header">octocat</header><div class="comment-body">A long comment</div></article></main>`;
  Object.defineProperty(document.querySelector('.comment-body'), 'scrollHeight', { value: 220 });
  runtime = new ReadingRuntime(document, window);
}

describe('live reading settings', () => {
  it('disables and restores effects without a page reload', () => {
    mount();
    runtime!.apply(DEFAULT_SETTINGS);
    expect(document.querySelector('.tlpr-comment-toggle')).not.toBeNull();
    runtime!.apply({ ...DEFAULT_SETTINGS, enabled: false });
    expect(document.querySelector('.tlpr-body,.tlpr-btn,.tlpr-global-rail')).toBeNull();
    expect(document.documentElement.hasAttribute('data-tlpr-animations')).toBe(false);
    runtime!.apply(DEFAULT_SETTINGS);
    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
  });

  it('applies explicit French and English plus visual preferences live', () => {
    mount();
    runtime!.apply({ ...DEFAULT_SETTINGS, language: 'fr', animations: false, stateColors: false });
    expect(document.querySelector('.tlpr-comment-toggle')?.textContent).toBe('Déplier');
    expect(document.querySelector('[data-tlpr-action="expand-all"]')?.textContent).toBe(
      'Tout déplier',
    );
    expect(document.documentElement.dataset.tlprAnimations).toBe('off');
    expect(document.documentElement.dataset.tlprStateColors).toBe('off');
    runtime!.apply({ ...DEFAULT_SETTINGS, language: 'en' });
    expect(document.querySelector('.tlpr-comment-toggle')?.textContent).toBe('Expand');
    expect(document.documentElement.dataset.tlprAnimations).toBe('on');
  });

  it('passes a pinned GitHub view to the conversation controller', () => {
    window.history.replaceState({}, '', '/x-quark/tlpr/pull/1');
    document.body.innerHTML = `<main><section><h2 id="overview-comments">Comments</h2><article id="issuecomment-1"><div data-testid="comment-header"></div><div class="markdown-body">Text</div></article></section></main>`;
    runtime = new ReadingRuntime(document, window);
    runtime.apply(DEFAULT_SETTINGS);
    expect(document.documentElement.dataset.tlprLayout).toBe('overview');
    runtime.apply({ ...DEFAULT_SETTINGS, layout: 'classic' });
    expect(document.documentElement.dataset.tlprLayout).toBe('generic');
    runtime.apply({ ...DEFAULT_SETTINGS, enabled: false });
    expect(document.documentElement.hasAttribute('data-tlpr-layout')).toBe(false);
  });

  it('keeps the merge helper off by default and off on issues', () => {
    mount();
    runtime!.apply(DEFAULT_SETTINGS);
    expect(document.querySelector('.tlpr-merge-open')).toBeNull();
    runtime!.apply({ ...DEFAULT_SETTINGS, mergeHelper: true });
    expect(document.querySelector('.tlpr-merge-open')).toBeNull();
    window.history.replaceState({}, '', '/x-quark/tlpr/pull/1');
    runtime!.apply({ ...DEFAULT_SETTINGS, mergeHelper: true });
    expect(document.querySelector('.tlpr-merge-open')).not.toBeNull();
    runtime!.apply({ ...DEFAULT_SETTINGS, mergeHelper: false });
    expect(document.querySelector('.tlpr-merge-open')).toBeNull();
  });
});
