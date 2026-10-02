import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountMergeHelper, type MergeHelperLabels } from '../../src/content/merge-helper';

const labels: MergeHelperLabels = {
  mergeOpen: 'Preview merge text',
  mergeTitle: 'Merge text preview',
  mergeDetectedNotice:
    'Detected from a visible heading. Review before copying; the raw marker is not verified.',
  mergeCandidateLabel: 'Choose a detected comment',
  mergeCandidatePlaceholder: 'Choose a comment',
  mergeCandidateOption: 'Comment {count}',
  mergePreviewLabel: 'Text to copy',
  mergeMissingTitle: 'The pull request title could not be read.',
  mergeNoCandidates: 'No unambiguous merge body was found under a visible heading.',
  mergeCopy: 'Copy text',
  mergeCopying: 'Copying…',
  mergeCopied: 'Copied',
  mergeCopyError: 'Copy was blocked. Select and copy the preview text manually.',
  mergeClose: 'Close',
};

let cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
});

function mountPage(
  bodies: string[],
  title = '<span class="js-issue-title">Improve example behavior</span>',
): HTMLElement {
  document.body.innerHTML = `${title}<main class="js-discussion">${bodies.join('')}<div class="tlpr-global-rail"></div></main>`;
  return document.querySelector<HTMLElement>('.tlpr-global-rail')!;
}

function comment(body: string, id = '1'): string {
  return `<article class="js-comment timeline-comment" id="issuecomment-${id}"><div class="comment-body markdown-body">${body}</div></article>`;
}

function markedBody(payload = '- Preserve **Markdown**\n\n  Indented detail  \n'): string {
  return `<h2>🧾 Merge commit body</h2><pre><code>${payload}</code></pre>`;
}

function start(container = mountPage([comment(markedBody())])): HTMLButtonElement {
  cleanups.push(mountMergeHelper(document, window, container, labels));
  return container.querySelector<HTMLButtonElement>('.tlpr-merge-open')!;
}

function preview(): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>('.tlpr-merge-preview')!;
}

function copyButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.tlpr-merge-copy')!;
}

function status(): HTMLElement {
  return document.querySelector<HTMLElement>('.tlpr-merge-status')!;
}

function setClipboard(writeText?: (text: string) => Promise<void>): void {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

describe('mountMergeHelper', () => {
  it('mounts only a button until explicitly opened and displays the exact read-only payload', () => {
    const opener = start();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(opener.textContent).toBe(labels.mergeOpen);

    opener.click();

    expect(preview().value).toBe(
      'Improve example behavior\n\n- Preserve **Markdown**\n\n  Indented detail  \n',
    );
    expect(preview().readOnly).toBe(true);
    expect(copyButton().disabled).toBe(false);
    expect(document.querySelector('.tlpr-merge-notice')?.textContent).toBe(
      labels.mergeDetectedNotice,
    );
  });

  it('does not write to the clipboard until clicked and reports success only after resolution', async () => {
    let finish: (() => void) | undefined;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    setClipboard(writeText);
    start().click();
    expect(writeText).not.toHaveBeenCalled();

    copyButton().click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(preview().value);
    expect(status().textContent).toBe(labels.mergeCopying);
    expect(copyButton().disabled).toBe(true);
    finish?.();
    await Promise.resolve();

    expect(status().textContent).toBe(labels.mergeCopied);
    expect(copyButton().disabled).toBe(false);
  });

  it.each(['absent', 'rejected'] as const)(
    'keeps the preview selectable when clipboard access is %s',
    async (failure) => {
      setClipboard(
        failure === 'rejected'
          ? async () => {
              throw new Error('denied');
            }
          : undefined,
      );
      start().click();
      const expected = preview().value;
      copyButton().click();
      await Promise.resolve();

      expect(status().textContent).toBe(labels.mergeCopyError);
      expect(preview().value).toBe(expected);
      expect(preview().disabled).toBe(false);
      expect(preview().readOnly).toBe(true);
      expect(copyButton().disabled).toBe(false);
    },
  );

  it('requires an explicit selection when multiple comments qualify', () => {
    start(
      mountPage([comment(markedBody('First body'), '1'), comment(markedBody('Second body'), '2')]),
    ).click();
    const group = document.querySelector<HTMLFieldSetElement>('.tlpr-merge-candidates')!;
    const choices = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(document.querySelector('.tlpr-merge-dialog select')).toBeNull();
    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend')?.textContent).toBe(labels.mergeCandidateLabel);
    expect(choices).toHaveLength(2);
    expect(choices.every((choice) => !choice.checked)).toBe(true);
    expect(choices[0]!.name).toBe(choices[1]!.name);
    expect(choices.map((choice) => choice.labels?.[0]?.textContent)).toEqual([
      'Comment 1',
      'Comment 2',
    ]);
    expect(preview().value).toBe('');
    expect(copyButton().disabled).toBe(true);

    choices[1]!.labels![0]!.click();
    expect(choices[1]!.checked).toBe(true);
    expect(choices[0]!.checked).toBe(false);
    expect(preview().value).toBe('Improve example behavior\n\nSecond body');
    expect(copyButton().disabled).toBe(false);

    choices[0]!.click();
    expect(choices[0]!.checked).toBe(true);
    expect(choices[1]!.checked).toBe(false);
    expect(preview().value).toBe('Improve example behavior\n\nFirst body');
  });

  it('disables inline choices while copying and restores them once copying settles', async () => {
    let finish: (() => void) | undefined;
    setClipboard(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    start(
      mountPage([comment(markedBody('First body'), '1'), comment(markedBody('Second body'), '2')]),
    ).click();
    const choices = [...document.querySelectorAll<HTMLInputElement>('.tlpr-merge-candidate-radio')];
    expect(choices).toHaveLength(2);
    choices[0]!.click();
    const expected = preview().value;
    copyButton().click();
    expect(choices.every((choice) => choice.matches(':disabled'))).toBe(true);
    choices[1]!.click();
    expect(preview().value).toBe(expected);
    expect(copyButton().disabled).toBe(true);
    finish?.();
    await Promise.resolve();
    expect(choices.every((choice) => !choice.matches(':disabled'))).toBe(true);
    choices[1]!.click();
    expect(preview().value).toBe('Improve example behavior\n\nSecond body');
  });

  it.each([
    '<p>🧾 Merge commit body</p><pre><code>Body</code></pre>',
    '<h2 hidden>🧾 Merge commit body</h2><pre><code>Body</code></pre>',
    '<div style="display:none"><h2>🧾 Merge commit body</h2></div><pre><code>Body</code></pre>',
    '<h2 aria-hidden="true">🧾 Merge commit body</h2><pre><code>Body</code></pre>',
    '<h2>🧾 Merge commit body</h2><pre><code>One</code></pre><pre><code>Two</code></pre>',
    '<h2>🧾 Merge commit body</h2><h2>🧾 Merge commit body</h2><pre><code>Body</code></pre>',
    '<h2>🧾 Merge commit body</h2><p>No fenced payload</p>',
    '<h2>🧾 Merge commit body</h2><pre><code>   \n</code></pre>',
  ])('fails closed for a missing, hidden, or ambiguous heading/code candidate: %s', (body) => {
    start(mountPage([comment(body)])).click();
    expect(preview().value).toBe('');
    expect(copyButton().disabled).toBe(true);
    expect(status().textContent).toBe(labels.mergeNoCandidates);
  });

  it.each([
    '<h2>🧾 Merge commit body</h2><pre hidden><code>Hidden payload</code></pre>',
    '<blockquote><h2>🧾 Merge commit body</h2></blockquote><pre><code>Quoted heading</code></pre>',
    '<pre><code>Earlier unrelated payload</code></pre><h2>🧾 Merge commit body</h2>',
  ])('rejects hidden or incorrectly scoped content: %s', (body) => {
    start(mountPage([comment(body)])).click();
    expect(copyButton().disabled).toBe(true);
    expect(status().textContent).toBe(labels.mergeNoCandidates);
  });

  it('discovers rendered headings inside TLPR-folded timeline items without revealing them', () => {
    const style = document.createElement('style');
    style.textContent = '.tlpr-timeline-hidden { display: none !important; }';
    document.head.append(style);
    try {
      const container = mountPage([
        `<div class="tlpr-timeline-hidden">${comment(markedBody('Folded payload'))}</div>`,
      ]);
      const folded = document.querySelector<HTMLElement>('.tlpr-timeline-hidden')!;
      const observer = new MutationObserver(() => undefined);
      observer.observe(folded, { attributes: true, childList: true, subtree: true });
      start(container).click();
      expect(preview().value).toBe('Improve example behavior\n\nFolded payload');
      expect(window.getComputedStyle(folded).display).toBe('none');
      expect(observer.takeRecords()).toEqual([]);
      observer.disconnect();
    } finally {
      style.remove();
    }
  });

  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"'])(
    'does not override native hiding on a TLPR-folded wrapper: %s',
    (attribute) => {
      start(
        mountPage([
          `<div class="tlpr-timeline-hidden" ${attribute}>${comment(markedBody('Hidden payload'))}</div>`,
        ]),
      ).click();
      expect(copyButton().disabled).toBe(true);
      expect(status().textContent).toBe(labels.mergeNoCandidates);
    },
  );

  it('ignores comments currently being edited', () => {
    const container = mountPage([comment(markedBody())]);
    document.querySelector('.js-comment')!.append(document.createElement('textarea'));
    start(container).click();
    expect(copyButton().disabled).toBe(true);
    expect(status().textContent).toBe(labels.mergeNoCandidates);
  });

  it('rejects conflicting current title elements', () => {
    const title =
      '<span class="js-issue-title">First title</span><h1 data-testid="issue-title">Second title</h1>';
    start(mountPage([comment(markedBody())], title)).click();
    expect(copyButton().disabled).toBe(true);
    expect(status().textContent).toBe(labels.mergeMissingTitle);
  });

  it('ignores unrelated matching content outside discussion comments', () => {
    const container = mountPage([`<aside>${markedBody('Unrelated')}</aside>`]);
    const outside = document.createElement('aside');
    outside.innerHTML = comment(markedBody('Outside discussion'));
    document.body.prepend(outside);
    start(container).click();

    expect(copyButton().disabled).toBe(true);
    expect(status().textContent).toBe(labels.mergeNoCandidates);
  });

  it('fails closed without a visible current page title instead of reading document.title', () => {
    document.title = 'Example page';
    start(
      mountPage([comment(markedBody())], '<span class="js-issue-title" hidden>Hidden title</span>'),
    ).click();
    expect(preview().value).toBe('');
    expect(copyButton().disabled).toBe(true);
    expect(status().textContent).toBe(labels.mergeMissingTitle);
  });

  it('supports React title and comment markup without a hidden raw marker', () => {
    const container = mountPage([], '<h1 data-testid="issue-title">React example</h1>');
    const article = document.createElement('article');
    article.className = 'react-issue-comment';
    article.innerHTML = `<div data-testid="markdown-body">${markedBody('A &amp; B\n&lt;example&gt;')}</div>`;
    container.before(article);
    start(container).click();
    expect(preview().value).toBe('React example\n\nA & B\n<example>');
  });

  it('labels the dialog and textarea accessibly, closes with Escape, and restores focus', () => {
    const opener = start();
    opener.focus();
    opener.click();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      labels.mergeTitle,
    );
    expect(preview().getAttribute('aria-label')).toBe(labels.mergePreviewLabel);
    expect(dialog.contains(document.activeElement)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(opener.getAttribute('aria-expanded')).toBe('false');
  });

  it('traps keyboard focus in the open dialog and closes using its localized button', () => {
    const opener = start();
    opener.click();
    const close = document.querySelector<HTMLButtonElement>('.tlpr-merge-close')!;
    copyButton().focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(close);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(copyButton());
    expect(close.textContent).toBe('');
    expect(close.getAttribute('aria-label')).toBe(labels.mergeClose);
    expect(close.title).toBe(labels.mergeClose);
    expect(close.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(close.querySelector('svg path')).not.toBeNull();

    close.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('prevents duplicate panels and fully removes listeners on cleanup and remount', () => {
    const container = mountPage([comment(markedBody())]);
    const cleanup = mountMergeHelper(document, window, container, labels);
    const opener = container.querySelector<HTMLButtonElement>('.tlpr-merge-open')!;
    opener.click();
    opener.click();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    cleanup();
    cleanup();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.tlpr-merge-open')).toBeNull();
    opener.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    start(container).click();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('.tlpr-merge-close')!.click();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('replaces an existing mount in the same rail without retaining a duplicate opener or panel', () => {
    const container = mountPage([comment(markedBody())]);
    const firstOpener = start(container);
    firstOpener.click();
    const nextOpener = start(container);
    expect(document.querySelectorAll('.tlpr-merge-open')).toHaveLength(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    firstOpener.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    nextOpener.click();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('does not report a previous copy result in a newly opened panel', async () => {
    let finish: (() => void) | undefined;
    setClipboard(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const opener = start();
    opener.click();
    copyButton().click();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-close')!.click();
    opener.click();
    finish?.();
    await Promise.resolve();
    expect(status().textContent).toBe('');
    expect(copyButton().disabled).toBe(false);
  });

  it('copies its preview snapshot even if the page title or comment changes while open', async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard(writeText);
    start().click();
    const expected = preview().value;
    document.querySelector('.js-issue-title')!.textContent = 'New title';
    document.querySelector('pre code')!.textContent = 'New payload';
    copyButton().click();
    await Promise.resolve();
    expect(preview().value).toBe(expected);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('reads the current page again after closing instead of retaining a previous preview', () => {
    const opener = start();
    opener.click();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-close')!.click();
    document.querySelector('.js-issue-title')!.textContent = 'Updated example';
    document.querySelector('pre code')!.textContent = 'Updated body';
    opener.click();
    expect(preview().value).toBe('Updated example\n\nUpdated body');
  });

  it('refuses a stale preview after navigation to a different pull request', () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard(writeText);
    window.history.replaceState({}, '', '/example/project/pull/1');
    start().click();
    window.history.replaceState({}, '', '/example/project/pull/2');
    copyButton().click();
    expect(writeText).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('permits copy after an in-page hash change', async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard(writeText);
    window.history.replaceState({}, '', '/example/project/pull/1');
    start().click();
    const expected = preview().value;
    window.history.replaceState({}, '', '/example/project/pull/1#discussion');
    copyButton().click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('never fills or submits GitHub merge form controls', async () => {
    setClipboard(async () => undefined);
    const opener = start();
    const form = document.createElement('form');
    form.innerHTML =
      '<input name="commit_title" value="Existing title"><textarea name="commit_message">Existing body</textarea><button type="submit">Submit</button>';
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', submit);
    document.body.append(form);
    opener.click();
    copyButton().click();
    await Promise.resolve();
    expect(form.querySelector('input')!.value).toBe('Existing title');
    expect(form.querySelector('textarea')!.value).toBe('Existing body');
    expect(submit).not.toHaveBeenCalled();
  });
});
