import { timestampOf } from './comment-dom';

/** User choice from the popup. `auto` detects GitHub's current pull request view. */
export type LayoutPreference = 'auto' | 'classic' | 'overview';
/**
 * - `classic`: server-rendered conversation timeline
 * - `react`: React issue viewer
 * - `overview`: pull request Overview page (public preview since 2026-11-05)
 * - `generic`: last-resort structure recovered from comment anchors
 */
export type LayoutKind = 'classic' | 'react' | 'overview' | 'generic';
export type Chronology = 'ascending' | 'descending';

export interface ConversationLayout {
  kind: LayoutKind;
  /** Contains every comment TL;PR may fold, and receives the reading toolbar. */
  host: HTMLElement;
  /** Contains chronological timeline items, or null when the order cannot be trusted. */
  timeline: HTMLElement | null;
}

const CLASSIC_HOST_SELECTOR =
  '#discussion_bucket .js-discussion, .js-discussion, .new-discussion-timeline, [data-testid="issue-viewer-container"]';
const GENERIC_ANCHOR_SELECTOR =
  '[id^="issuecomment-"]:not(a), [id^="pullrequestreview-"]:not(a), [id^="discussion_r"]:not(a)';

/** Nearest shared ancestor, only when it stays close to `near` (never a whole page shell). */
function sharedContainer(near: HTMLElement, other: Element, maxDepth: number): HTMLElement | null {
  let node: HTMLElement | null = near;
  for (let depth = 0; node && depth <= maxDepth; depth += 1, node = node.parentElement) {
    if (node === near.ownerDocument.body) return null;
    if (node.contains(other)) return node;
  }
  return null;
}

function findOverview(pageDocument: Document): ConversationLayout | null {
  // GitHub anchors the Overview comment list with this heading (`#overview-comments`).
  const comments = pageDocument.getElementById('overview-comments')?.closest('section');
  if (!(comments instanceof HTMLElement)) return null;
  const description = pageDocument.querySelector('section[aria-label="Description"]');
  const column = description ? sharedContainer(comments, description, 4) : null;
  return { kind: 'overview', host: column ?? comments, timeline: comments };
}

function findClassic(pageDocument: Document): ConversationLayout | null {
  const host = pageDocument.querySelector<HTMLElement>(CLASSIC_HOST_SELECTOR);
  return host ? { kind: 'classic', host, timeline: host } : null;
}

function findReactIssue(pageDocument: Document): ConversationLayout | null {
  const comments = pageDocument.querySelector<HTMLElement>(
    '[data-testid="issue-viewer-comments-container"]',
  );
  const body = pageDocument.querySelector<HTMLElement>('[data-testid="issue-body"]');
  if (!comments) return null;
  const host = (body && sharedContainer(comments, body, 6)) ?? comments;
  const timeline =
    comments.querySelector<HTMLElement>('[data-testid="issue-timeline-container"]') ?? comments;
  return { kind: 'react', host, timeline };
}

function findGeneric(pageDocument: Document): ConversationLayout | null {
  const anchor = pageDocument.querySelector(GENERIC_ANCHOR_SELECTOR);
  if (!anchor) return null;
  const host =
    anchor.closest<HTMLElement>('main, [role="main"]') ?? pageDocument.querySelector('main');
  // Without a recognized container, folding a timeline could hide unrelated content.
  return host ? { kind: 'generic', host, timeline: null } : null;
}

export function detectLayout(
  pageDocument: Document,
  preference: LayoutPreference = 'auto',
): ConversationLayout | null {
  if (preference === 'classic') {
    return findClassic(pageDocument) ?? findReactIssue(pageDocument) ?? findGeneric(pageDocument);
  }
  if (preference === 'overview') {
    return findOverview(pageDocument) ?? findGeneric(pageDocument);
  }
  return (
    findOverview(pageDocument) ??
    findClassic(pageDocument) ??
    findReactIssue(pageDocument) ??
    findGeneric(pageDocument)
  );
}

/**
 * Timelines are chronological in the classic view, while the Overview lists the newest
 * comments first by default. Timestamps decide; the sort control and view are fallbacks.
 */
export function chronologyOf(items: HTMLElement[], layout: ConversationLayout): Chronology {
  let first: number | null = null;
  let firstIndex = -1;
  for (let index = 0; index < items.length && first === null; index += 1) {
    first = timestampOf(items[index]!);
    firstIndex = index;
  }
  let last: number | null = null;
  for (let index = items.length - 1; index > firstIndex && last === null; index -= 1) {
    last = timestampOf(items[index]!);
  }
  if (first !== null && last !== null && first !== last) {
    return first > last ? 'descending' : 'ascending';
  }
  const sort =
    layout.timeline?.querySelector('[aria-label^="Sort comments"]')?.getAttribute('aria-label') ??
    '';
  if (/newest/i.test(sort)) return 'descending';
  if (/oldest/i.test(sort)) return 'ascending';
  return layout.kind === 'overview' ? 'descending' : 'ascending';
}

/** Same pull request in GitHub's other view, or null when no switch applies. */
export function alternateViewUrl(
  location: Pick<Location, 'href' | 'pathname'>,
  kind: LayoutKind,
): URL | null {
  if (!/\/pull\/\d+\/?$/.test(location.pathname)) return null;
  const url = new URL(location.href);
  if (kind === 'overview') {
    url.searchParams.set('overview', 'false');
    return url;
  }
  // Only offer a return trip: the opt-in itself remains a GitHub account preference.
  if (url.searchParams.get('overview') === 'false') {
    url.searchParams.set('overview', 'true');
    return url;
  }
  return null;
}
