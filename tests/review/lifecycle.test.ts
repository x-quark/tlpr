import { afterEach, describe, expect, it, vi } from 'vitest';
import english from '../../src/_locales/en/messages.json';
import { GitHubCommentCollapser } from '../../src/content/controller';

let controller: GitHubCommentCollapser | undefined;
afterEach(() => controller?.destroy());

function mount(): void {
  window.history.replaceState({}, '', '/example/project/pull/1');
  document.body.innerHTML = `<h1 class="js-issue-title">Example pull request</h1><main class="js-discussion"><article class="js-comment timeline-comment" id="issuecomment-1"><header class="timeline-comment-header">octocat</header><div class="comment-body">A long comment</div></article></main>`;
  Object.defineProperty(document.querySelector('.comment-body'), 'scrollHeight', { value: 220 });
  controller = new GitHubCommentCollapser(document, window, { mergeHelper: true });
  controller.scan();
}

describe('independent lifecycle regression review', () => {
  it('numbers candidates under the default Chrome-selected locale', () => {
    const catalog = english as Record<
      string,
      { message: string; placeholders?: Record<string, { content: string }> }
    >;
    vi.spyOn(chrome.i18n, 'getMessage').mockImplementation((key, substitutions) => {
      const entry = catalog[key];
      const values = Array.isArray(substitutions) ? substitutions : [substitutions];
      // Chrome expands catalog placeholders before returning the translated message.
      return (entry?.message ?? '')
        .replace(
          /\$([a-z_]+)\$/gi,
          (_, name: string) => entry?.placeholders?.[name.toLowerCase()]?.content ?? '',
        )
        .replace(/\$([1-9])/g, (_, index: string) => String(values[Number(index) - 1] ?? ''));
    });
    mount();
    document
      .querySelector('.js-discussion')!
      .insertAdjacentHTML(
        'beforeend',
        [1, 2]
          .map(
            (id) =>
              `<article class="js-comment" id="issuecomment-candidate-${id}"><div class="comment-body"><h3>🧾 Merge commit body</h3><pre><code>Example ${id}</code></pre></div></article>`,
          )
          .join(''),
      );
    document.querySelector<HTMLButtonElement>('.tlpr-merge-open')!.click();
    expect(
      [...document.querySelectorAll('.tlpr-merge-candidate-text')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['Comment 1', 'Comment 2']);
    expect(document.querySelector('.tlpr-merge-candidate-radio:checked')).toBeNull();
  });

  it('removes an open merge helper when navigating to an issue', () => {
    mount();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-open')!.click();
    expect(document.querySelector('.tlpr-merge-overlay')).not.toBeNull();
    window.history.replaceState({}, '', '/example/project/issues/2');
    document.querySelector('.js-discussion')!.innerHTML = '<p>Replacement issue</p>';
    controller!.scan();
    expect(document.querySelector('.tlpr-merge-overlay')).toBeNull();
    expect(document.querySelector('.tlpr-merge-open')).toBeNull();
  });

  it('removes an open merge helper when navigating out of conversations', () => {
    mount();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-open')!.click();
    window.history.replaceState({}, '', '/example/project');
    document.querySelector('.js-discussion')!.remove();
    controller!.scan();
    expect(document.querySelector('.tlpr-merge-overlay')).toBeNull();
  });

  it('exposes the PR-only helper if GitHub reuses a discussion host from an issue', () => {
    mount();
    window.history.replaceState({}, '', '/example/project/issues/2');
    controller!.destroy();
    controller = new GitHubCommentCollapser(document, window, { mergeHelper: true });
    controller.scan();
    expect(document.querySelector('.tlpr-merge-open')).toBeNull();
    window.history.replaceState({}, '', '/example/project/pull/3');
    controller.scan();
    expect(document.querySelector('.tlpr-merge-open')).not.toBeNull();
  });
});
