import { describe, expect, it, vi } from 'vitest';
import { GitHubCommentCollapser } from '../../src/content/controller';

function mount(count = 8): HTMLElement[] {
  document.body.innerHTML = `<main class="js-discussion">${Array.from({ length: count }, (_, i) => `<div class="TimelineItem"><article class="js-comment timeline-comment" id="issuecomment-${i}"><header class="timeline-comment-header">octocat</header><div class="comment-body">Text</div></article></div>`).join('')}</main>`;
  return [...document.querySelectorAll<HTMLElement>('article')];
}

describe('scan work budget', () => {
  it('enumerates editors once per comment in one scan, without caching across scans', () => {
    const comments = mount();
    const queries = comments.map((comment) => vi.spyOn(comment, 'querySelectorAll'));
    const controller = new GitHubCommentCollapser();
    try {
      controller.scan();
      for (const query of queries) {
        expect(
          query.mock.calls.filter(([selector]) => selector === 'textarea, [contenteditable]'),
        ).toHaveLength(1);
        query.mockClear();
      }
      const editor = document.createElement('textarea');
      editor.value = 'Keep my draft';
      comments[3]!.append(editor);
      controller.scan();
      expect(
        comments[3]!.closest('.TimelineItem')?.classList.contains('tlpr-timeline-hidden'),
      ).toBe(false);
      expect(comments[3]!.querySelector('.tlpr-control')).toBeNull();
      expect(editor.value).toBe('Keep my draft');
      for (const query of queries) {
        expect(
          query.mock.calls.filter(([selector]) => selector === 'textarea, [contenteditable]'),
        ).toHaveLength(1);
      }
      editor.remove();
      controller.scan();
      expect(comments[3]!.querySelector('.tlpr-control')).not.toBeNull();
      expect(
        comments[3]!.closest('.TimelineItem')?.classList.contains('tlpr-timeline-hidden'),
      ).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it('revalidates an editor at interaction time rather than using a scan snapshot', () => {
    const comment = mount(1)[0]!;
    const controller = new GitHubCommentCollapser();
    try {
      controller.scan();
      const body = comment.querySelector<HTMLElement>('.comment-body')!;
      const before = body.dataset.tlprCollapsed;
      comment.append(document.createElement('textarea'));
      comment.querySelector<HTMLButtonElement>('button')!.click();
      expect(body.dataset.tlprCollapsed).toBe(before);
      expect(localStorage.length).toBe(0);
    } finally {
      controller.destroy();
    }
  });

  it('discards an interrupted scan snapshot', () => {
    const comment = mount(1)[0]!;
    const host = document.querySelector<HTMLElement>('main')!;
    const controller = new GitHubCommentCollapser();
    const prepend = vi.spyOn(host, 'prepend').mockImplementationOnce(() => {
      throw new Error('interrupted DOM operation');
    });
    try {
      expect(() => controller.scan()).toThrow('interrupted DOM operation');
      prepend.mockRestore();
      comment.append(document.createElement('textarea'));
      controller.scan();
      expect(comment.querySelector('.tlpr-control')).toBeNull();
    } finally {
      controller.destroy();
    }
  });
});
