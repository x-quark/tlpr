import { readTitle, readCandidates } from './merge-source';
import { mountMergeFormControls, type MergeFormLabels } from './merge-form';
export type MergeHelperHandle = (() => void) & { refresh: () => void };
export interface MergeHelperLabels extends MergeFormLabels {
  mergeOpen: string;
  mergeTitle: string;
  mergeDetectedNotice: string;
  mergeCandidateLabel: string;
  mergeCandidatePlaceholder: string;
  mergeCandidateOption: string;
  mergePreviewLabel: string;
  mergeMissingTitle: string;
  mergeNoCandidates: string;
  mergeCopy: string;
  mergeCopying: string;
  mergeCopied: string;
  mergeCopyError: string;
  mergeClose: string;
}

const mountedHelpers = new WeakMap<HTMLElement, () => void>();
let nextPanelId = 0;

export function mountMergeHelper(
  pageDocument: Document,
  pageWindow: Window,
  container: HTMLElement,
  labels: MergeHelperLabels,
): MergeHelperHandle {
  mountedHelpers.get(container)?.();
  const formControls = mountMergeFormControls(pageDocument, pageWindow, labels);

  const makeButton = (className: string, text: string): HTMLButtonElement => {
    const button = pageDocument.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
  };
  const opener = makeButton('tlpr-merge-open', labels.mergeOpen);
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-expanded', 'false');
  container.append(opener);

  let disposed = false;
  let closePanel: ((restoreFocus?: boolean) => void) | null = null;

  const openPanel = (): void => {
    if (disposed || closePanel) return;
    const sourcePage = `${pageWindow.location.origin}${pageWindow.location.pathname}`;
    const title = readTitle(pageDocument, pageWindow);
    const candidates = readCandidates(pageDocument, pageWindow);
    const panelId = `tlpr-merge-${++nextPanelId}`;
    const overlay = pageDocument.createElement('div');
    overlay.className = 'tlpr-merge-overlay';
    const dialog = pageDocument.createElement('section');
    dialog.className = 'tlpr-merge-dialog';
    dialog.id = panelId;
    dialog.tabIndex = -1;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${panelId}-title`);
    dialog.setAttribute('aria-describedby', `${panelId}-notice`);
    const header = pageDocument.createElement('div');
    header.className = 'tlpr-merge-header';
    const heading = pageDocument.createElement('h2');
    heading.className = 'tlpr-merge-title';
    heading.id = `${panelId}-title`;
    heading.textContent = labels.mergeTitle;
    const close = makeButton('tlpr-merge-close', '');
    close.setAttribute('aria-label', labels.mergeClose);
    close.title = labels.mergeClose;
    const closeIcon = pageDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeIcon.classList.add('tlpr-merge-close-icon');
    closeIcon.setAttribute('viewBox', '0 0 24 24');
    closeIcon.setAttribute('width', '18');
    closeIcon.setAttribute('height', '18');
    closeIcon.setAttribute('aria-hidden', 'true');
    closeIcon.setAttribute('focusable', 'false');
    const closePath = pageDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    closePath.setAttribute('d', 'M6 6l12 12M18 6L6 18');
    closePath.setAttribute('fill', 'none');
    closePath.setAttribute('stroke', 'currentColor');
    closePath.setAttribute('stroke-width', '2');
    closePath.setAttribute('stroke-linecap', 'round');
    closeIcon.append(closePath);
    close.append(closeIcon);
    header.append(heading, close);
    const notice = pageDocument.createElement('p');
    notice.className = 'tlpr-merge-notice';
    notice.id = `${panelId}-notice`;
    notice.textContent = labels.mergeDetectedNotice;
    dialog.append(header, notice);

    let selection: HTMLFieldSetElement | null = null;
    if (title && candidates.length > 1) {
      selection = pageDocument.createElement('fieldset');
      selection.className = 'tlpr-merge-candidates';
      const candidateLabel = pageDocument.createElement('legend');
      candidateLabel.className = 'tlpr-merge-candidate-label';
      candidateLabel.textContent = labels.mergeCandidateLabel;
      selection.append(candidateLabel);
      candidates.forEach((_, index) => {
        const option = pageDocument.createElement('label');
        option.className = 'tlpr-merge-candidate-option';
        const radio = pageDocument.createElement('input');
        radio.type = 'radio';
        radio.className = 'tlpr-merge-candidate-radio';
        radio.name = `${panelId}-candidate`;
        radio.value = String(index);
        const text = pageDocument.createElement('span');
        text.className = 'tlpr-merge-candidate-text';
        text.textContent = labels.mergeCandidateOption.replace('{count}', String(index + 1));
        option.append(radio, text);
        selection!.append(option);
      });
      dialog.append(selection);
    }

    const previewLabel = pageDocument.createElement('label');
    previewLabel.className = 'tlpr-merge-preview-label';
    previewLabel.htmlFor = `${panelId}-preview`;
    previewLabel.textContent = labels.mergePreviewLabel;
    const preview = pageDocument.createElement('textarea');
    preview.className = 'tlpr-merge-preview';
    preview.id = previewLabel.htmlFor;
    preview.setAttribute('aria-label', labels.mergePreviewLabel);
    preview.readOnly = true;
    preview.spellcheck = false;
    preview.rows = 12;
    const status = pageDocument.createElement('p');
    status.className = 'tlpr-merge-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const actions = pageDocument.createElement('div');
    actions.className = 'tlpr-merge-actions';
    const copy = makeButton('tlpr-merge-copy', labels.mergeCopy);
    actions.append(copy);
    dialog.append(previewLabel, preview, status, actions);
    overlay.append(dialog);

    let pending = false;
    let closed = false;
    const updatePreview = (): void => {
      if (pending || closed) return;
      const selected = selection
        ? (selection.querySelector<HTMLInputElement>('input:checked')?.value ?? '')
        : candidates.length === 1
          ? '0'
          : '';
      const payload = selected === '' ? undefined : candidates[Number(selected)];
      preview.value = title && payload !== undefined ? `${title}\n\n${payload}` : '';
      copy.disabled = !preview.value;
      status.textContent = !title
        ? labels.mergeMissingTitle
        : candidates.length === 0
          ? labels.mergeNoCandidates
          : '';
      status.dataset.state = status.textContent ? 'error' : '';
    };

    const onCopy = async (): Promise<void> => {
      if (closed || pending || !preview.value || copy.disabled) return;
      if (`${pageWindow.location.origin}${pageWindow.location.pathname}` !== sourcePage) {
        closeThisPanel();
        return;
      }
      pending = true;
      copy.disabled = true;
      if (selection) selection.disabled = true;
      status.textContent = labels.mergeCopying;
      status.dataset.state = '';
      try {
        const clipboard = pageWindow.navigator.clipboard;
        if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
        // Copy the displayed value itself, never a separate or newly recomputed payload.
        await clipboard.writeText(preview.value);
        if (closed) return;
        status.textContent = labels.mergeCopied;
        status.dataset.state = 'success';
      } catch {
        if (closed) return;
        status.textContent = labels.mergeCopyError;
        status.dataset.state = 'error';
        preview.focus();
        preview.select();
      } finally {
        pending = false;
        if (!closed) {
          copy.disabled = !preview.value;
          if (selection) selection.disabled = false;
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeThisPanel();
      } else if (event.key === 'Tab') {
        const controls = [
          ...dialog.querySelectorAll<HTMLElement>('button, input, textarea'),
        ].filter((element) => !element.matches(':disabled'));
        const first = controls[0];
        const last = controls.at(-1);
        if (
          event.shiftKey &&
          (pageDocument.activeElement === first || !dialog.contains(pageDocument.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (pageDocument.activeElement === last || !dialog.contains(pageDocument.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onFocusIn = (): void => {
      if (!dialog.contains(pageDocument.activeElement)) close.focus();
    };
    const onClose = (): void => closeThisPanel();
    const closeThisPanel = (restoreFocus = true): void => {
      if (closed) return;
      closed = true;
      pageDocument.removeEventListener('keydown', onKeyDown, true);
      pageDocument.removeEventListener('focusin', onFocusIn);
      close.removeEventListener('click', onClose);
      copy.removeEventListener('click', onCopy);
      selection?.removeEventListener('change', updatePreview);
      overlay.remove();
      closePanel = null;
      opener.setAttribute('aria-expanded', 'false');
      opener.removeAttribute('aria-controls');
      if (restoreFocus && opener.isConnected) opener.focus();
    };

    closePanel = closeThisPanel;
    close.addEventListener('click', onClose);
    copy.addEventListener('click', onCopy);
    selection?.addEventListener('change', updatePreview);
    pageDocument.addEventListener('keydown', onKeyDown, true);
    pageDocument.addEventListener('focusin', onFocusIn);
    updatePreview();
    pageDocument.body.append(overlay);
    opener.setAttribute('aria-expanded', 'true');
    opener.setAttribute('aria-controls', panelId);
    close.focus();
  };

  opener.addEventListener('click', openPanel);
  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    formControls.destroy();
    closePanel?.(false);
    opener.removeEventListener('click', openPanel);
    opener.remove();
    if (mountedHelpers.get(container) === cleanup) mountedHelpers.delete(container);
  };
  const handle = Object.assign(cleanup, { refresh: formControls.refresh });
  mountedHelpers.set(container, handle);
  return handle;
}
