import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubCommentCollapser } from '../../src/content/controller';
import { ConversationBootstrap } from '../../src/content/bootstrap';
import { DEFAULT_SETTINGS } from '../../src/settings';

let styles: HTMLStyleElement | undefined;
let controller: GitHubCommentCollapser | undefined;
let bootstrap: ConversationBootstrap | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve, 65));
afterEach(() => {
  styles?.remove();
  styles = undefined;
  controller?.destroy();
  bootstrap?.destroy();
  controller = undefined;
  bootstrap = undefined;
});
const markup = (id: number, react = true) =>
  `<article class="${react ? 'react-issue-comment' : 'js-comment timeline-comment'}" id="issuecomment-${id}"><header class="timeline-comment-header">octocat</header><div class="comment-body">New comment</div></article>`;
async function start() {
  document.body.innerHTML = `<main class="js-discussion">${markup(1)}</main>`;
  controller = new GitHubCommentCollapser();
  controller.start();
  await settle();
}
function assertOne(id: number) {
  expect(document.querySelectorAll(`#issuecomment-${id} .tlpr-comment-toggle`)).toHaveLength(1);
}

describe('new comments without reload or manual scans', () => {
  it.each([true, false])('enhances inserted React=%s comments exactly once', async (react) => {
    await start();
    document.querySelector('main')!.insertAdjacentHTML('beforeend', markup(2, react));
    await settle();
    assertOne(2);
    document.querySelector('#issuecomment-2 .comment-body')!.append(' More text');
    await settle();
    assertOne(2);
    const scan = vi.spyOn(controller!, 'scan');
    await settle();
    expect(scan).not.toHaveBeenCalled();
  });
  it('enhances an own-post DOM result after a form clears, without submitting a real comment', async () => {
    await start();
    const host = document.querySelector('main')!;
    host.insertAdjacentHTML('beforeend', '<form><textarea>Own draft</textarea></form>');
    await settle();
    host.insertAdjacentHTML('beforeend', markup(2));
    host.querySelector('textarea')!.value = '';
    await settle();
    assertOne(2);
  });
  it('survives whole timeline replacement and late body insertion', async () => {
    await start();
    document.querySelector('main')!.outerHTML = `<main class="js-discussion">${markup(2)}</main>`;
    await settle();
    assertOne(2);
    const article = document.querySelector('#issuecomment-2')!;
    article.querySelector('.comment-body')!.remove();
    await settle();
    article.insertAdjacentHTML('beforeend', '<div class="comment-body">Hydrated body</div>');
    await settle();
    assertOne(2);
  });
  it.each(['class', 'id', 'data-testid'])(
    'enhances attribute-only %s hydration after the insertion scan has settled',
    async (attribute) => {
      await start();
      const host = document.querySelector('main')!;
      if (attribute === 'class')
        host.insertAdjacentHTML(
          'beforeend',
          '<article class="react-issue-comment" id="issuecomment-2"><header>octocat</header><div>Hydrated body</div></article>',
        );
      if (attribute === 'id')
        host.insertAdjacentHTML(
          'beforeend',
          '<article class="react-issue-comment"><header>octocat</header><div class="comment-body">Hydrated body</div></article>',
        );
      if (attribute === 'data-testid')
        host.insertAdjacentHTML(
          'beforeend',
          '<article class="react-issue-comment" id="issuecomment-2"><header>octocat</header><div>Hydrated body</div></article>',
        );
      await settle();
      const article = host.lastElementChild!;
      if (attribute === 'id') article.id = 'issuecomment-2';
      else
        article
          .querySelector('div')!
          .setAttribute(attribute, attribute === 'class' ? 'comment-body' : 'markdown-body');
      await settle();
      assertOne(2);
      const scan = vi.spyOn(controller!, 'scan');
      await settle();
      expect(scan).not.toHaveBeenCalled();
    },
  );
  it('reconnects through supported SPA departure and re-entry before another insertion', async () => {
    document.body.innerHTML = `<main class="js-discussion">${markup(1)}</main>`;
    bootstrap = new ConversationBootstrap(document, window, {
      read: async () => ({ ...DEFAULT_SETTINGS }),
      subscribe: () => () => {},
    });
    bootstrap.start();
    await settle();
    assertOne(1);
    window.history.pushState({}, '', '/x-quark/tlpr');
    document.dispatchEvent(new Event('turbo:load'));
    await settle();
    expect(document.querySelector('.tlpr-comment-toggle')).toBeNull();
    window.history.pushState({}, '', '/x-quark/tlpr/pull/2');
    document.dispatchEvent(new Event('turbo:load'));
    await settle();
    document.querySelector('main')!.insertAdjacentHTML('beforeend', markup(2));
    await settle();
    assertOne(2);
  });
  it('enhances late host and header selectors without a child insertion', async () => {
    document.body.innerHTML =
      '<main><article class="react-issue-comment" id="issuecomment-2"><span>octocat</span><div class="comment-body">Draft</div></article></main>';
    controller = new GitHubCommentCollapser();
    controller.start();
    await settle();
    document.querySelector('main')!.className = 'js-discussion';
    await settle();
    expect(document.querySelector('.tlpr-comment-toggle')).toBeNull();
    document.querySelector('article > span')!.className = 'timeline-comment-header';
    await settle();
    assertOne(2);
  });
  it('preserves a reading choice and pending editor while enhancing subsequent comments, then cleans up', async () => {
    await start();
    document.querySelector<HTMLButtonElement>('#issuecomment-1 .tlpr-comment-toggle')!.click();
    const saved = localStorage.getItem('gh-pr-comment-collapse:v3');
    document
      .querySelector('main')!
      .insertAdjacentHTML(
        'beforeend',
        markup(2).replace('</article>', '<textarea>Unsaved draft</textarea></article>'),
      );
    await settle();
    expect(document.querySelector('#issuecomment-2 .tlpr-comment-toggle')).toBeNull();
    document.querySelector<HTMLTextAreaElement>('#issuecomment-2 textarea')!.hidden = true;
    await settle();
    assertOne(2);
    expect(localStorage.getItem('gh-pr-comment-collapse:v3')).toBe(saved);
    expect(document.querySelector<HTMLTextAreaElement>('#issuecomment-2 textarea')!.value).toBe(
      'Unsaved draft',
    );
    controller!.destroy();
    expect(document.querySelector('.tlpr-comment-toggle')).toBeNull();
    document.querySelector('main')!.insertAdjacentHTML('beforeend', markup(3));
    await settle();
    expect(document.querySelector('#issuecomment-3 .tlpr-comment-toggle')).toBeNull();
  });
  it.each([true, false])(
    'reconciles replaced classes and IDs on the same body, preserving saved collapsed=%s and native properties',
    async (collapsed) => {
      await start();
      styles = document.createElement('style');
      styles.textContent = readFileSync('src/content/styles.css', 'utf8');
      document.head.append(styles);
      const body = document.querySelector<HTMLElement>('#issuecomment-1 .comment-body')!;
      const button = document.querySelector<HTMLButtonElement>(
        '#issuecomment-1 .tlpr-comment-toggle',
      )!;
      button.click();
      if (body.dataset.tlprCollapsed !== (collapsed ? '1' : '0')) button.click();
      const stored = localStorage.getItem('gh-pr-comment-collapse:v3');
      body.style.color = 'red';
      body.className = 'comment-body markdown-body github-hydrated';
      await settle();
      expect(body.classList.contains('tlpr-body')).toBe(true);
      expect(body.classList.contains('github-hydrated')).toBe(true);
      expect(body.dataset.tlprCollapsed).toBe(collapsed ? '1' : '0');
      expect(getComputedStyle(body).overflow).toBe(collapsed ? 'hidden' : '');
      body.id = 'github-hydrated-body';
      await settle();
      expect(button.getAttribute('aria-controls')).toBe('github-hydrated-body');
      expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(body);
      expect(body.style.color).toBe('red');
      body.removeAttribute('id');
      await settle();
      expect(body.id).not.toBe('');
      expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(body);
      body.id = 'github-final-body';
      await settle();
      expect(button.getAttribute('aria-controls')).toBe('github-final-body');
      expect(localStorage.getItem('gh-pr-comment-collapse:v3')).toBe(stored);
      assertOne(1);
      const scan = vi.spyOn(controller!, 'scan');
      await settle();
      expect(scan).not.toHaveBeenCalled();
      controller!.destroy();
      expect(body.id).toBe('github-final-body');
      expect(body.className).toBe('comment-body markdown-body github-hydrated');
      expect(body.style.color).toBe('red');
      expect(body.dataset.tlprGeneratedId).toBeUndefined();
    },
  );
});
