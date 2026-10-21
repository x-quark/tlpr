import { afterEach, describe, expect, it } from 'vitest';
import { GitHubCommentCollapser, STORAGE_KEY } from '../../src/content/controller';

let controller: GitHubCommentCollapser;
afterEach(() => controller?.destroy());
const item = (id: number, editing = false): string =>
  `<div class="TimelineItem" id="timeline-${id}"><article class="js-comment timeline-comment" id="issuecomment-${id}"><header class="timeline-comment-header">octocat</header><div class="comment-body">Content</div>${editing ? '<textarea>Unsaved draft</textarea>' : ''}</article></div>`;
function mount(count = 8, editing = -1): void {
  document.body.innerHTML = `<main class="js-discussion">${Array.from({ length: count }, (_, i) => item(i, i === editing)).join('')}</main>`;
  controller = new GitHubCommentCollapser();
  controller.scan();
}
function hidden(id: number): boolean {
  return document.querySelector(`#timeline-${id}`)!.classList.contains('tlpr-timeline-hidden');
}

describe('October 21 independent lifecycle regressions', () => {
  it('never hides an initially active middle comment editor', () => {
    mount(8, 3);
    expect(hidden(3)).toBe(false);
    expect(hidden(2)).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')!.click();
    expect(hidden(3)).toBe(false);
  });

  it('reveals a late editor and resumes folding after it closes', () => {
    mount();
    document
      .querySelector('#issuecomment-3')!
      .insertAdjacentHTML('beforeend', '<textarea>Draft</textarea>');
    controller.scan();
    expect(hidden(3)).toBe(false);
    document.querySelector<HTMLTextAreaElement>('textarea')!.hidden = true;
    controller.scan();
    expect(hidden(3)).toBe(true);
  });

  it('protects an editor opened immediately before the existing toggle is clicked', () => {
    mount();
    const toggle = document.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle')!;
    toggle.click();
    document
      .querySelector('#issuecomment-3')!
      .insertAdjacentHTML('beforeend', '<textarea>Draft</textarea>');
    toggle.click();
    expect(hidden(3)).toBe(false);
    expect(hidden(2)).toBe(true);
  });

  it('does not exempt cached hidden editors from ordinary timeline folding', () => {
    mount();
    document
      .querySelector('#issuecomment-3')!
      .insertAdjacentHTML('beforeend', '<div hidden><textarea>Cached editor</textarea></div>');
    controller.scan();
    expect(hidden(3)).toBe(true);
  });

  it('rebinds replacement middle nodes even when identifiers do not change', () => {
    mount();
    document.querySelector('#timeline-3')!.outerHTML = item(3);
    controller.scan();
    expect(hidden(3)).toBe(true);
    const toggle = document.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle')!;
    toggle.click();
    expect(hidden(3)).toBe(false);
    toggle.click();
    expect(hidden(3)).toBe(true);
  });

  it('reassesses an automatically expanded body after in-place hydration', () => {
    mount(1);
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    Object.defineProperty(body, 'scrollHeight', { value: 400 });
    body.textContent = 'Hydrated long content';
    controller.scan();
    expect(body.dataset.tlprCollapsed).toBe('1');
  });

  it('reassesses automatic state when an existing image finishes loading', async () => {
    document.body.innerHTML = `<main class="js-discussion">${item(0)}</main>`;
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    body.innerHTML = '<img alt="Attached diagram">';
    let height = 30;
    Object.defineProperty(body, 'scrollHeight', { get: () => height });
    controller = new GitHubCommentCollapser();
    controller.start();
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
    );
    height = 400;
    body.querySelector('img')!.dispatchEvent(new Event('load'));
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
    );
    expect(body.dataset.tlprCollapsed).toBe('1');
    document.querySelector<HTMLButtonElement>('[data-tlpr-action="expand-all"]')!.click();
    body.querySelector('img')!.dispatchEvent(new Event('load'));
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
    );
    expect(body.dataset.tlprCollapsed).toBe('0');
  });

  it('preserves a manual expansion when content is hydrated again', () => {
    mount(1);
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    Object.defineProperty(body, 'scrollHeight', { value: 400 });
    document.querySelector<HTMLButtonElement>('[data-tlpr-action="expand-all"]')!.click();
    body.textContent = 'Hydrated long content';
    controller.scan();
    expect(body.dataset.tlprCollapsed).toBe('0');
  });

  it('preserves a temporary direct-link expansion without replacing saved collapse', () => {
    window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#issuecomment-0');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        '/x-quark/tlpr/issues/1': { comments: { 'issuecomment-0': true }, timelineCollapsed: true },
      }),
    );
    mount(1);
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    Object.defineProperty(body, 'scrollHeight', { value: 400 });
    body.textContent = 'Hydrated linked content';
    controller.scan();
    expect(body.dataset.tlprCollapsed).toBe('0');
  });

  it.each(['header', '.comment-body'])(
    'preserves direct-link expansion after replacing %s',
    (selector) => {
      window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#issuecomment-0');
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          '/x-quark/tlpr/issues/1': {
            comments: { 'issuecomment-0': true },
            timelineCollapsed: true,
          },
        }),
      );
      mount(1);
      const target = document.querySelector(selector)!;
      target.replaceWith(target.cloneNode(true));
      controller.scan();
      expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('0');
    },
  );

  it('preserves an explicit collapse after following a direct link and remounting the header', () => {
    window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#issuecomment-0');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        '/x-quark/tlpr/issues/1': { comments: { 'issuecomment-0': true }, timelineCollapsed: true },
      }),
    );
    mount(1);
    document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    const header = document.querySelector('header')!;
    header.replaceWith(header.cloneNode(true));
    controller.scan();
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');
  });
});
