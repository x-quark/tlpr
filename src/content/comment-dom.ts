// HTML enumerated values are case-insensitive; invalid or absent values inherit.
function isContentEditable(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const value = node.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return false;
    if (value === '' || value === 'true' || value === 'plaintext-only') return true;
  }
  return false;
}

/** GitHub retains its edit form in the DOM after editing or lazy hydration. */
export function hasActiveCommentEditor(comment: HTMLElement, pageWindow: Window): boolean {
  const editors = [
    comment,
    ...comment.querySelectorAll<HTMLElement>('textarea, [contenteditable]'),
  ].filter((element) => element.matches('textarea') || isContentEditable(element));
  if (!editors.length) return false;

  // Inspect native visibility without our own timeline mask. This temporary attribute
  // is deliberately outside the controller's observed attribute filter (no rescan loop).
  const marker = 'data-tlpr-checking-editor';
  const suppressMask =
    comment.classList.contains('tlpr-timeline-hidden') && !comment.hasAttribute(marker);
  if (suppressMask) comment.setAttribute(marker, '');
  try {
    return editors.some((editor) => {
      for (let node: HTMLElement | null = editor; node; node = node.parentElement) {
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
        const style = pageWindow.getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse'
        )
          return false;
        if (node === comment) break;
      }
      return true;
    });
  } finally {
    if (suppressMask) comment.removeAttribute(marker);
  }
}

/** Pull request descriptions (Overview) and issue bodies (React) have no comment anchor. */
export const DESCRIPTION_SELECTOR = 'section[aria-label="Description"], [data-testid="issue-body"]';
export const DESCRIPTION_ID = 'description';

/** Classic timeline comments, React issue comments and Overview CommentLayout articles. */
export const COMMENT_SELECTOR = [
  '.js-comment.timeline-comment',
  '.review-comment.js-comment',
  '.react-issue-comment',
  '[id^="issuecomment-"]',
  '[id^="discussion_r"]',
  'article[id*="issuecomment-"]',
  'article[id*="pullrequestreview-"]',
  '[id*="-discussion_r"]',
  DESCRIPTION_SELECTOR,
].join(', ');
export const BODY_SELECTOR =
  '.comment-body, .edit-comment-hide .comment-body, [data-testid="markdown-body"], .markdown-body';
export const HEADER_SELECTOR =
  '.timeline-comment-header, [data-testid="comment-header"], header, [class*="IssueBodyHeaderContainer"]';
const OWNER_SELECTOR = `${COMMENT_SELECTOR}, article`;

/** Nearest conversation item that owns an element: nested comments keep their own bodies. */
export function ownerOf(element: Element): Element | null {
  return element.parentElement?.closest(OWNER_SELECTOR) ?? null;
}

/**
 * A body belongs to the comment whose header precedes it. A later header starts nested
 * content (Overview review threads) that must never lend its body to the container.
 */
export function findCommentBody(comment: HTMLElement): HTMLElement | null {
  let headers = 0;
  for (const node of comment.querySelectorAll<HTMLElement>(
    `${HEADER_SELECTOR}, ${BODY_SELECTOR}`,
  )) {
    if (node.matches(BODY_SELECTOR)) {
      if (ownerOf(node) !== comment) continue;
      return headers <= 1 ? node : null;
    }
    if (!node.closest(BODY_SELECTOR)) headers += 1;
  }
  return null;
}

export function findCommentHeader(
  comment: HTMLElement,
  body: HTMLElement | null,
): HTMLElement | null {
  for (const header of comment.querySelectorAll<HTMLElement>(HEADER_SELECTOR)) {
    if (body?.contains(header)) continue;
    if (ownerOf(header) === comment) return header;
  }
  return null;
}

/**
 * GitHub anchors issue comments, review summaries and review thread comments.
 * The Overview page may prefix them (for example `pullrequestreview-1-discussion_r2`).
 */
const COMMENT_ANCHOR = /(?:^|[-_#])((?:issuecomment|pullrequestreview)-\d+|discussion_r\d+)$/;
const PERMALINK_SELECTOR =
  'a[href*="#issuecomment-"], a[href*="#discussion_r"], a[href*="#pullrequestreview-"]';

/** Returns the stable GitHub anchor shared by the classic, React and Overview views. */
export function canonicalCommentId(value: string | null | undefined): string | null {
  if (!value) return null;
  return COMMENT_ANCHOR.exec(value)?.[1] ?? null;
}

/** Reads a comment anchor from a header id or its permalink, never from the comment body. */
export function headerCommentId(header: HTMLElement | null): string | null {
  if (!header) return null;
  const own = canonicalCommentId(header.id);
  if (own) return own;
  for (const link of header.querySelectorAll<HTMLAnchorElement>(PERMALINK_SELECTOR)) {
    const id = canonicalCommentId(link.getAttribute('href')?.split('#')[1]);
    if (id) return id;
  }
  return null;
}

export function findCommentId(comment: HTMLElement, header: HTMLElement | null): string | null {
  const holder = comment.closest<HTMLElement>(
    '[id^="issuecomment-"], [id^="discussion_r"], [id^="pullrequestreview-"]',
  );
  if (holder?.id) return canonicalCommentId(holder.id) ?? holder.id;
  // Overview anchors may be prefixed; React issue headers carry the anchor themselves.
  const prefixed = comment.closest<HTMLElement>(
    '[id*="issuecomment-"], [id*="discussion_r"], [id*="pullrequestreview-"]',
  );
  const id = canonicalCommentId(prefixed?.id) ?? headerCommentId(header);
  if (id) return id;
  if (comment.matches(DESCRIPTION_SELECTOR)) return DESCRIPTION_ID;
  return comment.id || null;
}

const BOT_LINK_SELECTOR =
  'a[href^="/apps/"], a[href^="https://github.com/apps/"], [data-hovercard-type="bot"]';
const LABEL_SELECTOR = '.Label, [data-component="Label"]';

/**
 * GitHub renders App authors as `name` plus a “Bot” label (classic and React) and older
 * markup as `name[bot]`. Any of these markers identifies an automated author.
 */
export function hasBotMarker(element: Element | null): boolean {
  if (!element) return false;
  if ((element.textContent ?? '').toLowerCase().includes('[bot]')) return true;
  if (element.querySelector(BOT_LINK_SELECTOR)) return true;
  for (const label of element.querySelectorAll(LABEL_SELECTOR)) {
    if (label.textContent?.trim().toLowerCase() === 'bot') return true;
  }
  return false;
}

const AUTHOR_SELECTOR =
  'a.author, [data-testid="avatar-link"], [data-testid="issue-body-header-author"], a[data-hovercard-type="user"]:not([aria-label])';

export function authorOf(header: Element | null): string | null {
  const author = header?.querySelector(AUTHOR_SELECTOR)?.textContent?.trim();
  return author ? author.replace(/\[bot\]$/i, '') : null;
}

/** Creation time of the first timestamp in an element, in epoch milliseconds. */
export function timestampOf(element: Element): number | null {
  const time = element.querySelector('relative-time[datetime], time[datetime]');
  const value = Date.parse(time?.getAttribute('datetime') ?? '');
  return Number.isNaN(value) ? null : value;
}
