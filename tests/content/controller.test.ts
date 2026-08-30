import { describe, expect, it, vi } from 'vitest';

import {
  GitHubCommentCollapser,
  KEEP_LEADING_TIMELINE_ITEMS,
  KEEP_TRAILING_TIMELINE_ITEMS,
  STORAGE_KEY,
} from '../../src/content/controller';

function comment(
  id: string,
  options: { bot?: boolean; editable?: boolean; height?: number } = {},
): string {
  const botLabel = options.bot ? 'renovate[bot]' : 'octocat';
  const editor = options.editable ? '<textarea></textarea>' : '';
  return `
    <div class="TimelineItem" id="timeline-${id}">
      <article class="js-comment timeline-comment" id="issuecomment-${id}">
        <header class="timeline-comment-header">${botLabel}</header>
        <div class="comment-body" data-test-height="${options.height ?? 200}">Comment ${id}</div>
        ${editor}
      </article>
    </div>
  `;
}

function mountTimeline(items: string[]): HTMLElement {
  document.body.innerHTML = `<main class="js-discussion">${items.join('')}</main>`;
  setTestHeights();
  return document.querySelector<HTMLElement>('.js-discussion')!;
}

function setTestHeights(): void {
  document.querySelectorAll<HTMLElement>('[data-test-height]').forEach((body) => {
    Object.defineProperty(body, 'scrollHeight', {
      configurable: true,
      value: Number(body.dataset.testHeight),
    });
  });
}

describe('GitHubCommentCollapser', () => {
  it('collapses long human comments and restores their saved state', () => {
    mountTimeline([comment('1', { height: 220 })]);
    const first = new GitHubCommentCollapser();
    first.scan();

    const body = document.querySelector<HTMLElement>('.comment-body')!;
    const toggle = document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!;
    expect(body.dataset.tlprCollapsed).toBe('1');
    expect(toggle.textContent).toContain('Expand');

    toggle.click();
    expect(body.dataset.tlprCollapsed).toBe('0');

    document.querySelector('.tlpr-control')?.remove();
    document.querySelector<HTMLElement>('.js-comment')!.dataset.tlprEnhanced = '';
    new GitHubCommentCollapser().scan();
    expect(body.dataset.tlprCollapsed).toBe('0');

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      { comments: Record<string, boolean> }
    >;
    expect(persisted['/x-quark/tlpr/issues/1']?.comments['issuecomment-1']).toBe(false);
  });

  it('keeps short comments expanded by default', () => {
    mountTimeline([comment('1', { height: 100 })]);
    new GitHubCommentCollapser().scan();

    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('0');
    expect(document.querySelector('.tlpr-comment-toggle')?.textContent).toContain('Collapse');
  });

  it('leaves bot and editable comments untouched', () => {
    mountTimeline([comment('1', { bot: true }), comment('2', { editable: true })]);
    new GitHubCommentCollapser().scan();

    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(0);
    expect(document.querySelectorAll('.tlpr-body')).toHaveLength(0);
  });

  it('enhances a comment after its initial edit mode ends', () => {
    mountTimeline([comment('1', { editable: true })]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();
    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(0);

    document.querySelector('textarea')!.remove();
    collapser.scan();

    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');
  });

  it('supports representative React and review comment structures', () => {
    document.body.innerHTML = `
      <main data-testid="issue-viewer-container">
        <div class="js-timeline-item">
          <article class="react-issue-comment" id="react-comment">
            <header data-testid="comment-header">octocat</header>
            <div data-testid="markdown-body" data-test-height="220">React comment</div>
          </article>
        </div>
        <div class="js-comment-container">
          <article class="review-comment js-comment" id="review-comment">
            <header class="timeline-comment-header">reviewer</header>
            <div class="comment-body" data-test-height="220">Review comment</div>
          </article>
        </div>
      </main>
    `;
    setTestHeights();

    new GitHubCommentCollapser().scan();

    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(2);
    expect(
      [...document.querySelectorAll<HTMLElement>('.tlpr-body')].map(
        (body) => body.dataset.tlprCollapsed,
      ),
    ).toEqual(['1', '1']);
  });

  it('keeps the leading and trailing timeline items visible and toggles the middle', () => {
    const total = 9;
    const host = mountTimeline(
      Array.from({ length: total }, (_, index) => comment(String(index + 1), { height: 80 })),
    );
    new GitHubCommentCollapser().scan();

    const expectedHidden = total - KEEP_LEADING_TIMELINE_ITEMS - KEEP_TRAILING_TIMELINE_ITEMS;
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(expectedHidden);
    expect(host.querySelector('.tlpr-timeline-summary-text')?.textContent).toContain(
      `${expectedHidden} items hidden`,
    );

    const summaryToggle = host.querySelector<HTMLButtonElement>(
      '.tlpr-timeline-summary .tlpr-timeline-toggle',
    )!;
    summaryToggle.click();

    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
    expect(host.querySelector('.tlpr-timeline-summary-text')?.textContent).toContain(
      `${expectedHidden} items hidden`,
    );
  });

  it('reapplies controls when GitHub replaces a comment header', () => {
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();

    const commentElement = document.querySelector<HTMLElement>('.js-comment')!;
    commentElement.querySelector('header')!.innerHTML = 'octocat';
    collapser.scan();

    expect(commentElement.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
  });

  it('rebinds controls when GitHub replaces a comment body', () => {
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();

    const originalBody = document.querySelector<HTMLElement>('.comment-body')!;
    originalBody.outerHTML = '<div class="comment-body">Replacement body</div>';
    const replacementBody = document.querySelector<HTMLElement>('.comment-body')!;
    Object.defineProperty(replacementBody, 'scrollHeight', {
      configurable: true,
      value: 220,
    });

    collapser.scan();
    expect(replacementBody.dataset.tlprCollapsed).toBe('1');

    document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(replacementBody.dataset.tlprCollapsed).toBe('0');
    expect(originalBody.dataset.tlprCollapsed).toBe('1');
  });

  it('enhances a complete replacement comment node', () => {
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();

    const wrapper = document.querySelector<HTMLElement>('.TimelineItem')!;
    wrapper.innerHTML = `
      <article class="js-comment timeline-comment" id="issuecomment-1">
        <header class="timeline-comment-header">octocat</header>
        <div class="comment-body" data-test-height="220">Replacement comment</div>
      </article>
    `;
    setTestHeights();
    collapser.scan();

    const replacementBody = document.querySelector<HTMLElement>('.comment-body')!;
    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
    expect(replacementBody.dataset.tlprCollapsed).toBe('1');

    document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(replacementBody.dataset.tlprCollapsed).toBe('0');
  });

  it('keeps per-page state isolated across GitHub soft navigation', () => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.start();

    document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('0');

    window.history.pushState({}, '', '/x-quark/tlpr/pull/2');
    mountTimeline([comment('1')]);
    document.dispatchEvent(new Event('soft-nav:success'));
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');

    window.history.pushState({}, '', '/x-quark/tlpr/issues/1');
    mountTimeline([comment('1')]);
    document.dispatchEvent(new Event('soft-nav:success'));
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('0');

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    collapser.stop();
  });

  it('starts one observer and reacts to GitHub navigation events', () => {
    mountTimeline([comment('1')]);
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const collapser = new GitHubCommentCollapser();

    collapser.start();
    document.dispatchEvent(new Event('turbo:load'));
    collapser.start();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
    collapser.stop();
  });
});
