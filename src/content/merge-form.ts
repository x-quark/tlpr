import { isVisible, readCandidates, readTitle } from './merge-source';

export interface MergeFormLabels {
  mergeInsert: string;
  mergeInserted: string;
  mergeEdited: string;
  mergeFormUnavailable: string;
  mergeChooseSource: string;
  mergePreview: string;
  mergeDetectedNotice: string;
  mergeCandidateOption: string;
  mergeMissingTitle: string;
  mergeNoCandidates: string;
}

function labelled(field: HTMLInputElement | HTMLTextAreaElement, label: string): boolean {
  return [...(field.labels ?? [])].some((item) => item.textContent?.trim() === label);
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
        labelled(input, 'Commit message'),
    );
    return matches.length === 1 ? matches[0]! : null;
  }
  return null;
}

function isCurrentMergeTitle(title: HTMLInputElement, pageWindow: Window): boolean {
  const number = pageWindow.location.pathname.match(/\/pull\/(\d+)(?:\/|$)/)?.[1];
  return Boolean(number && title.value.match(/^Merge pull request #(\d+)\b/)?.[1] === number);
}

export function mountMergeFormControls(
  pageDocument: Document,
  pageWindow: Window,
  labels: MergeFormLabels,
): { refresh: () => void; destroy: () => void } {
  const mounted = new Map<HTMLTextAreaElement, { node: HTMLElement; remove: () => void }>();
  let disposed = false;
  const refresh = (): void => {
    if (disposed) return;
    for (const [field, entry] of mounted) {
      if (!field.isConnected || !entry.node.isConnected) {
        entry.remove();
        mounted.delete(field);
      }
    }
    if (!/\/pull\/\d+(?:\/|$)/.test(pageWindow.location.pathname)) return;
    for (const field of pageDocument.querySelectorAll<HTMLTextAreaElement>('textarea')) {
      if (
        mounted.has(field) ||
        !isVisible(field, pageWindow) ||
        field.closest('.tlpr-merge-dialog')
      )
        continue;
      if (
        field.name !== 'commit_message' &&
        field.id !== 'merge_message_field' &&
        !labelled(field, 'Extended description')
      )
        continue;
      const commitTitle = titleFieldFor(field);
      if (!commitTitle || !isCurrentMergeTitle(commitTitle, pageWindow)) continue;
      const page = `${pageWindow.location.origin}${pageWindow.location.pathname}`;
      const label = [...(field.labels ?? [])][0];
      // GitHub may clone injected markup without its listeners. Remove only this field's adjacent stale control.
      let stale = label ? label.nextElementSibling : field.previousElementSibling;
      while (stale?.classList.contains('tlpr-merge-form-controls')) {
        stale.remove();
        stale = label ? label.nextElementSibling : field.previousElementSibling;
      }
      const controls = pageDocument.createElement('div');
      controls.className = 'tlpr-merge-form-controls';
      const insert = pageDocument.createElement('button');
      insert.type = 'button';
      insert.className = 'tlpr-btn tlpr-merge-insert';
      insert.textContent = labels.mergeInsert;
      insert.title = labels.mergeDetectedNotice;
      const status = pageDocument.createElement('span');
      status.className = 'tlpr-merge-form-status';
      status.setAttribute('role', 'status');
      const details = pageDocument.createElement('details');
      details.className = 'tlpr-merge-form-preview';
      const summary = pageDocument.createElement('summary');
      summary.textContent = labels.mergePreview;
      const notice = pageDocument.createElement('p');
      notice.textContent = labels.mergeDetectedNotice;
      const choices = pageDocument.createElement('fieldset');
      choices.className = 'tlpr-merge-candidates';
      const preview = pageDocument.createElement('pre');
      preview.className = 'tlpr-merge-form-text';
      details.append(summary, notice, choices, preview);
      controls.append(insert, status, details);
      if (label) label.after(controls);
      else field.before(controls);
      let dirty = field.dataset.tlprManualDescription === '1';
      let applying = false;
      let candidates: string[] = [];
      let selected: string | null = null;
      const onInput = (): void => {
        if (!applying) {
          dirty = true;
          field.dataset.tlprManualDescription = '1';
        }
      };
      field.addEventListener('input', onInput);
      const prepare = (): { title: string | null; payload: string | null } => {
        const title = readTitle(pageDocument, pageWindow);
        const next = readCandidates(pageDocument, pageWindow);
        if (JSON.stringify(next) !== JSON.stringify(candidates)) {
          candidates = next;
          selected = candidates.length === 1 ? candidates[0]! : null;
          choices.replaceChildren();
          if (candidates.length > 1) {
            const legend = pageDocument.createElement('legend');
            legend.textContent = labels.mergeChooseSource;
            choices.append(legend);
            candidates.forEach((candidate, index) => {
              const option = pageDocument.createElement('label');
              option.className = 'tlpr-merge-candidate-option';
              const radio = pageDocument.createElement('input');
              radio.type = 'radio';
              radio.name = `tlpr-source-${field.id}`;
              radio.addEventListener('change', () => {
                selected = candidate;
                preview.textContent = title ? `${title}\n\n${candidate}` : '';
              });
              option.append(
                radio,
                labels.mergeCandidateOption.replace('{count}', String(index + 1)),
              );
              choices.append(option);
            });
          }
        }
        preview.textContent = title && selected !== null ? `${title}\n\n${selected}` : '';
        return { title, payload: selected };
      };
      const onPreview = (): void => {
        if (details.open) prepare();
      };
      details.addEventListener('toggle', onPreview);
      const onInsert = (): void => {
        if (
          disposed ||
          !field.isConnected ||
          page !== `${pageWindow.location.origin}${pageWindow.location.pathname}` ||
          !isVisible(field, pageWindow) ||
          !isVisible(commitTitle, pageWindow) ||
          field.disabled ||
          field.readOnly ||
          titleFieldFor(field) !== commitTitle ||
          !isCurrentMergeTitle(commitTitle, pageWindow)
        ) {
          status.textContent = labels.mergeFormUnavailable;
          return;
        }
        const { title, payload } = prepare();
        if (!title || payload === null) {
          status.textContent = !title
            ? labels.mergeMissingTitle
            : candidates.length
              ? labels.mergeChooseSource
              : labels.mergeNoCandidates;
          if (candidates.length > 1) details.open = true;
          return;
        }
        const value = `${title}\n\n${payload}`;
        if (field.value === value) {
          status.textContent = labels.mergeInserted;
          return;
        }
        if (dirty || (field.value.trim() !== '' && field.value.trim() !== title)) {
          status.textContent = labels.mergeEdited;
          details.open = true;
          return;
        }
        // Use the native setter so React observes the input event and retains the value.
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
        if (!setter) {
          status.textContent = labels.mergeFormUnavailable;
          return;
        }
        applying = true;
        try {
          setter.call(field, value);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
          applying = false;
        }
        status.textContent = labels.mergeInserted;
      };
      insert.addEventListener('click', onInsert);
      mounted.set(field, {
        node: controls,
        remove: () => {
          field.removeEventListener('input', onInput);
          insert.removeEventListener('click', onInsert);
          details.removeEventListener('toggle', onPreview);
          controls.remove();
        },
      });
    }
  };
  refresh();
  return {
    refresh,
    destroy: () => {
      disposed = true;
      for (const entry of mounted.values()) {
        // Retain the per-field edit marker across helper/rail remounts.
        entry.remove();
      }
      mounted.clear();
    },
  };
}
