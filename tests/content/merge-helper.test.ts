import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountMergeHelper, type MergeHelperLabels } from '../../src/content/merge-helper';

const labels: MergeHelperLabels = {
  mergeInsert: 'Insert',
  mergeInserted: 'Message inserted',
  mergeEdited:
    'Your description has been edited. It was kept unchanged; the prepared text is below.',
  mergeFormUnavailable: 'The merge form changed. Reopen it to insert the message.',
  mergeChooseSource: 'Choose a comment, review its text, then select Insert.',
  mergePreview: 'Preview source',

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

describe('current GitHub markup', () => {
  it('reads the React PR title without its accessible issue number', () => {
    start(
      mountPage(
        [comment(markedBody('Exact body'))],
        '<h1 data-component="PH_Title"><span class="markdown-title">Modern PR title</span><span class="sr-only"> - #713</span></h1>',
      ),
    ).click();
    expect(preview().value).toBe('Modern PR title\n\nExact body');
  });

  it('reads syntax-highlighted blocks without requiring a nested code element', () => {
    start(
      mountPage([
        comment(
          '<h1>🧾 Merge commit body</h1><div class="highlight highlight-text-md"><pre><span class="pl-v">-</span> Exact body</pre></div>',
        ),
      ]),
    ).click();
    expect(preview().value).toBe('Improve example behavior\n\n- Exact body');
  });
});

describe('explicit merge form insertion', () => {
  function form() {
    window.history.replaceState({}, '', '/example/project/pull/713');
    const container = mountPage([comment(markedBody('- Body'))]);
    document
      .querySelector('.js-discussion')!
      .insertAdjacentHTML(
        'beforeend',
        '<form class="js-merge-pull-request"><label for="merge_title_field">Commit message</label><input id="merge_title_field" name="commit_title" value="Merge pull request #713 from example/topic"><label for="merge_message_field">Extended description</label><textarea id="merge_message_field" name="commit_message">Improve example behavior</textarea><button type="submit">Confirm merge</button></form>',
      );
    start(container);
    return document.querySelector<HTMLTextAreaElement>('#merge_message_field')!;
  }
  function insert() {
    return document.querySelector<HTMLButtonElement>('.tlpr-merge-insert')!;
  }
  it('inserts only on request and preserves the default commit title without submitting', () => {
    const field = form();
    const submit = vi.fn((e: Event) => e.preventDefault());
    field.form!.addEventListener('submit', submit);
    expect(field.value).toBe('Improve example behavior');
    expect(insert()).not.toBeNull();
    insert().click();
    expect(field.value).toBe('Improve example behavior\n\n- Body');
    expect(document.querySelector<HTMLInputElement>('#merge_title_field')!.value).toBe(
      'Merge pull request #713 from example/topic',
    );
    expect(submit).not.toHaveBeenCalled();
    insert().click();
    expect(field.value).toBe('Improve example behavior\n\n- Body');
  });
  it('preserves manual edits before and after inserting', () => {
    const field = form();
    field.value = 'My manual description';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    insert().click();
    expect(field.value).toBe('My manual description');
  });
  it('does not enhance unrelated textareas or squash commit forms', () => {
    const field = form();
    document.querySelector<HTMLInputElement>('#merge_title_field')!.value = 'Squash title';
    insert().click();
    expect(field.value).toBe('Improve example behavior');
  });
});

describe('React merge confirmation form', () => {
  it('handles generated ids and missing names/form tags via associated field labels', () => {
    window.history.replaceState({}, '', '/example/project/pull/713');
    const container = mountPage([comment(markedBody('React body'))]);
    document
      .querySelector('.js-discussion')!
      .insertAdjacentHTML(
        'beforeend',
        '<section class="merge-container"><div><label for="_r_title_">Commit message</label><span data-component="TextInput"><input id="_r_title_" value="Merge pull request #713 from example/topic"></span></div><div><label for="_r_description_">Extended description</label><span data-component="TextInput"><textarea id="_r_description_">Improve example behavior</textarea></span></div><button type="button">Confirm merge</button></section>',
      );
    const confirm = vi.fn();
    document.querySelector('.merge-container button')!.addEventListener('click', confirm);
    start(container);
    const insert = document.querySelector<HTMLButtonElement>('.tlpr-merge-insert');
    expect(insert).not.toBeNull();
    insert!.click();
    expect(document.querySelector<HTMLTextAreaElement>('#_r_description_')!.value).toBe(
      'Improve example behavior\n\nReact body',
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('insertion lifecycle guards', () => {
  function setup(bodies = [comment(markedBody('First body'))]) {
    window.history.replaceState({}, '', '/example/project/pull/713');
    const rail = mountPage(bodies);
    const handle = mountMergeHelper(document, window, rail, labels);
    cleanups.push(handle);
    const form = document.createElement('form');
    form.innerHTML =
      '<div><label for="ct">Commit message</label><input id="ct" value="Merge pull request #713 from example/topic"></div><div><label for="cm">Extended description</label><textarea id="cm">Improve example behavior</textarea></div><button type="submit">Confirm merge</button>';
    document.querySelector('.js-discussion')!.append(form);
    handle.refresh();
    return {
      handle,
      form,
      field: form.querySelector('textarea')!,
      button: form.querySelector<HTMLButtonElement>('.tlpr-merge-insert')!,
    };
  }
  it('requires source selection then explicit insertion when two comments qualify', () => {
    const { field, button, form } = setup([
      comment(markedBody('First body'), '1'),
      comment(markedBody('Second body'), '2'),
    ]);
    button.click();
    expect(field.value).toBe('Improve example behavior');
    expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    form.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click();
    expect(field.value).toBe('Improve example behavior');
    button.click();
    expect(field.value).toBe('Improve example behavior\n\nSecond body');
  });
  it('does not overwrite manual text after insertion or duplicate on rescans', () => {
    const { field, button, handle } = setup();
    button.click();
    field.value += '\nMy manual addition';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    handle.refresh();
    handle.refresh();
    expect(document.querySelectorAll('.tlpr-merge-insert')).toHaveLength(1);
    button.click();
    expect(field.value).toBe('Improve example behavior\n\nFirst body\nMy manual addition');
  });
  it('keeps the manual-edit guard when the user returns the field to its default text', () => {
    const { field, button } = setup();
    field.value = 'Improve example behavior';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    expect(field.value).toBe('Improve example behavior');
  });
  it('uses the native textarea setter so framework value tracking receives the change', () => {
    const { field, button } = setup();
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
    let tracked = field.value;
    Object.defineProperty(field, 'value', {
      get() {
        return native.get!.call(this);
      },
      set(v) {
        tracked = v;
        native.set!.call(this, v);
      },
    });
    let received = '';
    field.addEventListener('input', () => {
      if (field.value !== tracked) received = field.value;
    });
    button.click();
    expect(received).toBe('Improve example behavior\n\nFirst body');
  });
  it('does not reuse a preview selection after its source changes', () => {
    const { field, button, form } = setup([
      comment(markedBody('First body'), '1'),
      comment(markedBody('Second body'), '2'),
    ]);
    button.click();
    form.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    document.querySelector('pre code')!.textContent = 'Changed body';
    button.click();
    expect(field.value).toBe('Improve example behavior');
    expect(form.querySelector('input:checked')).toBeNull();
  });
  it('refuses stale and detached fields after SPA navigation or form replacement', () => {
    const { field, button } = setup();
    window.history.replaceState({}, '', '/example/project/pull/714');
    button.click();
    expect(field.value).toBe('Improve example behavior');
    field.remove();
    button.click();
    expect(field.value).toBe('Improve example behavior');
  });
  it('replaces cloned enhancement controls without leaving an inert duplicate', () => {
    const { form, handle } = setup();
    const clone = form.cloneNode(true) as HTMLFormElement;
    form.replaceWith(clone);
    handle.refresh();
    expect(clone.querySelectorAll('.tlpr-merge-insert')).toHaveLength(1);
    clone.querySelector<HTMLButtonElement>('.tlpr-merge-insert')!.click();
    expect(clone.querySelector('textarea')!.value).toBe('Improve example behavior\n\nFirst body');
  });
});

describe('manual description retention across remounts', () => {
  it.each(['removed controls', 'cloned controls', 'cloned field'])(
    'retains a manually blank description after %s',
    (mode) => {
      window.history.replaceState({}, '', '/example/project/pull/713');
      const rail = mountPage([comment(markedBody('Body'))]);
      rail.insertAdjacentHTML(
        'afterend',
        '<section><div><label for="manual-title">Commit message</label><input id="manual-title" value="Merge pull request #713 from example/topic"></div><div><label for="manual-desc">Extended description</label><textarea id="manual-desc">Improve example behavior</textarea></div></section>',
      );
      const handle = mountMergeHelper(document, window, rail, labels);
      cleanups.push(handle);
      let field = document.querySelector<HTMLTextAreaElement>('#manual-desc')!;
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      const controls = document.querySelector('.tlpr-merge-form-controls')!;
      if (mode === 'removed controls') controls.remove();
      else if (mode === 'cloned controls') controls.replaceWith(controls.cloneNode(true));
      else {
        const next = field.cloneNode(true) as HTMLTextAreaElement;
        field.replaceWith(next);
        field = next;
      }
      handle.refresh();
      expect(document.querySelectorAll('.tlpr-merge-insert')).toHaveLength(1);
      document.querySelector<HTMLButtonElement>('.tlpr-merge-insert')!.click();
      expect(field.value).toBe('');
    },
  );
});

describe('source section boundaries', () => {
  it('does not take the sole code block from an unrelated later heading', () => {
    start(
      mountPage([
        comment(
          '<h2>🧾 Merge commit body</h2><p>Not ready</p><h2>Troubleshooting</h2><pre>unrelated command</pre>',
        ),
      ]),
    ).click();
    expect(preview().value).toBe('');
  });
});

describe('merge form page identity', () => {
  it('does not attach to a stale commit title for a different pull request', () => {
    window.history.replaceState({}, '', '/example/project/pull/713');
    const rail = mountPage([comment(markedBody('Body'))]);
    rail.insertAdjacentHTML(
      'afterend',
      '<section><label for="stale-title">Commit message</label><input id="stale-title" value="Merge pull request #714 from example/topic"><label for="stale-description">Extended description</label><textarea id="stale-description">Improve example behavior</textarea></section>',
    );
    start(rail);
    expect(document.querySelector('.tlpr-merge-insert')).toBeNull();
  });
});
