import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubCommentCollapser, STORAGE_KEY } from '../../src/content/controller';
import { alternateViewUrl, chronologyOf, detectLayout } from '../../src/content/layout';

const overviewFixture = readFileSync('tests/fixtures/github-pr-overview.html', 'utf8');
let controller: GitHubCommentCollapser | undefined;

afterEach(() => {
  controller?.destroy();
  controller = undefined;
});

function setTestHeights(): void {
  document.querySelectorAll<HTMLElement>('[data-test-height]').forEach((body) => {
    Object.defineProperty(body, 'scrollHeight', {
      configurable: true,
      value: Number(body.dataset.testHeight),
    });
  });
}

function mountOverview(path = '/example/project/pull/42'): void {
  window.history.replaceState({}, '', path);
  document.body.innerHTML = `<main id="js-repo-pjax-container">${overviewFixture}</main>`;
  setTestHeights();
}

function item(id: string): HTMLElement {
  return document.getElementById(id)!.closest<HTMLElement>('[data-testid="timeline-item"]')!;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 65));

describe('GitHub view detection', () => {
  it('recognizes the Overview page and its newest-first comment list', () => {
    mountOverview();
    const layout = detectLayout(document)!;
    expect(layout.kind).toBe('overview');
    expect(layout.timeline).toBe(document.getElementById('overview-comments')!.closest('section'));
    expect(layout.host.contains(document.querySelector('section[aria-label="Description"]'))).toBe(
      true,
    );
    const items = [...document.querySelectorAll<HTMLElement>('[data-testid="timeline-item"]')];
    expect(chronologyOf(items, layout)).toBe('descending');
    expect(chronologyOf([...items].reverse(), layout)).toBe('ascending');
  });

  it('falls back to the sort control, then to the Overview default, without timestamps', () => {
    mountOverview();
    document.querySelectorAll('relative-time').forEach((time) => time.remove());
    const layout = detectLayout(document)!;
    const items = [...document.querySelectorAll<HTMLElement>('[data-testid="timeline-item"]')];
    expect(chronologyOf(items, layout)).toBe('descending');
    document
      .querySelector('[aria-label^="Sort comments"]')!
      .setAttribute('aria-label', 'Sort comments: Oldest');
    expect(chronologyOf(items, layout)).toBe('ascending');
    document.querySelector('[aria-label^="Sort comments"]')!.remove();
    expect(chronologyOf(items, layout)).toBe('descending');
  });

  it('honors a pinned view and recovers a generic container from comment anchors', () => {
    mountOverview();
    expect(detectLayout(document, 'classic')?.kind).toBe('generic');
    document.body.innerHTML =
      '<main class="js-discussion"><div id="issuecomment-1" class="js-comment timeline-comment"></div></main>';
    expect(detectLayout(document)?.kind).toBe('classic');
    expect(detectLayout(document, 'overview')?.kind).toBe('generic');
    expect(detectLayout(document, 'overview')?.timeline).toBeNull();
    document.body.innerHTML = '<div><p>No conversation</p></div>';
    expect(detectLayout(document)).toBeNull();
  });

  it('offers the classic view from the Overview and a return trip only from ?overview=false', () => {
    const base = { href: 'https://github.com/o/r/pull/7#issuecomment-1', pathname: '/o/r/pull/7' };
    expect(alternateViewUrl(base, 'overview')?.href).toBe(
      'https://github.com/o/r/pull/7?overview=false#issuecomment-1',
    );
    expect(alternateViewUrl(base, 'classic')).toBeNull();
    expect(
      alternateViewUrl(
        { href: 'https://github.com/o/r/pull/7?overview=false', pathname: '/o/r/pull/7' },
        'classic',
      )?.href,
    ).toBe('https://github.com/o/r/pull/7?overview=true');
    expect(
      alternateViewUrl(
        { href: 'https://github.com/o/r/issues/7', pathname: '/o/r/issues/7' },
        'overview',
      ),
    ).toBeNull();
  });
});

describe('Overview page reading controls', () => {
  it('folds long human comments and the description while leaving bots untouched', () => {
    mountOverview();
    controller = new GitHubCommentCollapser();
    controller.scan();

    expect(document.documentElement.dataset.tlprLayout).toBe('overview');
    const collapsed = (id: string) =>
      document.getElementById(id)!.querySelector<HTMLElement>('.markdown-body')!.dataset
        .tlprCollapsed;
    expect(collapsed('issuecomment-106')).toBe('1');
    expect(collapsed('issuecomment-102')).toBe('0');
    expect(collapsed('issuecomment-100')).toBe('1');
    expect(document.querySelector('#issuecomment-105 .tlpr-control')).toBeNull();
    expect(document.querySelector('#issuecomment-105 .tlpr-body')).toBeNull();

    const toggle = document.querySelector('#issuecomment-106 .tlpr-comment-toggle')!;
    expect(toggle.closest('[data-testid="comment-header-right-side-items"]')).not.toBeNull();

    const description = document.querySelector<HTMLElement>('section[aria-label="Description"]')!;
    const bar = description.firstElementChild!;
    expect(bar.classList.contains('tlpr-comment-bar')).toBe(true);
    expect(bar.querySelector('.tlpr-comment-toggle')).not.toBeNull();
    expect(description.querySelector<HTMLElement>('.markdown-body')!.dataset.tlprCollapsed).toBe(
      '1',
    );
  });

  it('keeps review thread bodies with their own comment, never with the review summary', () => {
    mountOverview();
    controller = new GitHubCommentCollapser();
    controller.scan();
    const review = document.getElementById('pullrequestreview-103')!;
    const thread = document.getElementById('pullrequestreview-103-discussion_r900')!;
    expect(review.dataset.tlprEnhanced).toBeUndefined();
    expect(thread.dataset.tlprEnhanced).toBe('1');
    expect(thread.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
    thread.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)['/example/project/pull/42'];
    // Anchors are canonical, so classic and Overview views share one folding preference.
    expect(saved.comments).toEqual({ discussion_r900: false });
  });

  it('keeps the oldest two and newest three items of a newest-first list', () => {
    mountOverview();
    controller = new GitHubCommentCollapser();
    controller.scan();
    const hidden = [...document.querySelectorAll('.tlpr-timeline-hidden')];
    expect(hidden).toEqual([item('pullrequestreview-103'), item('issuecomment-102')]);
    for (const visible of [
      'issuecomment-106',
      'issuecomment-105',
      'issuecomment-101',
      'issuecomment-100',
    ])
      expect(item(visible).classList.contains('tlpr-timeline-hidden')).toBe(false);
    const summary = document.querySelector('.tlpr-timeline-summary')!;
    expect(summary.nextElementSibling).toBe(item('pullrequestreview-103'));
    expect(summary.textContent).toContain('2 items hidden');

    summary.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle')!.click();
    expect(document.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
  });

  it('re-applies the fold when GitHub switches the list to oldest first', () => {
    mountOverview();
    controller = new GitHubCommentCollapser();
    controller.scan();
    const list = document.querySelector('[data-direction="vertical"]')!;
    const items = [...list.querySelectorAll<HTMLElement>(':scope > [data-testid="timeline-item"]')];
    for (const entry of items.reverse()) list.append(entry);
    controller.scan();
    expect([...document.querySelectorAll('.tlpr-timeline-hidden')]).toEqual([
      item('issuecomment-102'),
      item('pullrequestreview-103'),
    ]);
  });

  it('places one reading rail at the top of the column with a classic view link', () => {
    mountOverview('/example/project/pull/42#issuecomment-100');
    controller = new GitHubCommentCollapser();
    controller.scan();
    const rails = document.querySelectorAll('.tlpr-global-rail');
    expect(rails).toHaveLength(1);
    expect(rails[0]!.parentElement?.classList.contains('flex-column')).toBe(true);
    const link = rails[0]!.querySelector<HTMLAnchorElement>('a.tlpr-view-switch')!;
    expect(link.href).toBe(
      'https://github.com/example/project/pull/42?overview=false#issuecomment-100',
    );
    expect(link.textContent).toBe('Classic view');
    controller.scan();
    expect(document.querySelectorAll('.tlpr-view-switch')).toHaveLength(1);
  });

  it('reveals a linked comment without saving a preference', () => {
    mountOverview('/example/project/pull/42#issuecomment-100');
    controller = new GitHubCommentCollapser();
    controller.scan();
    const body = document.querySelector<HTMLElement>('#issuecomment-100 .markdown-body')!;
    expect(body.dataset.tlprCollapsed).toBe('0');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('removes every effect, bar and layout marker on destroy', () => {
    mountOverview();
    controller = new GitHubCommentCollapser();
    controller.scan();
    controller.destroy();
    expect(
      document.querySelector('.tlpr-comment-bar, .tlpr-control, .tlpr-global-rail'),
    ).toBeNull();
    expect(document.querySelector('.tlpr-body, .tlpr-timeline-hidden')).toBeNull();
    expect(document.documentElement.dataset.tlprLayout).toBeUndefined();
  });

  it('ignores page mutations outside the conversation but follows a replaced list', async () => {
    mountOverview();
    controller = new GitHubCommentCollapser();
    controller.start();
    await settle();
    const scan = vi.spyOn(controller, 'scan');
    const tooltip = document.createElement('div');
    tooltip.className = 'hovercard';
    tooltip.innerHTML = '<p>Popover content</p>';
    document.body.append(tooltip);
    document
      .querySelector('[data-testid="sticky-sidebar"]')!
      .append(document.createElement('span'));
    await settle();
    expect(scan).not.toHaveBeenCalled();

    const list = document.querySelector('[data-direction="vertical"]')!;
    list.insertAdjacentHTML(
      'afterbegin',
      '<div data-testid="timeline-item" data-item-type="issue"><article id="issuecomment-107"><div><div data-testid="comment-header"><relative-time datetime="2026-11-07T10:07:00Z"></relative-time><div data-testid="comment-header-right-side-items"></div></div></div><div class="markdown-body">Live reply</div></article></div>',
    );
    await settle();
    expect(scan).toHaveBeenCalled();
    expect(document.querySelector('#issuecomment-107 .tlpr-comment-toggle')).not.toBeNull();
  });
});

describe('React issue viewer', () => {
  function mountIssue(): void {
    window.history.replaceState({}, '', '/example/project/issues/9');
    const comment = (id: number, author: string, bot = false) =>
      `<li data-wrapper-timeline-id="IC_${id}"><div class="timelineElement"><div class="react-issue-comment"><div data-testid="comment-viewer-outer-box-IC_${id}"><div data-testid="comment-header" id="issuecomment-${id}"><div data-testid="comment-header-left-side-items"><a data-testid="avatar-link" href="${bot ? `/apps/${author}` : `/${author}`}">${author}</a>${bot ? '<span data-component="Label">Bot</span>' : ''}<a href="https://github.com/example/project/issues/9#issuecomment-${id}"><relative-time datetime="2026-11-0${id}T10:00:00Z"></relative-time></a></div><div data-testid="comment-header-right-side-items"><button data-testid="comment-header-hamburger">…</button></div></div><div class="IssueCommentBody"><div data-testid="markdown-body" class="markdown-body" data-test-height="260">Comment ${id}</div></div></div></div></div></li>`;
    document.body.innerHTML = `<div class="contentArea"><div data-testid="issue-viewer-issue-container"><div data-testid="issue-body" class="react-issue-body"><div class="headerRow"><div class="IssueBodyHeaderContainer__FFEvZk"><div class="activityHeader__V45NcJ"><a data-testid="issue-body-header-author" href="/octocat">octocat</a><div class="actionsWrapper__rTb725"><div class="actionsSection__QKxX29"><button type="button">…</button></div></div></div></div><div id="issue-body-viewer" data-testid="issue-body-viewer"><div data-testid="markdown-body" class="markdown-body" data-test-height="300">Issue body</div></div></div></div></div><div data-testid="issue-viewer-comments-container"><ol id="issue-timeline" data-testid="issue-timeline-container">${comment(1, 'octocat')}${comment(2, 'github-actions', true)}${comment(3, 'hubot')}</ol></div></div>`;
    setTestHeights();
  }

  it('enhances React issue comments whose anchor lives on the header', () => {
    mountIssue();
    controller = new GitHubCommentCollapser();
    controller.scan();
    expect(detectLayout(document)?.kind).toBe('react');
    const toggle = document.querySelector('#issuecomment-1')!.querySelector('.tlpr-comment-toggle');
    expect(toggle?.closest('[data-testid="comment-header-right-side-items"]')).not.toBeNull();
    expect(document.querySelector('#issuecomment-3 .tlpr-comment-toggle')).not.toBeNull();
    expect(document.querySelector('#issuecomment-2 .tlpr-comment-toggle')).toBeNull();
    expect(
      document
        .querySelector('[data-testid="issue-body"]')!
        .querySelector('.actionsSection__QKxX29 > .tlpr-control .tlpr-comment-toggle'),
    ).not.toBeNull();
    document.querySelector<HTMLButtonElement>('#issuecomment-1 .tlpr-comment-toggle')!.click();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)['/example/project/issues/9'];
    expect(saved.comments).toEqual({ 'issuecomment-1': false });
  });
});

describe('automated authors', () => {
  it('leaves classic GitHub App comments alone even without a [bot] suffix', () => {
    window.history.replaceState({}, '', '/example/project/pull/1');
    document.body.innerHTML = `<main class="js-discussion"><div class="TimelineItem"><div class="js-comment timeline-comment" id="issuecomment-1"><div class="timeline-comment-header"><strong><a class="author" href="/apps/github-actions">github-actions</a> <span class="Label Label--secondary">Bot</span></strong> commented</div><div class="comment-body" data-test-height="400">Report</div></div></div><div class="TimelineItem"><div class="js-comment timeline-comment" id="issuecomment-2"><div class="timeline-comment-header"><strong><a class="author" href="/octocat">octocat</a></strong> commented</div><div class="comment-body" data-test-height="400">Review</div></div></div></main>`;
    setTestHeights();
    controller = new GitHubCommentCollapser();
    controller.scan();
    expect(document.querySelector('#issuecomment-1 .tlpr-control')).toBeNull();
    expect(document.querySelector('#issuecomment-1 .tlpr-body')).toBeNull();
    expect(document.querySelector('#issuecomment-2 .tlpr-control')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')!.click();
    expect(document.querySelector('#issuecomment-1 .tlpr-body')).toBeNull();
  });
});
