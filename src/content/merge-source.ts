import {
  COMMENT_SELECTOR,
  authorOf,
  findCommentBody,
  findCommentHeader,
  findCommentId,
  hasActiveCommentEditor,
  timestampOf,
} from './comment-dom';
import { detectLayout } from './layout';

/**
 * The current React pull request header renders `h1 > span.markdown-title`; issues and
 * older headers use `bdi.markdown-title`, `[data-testid="issue-title"]` or `.js-issue-title`.
 */
const TITLE_SELECTOR =
  'h1 .markdown-title, bdi.markdown-title, [data-testid="issue-title"], .js-issue-title';
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
/** “🧾 Proposed merge commit”, “🧾 Merge commit body”, “Merge commit message”… */
const MARKER_HEADING = /🧾|\bmerge[\s-]+commit\b|\bcommit\s+message\b/iu;
const BODY_ONLY_HEADING = /\b(?:body|description)\b/i;
const COMMIT_LANGUAGES = new Set(['git', 'gitcommit', 'git-commit', 'commit']);
const MARKDOWN_LANGUAGES = new Set(['markdown', 'md']);

export interface MergeProposal {
  /** Commit subject when the source block is a complete commit message. */
  subject: string | null;
  /** Commit body: every line after the subject, or the whole block. */
  body: string;
  /** Anchor of the source comment, used for selection and the “view source” link. */
  sourceId: string | null;
  author: string | null;
  createdAt: number | null;
  heading: string | null;
}

export interface MergeMessage {
  /** Commit title for GitHub's “Commit message” field. */
  title: string;
  /** Commit body for GitHub's “Extended description” field. */
  description: string;
}

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

const normalize = (text: string | null | undefined): string =>
  (text ?? '').trim().replace(/\s+/g, ' ');

export function readTitle(pageDocument: Document, pageWindow: Window): string | null {
  const titles = new Set(
    [...pageDocument.querySelectorAll(TITLE_SELECTOR)]
      .filter((element) => isVisible(element, pageWindow))
      .map((element) => normalize(element.textContent))
      .filter(Boolean),
  );
  return titles.size === 1 ? [...titles][0]! : null;
}

function codeLanguage(block: HTMLElement): string | null {
  const declared =
    block.getAttribute('lang') ?? block.querySelector('code[lang]')?.getAttribute('lang');
  if (declared) return declared.trim().toLowerCase();
  const highlighted = block
    .closest('.highlight')
    ?.className.match(/\bhighlight-(?:text|source)-([a-z0-9-]+)/)?.[1];
  if (highlighted) return highlighted;
  return (
    block
      .querySelector('code')
      ?.className.match(/\blanguage-([a-z0-9-]+)/i)?.[1]
      ?.toLowerCase() ?? null
  );
}

/**
 * Exact block text: GitHub keeps the raw fenced content for its copy button. Only the
 * renderer's surrounding blank lines are dropped; inner and trailing spaces are preserved.
 */
function blockText(block: HTMLElement): string {
  const raw =
    block
      .closest('[data-snippet-clipboard-copy-content]')
      ?.getAttribute('data-snippet-clipboard-copy-content') ??
    block.textContent ??
    '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '');
}

const follows = (first: Node, second: Node): boolean =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

/** True when a comment holds nothing but this block (and optional headings). */
function isOnlyBlock(body: HTMLElement, block: HTMLElement): boolean {
  const wrapper = block.closest('.snippet-clipboard-content, .highlight') ?? block;
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || wrapper.contains(parent) || parent.closest(HEADING_SELECTOR)) continue;
    return false;
  }
  return true;
}

type Hint = 'full' | 'body' | 'auto';

/**
 * Splits a commit message. A complete message starts with a subject line followed by a
 * blank line; bullet lists and Markdown blocks are body-only templates.
 */
export function splitCommitMessage(
  text: string,
  hint: Hint = 'auto',
): { subject: string | null; body: string } {
  const lines = text.split('\n');
  const first = lines[0]?.trim() ?? '';
  const second = lines[1];
  const subjectLike =
    first !== '' && first.length <= 300 && !/^(?:[-*+>|]|#{1,6}|\d+[.)])(?:\s|$)/.test(first);
  if (hint !== 'body' && subjectLike && (second === undefined || second.trim() === '')) {
    return { subject: first, body: lines.slice(1).join('\n').replace(/^\n+/, '') };
  }
  return { subject: null, body: text };
}

function proposalSource(
  body: HTMLElement,
  pageWindow: Window,
): { text: string; hint: Hint; heading: string | null } | null {
  const headings = [...body.querySelectorAll<HTMLElement>(HEADING_SELECTOR)].filter(
    (heading) => !heading.closest('blockquote'),
  );
  const blocks = [...body.querySelectorAll<HTMLElement>('pre')].filter(
    (block) => !block.closest('blockquote'),
  );
  const markers = headings.filter(
    (heading) =>
      MARKER_HEADING.test(normalize(heading.textContent)) && isVisible(heading, pageWindow, true),
  );
  if (markers.length > 1) return null;

  if (markers.length === 1) {
    const heading = markers[0]!;
    // The designated section ends at the next heading; later blocks belong elsewhere.
    const section = blocks.filter(
      (block) =>
        follows(heading, block) &&
        !headings.some(
          (other) => other !== heading && follows(heading, other) && follows(other, block),
        ),
    );
    if (section.length !== 1) return null;
    const block = section[0]!;
    if (!isVisible(block, pageWindow, true)) return null;
    const language = codeLanguage(block) ?? '';
    const title = normalize(heading.textContent);
    const hint: Hint =
      MARKDOWN_LANGUAGES.has(language) || BODY_ONLY_HEADING.test(title)
        ? 'body'
        : COMMIT_LANGUAGES.has(language)
          ? 'full'
          : 'auto';
    return { text: blockText(block), hint, heading: title };
  }

  // Without a heading, only a comment made of exactly one ```git block qualifies.
  if (blocks.length !== 1) return null;
  const block = blocks[0]!;
  if (!COMMIT_LANGUAGES.has(codeLanguage(block) ?? '')) return null;
  if (!isVisible(block, pageWindow, true) || !isOnlyBlock(body, block)) return null;
  return { text: blockText(block), hint: 'full', heading: null };
}

/** Merge message proposals in the conversation, oldest first. */
export function readProposals(
  pageDocument: Document,
  pageWindow: Window,
  root: HTMLElement | null = detectLayout(pageDocument)?.host ?? null,
): MergeProposal[] {
  if (!root) return [];
  const proposals: MergeProposal[] = [];
  const seen = new Set<HTMLElement>();
  for (const comment of root.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)) {
    const body = findCommentBody(comment);
    if (!body || seen.has(body)) continue;
    seen.add(body);
    if (hasActiveCommentEditor(comment, pageWindow)) continue;
    const source = proposalSource(body, pageWindow);
    if (!source || !source.text.trim()) continue;
    const header = findCommentHeader(comment, body);
    const { subject, body: message } = splitCommitMessage(source.text, source.hint);
    proposals.push({
      subject,
      body: message,
      sourceId: findCommentId(comment, header),
      author: authorOf(header),
      createdAt: header ? timestampOf(header) : null,
      heading: source.heading,
    });
  }
  // The Overview lists newest comments first: order by creation time when every source has one.
  if (proposals.every((proposal) => proposal.createdAt !== null)) {
    proposals.sort((left, right) => left.createdAt! - right.createdAt!);
  }
  return proposals;
}

/** Decorative leading emoji: pictographs with modifiers or joiners, flags and :shortcodes:. */
const LEADING_EMOJI =
  /^(?:(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}|:[a-z0-9_+-]+:)\s*)+/u;

/**
 * Commit subject for a body-only template, as such pull requests are merged in practice:
 * the pull request title without its decorative leading emoji, then `(#number)`.
 */
export function commitTitleFromPullRequest(title: string, number: string | null): string {
  const subject = title.replace(LEADING_EMOJI, '').trim() || title.trim();
  if (!number || subject.includes(`(#${number})`)) return subject;
  return `${subject} (#${number})`;
}

/** Complete proposals give the subject; body-only templates derive it from the PR title. */
export function composeMergeMessage(
  proposal: MergeProposal,
  pullRequestTitle: string | null,
  pullRequestNumber: string | null = null,
): MergeMessage | null {
  if (proposal.subject) return { title: proposal.subject, description: proposal.body };
  if (!pullRequestTitle) return null;
  return {
    title: commitTitleFromPullRequest(pullRequestTitle, pullRequestNumber),
    description: proposal.body,
  };
}

/** Full commit message for the clipboard: subject, a blank line, then the body. */
export function mergeMessageText(message: MergeMessage): string {
  return message.description ? `${message.title}\n\n${message.description}` : message.title;
}

/** Number of the pull request shown at this location, if any. */
export function pullRequestNumber(location: Pick<Location, 'pathname'>): string | null {
  return location.pathname.match(/\/pull\/(\d+)(?:\/|$)/)?.[1] ?? null;
}

export function proposalKey(proposal: MergeProposal): string {
  return JSON.stringify([proposal.sourceId, proposal.subject, proposal.body]);
}
