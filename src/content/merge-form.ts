import { icons } from './icons';
import {
  composeMergeMessage,
  isVisible,
  proposalKey,
  readProposals,
  readTitle,
  type MergeMessage,
  type MergeProposal,
} from './merge-source';

export interface MergeFormLabels {
  mergeInsert: string;
  mergeReplace: string;
  mergeInserted: string;
  mergeUndo: string;
  mergeUndone: string;
  mergeEdited: string;
  mergeFormUnavailable: string;
  mergeChooseSource: string;
  mergePreview: string;
  mergeDetectedNotice: string;
  mergeCandidateLabel: string;
  mergeCandidateOption: string;
  mergeCandidateLatest: string;
  mergeSubjectLabel: string;
  mergeDescriptionLabel: string;
  mergeKeepsTitle: string;
  mergeMissingTitle: string;
  mergeNoCandidates: string;
  mergeViewSource: string;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

const DESCRIPTION_LABELS = ['extended description'];
const TITLE_LABELS = ['commit message'];
/** “Confirm merge”, “Confirm squash and merge”, “Confirm rebase and merge”, “Confirm auto-merge”… */
const CONFIRM_MERGE = /^confirm\b.*\bmerge\b/i;
const normalize = (text: string | null | undefined): string =>
  (text ?? '').trim().replace(/\s+/g, ' ');

/** Titles TL;PR wrote, so a later Undo or re-insert still recognizes the form. */
const insertedTitles = new WeakMap<HTMLInputElement, string>();

function labelTexts(field: Field): string[] {
  const texts: Array<string | null> = [...(field.labels ?? [])].map((label) => label.textContent);
  texts.push(field.getAttribute('aria-label'));
  for (const id of field.getAttribute('aria-labelledby')?.split(/\s+/) ?? []) {
    if (id) texts.push(field.ownerDocument.getElementById(id)?.textContent ?? null);
  }
  return texts
    .map((text) =>
      normalize(text)
        .replace(/\s*\*$/, '')
        .toLowerCase(),
    )
    .filter(Boolean);
}

function labelled(field: Field, names: readonly string[]): boolean {
  return labelTexts(field).some((text) => names.includes(text));
}

function isDescriptionField(field: HTMLTextAreaElement): boolean {
  return (
    field.name === 'commit_message' ||
    field.id === 'merge_message_field' ||
    labelled(field, DESCRIPTION_LABELS)
  );
}

function titleFieldFor(field: HTMLTextAreaElement): HTMLInputElement | null {
  // Current GitHub React uses generated ids and no form/name attributes.
  // Stop at the nearest container with inputs; never pair unrelated page controls.
  for (
    let scope = field.parentElement;
    scope && scope !== field.ownerDocument.body;
    scope = scope.parentElement
  ) {
    const inputs = [
      ...scope.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])'),
    ].filter((input) => !input.closest('.tlpr-merge-form-controls'));
    if (!inputs.length) continue;
    const matches = inputs.filter(
      (input) =>
        input.name === 'commit_title' ||
        input.id === 'merge_title_field' ||
        labelled(input, TITLE_LABELS),
    );
    return matches.length === 1 ? matches[0]! : null;
  }
  return null;
}

function hasConfirmMerge(from: Element): boolean {
  let node: Element | null = from;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    for (const button of node.querySelectorAll('button')) {
      if (CONFIRM_MERGE.test(normalize(button.textContent))) return true;
    }
    if (node.matches('[role="dialog"], dialog, form')) break;
  }
  return false;
}

function pullNumber(pageWindow: Window): string | null {
  return pageWindow.location.pathname.match(/\/pull\/(\d+)(?:\/|$)/)?.[1] ?? null;
}

/**
 * GitHub's default titles mention the pull request (“Merge pull request #12 from…”,
 * “Title (#12)”). A title naming another number belongs to a stale form. Suggestion
 * commit dialogs have neither the number nor a “Confirm … merge” button.
 */
function belongsToPullRequest(
  title: HTMLInputElement,
  field: HTMLTextAreaElement,
  pageWindow: Window,
): boolean {
  const number = pullNumber(pageWindow);
  if (!number) return false;
  if (insertedTitles.get(title) === title.value) return true;
  const mentions = [...title.value.matchAll(/#(\d+)\b/g)].map((match) => match[1]);
  if (mentions.length) return mentions.includes(number);
  let scope: Element | null = field.parentElement;
  while (scope && !scope.contains(title)) scope = scope.parentElement;
  return Boolean(scope && hasConfirmMerge(scope));
}

/** Use the native setter so React's value tracking observes the input event. */
function setNativeValue(field: Field, value: string): boolean {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
  if (!setter) return false;
  setter.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function formatDate(value: number | null): string {
  if (value === null) return '';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(value).toISOString();
  }
}

export function proposalLabel(
  proposal: MergeProposal,
  index: number,
  latest: boolean,
  labels: Pick<MergeFormLabels, 'mergeCandidateOption' | 'mergeCandidateLatest'>,
): string {
  return [
    labels.mergeCandidateOption.replace('{count}', String(index + 1)),
    proposal.author ? `@${proposal.author}` : '',
    formatDate(proposal.createdAt),
    latest ? labels.mergeCandidateLatest : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

interface Mounted {
  node: HTMLElement;
  remove: () => void;
}

export function mountMergeFormControls(
  pageDocument: Document,
  pageWindow: Window,
  labels: MergeFormLabels,
): { refresh: () => void; destroy: () => void } {
  const mounted = new Map<HTMLTextAreaElement, Mounted>();
  let disposed = false;
  let nextGroup = 0;

  const mount = (field: HTMLTextAreaElement, commitTitle: HTMLInputElement): Mounted => {
    const page = `${pageWindow.location.origin}${pageWindow.location.pathname}`;
    // Above the title field, including its label when the form has no field container.
    const label = commitTitle.labels?.[0];
    const anchor =
      commitTitle.closest<HTMLElement>('[data-component="FormControl"], .form-group, dl') ??
      (label?.parentElement === commitTitle.parentElement &&
      label &&
      Boolean(label.compareDocumentPosition(commitTitle) & Node.DOCUMENT_POSITION_FOLLOWING)
        ? label
        : commitTitle);
    // GitHub may clone injected markup without its listeners. Remove only stale copies.
    for (
      let stale = anchor.previousElementSibling;
      stale?.classList.contains('tlpr-merge-form-controls');
      stale = anchor.previousElementSibling
    ) {
      stale.remove();
    }
    const element = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className = '',
      text = '',
    ): HTMLElementTagNameMap[K] => {
      const node = pageDocument.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const controls = element('div', 'tlpr-merge-form-controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'TL;PR');
    const row = element('div', 'tlpr-merge-form-row');
    const insert = element('button', 'tlpr-btn tlpr-merge-insert');
    insert.type = 'button';
    insert.title = labels.mergeDetectedNotice;
    insert.innerHTML = icons.merge;
    insert.append(element('span', '', labels.mergeInsert));
    const undo = element('button', 'tlpr-btn tlpr-merge-undo', labels.mergeUndo);
    undo.type = 'button';
    undo.hidden = true;
    const status = element('span', 'tlpr-merge-form-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    row.append(insert, undo, status);
    const details = element('details', 'tlpr-merge-form-preview');
    const summary = element('summary', '', labels.mergePreview);
    const notice = element('p', 'tlpr-merge-form-notice', labels.mergeDetectedNotice);
    const choices = element('fieldset', 'tlpr-merge-candidates');
    const fields = element('dl', 'tlpr-merge-form-fields');
    const subject = element('dd', 'tlpr-merge-form-subject');
    const preview = element('pre', 'tlpr-merge-form-text');
    const previewItem = element('dd');
    previewItem.append(preview);
    fields.append(
      element('dt', '', labels.mergeSubjectLabel),
      subject,
      element('dt', '', labels.mergeDescriptionLabel),
      previewItem,
    );
    const source = element('a', 'tlpr-merge-source-link', labels.mergeViewSource);
    source.hidden = true;
    details.append(summary, notice, choices, fields, source);
    controls.append(row, details);
    anchor.before(controls);

    const group = `tlpr-source-${++nextGroup}`;
    let proposals: MergeProposal[] = [];
    let selected: string | null = null;
    let confirming = false;
    let applying = false;
    let snapshot: { title: string; description: string } | null = null;
    const manual = {
      title: commitTitle.dataset.tlprManualTitle === '1',
      description: field.dataset.tlprManualDescription === '1',
    };

    const setStatus = (text: string, state = ''): void => {
      status.textContent = text;
      status.dataset.state = state;
    };
    const disarm = (): void => {
      if (!confirming) return;
      confirming = false;
      insert.lastElementChild!.textContent = labels.mergeInsert;
      insert.dataset.state = '';
    };
    const current = (): MergeProposal | undefined =>
      proposals.find((proposal) => proposalKey(proposal) === selected) ?? proposals.at(-1);

    const render = (message: MergeMessage | null, proposal: MergeProposal | undefined): void => {
      subject.textContent = message?.title ?? (message ? labels.mergeKeepsTitle : '');
      subject.dataset.kept = String(Boolean(message && !message.title));
      preview.textContent = message?.description ?? '';
      source.hidden = !proposal?.sourceId;
      if (proposal?.sourceId) source.href = `#${proposal.sourceId}`;
    };

    const prepare = (): { message: MergeMessage | null; error: string | null } => {
      const title = readTitle(pageDocument, pageWindow);
      const next = readProposals(pageDocument, pageWindow);
      let lost = false;
      if (next.map(proposalKey).join('\n') !== proposals.map(proposalKey).join('\n')) {
        proposals = next;
        // An explicitly chosen proposal changed: never substitute another one silently.
        if (selected && !proposals.some((proposal) => proposalKey(proposal) === selected)) {
          selected = null;
          lost = true;
        }
        choices.replaceChildren();
        if (proposals.length > 1) {
          choices.append(element('legend', '', labels.mergeCandidateLabel));
          const latest = proposals.length - 1;
          proposals.forEach((proposal, index) => {
            const option = element('label', 'tlpr-merge-candidate-option');
            const radio = element('input', 'tlpr-merge-candidate-radio');
            radio.type = 'radio';
            radio.name = group;
            radio.value = proposalKey(proposal);
            radio.checked = radio.value === (selected ?? proposalKey(proposals[latest]!));
            radio.addEventListener('change', () => {
              selected = radio.value;
              disarm();
              const chosen = current();
              render(
                chosen ? composeMergeMessage(chosen, readTitle(pageDocument, pageWindow)) : null,
                chosen,
              );
            });
            option.append(radio, proposalLabel(proposal, index, index === latest, labels));
            choices.append(option);
          });
        }
      }
      const proposal = current();
      const message = proposal ? composeMergeMessage(proposal, title) : null;
      render(message, proposal);
      if (!proposal) return { message: null, error: labels.mergeNoCandidates };
      if (!message) return { message: null, error: labels.mergeMissingTitle };
      if (lost) return { message: null, error: labels.mergeChooseSource };
      return { message, error: null };
    };

    const onInput = (event: Event): void => {
      if (applying) return;
      if (event.target === commitTitle) {
        manual.title = true;
        commitTitle.dataset.tlprManualTitle = '1';
      } else {
        manual.description = true;
        field.dataset.tlprManualDescription = '1';
      }
      disarm();
    };
    const usable = (): boolean =>
      !disposed &&
      field.isConnected &&
      commitTitle.isConnected &&
      page === `${pageWindow.location.origin}${pageWindow.location.pathname}` &&
      isVisible(field, pageWindow) &&
      isVisible(commitTitle, pageWindow) &&
      !field.disabled &&
      !field.readOnly &&
      !commitTitle.disabled &&
      !commitTitle.readOnly &&
      titleFieldFor(field) === commitTitle &&
      belongsToPullRequest(commitTitle, field, pageWindow);

    const write = (title: string | null, description: string): boolean => {
      applying = true;
      try {
        if (title !== null && commitTitle.value !== title) {
          if (!setNativeValue(commitTitle, title)) return false;
          insertedTitles.set(commitTitle, title);
        }
        return field.value === description || setNativeValue(field, description);
      } finally {
        applying = false;
      }
    };

    const onInsert = (): void => {
      if (!usable()) {
        disarm();
        setStatus(labels.mergeFormUnavailable, 'error');
        return;
      }
      const { message, error } = prepare();
      if (!message) {
        disarm();
        setStatus(error ?? labels.mergeNoCandidates, 'error');
        details.open = true;
        return;
      }
      const titleChanges = message.title !== null && commitTitle.value !== message.title;
      const descriptionChanges = field.value !== message.description;
      if (!titleChanges && !descriptionChanges) {
        disarm();
        setStatus(labels.mergeInserted, 'success');
        return;
      }
      const overwritesEdits =
        (manual.title && titleChanges) || (manual.description && descriptionChanges);
      if (overwritesEdits && !confirming) {
        // Explicit consent is required twice before replacing text the user typed.
        confirming = true;
        insert.lastElementChild!.textContent = labels.mergeReplace;
        insert.dataset.state = 'confirm';
        setStatus(labels.mergeEdited, 'warning');
        details.open = true;
        return;
      }
      disarm();
      const before = { title: commitTitle.value, description: field.value };
      if (!write(message.title, message.description)) {
        setStatus(labels.mergeFormUnavailable, 'error');
        return;
      }
      snapshot = before;
      manual.title = false;
      manual.description = false;
      delete commitTitle.dataset.tlprManualTitle;
      delete field.dataset.tlprManualDescription;
      undo.hidden = false;
      setStatus(labels.mergeInserted, 'success');
    };

    const onUndo = (): void => {
      if (!snapshot || !usable()) {
        setStatus(labels.mergeFormUnavailable, 'error');
        return;
      }
      const restore = snapshot;
      snapshot = null;
      write(restore.title, restore.description);
      undo.hidden = true;
      setStatus(labels.mergeUndone, '');
    };

    const onPreview = (): void => {
      if (details.open) prepare();
    };
    field.addEventListener('input', onInput);
    commitTitle.addEventListener('input', onInput);
    insert.addEventListener('click', onInsert);
    undo.addEventListener('click', onUndo);
    details.addEventListener('toggle', onPreview);
    return {
      node: controls,
      remove: () => {
        field.removeEventListener('input', onInput);
        commitTitle.removeEventListener('input', onInput);
        insert.removeEventListener('click', onInsert);
        undo.removeEventListener('click', onUndo);
        details.removeEventListener('toggle', onPreview);
        controls.remove();
      },
    };
  };

  const refresh = (): void => {
    if (disposed) return;
    for (const [field, entry] of mounted) {
      if (!field.isConnected || !entry.node.isConnected) {
        entry.remove();
        mounted.delete(field);
      }
    }
    if (!pullNumber(pageWindow)) return;
    for (const field of pageDocument.querySelectorAll<HTMLTextAreaElement>('textarea')) {
      if (mounted.has(field) || field.closest('.tlpr-merge-dialog, .tlpr-merge-form-controls'))
        continue;
      if (!isDescriptionField(field)) continue;
      // Ignore unrelated comment editors before walking computed ancestor styles.
      // Visibility stays live for actual merge candidates; nothing is cached.
      if (!isVisible(field, pageWindow)) continue;
      const commitTitle = titleFieldFor(field);
      if (!commitTitle || !belongsToPullRequest(commitTitle, field, pageWindow)) continue;
      mounted.set(field, mount(field, commitTitle));
    }
  };
  refresh();
  return {
    refresh,
    destroy: () => {
      disposed = true;
      // Manual-edit markers stay on the fields across helper and toolbar remounts.
      for (const entry of mounted.values()) entry.remove();
      mounted.clear();
    },
  };
}
