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
      `${expectedHidden} items shown`,
    );
  });

  it('keeps keyboard focus on the middle toggle through repeated clicks', () => {
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index))));
    new GitHubCommentCollapser().scan();
    const toggle = host.querySelector<HTMLButtonElement>('.tlpr-timeline-summary button')!;
    toggle.focus();

    for (const expanded of [true, false, true]) {
      toggle.click();
      expect(document.activeElement).toBe(toggle);
      expect(toggle.isConnected).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe(String(expanded));
      expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(expanded ? 0 : 4);
    }
  });

  it('keeps global actions in one reachable rail separate from the middle summary', () => {
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index))));
    new GitHubCommentCollapser().scan();
    const summary = host.querySelector('.tlpr-timeline-summary')!;
    const toolbar = host.querySelector('.tlpr-toolbar')!;
    expect(summary.contains(toolbar)).toBe(false);
    expect(toolbar.classList.contains('tlpr-global-rail')).toBe(true);
    expect(toolbar.textContent).toContain('Expand all');
    expect(toolbar.textContent).toContain('Collapse all');
    expect(summary.getAttribute('aria-label')).toBe('Conversation reading controls');
  });

  it('offers global actions even for a short timeline and leaves bots alone', () => {
    const host = mountTimeline([comment('1'), comment('2', { bot: true })]);
    new GitHubCommentCollapser().scan();
    expect(host.querySelectorAll('.tlpr-global-rail')).toHaveLength(1);
    const expand = host.querySelector<HTMLButtonElement>('[data-tlpr-action="expand-all"]')!;
    expand.click();
    expect(
      host.querySelector<HTMLElement>('#issuecomment-1 .comment-body')!.dataset.tlprCollapsed,
    ).toBe('0');
    expect(host.querySelector('#issuecomment-2 .tlpr-body')).toBeNull();
  });

  it('expands and collapses both the timeline and human comments from the rail', () => {
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index + 1))));
    new GitHubCommentCollapser().scan();
    const expand = host.querySelector<HTMLButtonElement>('[data-tlpr-action="expand-all"]')!;
    expand.focus();
    expand.click();
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
    expect(host.querySelectorAll('.tlpr-body[data-tlpr-collapsed="0"]')).toHaveLength(9);
    expect(document.activeElement).toBe(expand);
    host.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')!.click();
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(4);
    expect(host.querySelectorAll('.tlpr-body[data-tlpr-collapsed="1"]')).toHaveLength(9);
  });

  it('fully removes its effects and listeners without clearing saved preferences', () => {
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index + 1))));
    const collapser = new GitHubCommentCollapser();
    collapser.start();
    const body = host.querySelector<HTMLElement>('.comment-body')!;
    host.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    const stored = localStorage.getItem(STORAGE_KEY);
    collapser.destroy();
    expect(
      host.querySelectorAll('.tlpr-body,.tlpr-btn,.tlpr-timeline-hidden,.tlpr-global-rail'),
    ).toHaveLength(0);
    expect(body.id).toBe('');
    expect(body.hasAttribute('data-tlpr-collapsed')).toBe(false);
    body.click();
    collapser.scan();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    expect(host.querySelector('.tlpr-btn')).toBeNull();
    const restarted = new GitHubCommentCollapser();
    restarted.scan();
    expect(body.dataset.tlprCollapsed).toBe('0');
    expect(host.querySelectorAll('.tlpr-global-rail')).toHaveLength(1);
    restarted.destroy();
  });

  it('associates a comment toggle with its body without replacing an existing id', () => {
    mountTimeline([comment('1'), comment('2')]);
    document.querySelector<HTMLElement>('#issuecomment-1 .comment-body')!.id = 'github-body';
    new GitHubCommentCollapser().scan();
    for (const id of ['1', '2']) {
      const article = document.getElementById(`issuecomment-${id}`)!;
      const body = article.querySelector<HTMLElement>('.comment-body')!;
      expect(body.id).not.toBe('');
      expect(article.querySelector('button')?.getAttribute('aria-controls')).toBe(body.id);
    }
    expect(document.getElementById('github-body')).not.toBeNull();
  });

  it.each([
    '<a href="#details">Read details</a>',
    '<button type="button"><span>Copy</span></button>',
    '<input type="checkbox">',
    '<summary>More details</summary>',
    '<span role="button" tabindex="0">Custom action</span>',
  ])('does not expand a comment when an embedded action is clicked: %s', (markup) => {
    mountTimeline([comment('1')]);
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    body.innerHTML = markup;
    new GitHubCommentCollapser().scan();
    const target = body.querySelector<HTMLElement>('span') ?? body.firstElementChild!;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(body.dataset.tlprCollapsed).toBe('1');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('expands ordinary preview text and reveals keyboard-focused body controls', () => {
    mountTimeline([comment('1')]);
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    body.innerHTML = '<p>Preview text</p><a href="#details">Details</a>';
    const collapser = new GitHubCommentCollapser();
    collapser.start();
    body.querySelector('p')!.click();
    expect(body.dataset.tlprCollapsed).toBe('0');
    document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(body.dataset.tlprCollapsed).toBe('1');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    body.querySelector('a')!.focus();
    expect(body.dataset.tlprCollapsed).toBe('0');
    collapser.stop();
  });

  it('does not toggle a previously enhanced comment while it is being edited', () => {
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();
    const article = document.querySelector('.js-comment')!;
    article.insertAdjacentHTML('beforeend', '<textarea></textarea>');
    article.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(article.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reaches a stable glow plateau just inside the clickable area without changing folding state', () => {
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      right: 610,
      bottom: 140,
      width: 600,
      height: 120,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    const approach = (x: number, y: number): number => {
      const event = new MouseEvent('pointermove', { clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      body.dispatchEvent(event);
      return Number(body.style.getPropertyValue('--tlpr-reveal-proximity'));
    };
    const far = approach(310, 24);
    const middle = approach(310, 90);
    const near = approach(310, 120);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(1);
    expect(middle).toBe(1);
    expect(near).toBe(1);
    expect(approach(40, 45)).toBe(1);
    expect(approach(12, 90)).toBeLessThan(near);
    expect(body.dataset.tlprCollapsed).toBe('1');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(body.hasAttribute('data-tlpr-expand-hint')).toBe(false);
    body.dispatchEvent(new Event('pointerleave'));
    expect(body.style.getPropertyValue('--tlpr-reveal-proximity')).toBe('');
    approach(310, 139);
    body.dispatchEvent(new Event('pointercancel'));
    expect(body.style.getPropertyValue('--tlpr-reveal-proximity')).toBe('');
    collapser.destroy();
    approach(310, 139);
    expect(body.style.getPropertyValue('--tlpr-reveal-proximity')).toBe('');
  });

  it.each(['touch', 'pen'])('does not leave a pointer cue after %s input', (pointerType) => {
    mountTimeline([comment('1')]);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    body.style.setProperty('--tlpr-reveal-proximity', '1');
    const event = new MouseEvent('pointermove', { clientX: 20, clientY: 120 });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    body.dispatchEvent(event);
    expect(body.style.getPropertyValue('--tlpr-reveal-proximity')).toBe('');
    expect(body.dataset.tlprCollapsed).toBe('1');
    collapser.destroy();
  });

  it.each(['link', 'editing', 'expanded', 'reduced motion', 'animations off'])(
    'suppresses the expansion cue for %s',
    (mode) => {
      mountTimeline([comment('1')]);
      const collapser = new GitHubCommentCollapser();
      collapser.scan();
      const body = document.querySelector<HTMLElement>('.comment-body')!;
      const article = document.querySelector('.js-comment')!;
      let target: HTMLElement = body;
      if (mode === 'link') {
        body.innerHTML = '<a href="#example">Example</a>';
        target = body.querySelector('a')!;
      }
      if (mode === 'editing') article.insertAdjacentHTML('beforeend', '<textarea></textarea>');
      if (mode === 'expanded')
        article.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
      if (mode === 'animations off') document.documentElement.dataset.tlprAnimations = 'off';
      if (mode === 'reduced motion') {
        vi.stubGlobal(
          'matchMedia',
          vi.fn(() => ({ matches: true })),
        );
      }
      body.style.setProperty('--tlpr-reveal-proximity', '1');
      const event = new MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 120 });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      target.dispatchEvent(event);
      expect(body.style.getPropertyValue('--tlpr-reveal-proximity')).toBe('');
      delete document.documentElement.dataset.tlprAnimations;
      vi.unstubAllGlobals();
      collapser.destroy();
    },
  );

  it('reveals a permalink target without overwriting saved folding preferences', () => {
    window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#issuecomment-4');
    const saved = {
      '/x-quark/tlpr/issues/1': { comments: { 'issuecomment-4': true }, timelineCollapsed: true },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index + 1))));
    new GitHubCommentCollapser().scan();
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
    expect(
      host.querySelector<HTMLElement>('#issuecomment-4 .comment-body')!.dataset.tlprCollapsed,
    ).toBe('0');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(saved);
    const toggle = host.querySelector<HTMLButtonElement>('.tlpr-timeline-summary button')!;
    toggle.click();
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(4);
  });

  it('reveals a target on hash navigation and stops listening after stop', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    );
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index + 1))));
    const collapser = new GitHubCommentCollapser();
    collapser.start();
    window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#issuecomment-4');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
    expect(
      host.querySelector<HTMLElement>('#issuecomment-4 .comment-body')!.dataset.tlprCollapsed,
    ).toBe('0');
    collapser.stop();
    const requestFrame = vi.mocked(window.requestAnimationFrame);
    requestFrame.mockClear();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('restores the conversation bar when GitHub replaces the timeline with identical ids', () => {
    const items = Array.from({ length: 9 }, (_, index) => comment(String(index + 1)));
    mountTimeline(items);
    const collapser = new GitHubCommentCollapser();
    collapser.scan();
    const replacementHost = mountTimeline(items);
    collapser.scan();
    expect(replacementHost.querySelectorAll('.tlpr-timeline-summary')).toHaveLength(1);
    expect(replacementHost.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(4);
  });

  it('does not expand a comment while its preview text is selected', () => {
    mountTimeline([comment('1')]);
    new GitHubCommentCollapser().scan();
    const body = document.querySelector<HTMLElement>('.comment-body')!;
    const range = document.createRange();
    range.selectNodeContents(body);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.toString()).toBe('Comment 1');
    body.click();
    expect(body.dataset.tlprCollapsed).toBe('1');
    window.getSelection()!.removeAllRanges();
    body.click();
    expect(body.dataset.tlprCollapsed).toBe('0');
  });

  it('respects a manual comment collapse after temporarily revealing a permalink', () => {
    window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#issuecomment-4');
    const host = mountTimeline(Array.from({ length: 9 }, (_, index) => comment(String(index + 1))));
    const collapser = new GitHubCommentCollapser();
    collapser.scan();
    host.querySelector<HTMLButtonElement>('#issuecomment-4 .tlpr-comment-toggle')!.click();
    collapser.scan();
    expect(
      host.querySelector<HTMLElement>('#issuecomment-4 .comment-body')!.dataset.tlprCollapsed,
    ).toBe('1');
  });

  it.each(['#missing-comment', '#%E0%A4%A'])(
    'ignores missing or invalid permalink targets: %s',
    (hash) => {
      window.history.replaceState({}, '', `/x-quark/tlpr/issues/1${hash}`);
      const host = mountTimeline(
        Array.from({ length: 9 }, (_, index) => comment(String(index + 1))),
      );
      expect(() => new GitHubCommentCollapser().scan()).not.toThrow();
      expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(4);
    },
  );

  it('reveals a nested anchor and leaves linked bot content unchanged', () => {
    const host = mountTimeline(
      Array.from({ length: 9 }, (_, index) => comment(String(index + 1), { bot: index === 3 })),
    );
    const body = host.querySelector('#issuecomment-4 .comment-body')!;
    body.innerHTML = '<h3 id="details">Details</h3>';
    window.history.replaceState({}, '', '/x-quark/tlpr/issues/1#details');
    new GitHubCommentCollapser().scan();
    expect(host.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
    expect(body.classList.contains('tlpr-body')).toBe(false);
    expect(host.querySelector('#issuecomment-4 .tlpr-comment-toggle')).toBeNull();
  });

  it('labels one middle item correctly in both states', () => {
    const host = mountTimeline(Array.from({ length: 6 }, (_, index) => comment(String(index + 1))));
    new GitHubCommentCollapser().scan();
    expect(host.querySelector('.tlpr-timeline-summary-text')?.textContent).toBe('1 item hidden');
    const toggle = host.querySelector<HTMLButtonElement>('.tlpr-timeline-summary button')!;
    expect(toggle.textContent).toBe('Show 1 more');
    toggle.click();
    expect(host.querySelector('.tlpr-timeline-summary-text')?.textContent).toBe('1 item shown');
    expect(toggle.textContent).toBe('Hide middle');
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
