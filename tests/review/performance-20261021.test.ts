import { describe, expect, it, vi } from 'vitest';
import { GitHubCommentCollapser, STORAGE_KEY } from '../../src/content/controller';

function mount(count = 1): HTMLElement {
  document.body.innerHTML = `<main class="js-discussion">${Array.from({ length: count }, (_, i) => `<div class="TimelineItem"><article class="js-comment timeline-comment" id="issuecomment-${i}"><header class="timeline-comment-header">human</header><div class="comment-body">text</div></article></div>`).join('')}</main>`;
  return document.querySelector('main')!;
}

describe('performance and persistence regressions', () => {
  it('retries explicit unchanged preferences after a quota failure on the next write', () => {
    const host = mount(2);
    const key = '/x-quark/tlpr/issues/1';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [key]: { comments: { 'issuecomment-0': true }, timelineCollapsed: true } }),
    );
    const controller = new GitHubCommentCollapser();
    controller.scan();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [key]: { comments: { 'issuecomment-0': false }, timelineCollapsed: false },
      }),
    );
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    host.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')!.click();
    fail.mockRestore();
    host.querySelector<HTMLButtonElement>('#issuecomment-1 button')!.click();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[key]).toEqual({
      comments: { 'issuecomment-0': true, 'issuecomment-1': false },
      timelineCollapsed: true,
    });
    controller.destroy();
  });
  it('honors explicit bulk collapse after another context changes the same preference', () => {
    const host = mount();
    const key = '/x-quark/tlpr/issues/1';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [key]: { comments: { 'issuecomment-0': true }, timelineCollapsed: true } }),
    );
    const controller = new GitHubCommentCollapser();
    controller.scan();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [key]: { comments: { 'issuecomment-0': false }, timelineCollapsed: false },
      }),
    );
    host.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')!.click();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[key]).toEqual({
      comments: { 'issuecomment-0': true },
      timelineCollapsed: true,
    });
    controller.destroy();
  });

  it('recovers from an invalid array store without losing later writes', () => {
    localStorage.setItem(STORAGE_KEY, '[]');
    const host = mount();
    const controller = new GitHubCommentCollapser();
    controller.scan();
    host.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!)['/x-quark/tlpr/issues/1'].comments[
        'issuecomment-0'
      ],
    ).toBe(true);
    controller.destroy();
  });
  it('restores body listeners when an entire comment is detached then reattached', () => {
    const host = mount();
    const controller = new GitHubCommentCollapser();
    controller.scan();
    const item = host.querySelector<HTMLElement>('.TimelineItem')!;
    item.remove();
    controller.scan();
    host.append(item);
    controller.scan();
    host.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    const body = host.querySelector<HTMLElement>('.comment-body')!;
    body.click();
    expect(body.dataset.tlprCollapsed).toBe('0');
    controller.destroy();
  });
  it('releases listeners attached to replaced bodies before destruction', () => {
    const host = mount();
    const controller = new GitHubCommentCollapser();
    controller.scan();
    const old = host.querySelector('.comment-body')!;
    const remove = vi.spyOn(old, 'removeEventListener');
    old.replaceWith(document.createElement('div'));
    host.querySelector('article > div')!.className = 'comment-body';
    controller.scan();
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function));
    controller.destroy();
  });

  it('avoids quadratic contains comparisons in a flat timeline', () => {
    const host = mount(100);
    const contains = vi.spyOn(Node.prototype, 'contains');
    const controller = new GitHubCommentCollapser();
    (
      controller as unknown as { getTimelineItems(host: HTMLElement): HTMLElement[] }
    ).getTimelineItems(host);
    expect(contains.mock.calls.length).toBeLessThan(1000);
    controller.destroy();
  });

  it('keeps controls usable when persistence runs out of quota', () => {
    const host = mount();
    const controller = new GitHubCommentCollapser();
    controller.scan();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    host.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(host.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');
    controller.destroy();
  });

  it('preserves changes made by another already-open controller', () => {
    const host = mount(2);
    const first = new GitHubCommentCollapser();
    const second = new GitHubCommentCollapser();
    first.scan();
    const firstButton = host.querySelector<HTMLButtonElement>('#issuecomment-0 button')!;
    second.scan();
    firstButton.click();
    host.querySelector<HTMLButtonElement>('#issuecomment-1 button')!.click();
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(state['/x-quark/tlpr/issues/1'].comments).toEqual({
      'issuecomment-0': true,
      'issuecomment-1': true,
    });
    first.destroy();
    second.destroy();
  });
});
