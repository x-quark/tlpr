import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasActiveCommentEditor } from '../../src/content/comment-dom';
import { GitHubCommentCollapser } from '../../src/content/controller';

let styles: HTMLStyleElement;
let controller: GitHubCommentCollapser | undefined;
beforeEach(() => {
  styles = document.createElement('style');
  styles.textContent =
    readFileSync('src/content/styles.css', 'utf8') + '\n.github-hidden { display:none }';
  document.head.append(styles);
});
afterEach(() => {
  controller?.destroy();
  controller = undefined;
  styles.remove();
});

function comment(markup = '<textarea>Draft</textarea>', attributes = ''): HTMLElement {
  document.body.innerHTML = `<article class="react-issue-comment tlpr-timeline-hidden" ${attributes}>${markup}</article>`;
  return document.querySelector('article')!;
}

describe('active editors under actual timeline CSS', () => {
  it('ignores only the extension-owned timeline mask when detecting an active editor', () => {
    const article = comment();
    expect(getComputedStyle(article).display).toBe('none');
    expect(hasActiveCommentEditor(article, window)).toBe(true);
    expect(article.className).toBe('react-issue-comment tlpr-timeline-hidden');
    expect(article.hasAttribute('data-tlpr-checking-editor')).toBe(false);
    expect(getComputedStyle(article).display).toBe('none');
  });
  it.each([
    'hidden',
    'aria-hidden="true"',
    'style="display:none"',
    'style="visibility:hidden"',
    'style="visibility:collapse"',
  ])('does not ignore native comment hiding: %s', (attributes) => {
    expect(hasActiveCommentEditor(comment(undefined, attributes), window)).toBe(false);
  });
  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"', 'class="github-hidden"'])(
    'does not reveal cached editors hidden by an internal ancestor: %s',
    (attributes) => {
      expect(
        hasActiveCommentEditor(
          comment(`<div ${attributes}><textarea>Cached</textarea></div>`),
          window,
        ),
      ).toBe(false);
    },
  );
  it('retains native stylesheet hiding of the comment underneath the extension mask', () => {
    const article = comment();
    article.classList.add('github-hidden');
    expect(hasActiveCommentEditor(article, window)).toBe(false);
  });
  it('reveals a late direct React editor and folds again after editing closes without observer churn', async () => {
    document.body.innerHTML = `<main class="js-discussion">${Array.from({ length: 8 }, (_, i) => `<article class="react-issue-comment" id="issuecomment-${i}"><header>octocat</header><div class="comment-body">Text</div></article>`).join('')}</main>`;
    controller = new GitHubCommentCollapser();
    controller.start();
    const article = document.querySelector<HTMLElement>('#issuecomment-3')!;
    expect(getComputedStyle(article).display).toBe('none');
    article.insertAdjacentHTML('beforeend', '<textarea>Unsaved draft</textarea>');
    controller.scan();
    expect(article.classList.contains('tlpr-timeline-hidden')).toBe(false);
    expect(getComputedStyle(article).display).not.toBe('none');
    article.querySelector('textarea')!.hidden = true;
    controller.scan();
    expect(getComputedStyle(article).display).toBe('none');
    await new Promise((resolve) => setTimeout(resolve, 70));
    const scan = vi.spyOn(controller, 'scan');
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(scan).not.toHaveBeenCalled();
  });
  it.each([
    '<textarea>Unsaved draft</textarea>',
    '<div contenteditable="true">Unsaved draft</div>',
  ])(
    'suspends body folding during late editing (%s), resumes saved state and cleans up',
    (editorMarkup) => {
      document.body.innerHTML =
        '<main class="js-discussion"><article class="react-issue-comment" id="issuecomment-1"><header>octocat</header><div class="comment-body">Text</div></article></main>';
      const body = document.querySelector<HTMLElement>('.comment-body')!;
      Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 400 });
      controller = new GitHubCommentCollapser();
      controller.scan();
      const toggle = () => document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!;
      toggle().click();
      toggle().click();
      const saved = localStorage.getItem('gh-pr-comment-collapse:v3');
      expect(body.dataset.tlprCollapsed).toBe('1');
      body.innerHTML = `<section>${editorMarkup}</section>`;
      controller.scan();
      expect(getComputedStyle(body).overflow).not.toBe('hidden');
      expect(body.classList.contains('tlpr-body')).toBe(false);
      expect(body.textContent).toBe('Unsaved draft');
      document.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')?.click();
      expect(localStorage.getItem('gh-pr-comment-collapse:v3')).toBe(saved);
      body.innerHTML = 'Saved content';
      controller.scan();
      expect(body.classList.contains('tlpr-body')).toBe(true);
      expect(body.dataset.tlprCollapsed).toBe('1');
      toggle().click();
      expect(body.dataset.tlprCollapsed).toBe('0');
      body.innerHTML = editorMarkup;
      body.style.maxHeight = '600px';
      body.style.overflow = 'auto';
      controller.scan();
      expect(body.style.maxHeight).toBe('600px');
      expect(body.style.overflow).toBe('auto');
      controller.destroy();
      expect(body.dataset.tlprCollapsed).toBeUndefined();
      expect(body.dataset.tlprGeneratedId).toBeUndefined();
      expect(body.id).toBe('');
      expect(body.textContent).toBe('Unsaved draft');
      expect(body.style.overflow).toBe('auto');
    },
  );
});
