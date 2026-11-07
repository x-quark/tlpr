import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountMergeHelper, type MergeHelperLabels } from '../../src/content/merge-helper';
import {
  composeMergeMessage,
  mergeMessageText,
  readProposals,
  readTitle,
  splitCommitMessage,
} from '../../src/content/merge-source';

const labels: MergeHelperLabels = {
  mergeInsert: 'Insert proposed message',
  mergeReplace: 'Replace my edits',
  mergeInserted: 'Inserted',
  mergeUndo: 'Undo',
  mergeUndone: 'Restored',
  mergeEdited: 'Edited',
  mergeFormUnavailable: 'Unavailable',
  mergeChooseSource: 'Changed',
  mergePreview: 'Preview',
  mergeDetectedNotice: 'Notice',
  mergeCandidateLabel: 'Proposal to use',
  mergeCandidateOption: 'Comment {count}',
  mergeCandidateLatest: 'latest',
  mergeSubjectLabel: 'Commit message',
  mergeDescriptionLabel: 'Extended description',
  mergeKeepsTitle: 'Unchanged',
  mergeMissingTitle: 'Missing title',
  mergeNoCandidates: 'No proposal',
  mergeViewSource: 'View source comment',
  mergeOpen: 'Merge message',
  mergeTitle: 'Proposed merge message',
  mergePreviewLabel: 'Merge message',
  mergeCopy: 'Copy',
  mergeCopying: 'Copying',
  mergeCopied: 'Copied',
  mergeCopyError: 'Copy failed',
  mergeClose: 'Close',
};

const SUBJECT = 'feat(widgets): render example panels lazily';
const BODY = '- Load panel data on first display\n- Keep the cache bounded';
const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/** Rendered `## 🧾 Proposed merge commit` + ```git block, as GitHub's renderer emits it. */
const proposedCommit = (subject = SUBJECT, body = BODY) =>
  `<h2 dir="auto">🧾 Proposed merge commit</h2><div class="snippet-clipboard-content notranslate position-relative overflow-auto" data-snippet-clipboard-copy-content="${escape(`${subject}\n\n${body}`)}"><pre lang="git" class="notranslate"><code class="notranslate">${escape(`${subject}\n\n${body}`)}\n</code></pre></div>`;
/** A comment that is nothing but a ```git block (no heading). */
const loneGitBlock = (subject = SUBJECT, body = BODY) =>
  `<div class="snippet-clipboard-content notranslate position-relative overflow-auto" data-snippet-clipboard-copy-content="${escape(`${subject}\n\n${body}`)}"><pre lang="git" class="notranslate"><code class="notranslate">${escape(`${subject}\n\n${body}`)}\n</code></pre></div>`;
/** `# 🧾 Merge commit body` + ```markdown block, highlighted without a code element. */
const bodyTemplate = (body = BODY) =>
  `<h1 dir="auto">🧾 Merge commit body</h1><div class="highlight highlight-text-md notranslate position-relative overflow-auto" dir="auto" data-snippet-clipboard-copy-content="${escape(body)}"><pre class="notranslate">${body
    .split('\n')
    .map((line) => `<span class="pl-v">-</span>${escape(line.slice(1))}`)
    .join('\n')}</pre></div>`;

const reactTitle = (title = '🧩 feat(widgets): render example panels lazily') =>
  `<h1 class="prc-Heading-Heading-MtWFE" data-component="Heading"><span class="f1 text-normal markdown-title prc-Text-Text-9mHv3" data-component="Text">${title}</span><span class="sr-only"> - #<!-- -->713</span></h1>`;

function classicComment(body: string, id: number, time = `2026-11-0${id}T10:00:00Z`): string {
  return `<div class="TimelineItem"><div class="js-comment timeline-comment" id="issuecomment-${id}"><div class="timeline-comment-header"><a class="author" href="/octocat">octocat</a> commented <a href="#issuecomment-${id}" id="issuecomment-${id}-permalink"><relative-time datetime="${time}"></relative-time></a></div><div class="comment-body markdown-body">${body}</div></div></div>`;
}

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
});

function mountClassic(bodies: string[], title = reactTitle()): HTMLElement {
  window.history.replaceState({}, '', '/example/project/pull/713');
  document.body.innerHTML = `${title}<main class="js-discussion">${bodies.join('')}<div class="tlpr-global-rail"></div></main>`;
  return document.querySelector<HTMLElement>('.tlpr-global-rail')!;
}

describe('merge proposal formats', () => {
  it('reads a complete “Proposed merge commit” as a subject and a body', () => {
    mountClassic([classicComment(proposedCommit(), 1)]);
    const [proposal] = readProposals(document, window);
    expect(proposal).toMatchObject({
      subject: SUBJECT,
      body: BODY,
      sourceId: 'issuecomment-1',
      author: 'octocat',
      heading: '🧾 Proposed merge commit',
    });
    expect(composeMergeMessage(proposal!, readTitle(document, window))).toEqual({
      title: SUBJECT,
      description: BODY,
    });
  });

  it('reads a comment made of a single ```git block without any heading', () => {
    mountClassic([classicComment(loneGitBlock(), 1)]);
    expect(readProposals(document, window)).toMatchObject([{ subject: SUBJECT, body: BODY }]);
  });

  it('keeps body-only templates under the PR title, as GitHub’s default description does', () => {
    mountClassic([classicComment(bodyTemplate(), 1)]);
    const [proposal] = readProposals(document, window);
    expect(proposal).toMatchObject({ subject: null, body: BODY });
    const message = composeMergeMessage(proposal!, readTitle(document, window))!;
    expect(message).toEqual({
      title: null,
      description: `🧩 feat(widgets): render example panels lazily\n\n${BODY}`,
    });
    expect(mergeMessageText(message)).toBe(message.description);
  });

  it('rejects git blocks surrounded by prose and blocks in other languages', () => {
    mountClassic([
      classicComment(`<p>Try this:</p>${loneGitBlock()}`, 1),
      classicComment(
        '<div class="highlight highlight-source-shell"><pre>git push --force</pre></div>',
        2,
      ),
    ]);
    expect(readProposals(document, window)).toEqual([]);
  });

  it('reads the current React pull request title without its accessible number', () => {
    mountClassic([], reactTitle('Readable title'));
    expect(readTitle(document, window)).toBe('Readable title');
  });

  it('orders proposals by creation time even when the Overview lists newest first', () => {
    mountClassic([
      classicComment(proposedCommit('fix: second attempt'), 2, '2026-11-07T12:00:00Z'),
      classicComment(proposedCommit('fix: first attempt'), 1, '2026-11-07T09:00:00Z'),
    ]);
    expect(readProposals(document, window).map((proposal) => proposal.subject)).toEqual([
      'fix: first attempt',
      'fix: second attempt',
    ]);
  });

  it.each([
    ['feat: subject\n\n- one\n- two', 'auto', 'feat: subject', '- one\n- two'],
    ['feat: subject only', 'full', 'feat: subject only', ''],
    ['- one\n- two', 'auto', null, '- one\n- two'],
    ['Subject\nwithout blank line', 'auto', null, 'Subject\nwithout blank line'],
    ['Looks like a subject\n\nBody', 'body', null, 'Looks like a subject\n\nBody'],
    ['## Heading\n\nBody', 'auto', null, '## Heading\n\nBody'],
  ] as const)('splits %j with hint %s', (text, hint, subject, body) => {
    expect(splitCommitMessage(text, hint)).toEqual({ subject, body });
  });
});

describe('merge confirmation form insertion', () => {
  const formFixture = readFileSync('tests/fixtures/github-merge-form.html', 'utf8');

  function setup(bodies = [classicComment(proposedCommit(), 1)]) {
    const rail = mountClassic(bodies);
    document.querySelector('.js-discussion')!.insertAdjacentHTML('afterend', formFixture);
    const handle = mountMergeHelper(document, window, rail, labels);
    cleanups.push(handle);
    const title = document.querySelector<HTMLInputElement>('#_r_38_')!;
    const description = document.querySelector<HTMLTextAreaElement>('#_r_3e_')!;
    const insert = document.querySelector<HTMLButtonElement>('.tlpr-merge-insert')!;
    const undo = document.querySelector<HTMLButtonElement>('.tlpr-merge-undo')!;
    return { handle, title, description, insert, undo };
  }

  it('fills the commit title and description from a complete proposal, then undoes it', () => {
    const { title, description, insert, undo } = setup();
    const defaults = { title: title.value, description: description.value };
    const confirm = vi.fn();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Confirm merge')!
      .addEventListener('click', confirm);
    const events: string[] = [];
    for (const field of [title, description])
      field.addEventListener('input', () => events.push(field.id));

    expect(insert.closest('.tlpr-merge-form-controls')!.nextElementSibling).toBe(
      title.closest('[data-component="FormControl"]'),
    );
    insert.click();
    expect(title.value).toBe(SUBJECT);
    expect(description.value).toBe(BODY);
    expect(events).toEqual(['_r_38_', '_r_3e_']);
    expect(confirm).not.toHaveBeenCalled();
    expect(undo.hidden).toBe(false);

    undo.click();
    expect({ title: title.value, description: description.value }).toEqual(defaults);
  });

  it('switches proposals after a first insertion even though the title no longer names the PR', () => {
    const { title, description, insert } = setup([
      classicComment(proposedCommit('fix: resolve example crash (#12)'), 1),
      classicComment(bodyTemplate('- Later template'), 2),
    ]);
    const details = document.querySelector<HTMLDetailsElement>('.tlpr-merge-form-preview')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    document.querySelector<HTMLInputElement>('.tlpr-merge-candidate-radio')!.click();
    insert.click();
    expect(title.value).toBe('fix: resolve example crash (#12)');
    const radios = document.querySelectorAll<HTMLInputElement>('.tlpr-merge-candidate-radio');
    radios[1]!.click();
    insert.click();
    // A body-only template keeps the current title and restores GitHub's PR-title prefix.
    expect(title.value).toBe('fix: resolve example crash (#12)');
    expect(description.value).toBe(
      '🧩 feat(widgets): render example panels lazily\n\n- Later template',
    );
  });

  it('shows what will be inserted and links to the source comment', () => {
    setup();
    const details = document.querySelector<HTMLDetailsElement>('.tlpr-merge-form-preview')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(details.querySelector('.tlpr-merge-form-subject')?.textContent).toBe(SUBJECT);
    expect(details.querySelector('.tlpr-merge-form-text')?.textContent).toBe(BODY);
    expect(details.querySelector<HTMLAnchorElement>('.tlpr-merge-source-link')!.hash).toBe(
      '#issuecomment-1',
    );
  });

  it('reports a missing proposal without touching the form', () => {
    const { title, description, insert } = setup([classicComment('<p>Looks good</p>', 1)]);
    const before = [title.value, description.value];
    insert.click();
    expect([title.value, description.value]).toEqual(before);
    expect(document.querySelector('.tlpr-merge-form-status')?.textContent).toBe(
      labels.mergeNoCandidates,
    );
  });

  it('copies the complete message from the conversation dialog', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    setup();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-open')!.click();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-copy')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(`${SUBJECT}\n\n${BODY}`);
  });
});
