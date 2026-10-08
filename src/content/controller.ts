import { hasActiveCommentEditor } from './comment-dom';
import { icons } from './icons';
import { message } from './i18n';
import { mountMergeHelper, type MergeHelperHandle } from './merge-helper';

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
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [contenteditable="true"], [tabindex]';

interface PageState {
  comments: Record<string, boolean>;
  timelineCollapsed: boolean;
}

type Store = Record<string, PageState>;

export class GitHubCommentCollapser {
  private store: Store;
  private lastTimelineSignature = '';
  private globalRail: HTMLElement | null = null;
  private timelineSummary: HTMLElement | null = null;
  private queued = false;
  private observer: MutationObserver | null = null;
  private enhancedBodies = new WeakMap<HTMLElement, HTMLElement>();
  private clickableBodies = new WeakSet<HTMLElement>();
  private enhancedButtons = new WeakMap<HTMLElement, HTMLButtonElement>();
  private buttonIcons = new WeakMap<HTMLButtonElement, string>();
  private linkedTarget: HTMLElement | null = null;
  private lastLinkedTarget: HTMLElement | null = null;
  private lastLinkedLocation = '';
  private keyboardNavigation = false;
  private destroyed = false;
  private readonly bodyListeners: Array<() => void> = [];
  private removeMergeHelper: MergeHelperHandle | null = null;
  private pagePath = '';

  public constructor(
    private readonly pageDocument: Document = document,
    private readonly pageWindow: Window = window,
    private readonly options: { mergeHelper?: boolean } = {},
  ) {
    this.store = this.readStore();
  }

  public start(): void {
    if (this.observer || this.destroyed) return;

    this.observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === 'childList' ||
            (record.target instanceof Element &&
              (record.target.matches('textarea, [contenteditable="true"]') ||
                record.target.querySelector('textarea, [contenteditable="true"]'))),
        )
      )
        this.schedule();
    });
    this.observer.observe(this.pageDocument.documentElement, {
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      subtree: true,
    });

    for (const eventName of NAVIGATION_EVENTS) {
      this.pageDocument.addEventListener(eventName, this.handleNavigation);
    }
    this.pageWindow.addEventListener('hashchange', this.handleNavigation);
    this.pageDocument.addEventListener('keydown', this.handleKeyDown);
    this.pageDocument.addEventListener('pointerdown', this.handlePointerDown);

    this.scan();
  }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = null;

    for (const eventName of NAVIGATION_EVENTS) {
      this.pageDocument.removeEventListener(eventName, this.handleNavigation);
    }
    this.pageWindow.removeEventListener('hashchange', this.handleNavigation);
    this.pageDocument.removeEventListener('keydown', this.handleKeyDown);
    this.pageDocument.removeEventListener('pointerdown', this.handlePointerDown);
  }

  public scan(): void {
    if (this.destroyed) return;
    const pathname = this.pageWindow.location.pathname;
    if (pathname !== this.pagePath) {
      this.clearEffects();
      this.pagePath = pathname;
    }
    if (!/\/(pull|issues)\/\d+/.test(pathname)) return;

    const host = this.pageDocument.querySelector<HTMLElement>(HOST_SELECTOR);
    if (!host) return;

    this.getHumanComments(host).forEach((comment) => this.enhanceComment(comment));
    this.renderGlobalRail(host);
    this.removeMergeHelper?.refresh();
    const linkedTarget = this.revealLinkedTarget(host);
    this.renderTimeline(host, Boolean(linkedTarget));
    linkedTarget?.scrollIntoView?.({ block: 'nearest' });
  }

  public destroy(): void {
    this.destroyed = true;
    this.stop();
    this.clearEffects();
  }

  private clearEffects(): void {
    this.removeMergeHelper?.();
    this.removeMergeHelper = null;
    this.bodyListeners.splice(0).forEach((remove) => remove());
    this.pageDocument
      .querySelectorAll('.tlpr-control, .tlpr-timeline-summary, .tlpr-global-rail')
      .forEach((node) => node.remove());
    this.pageDocument.querySelectorAll<HTMLElement>('.tlpr-body').forEach((body) => {
      body.classList.remove('tlpr-body');
      if (body.id === body.dataset.tlprGeneratedId) body.removeAttribute('id');
      delete body.dataset.tlprGeneratedId;
      delete body.dataset.tlprCollapsed;
      body.style.removeProperty('--tlpr-reveal-proximity');
    });
    this.pageDocument.querySelectorAll<HTMLElement>('[data-tlpr-enhanced]').forEach((comment) => {
      delete comment.dataset.tlprEnhanced;
    });
    this.pageDocument.querySelectorAll('.tlpr-timeline-hidden').forEach((item) => {
      item.classList.remove('tlpr-timeline-hidden');
    });
    this.enhancedBodies = new WeakMap();
    this.clickableBodies = new WeakSet();
    this.enhancedButtons = new WeakMap();
    this.buttonIcons = new WeakMap();
    this.lastTimelineSignature = '';
    this.globalRail = null;
    this.timelineSummary = null;
    this.linkedTarget = null;
    this.lastLinkedTarget = null;
    this.lastLinkedLocation = '';
  }

  private readonly handleNavigation = (): void => {
    this.lastTimelineSignature = '';
    this.linkedTarget = null;
    this.lastLinkedTarget = null;
    this.lastLinkedLocation = '';
    this.schedule();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') this.keyboardNavigation = true;
  };

  private readonly handlePointerDown = (): void => {
    this.keyboardNavigation = false;
  };

  private revealLinkedTarget(host: HTMLElement): HTMLElement | null {
    const location = this.pageWindow.location;
    const linkedLocation = `${location.pathname}${location.hash}`;
    if (!location.hash) return null;

    let target: HTMLElement | null;
    try {
      target = this.pageDocument.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch {
      return null;
    }
    if (!target || !host.contains(target)) return null;
    if (linkedLocation === this.lastLinkedLocation && target === this.lastLinkedTarget) return null;

    this.lastLinkedLocation = linkedLocation;
    this.lastLinkedTarget = target;
    this.linkedTarget = target;
    const comment = this.getHumanComments(host).find((item) => item.contains(target));
    // Following a link is temporary: do not replace the user's saved preferences.
    if (comment) this.paintComment(comment, false);
    return target;
  }

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
    return hasActiveCommentEditor(comment, this.pageWindow);
  }

  private renderButton(button: HTMLButtonElement, icon: string, label: string): void {
    button.title = label;
    button.setAttribute('aria-label', label);
    if (this.buttonIcons.get(button) !== icon) {
      button.innerHTML = icon;
      button.append(this.pageDocument.createElement('span'));
      this.buttonIcons.set(button, icon);
    }
    button.lastElementChild!.textContent = label;
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
    body.style.removeProperty('--tlpr-reveal-proximity');

    if (button) {
      const label = collapsed ? message('expand') : message('collapse');
      this.renderButton(button, icons.down, label);
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  }

  private setComment(comment: HTMLElement, collapsed: boolean): void {
    if (this.destroyed || this.botComment(comment) || this.editableComment(comment)) return;
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
      comment.querySelector('.tlpr-comment-toggle') === this.enhancedButtons.get(comment) &&
      header.contains(this.enhancedButtons.get(comment) ?? null) &&
      this.enhancedBodies.get(comment) === body
    ) {
      return;
    }

    comment.dataset.tlprEnhanced = '1';
    this.enhancedBodies.set(comment, body);
    header.querySelectorAll('.tlpr-control, .tlpr-comment-toggle').forEach((node) => node.remove());

    const control = this.pageDocument.createElement('span');
    control.className = 'tlpr-control';
    const button = this.makeButton(icons.down, message('collapse'), 'tlpr-btn tlpr-comment-toggle');
    if (!body.id) {
      body.id = `tlpr-body-${id}`;
      body.dataset.tlprGeneratedId = body.id;
    }
    button.setAttribute('aria-controls', body.id);
    control.append(button);
    header.append(control);
    this.enhancedButtons.set(comment, button);

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
      const handleClick = (event: MouseEvent): void => {
        const target = event.target;
        if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;
        if (this.pageWindow.getSelection()?.toString()) return;
        if (body.dataset.tlprCollapsed === '1') {
          this.setComment(comment, false);
        }
      };
      const handleFocus = (event: FocusEvent): void => {
        const target = event.target;
        if (
          target instanceof Element &&
          (this.keyboardNavigation || target.matches(':focus-visible')) &&
          body.dataset.tlprCollapsed === '1'
        ) {
          this.setComment(comment, false);
        }
      };
      const clearRevealCue = (): void => {
        body.style.removeProperty('--tlpr-reveal-proximity');
      };
      const handlePointerMove = (event: PointerEvent): void => {
        const target = event.target;
        if (
          event.pointerType !== 'mouse' ||
          body.dataset.tlprCollapsed !== '1' ||
          this.botComment(comment) ||
          this.editableComment(comment) ||
          (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) ||
          this.pageWindow.getSelection()?.toString() ||
          this.pageDocument.documentElement.dataset.tlprAnimations === 'off' ||
          this.pageWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
          clearRevealCue();
          return;
        }

        const bounds = body.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const edgeDistance = Math.min(
          event.clientX - bounds.left,
          bounds.right - event.clientX,
          event.clientY - bounds.top,
          bounds.bottom - event.clientY,
        );
        const proximity = Math.max(0, Math.min(1, edgeDistance / 12));
        // A short entry ramp matches the whole clickable preview, then stays level.
        const eased = proximity * proximity * (3 - 2 * proximity);
        body.style.setProperty('--tlpr-reveal-proximity', eased.toFixed(3));
      };
      body.addEventListener('click', handleClick);
      body.addEventListener('focusin', handleFocus);
      body.addEventListener('pointermove', handlePointerMove, { passive: true });
      body.addEventListener('pointerleave', clearRevealCue);
      body.addEventListener('pointercancel', clearRevealCue);
      body.addEventListener('pointerdown', clearRevealCue);
      this.bodyListeners.push(() => {
        body.removeEventListener('click', handleClick);
        body.removeEventListener('focusin', handleFocus);
        body.removeEventListener('pointermove', handlePointerMove);
        body.removeEventListener('pointerleave', clearRevealCue);
        body.removeEventListener('pointercancel', clearRevealCue);
        body.removeEventListener('pointerdown', clearRevealCue);
        clearRevealCue();
      });
    }
  }

  private getHumanComments(host: HTMLElement): HTMLElement[] {
    return [...host.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)].filter(
      (comment) =>
        Boolean(this.getId(comment)) &&
        this.bodyOf(comment)?.closest(COMMENT_SELECTOR) === comment &&
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
    host.querySelectorAll('.tlpr-timeline-summary').forEach((node) => node.remove());
    this.getTimelineItems(host).forEach((item) => item.classList.remove('tlpr-timeline-hidden'));
  }

  private renderGlobalRail(host: HTMLElement): void {
    if (this.globalRail && host.querySelector('.tlpr-global-rail') === this.globalRail) return;
    host.querySelectorAll('.tlpr-global-rail').forEach((node) => node.remove());
    this.removeMergeHelper?.();
    this.removeMergeHelper = null;
    const rail = this.pageDocument.createElement('div');
    rail.className = 'tlpr-toolbar tlpr-global-rail';
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', message('conversationControls'));
    const expand = this.makeButton(icons.unfold, message('expandAll'), 'tlpr-btn');
    expand.dataset.tlprAction = 'expand-all';
    const collapse = this.makeButton(icons.fold, message('collapseAll'), 'tlpr-btn');
    collapse.dataset.tlprAction = 'collapse-all';
    const apply = (collapsed: boolean): void => {
      if (this.destroyed) return;
      const state = this.getPageState();
      this.getHumanComments(host).forEach((comment) => {
        const id = this.getId(comment);
        if (id) state.comments[id] = collapsed;
        this.paintComment(comment, collapsed);
      });
      state.timelineCollapsed = collapsed;
      this.linkedTarget = null;
      this.saveStore();
      this.renderTimeline(host, true);
    };
    expand.addEventListener('click', () => apply(false));
    collapse.addEventListener('click', () => apply(true));
    rail.append(expand, collapse);
    host.prepend(rail);
    this.globalRail = rail;
    if (this.options.mergeHelper && /\/pull\/\d+/.test(this.pageWindow.location.pathname)) {
      this.removeMergeHelper = mountMergeHelper(this.pageDocument, this.pageWindow, rail, {
        mergeInsert: message('mergeInsert'),
        mergeInserted: message('mergeInserted'),
        mergeEdited: message('mergeEdited'),
        mergeFormUnavailable: message('mergeFormUnavailable'),
        mergeChooseSource: message('mergeChooseSource'),
        mergePreview: message('mergePreview'),
        mergeOpen: message('mergeOpen'),
        mergeTitle: message('mergeTitle'),
        mergeDetectedNotice: message('mergeDetectedNotice'),
        mergeCandidateLabel: message('mergeCandidateLabel'),
        mergeCandidatePlaceholder: message('mergeCandidatePlaceholder'),
        mergeCandidateOption: message('mergeCandidateOption'),
        mergePreviewLabel: message('mergePreviewLabel'),
        mergeMissingTitle: message('mergeMissingTitle'),
        mergeNoCandidates: message('mergeNoCandidates'),
        mergeCopy: message('mergeCopy'),
        mergeCopying: message('mergeCopying'),
        mergeCopied: message('mergeCopied'),
        mergeCopyError: message('mergeCopyError'),
        mergeClose: message('mergeClose'),
      });
    }
  }

  private renderTimeline(host: HTMLElement, force = false): void {
    const items = this.getTimelineItems(host);
    const signature = items
      .map(
        (item) =>
          item.id || item.querySelector<HTMLElement>('[id]')?.id || item.textContent?.slice(0, 40),
      )
      .join('|');

    const needsSummary = items.length > KEEP_LEADING_TIMELINE_ITEMS + KEEP_TRAILING_TIMELINE_ITEMS;
    if (
      !force &&
      signature === this.lastTimelineSignature &&
      (!needsSummary ||
        (this.timelineSummary &&
          host.querySelector('.tlpr-timeline-summary') === this.timelineSummary))
    ) {
      return;
    }
    this.lastTimelineSignature = signature;
    this.clearTimelineControls(host);

    if (items.length <= KEEP_LEADING_TIMELINE_ITEMS + KEEP_TRAILING_TIMELINE_ITEMS) {
      return;
    }

    const hidden = items.slice(KEEP_LEADING_TIMELINE_ITEMS, -KEEP_TRAILING_TIMELINE_ITEMS);
    const state = this.getPageState();
    let collapsed =
      state.timelineCollapsed !== false &&
      !hidden.some((item) => this.linkedTarget && item.contains(this.linkedTarget));
    const summary = this.pageDocument.createElement('div');
    summary.className = 'tlpr-timeline-summary';
    this.timelineSummary = summary;
    summary.setAttribute('role', 'group');
    summary.setAttribute('aria-label', message('conversationControls'));
    const count = hidden.length;
    const toggle = this.makeButton(
      icons.down,
      message('show', String(count)),
      'tlpr-btn tlpr-timeline-toggle',
    );

    const context = this.pageDocument.createElement('div');
    context.className = 'tlpr-summary-context';
    const brand = this.pageDocument.createElement('span');
    brand.className = 'tlpr-brand';
    brand.textContent = message('extensionName');
    const text = this.pageDocument.createElement('span');
    text.className = 'tlpr-timeline-summary-text';
    text.setAttribute('aria-live', 'polite');
    context.append(brand, text);
    summary.append(context, toggle);
    hidden[0]?.before(summary);

    const paint = (): void => {
      const key = collapsed
        ? count === 1
          ? 'timelineHiddenOne'
          : 'timelineHiddenMany'
        : count === 1
          ? 'timelineShownOne'
          : 'timelineShownMany';
      text.textContent = message(key, String(count));
      this.renderButton(toggle, icons.down, message(collapsed ? 'show' : 'hide', String(count)));
      toggle.setAttribute('aria-expanded', String(!collapsed));
      summary.dataset.tlprCollapsed = collapsed ? '1' : '0';
      hidden.forEach((item) => item.classList.toggle('tlpr-timeline-hidden', collapsed));
    };
    paint();

    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      this.linkedTarget = null;
      this.getPageState().timelineCollapsed = collapsed;
      this.saveStore();
      // Update in place so keyboard focus and the icon transition survive the click.
      paint();
    });
  }
}
