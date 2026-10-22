import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubCommentCollapser } from '../../src/content/controller';
let controller: GitHubCommentCollapser;
let style: HTMLStyleElement;
const settle = () => new Promise((resolve) => setTimeout(resolve, 65));
afterEach(() => {
  controller?.destroy();
  style?.remove();
});

describe('timeline shares the complete editor contract', () => {
  it.each(
    ['direct', 'wrapper'].flatMap((structure) =>
      ['body', 'descendant', 'item', 'inherited'].map((location) => [structure, location]),
    ),
  )(
    'protects %s / %s passively through active and inactive transitions',
    async (structure, location) => {
      style = document.createElement('style');
      style.textContent = readFileSync('src/content/styles.css', 'utf8');
      document.head.append(style);
      document.body.innerHTML = `<main class="js-discussion">${Array.from({ length: 8 }, (_, i) => {
        const article = `<article class="react-issue-comment" id="issuecomment-${i}"><header>octocat</header><div class="comment-body"><span>Draft</span></div></article>`;
        return structure === 'wrapper'
          ? `<section class="TimelineItem">${article}</section>`
          : article;
      }).join('')}</main>`;
      const comment = document.querySelector<HTMLElement>('#issuecomment-3')!;
      const item = structure === 'wrapper' ? comment.parentElement! : comment;
      const body = comment.querySelector<HTMLElement>('.comment-body')!;
      Object.defineProperty(body, 'scrollHeight', { value: 400 });
      controller = new GitHubCommentCollapser();
      controller.start();
      await settle();
      expect(item.classList.contains('tlpr-timeline-hidden')).toBe(true);
      const target =
        location === 'body'
          ? body
          : location === 'descendant'
            ? body.firstElementChild!
            : location === 'item'
              ? item
              : document.querySelector('main')!;
      for (const value of ['', 'plaintext-only', 'true']) {
        target.setAttribute('contenteditable', value);
        await settle();
        expect(item.classList.contains('tlpr-timeline-hidden')).toBe(false);
        expect(body.classList.contains('tlpr-body')).toBe(false);
        document.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle')?.click();
        await settle();
        expect(item.classList.contains('tlpr-timeline-hidden')).toBe(false);
        target.setAttribute('contenteditable', 'false');
        await settle();
        // Restore the timeline reading preference after the explicit toggle above.
        const toggle = document.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle');
        if (!item.classList.contains('tlpr-timeline-hidden')) {
          toggle?.click();
          await settle();
        }
        expect(item.classList.contains('tlpr-timeline-hidden')).toBe(true);
        target.setAttribute('contenteditable', 'invalid');
        await settle();
        expect(item.classList.contains('tlpr-timeline-hidden')).toBe(true);
        target.removeAttribute('contenteditable');
        await settle();
        expect(item.classList.contains('tlpr-timeline-hidden')).toBe(true);
      }
      expect(body.textContent).toBe('Draft');
      const scan = vi.spyOn(controller, 'scan');
      await settle();
      expect(scan).not.toHaveBeenCalled();
    },
  );
});
