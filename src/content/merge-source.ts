import { hasActiveCommentEditor } from './comment-dom';

const DISCUSSION_SELECTOR =
  '#discussion_bucket, .js-discussion, .new-discussion-timeline, [data-testid="issue-viewer-container"]';
const COMMENT_SELECTOR =
  '.js-comment, .react-issue-comment, [id^="issuecomment-"], [id^="discussion_r"]';
const BODY_SELECTOR = '.comment-body, [data-testid="markdown-body"], .markdown-body';
const TITLE_SELECTOR =
  '.js-issue-title, [data-testid="issue-title"], h1[data-component="PH_Title"] .markdown-title';
const MERGE_HEADING = '🧾 Merge commit body';

export function isVisible(element: Element, pageWindow: Window, allowTlprFold = false): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.matches('template, [hidden], [aria-hidden="true"]')) return false;
    const style = pageWindow.getComputedStyle(current);
    // Our folded timeline items still contain rendered heading candidates.
    const ownFold =
      allowTlprFold &&
      current.classList.contains('tlpr-timeline-hidden') &&
      !current.matches('.d-none, .hidden') &&
      (!('style' in current) || (current as HTMLElement).style.display !== 'none');
    if (style.display === 'none' && !ownFold) return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
}

export function readTitle(pageDocument: Document, pageWindow: Window): string | null {
  const titles = new Set(
    [...pageDocument.querySelectorAll(TITLE_SELECTOR)]
      .filter((element) => isVisible(element, pageWindow))
      .map((element) => element.textContent?.trim() ?? '')
      .filter(Boolean),
  );
  return titles.size === 1 ? [...titles][0]! : null;
}

export function readCandidates(pageDocument: Document, pageWindow: Window): string[] {
  const bodies = new Set<Element>();
  for (const discussion of pageDocument.querySelectorAll(DISCUSSION_SELECTOR)) {
    for (const body of discussion.querySelectorAll(BODY_SELECTOR)) {
      const comment = body.closest(COMMENT_SELECTOR);
      if (!comment || !discussion.contains(comment)) continue;
      if (hasActiveCommentEditor(comment as HTMLElement, pageWindow)) continue;
      // The first matching body owns any nested markdown wrappers.
      if (comment.querySelector(BODY_SELECTOR) !== body) continue;
      bodies.add(body);
    }
  }

  const candidates: string[] = [];
  for (const body of bodies) {
    const headings = [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (heading) =>
        heading.textContent?.trim().replace(/\s+/g, ' ') === MERGE_HEADING &&
        !heading.closest('blockquote') &&
        isVisible(heading, pageWindow, true),
    );
    const blocks = body.querySelectorAll('pre');
    if (headings.length !== 1 || blocks.length !== 1) continue;
    const block = blocks[0]!;
    if (!isVisible(block, pageWindow, true) || block.closest('blockquote')) continue;
    if (!(headings[0]!.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    // A later section cannot donate its code block to this designated heading.
    if (
      [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')].some(
        (heading) =>
          heading !== headings[0] &&
          headings[0]!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING &&
          heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
    )
      continue;
    const payload = block.textContent ?? '';
    if (!payload.trim()) continue;
    // Rendered GitHub HTML does not expose the raw marker. These are heading candidates only.
    candidates.push(payload);
  }
  return candidates;
}
