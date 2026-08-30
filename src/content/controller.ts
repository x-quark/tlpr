import { icons } from './icons';
import { message } from './i18n';

export const STORAGE_KEY = 'gh-pr-comment-collapse:v3';
export const LONG_COMMENT_PX = 140;
export const KEEP_LEADING_TIMELINE_ITEMS = 2;
export const KEEP_TRAILING_TIMELINE_ITEMS = 3;

const COMMENT_SELECTOR =
  '.js-comment.timeline-comment, .timeline-comment.js-comment, .review-comment.js-comment, .react-issue-comment, [id^="issuecomment-"], [id^="discussion_r"]';
const BODY_SELECTOR =
  '.comment-body, .edit-comment-hide .comment-body, [data-testid="markdown-body"], .markdown-body';
const HEADER_SELECTOR = '.timeline-comment-header, [data-testid="comment-header"], header';
const TIMELINE_ITEM_SELECTOR =
  '.TimelineItem, .js-timeline-item, .timeline-comment-wrapper, .js-comment-container, .timeline-comment, .react-issue-comment';
const HOST_SELECTOR =
  '#discussion_bucket .js-discussion, .js-discussion, .new-discussion-timeline, [data-testid="issue-viewer-container"]';
const NAVIGATION_EVENTS = ['turbo:load', 'turbo:render', 'soft-nav:success'] as const;

interface PageState {
  comments: Record<string, boolean>;
  timelineCollapsed: boolean;
}

type Store = Record<string, PageState>;

export class GitHubCommentCollapser {
  private store: Store;
  private lastTimelineSignature = '';
  private queued = false;
  private observer: MutationObserver | null = null;
  private readonly enhancedBodies = new WeakMap<HTMLElement, HTMLElement>();
  private readonly clickableBodies = new WeakSet<HTMLElement>();

  public constructor(
    private readonly pageDocument: Document = document,
    private readonly pageWindow: Window = window,
  ) {
    this.store = this.readStore();
  }

  public start(): void {
    if (this.observer) return;

    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this.pageDocument.documentElement, {
      childList: true,
      subtree: true,
    });

    for (const eventName of NAVIGATION_EVENTS) {
      this.pageDocument.addEventListener(eventName, this.handleNavigation);
    }

    this.scan();
  }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = null;

    for (const eventName of NAVIGATION_EVENTS) {
      this.pageDocument.removeEventListener(eventName, this.handleNavigation);
    }
  }

  public scan(): void {
    if (!/\/(pull|issues)\/\d+/.test(this.pageWindow.location.pathname)) return;

    const host = this.pageDocument.querySelector<HTMLElement>(HOST_SELECTOR);
    if (!host) return;

    this.getHumanComments(host).forEach((comment) => this.enhanceComment(comment));
    this.renderTimeline(host);
  }

  private readonly handleNavigation = (): void => {
    this.lastTimelineSignature = '';
    this.schedule();
  };

  private schedule(): void {
    if (this.queued) return;

    this.queued = true;
    this.pageWindow.requestAnimationFrame(() => {
      this.queued = false;
      this.scan();
    });
  }

  private readStore(): Store {
    try {
      const parsed: unknown = JSON.parse(this.pageWindow.localStorage.getItem(STORAGE_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
    } catch {
      return {};
    }
  }

  private saveStore(): void {
    this.pageWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
  }

  private getPageState(): PageState {
    const key = this.pageWindow.location.pathname.replace(/\/$/, '');
    const current = this.store[key];

    if (current && current.comments && typeof current.comments === 'object') {
      return current;
    }

    const initial: PageState = {
      comments: {},
      timelineCollapsed: true,
    };
    this.store[key] = initial;
    return initial;
  }

  private getId(comment: HTMLElement): string | null {
    const holder = comment.closest<HTMLElement>(
      '[id^="issuecomment-"], [id^="discussion_r"], [id^="pullrequestreview-"]',
    );
    return holder?.id || comment.id || null;
  }

  private bodyOf(comment: HTMLElement): HTMLElement | null {
    return comment.querySelector<HTMLElement>(BODY_SELECTOR);
  }

  private headerOf(comment: HTMLElement): HTMLElement | null {
    return comment.querySelector<HTMLElement>(HEADER_SELECTOR);
  }

  private botComment(comment: HTMLElement): boolean {
    return (this.headerOf(comment)?.textContent ?? '').toLowerCase().includes('[bot]');
  }

  private editableComment(comment: HTMLElement): boolean {
    return Boolean(comment.querySelector('textarea, [contenteditable="true"]'));
  }

  private renderButton(button: HTMLButtonElement, icon: string, label: string): void {
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `${icon}<span>${label}</span>`;
  }

  private makeButton(icon: string, label: string, className: string): HTMLButtonElement {
    const button = this.pageDocument.createElement('button');
    button.type = 'button';
    button.className = className;
    this.renderButton(button, icon, label);
    return button;
  }

  private paintComment(comment: HTMLElement, collapsed: boolean): void {
    const body = this.bodyOf(comment);
    const button = comment.querySelector<HTMLButtonElement>('.tlpr-comment-toggle');
    if (!body) return;

    body.classList.add('tlpr-body');
    body.dataset.tlprCollapsed = collapsed ? '1' : '0';

    if (button) {
      const label = collapsed ? message('expand') : message('collapse');
      this.renderButton(button, collapsed ? icons.down : icons.up, label);
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  }

  private setComment(comment: HTMLElement, collapsed: boolean): void {
    const id = this.getId(comment);
    if (!id) return;

    this.getPageState().comments[id] = collapsed;
    this.saveStore();
    this.paintComment(comment, collapsed);
  }

  private enhanceComment(comment: HTMLElement): void {
    if (this.botComment(comment) || this.editableComment(comment)) return;

    const id = this.getId(comment);
    const body = this.bodyOf(comment);
    const header = this.headerOf(comment);
    if (!id || !body || !header) return;
    if (
      comment.dataset.tlprEnhanced === '1' &&
      comment.querySelector('.tlpr-comment-toggle') &&
      this.enhancedBodies.get(comment) === body
    ) {
      return;
    }

    comment.dataset.tlprEnhanced = '1';
    this.enhancedBodies.set(comment, body);
    header.querySelectorAll('.tlpr-control, .tlpr-comment-toggle').forEach((node) => node.remove());

    const control = this.pageDocument.createElement('span');
    control.className = 'tlpr-control';
    const button = this.makeButton(icons.up, message('collapse'), 'tlpr-btn tlpr-comment-toggle');
    control.append(button);
    header.append(control);

    const saved = this.getPageState().comments[id];
    this.paintComment(
      comment,
      typeof saved === 'boolean' ? saved : body.scrollHeight > LONG_COMMENT_PX,
    );

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setComment(comment, body.dataset.tlprCollapsed !== '1');
    });

    if (!this.clickableBodies.has(body)) {
      this.clickableBodies.add(body);
      body.addEventListener('click', () => {
        if (body.dataset.tlprCollapsed === '1') {
          this.setComment(comment, false);
        }
      });
    }
  }

  private getHumanComments(host: HTMLElement): HTMLElement[] {
    return [...host.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)].filter(
      (comment) =>
        Boolean(this.getId(comment)) &&
        Boolean(this.bodyOf(comment)) &&
        !this.botComment(comment) &&
        !this.editableComment(comment),
    );
  }

  private getTimelineItems(host: HTMLElement): HTMLElement[] {
    const raw = [...host.querySelectorAll<HTMLElement>(TIMELINE_ITEM_SELECTOR)];
    const unique = [
      ...new Set(
        raw.map(
          (item) =>
            item.closest<HTMLElement>(
              '.TimelineItem, .js-timeline-item, .timeline-comment-wrapper, .js-comment-container',
            ) ?? item,
        ),
      ),
    ];

    return unique.filter(
      (item) =>
        Boolean(item.parentElement) &&
        !unique.some((other) => other !== item && other.contains(item)) &&
        !item.classList.contains('tlpr-timeline-summary') &&
        !item.classList.contains('tlpr-toolbar'),
    );
  }

  private clearTimelineControls(host: HTMLElement): void {
    host.querySelectorAll('.tlpr-timeline-summary, .tlpr-toolbar').forEach((node) => node.remove());
    this.getTimelineItems(host).forEach((item) => item.classList.remove('tlpr-timeline-hidden'));
  }

  private renderTimeline(host: HTMLElement, force = false): void {
    const items = this.getTimelineItems(host);
    const signature = items
      .map(
        (item) =>
          item.id || item.querySelector<HTMLElement>('[id]')?.id || item.textContent?.slice(0, 40),
      )
      .join('|');

    if (!force && signature === this.lastTimelineSignature) return;
    this.lastTimelineSignature = signature;
    this.clearTimelineControls(host);

    if (items.length <= KEEP_LEADING_TIMELINE_ITEMS + KEEP_TRAILING_TIMELINE_ITEMS) {
      return;
    }

    const hidden = items.slice(KEEP_LEADING_TIMELINE_ITEMS, -KEEP_TRAILING_TIMELINE_ITEMS);
    const state = this.getPageState();
    const collapsed = state.timelineCollapsed !== false;
    const toolbar = this.pageDocument.createElement('div');
    toolbar.className = 'tlpr-toolbar';

    const collapseAll = this.makeButton(
      icons.fold,
      message('collapseAll'),
      'tlpr-btn tlpr-timeline-toggle',
    );
    const expandAll = this.makeButton(
      icons.unfold,
      message('expandAll'),
      'tlpr-btn tlpr-timeline-toggle',
    );
    toolbar.append(collapseAll, expandAll);
    items[KEEP_LEADING_TIMELINE_ITEMS - 1]?.after(toolbar);

    collapseAll.addEventListener('click', () => {
      this.getHumanComments(host).forEach((comment) => this.setComment(comment, true));
    });
    expandAll.addEventListener('click', () => {
      this.getHumanComments(host).forEach((comment) => this.setComment(comment, false));
    });

    const summary = this.pageDocument.createElement('div');
    summary.className = 'tlpr-timeline-summary';
    const count = hidden.length;
    const label = message(count === 1 ? 'timelineHiddenOne' : 'timelineHiddenMany', String(count));
    const toggleLabel = collapsed ? message('show') : message('hide');
    const toggle = this.makeButton(
      collapsed ? icons.down : icons.up,
      toggleLabel,
      'tlpr-btn tlpr-timeline-toggle',
    );
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

    const text = this.pageDocument.createElement('span');
    text.className = 'tlpr-timeline-summary-text';
    text.textContent = label;
    summary.append(text, toggle);
    hidden[0]?.before(summary);
    hidden.forEach((item) => item.classList.toggle('tlpr-timeline-hidden', collapsed));

    toggle.addEventListener('click', () => {
      this.getPageState().timelineCollapsed = !collapsed;
      this.saveStore();
      this.lastTimelineSignature = '';
      this.renderTimeline(host, true);
    });
  }
}
