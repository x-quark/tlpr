import { isConversationLocation } from './routes';
import {
  BODY_SELECTOR,
  COMMENT_SELECTOR,
  DESCRIPTION_SELECTOR,
  HEADER_SELECTOR,
  findCommentBody,
  findCommentHeader,
  findCommentId,
  hasActiveCommentEditor,
  hasBotMarker,
} from './comment-dom';
import { icons } from './icons';
import { message } from './i18n';
import {
  alternateViewUrl,
  chronologyOf,
  detectLayout,
  type ConversationLayout,
  type LayoutPreference,
} from './layout';
import { mountMergeHelper, type MergeHelperHandle } from './merge-helper';

export const STORAGE_KEY = 'gh-pr-comment-collapse:v3';
export const LONG_COMMENT_PX = 140;
export const KEEP_LEADING_TIMELINE_ITEMS = 2;
export const KEEP_TRAILING_TIMELINE_ITEMS = 3;

/** Action areas of React comment headers and issue body headers, in order of preference. */
const HEADER_SLOTS = [
  '[data-testid="comment-header-right-side-items"]',
  '[class*="actionsSection"]',
];
const HEADER_SLOT_SELECTOR = HEADER_SLOTS.join(', ');
const TIMELINE_CONTAINER_SELECTOR =
  '.TimelineItem, .js-timeline-item, .timeline-comment-wrapper, .js-comment-container, [data-wrapper-timeline-id], [data-testid="timeline-item"]';
const TIMELINE_ITEM_SELECTOR = [
  TIMELINE_CONTAINER_SELECTOR,
  '.timeline-comment',
  '.react-issue-comment',
  '[data-testid="timeline-commit-group"]',
  'article[id*="issuecomment-"]',
  'article[id*="pullrequestreview-"]',
].join(', ');
const HOST_HINT_SELECTOR =
  '#discussion_bucket, .js-discussion, .new-discussion-timeline, [data-testid="issue-viewer-container"], [data-testid="issue-viewer-comments-container"], [data-testid="issue-body"], #overview-comments, section[aria-label="Description"]';
const HYDRATION_SELECTOR = [
  COMMENT_SELECTOR,
  BODY_SELECTOR,
  HEADER_SELECTOR,
  HOST_HINT_SELECTOR,
  TIMELINE_ITEM_SELECTOR,
].join(', ');
const EDITOR_SELECTOR = 'textarea, [contenteditable]';
const TLPR_UI_SELECTOR =
  '.tlpr-global-rail, .tlpr-timeline-summary, .tlpr-control, .tlpr-comment-bar, .tlpr-merge-form-controls, .tlpr-merge-overlay';
const NAVIGATION_EVENTS = ['turbo:load', 'turbo:render', 'soft-nav:success'] as const;
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [contenteditable="true"], [tabindex]';

interface PageState {
  comments: Record<string, boolean>;
  timelineCollapsed: boolean;
}

type Store = Record<string, PageState>;

/** Facts about one comment that remain valid for the duration of one synchronous scan. */
interface CommentFacts {
  body: HTMLElement | null;
  header: HTMLElement | null;
  id: string | null;
}

export interface CollapserOptions {
  mergeHelper?: boolean;
  layout?: LayoutPreference;
  onOutOfScope?: () => void;
}

function isOwnNode(node: Node): boolean {
  if (node instanceof Element) return node.matches(TLPR_UI_SELECTOR);
  return node.nodeType === Node.TEXT_NODE && !node.textContent?.trim();
}

const classTokens = (value: string | null): string[] => (value ?? '').split(/\s+/).filter(Boolean);

/**
 * Our own additions (fold classes, generated body ids) must not schedule another scan.
 * Removals stay relevant: GitHub may have reset our markers and they must be restored.
 */
function isOwnAttributeChange(record: MutationRecord): boolean {
  if (record.type !== 'attributes' || !(record.target instanceof Element)) return false;
  const current = record.target.getAttribute(record.attributeName ?? '');
  if (record.attributeName === 'class') {
    const before = classTokens(record.oldValue);
    const after = classTokens(current);
    const foreign = (tokens: string[]) =>
      tokens
        .filter((token) => !token.startsWith('tlpr-'))
        .sort()
        .join(' ');
    return before.every((token) => after.includes(token)) && foreign(before) === foreign(after);
  }
  if (record.attributeName === 'id')
    return !record.oldValue && Boolean(current?.startsWith('tlpr-body-'));
  return false;
}

export class GitHubCommentCollapser {
  private store: Store;
  private savedStore: Store;
  private readonly pendingComments = new Map<string, Set<string>>();
  private readonly pendingTimelines = new Set<string>();
  private lastTimelineSignature = '';
  private readonly timelineNodeIds = new WeakMap<HTMLElement, number>();
  private nextTimelineNodeId = 0;
  private globalRail: HTMLElement | null = null;
  private viewSwitch: HTMLAnchorElement | null = null;
  private timelineSummary: HTMLElement | null = null;
  private layout: ConversationLayout | null = null;
  private queued = false;
  private observer: MutationObserver | null = null;
  private enhancedBodies = new WeakMap<HTMLElement, HTMLElement>();
  private clickableBodies = new WeakSet<HTMLElement>();
  private enhancedButtons = new WeakMap<HTMLElement, HTMLButtonElement>();
  private buttonIcons = new WeakMap<HTMLButtonElement, string>();
  private linkedTarget: HTMLElement | null = null;
  private linkedCommentManuallyToggled = false;
  private linkedTimelineManuallyToggled = false;
  private lastLinkedTarget: HTMLElement | null = null;
  private lastLinkedLocation = '';
  private keyboardNavigation = false;
  private destroyed = false;
  private readonly bodyListeners = new Map<HTMLElement, () => void>();
  private removeMergeHelper: MergeHelperHandle | null = null;
  private pagePath = '';
  private scanEditors: WeakMap<HTMLElement, boolean> | null = null;
  private scanFacts: WeakMap<HTMLElement, CommentFacts> | null = null;

  public constructor(
    private readonly pageDocument: Document = document,
    private readonly pageWindow: Window = window,
    private readonly options: CollapserOptions = {},
  ) {
    this.store = this.readStore();
    this.savedStore = structuredClone(this.store);
  }

  public start(): void {
    if (this.observer || this.destroyed) return;

    this.observer = new MutationObserver((records) => {
      if (!isConversationLocation(this.pageWindow.location)) {
        this.scan();
        return;
      }
      if (records.some((record) => this.isRelevant(record))) this.schedule();
    });
    this.observer.observe(this.pageDocument.documentElement, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        'class',
        'id',
        'data-testid',
        'style',
        'hidden',
        'aria-hidden',
        'contenteditable',
      ],
      subtree: true,
    });

    for (const eventName of NAVIGATION_EVENTS) {
      this.pageDocument.addEventListener(eventName, this.handleNavigation);
    }
    this.pageWindow.addEventListener('hashchange', this.handleNavigation);
    this.pageDocument.addEventListener('keydown', this.handleKeyDown);
    this.pageDocument.addEventListener('pointerdown', this.handlePointerDown);
    this.pageDocument.addEventListener('load', this.handleImageLoad, true);

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
    this.pageDocument.removeEventListener('load', this.handleImageLoad, true);
  }

  public scan(): void {
    if (this.destroyed) return;
    if (!isConversationLocation(this.pageWindow.location)) {
      this.stop();
      if (this.options.onOutOfScope) this.options.onOutOfScope();
      else this.clearEffects();
      return;
    }
    for (const [body, remove] of this.bodyListeners) {
      if (!body.isConnected) {
        remove();
        this.bodyListeners.delete(body);
        this.clickableBodies.delete(body);
      }
    }
    const pathname = this.pageWindow.location.pathname;
    if (pathname !== this.pagePath) {
      this.clearEffects();
      this.pagePath = pathname;
    }
    const layout = detectLayout(this.pageDocument, this.options.layout ?? 'auto');
    if (!layout) return;
    if (
      this.layout &&
      (this.layout.host !== layout.host || this.layout.timeline !== layout.timeline)
    ) {
      this.releaseLayout(this.layout);
    }
    this.layout = layout;
    const root = this.pageDocument.documentElement;
    if (root.dataset.tlprLayout !== layout.kind) root.dataset.tlprLayout = layout.kind;
    const host = layout.host;

    // A scan is synchronous. Reuse visibility checks only within this pass, never
    // across DOM mutations, user interactions or subsequent scans.
    const previousEditors = this.scanEditors;
    const previousFacts = this.scanFacts;
    this.scanEditors = new WeakMap();
    this.scanFacts = new WeakMap();
    try {
      // GitHub may reuse a folded body as its editor. Suspend only our effects,
      // leaving the draft, native styles and persisted reading preference untouched.
      host.querySelectorAll<HTMLElement>('[data-tlpr-enhanced]').forEach((comment) => {
        if (!this.editableComment(comment)) return;
        const body = this.bodyOf(comment);
        if (body?.classList.contains('tlpr-body')) {
          body.classList.remove('tlpr-body');
          body.style.removeProperty('--tlpr-reveal-proximity');
        }
        comment.querySelector('.tlpr-control')?.remove();
        comment.querySelector(':scope > .tlpr-comment-bar')?.remove();
      });
      const comments = this.getHumanComments(host);
      // Measure every comment before changing the page: interleaved reads and writes
      // would force one layout per comment on long conversations.
      const defaults = new Map(comments.map((comment) => [comment, this.defaultState(comment)]));
      comments.forEach((comment) => this.enhanceComment(comment, defaults.get(comment) ?? false));
      this.renderGlobalRail(host, layout);
      this.removeMergeHelper?.refresh();
      const linkedTarget = this.revealLinkedTarget(host, comments);
      this.renderTimeline(layout, Boolean(linkedTarget));
      linkedTarget?.scrollIntoView?.({ block: 'nearest' });
    } finally {
      this.scanEditors = previousEditors;
      this.scanFacts = previousFacts;
      this.discardOwnMutations();
    }
  }

  /**
   * Pending records after one of our synchronous passes describe our own writes: scripts
   * cannot interleave, and earlier page changes were delivered before this pass started.
   */
  private discardOwnMutations(): void {
    this.observer?.takeRecords();
  }

  public destroy(): void {
    this.destroyed = true;
    this.stop();
    this.clearEffects();
  }

  /** Changes outside the conversation rarely matter; GitHub mutates far more than comments. */
  private isRelevant(record: MutationRecord): boolean {
    const target = record.target;
    const element = target instanceof Element ? target : target.parentElement;
    if (!element) return false;
    if (
      record.type === 'childList' &&
      record.removedNodes.length === 0 &&
      [...record.addedNodes].every(isOwnNode)
    ) {
      return false;
    }
    // Labels and states inside our own widgets change on every toggle. Removing a widget
    // still matters: that record targets its GitHub parent, outside this selector.
    if (element.closest(TLPR_UI_SELECTOR)) return false;
    if (isOwnAttributeChange(record)) return false;

    const host = this.layout?.host;
    if (!host?.isConnected || host.contains(element)) return this.isConversationChange(record);

    // Outside the known conversation: only a new conversation container or merge form.
    const watched = this.options.mergeHelper
      ? `${HOST_HINT_SELECTOR}, ${COMMENT_SELECTOR}, textarea`
      : `${HOST_HINT_SELECTOR}, ${COMMENT_SELECTOR}`;
    if (record.type === 'childList') {
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          node instanceof Element &&
          !node.matches(TLPR_UI_SELECTOR) &&
          (node.matches(watched) || Boolean(node.querySelector(watched))),
      );
    }
    if (record.type === 'attributes') {
      if (['class', 'id', 'data-testid'].includes(record.attributeName ?? '')) {
        if (element.matches(HOST_HINT_SELECTOR) || element.querySelector(HOST_HINT_SELECTOR))
          return true;
      }
      return Boolean(
        this.options.mergeHelper &&
        (element.matches('textarea') || element.querySelector('textarea')),
      );
    }
    return false;
  }

  private isConversationChange(record: MutationRecord): boolean {
    return (
      record.type === 'childList' ||
      (record.type === 'attributes' && record.attributeName === 'contenteditable') ||
      (record.type === 'attributes' &&
        ['class', 'id', 'data-testid'].includes(record.attributeName ?? '') &&
        record.target instanceof Element &&
        (record.target.matches(HYDRATION_SELECTOR) ||
          Boolean(record.target.closest(COMMENT_SELECTOR)) ||
          Boolean(record.target.querySelector(COMMENT_SELECTOR)))) ||
      (record.type === 'characterData' &&
        Boolean(record.target.parentElement?.closest(BODY_SELECTOR))) ||
      (record.target instanceof Element &&
        (record.target.matches(EDITOR_SELECTOR) ||
          Boolean(record.target.querySelector(EDITOR_SELECTOR)) ||
          Boolean(record.target.closest('[contenteditable]'))))
    );
  }

  /** Removes controls bound to a previous conversation container. */
  private releaseLayout(layout: ConversationLayout): void {
    this.removeMergeHelper?.();
    this.removeMergeHelper = null;
    this.globalRail?.remove();
    this.globalRail = null;
    this.viewSwitch = null;
    if (layout.timeline) this.clearTimelineControls(layout.timeline);
    this.timelineSummary?.remove();
    this.timelineSummary = null;
    this.lastTimelineSignature = '';
  }

  private clearEffects(): void {
    this.removeMergeHelper?.();
    this.removeMergeHelper = null;
    this.bodyListeners.forEach((remove) => remove());
    this.bodyListeners.clear();
    this.pageDocument
      .querySelectorAll(
        '.tlpr-control, .tlpr-comment-bar, .tlpr-timeline-summary, .tlpr-global-rail',
      )
      .forEach((node) => node.remove());
    this.pageDocument
      .querySelectorAll<HTMLElement>('.tlpr-body, [data-tlpr-collapsed]')
      .forEach((body) => {
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
    delete this.pageDocument.documentElement.dataset.tlprLayout;
    this.enhancedBodies = new WeakMap();
    this.clickableBodies = new WeakSet();
    this.enhancedButtons = new WeakMap();
    this.buttonIcons = new WeakMap();
    this.lastTimelineSignature = '';
    this.globalRail = null;
    this.viewSwitch = null;
    this.timelineSummary = null;
    this.layout = null;
    this.linkedTarget = null;
    this.linkedCommentManuallyToggled = false;
    this.linkedTimelineManuallyToggled = false;
    this.lastLinkedTarget = null;
    this.lastLinkedLocation = '';
  }

  private readonly handleNavigation = (): void => {
    this.lastTimelineSignature = '';
    const location = this.pageWindow.location;
    if (`${location.pathname}${location.hash}` !== this.lastLinkedLocation) {
      this.linkedTarget = null;
      this.linkedCommentManuallyToggled = false;
      this.linkedTimelineManuallyToggled = false;
      this.lastLinkedTarget = null;
      this.lastLinkedLocation = '';
    }
    this.schedule();
  };

  private readonly handleImageLoad = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && target.matches('img') && target.closest('.tlpr-body')) {
      this.schedule();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') this.keyboardNavigation = true;
  };

  private readonly handlePointerDown = (): void => {
    this.keyboardNavigation = false;
  };

  private revealLinkedTarget(host: HTMLElement, comments: HTMLElement[]): HTMLElement | null {
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

    if (linkedLocation !== this.lastLinkedLocation) {
      this.linkedCommentManuallyToggled = false;
      this.linkedTimelineManuallyToggled = false;
    }
    this.lastLinkedLocation = linkedLocation;
    this.lastLinkedTarget = target;
    this.linkedTarget = this.linkedTimelineManuallyToggled ? null : target;
    const comment = comments.find((item) => item.contains(target) || target.contains(item));
    // Following a link is temporary: do not replace the user's saved preferences.
    if (comment && !this.linkedCommentManuallyToggled) this.paintComment(comment, false);
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
      const store: Store = {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return store;
      for (const [key, value] of Object.entries(parsed)) {
        if (!key.startsWith('/') || !value || typeof value !== 'object') continue;
        const state = value as Partial<PageState>;
        const comments = state.comments;
        if (!comments || typeof comments !== 'object' || Array.isArray(comments)) continue;
        store[key] = {
          comments: Object.fromEntries(
            Object.entries(comments).filter(([, collapsed]) => typeof collapsed === 'boolean'),
          ),
          timelineCollapsed: state.timelineCollapsed !== false,
        };
      }
      return store;
    } catch {
      return {};
    }
  }

  private saveStore(commentIds: string[] = [], timelineChanged = false): void {
    const merged = this.readStore();
    const currentPath = this.pageWindow.location.pathname.replace(/\/$/, '');
    const changedComments = this.pendingComments.get(currentPath) ?? new Set<string>();
    commentIds.forEach((id) => changedComments.add(id));
    this.pendingComments.set(currentPath, changedComments);
    if (timelineChanged) this.pendingTimelines.add(currentPath);
    for (const [key, current] of Object.entries(this.store)) {
      const baseline = this.savedStore[key];
      const latest = merged[key] ?? { comments: {}, timelineCollapsed: true };
      for (const [id, collapsed] of Object.entries(current.comments)) {
        if (baseline?.comments[id] !== collapsed || this.pendingComments.get(key)?.has(id)) {
          latest.comments[id] = collapsed;
        }
      }
      if (
        baseline?.timelineCollapsed !== current.timelineCollapsed ||
        this.pendingTimelines.has(key)
      ) {
        latest.timelineCollapsed = current.timelineCollapsed;
      }
      merged[key] = latest;
    }
    try {
      this.pageWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      this.store = merged;
      this.savedStore = structuredClone(merged);
      this.pendingComments.clear();
      this.pendingTimelines.clear();
    } catch {
      // Reading controls remain usable when site storage is blocked or full.
      // Retain the unsaved delta so a later successful write can persist it.
    }
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
    this.savedStore[key] = structuredClone(initial);
    return initial;
  }

  /** Body, header and anchor are cached for one synchronous scan only. */
  private factsOf(comment: HTMLElement): CommentFacts {
    const cached = this.scanFacts?.get(comment);
    if (cached) return cached;
    const body = findCommentBody(comment);
    const header = findCommentHeader(comment, body);
    const facts = { body, header, id: findCommentId(comment, header) };
    this.scanFacts?.set(comment, facts);
    return facts;
  }

  private getId(comment: HTMLElement): string | null {
    return this.factsOf(comment).id;
  }

  private bodyOf(comment: HTMLElement): HTMLElement | null {
    return this.factsOf(comment).body;
  }

  private headerOf(comment: HTMLElement): HTMLElement | null {
    return this.factsOf(comment).header;
  }

  private botComment(comment: HTMLElement): boolean {
    const header = this.headerOf(comment);
    if (header) return hasBotMarker(header);
    // Descriptions have no comment header: their author is shown in the page header.
    if (!comment.matches(DESCRIPTION_SELECTOR)) return false;
    const pageHeader =
      this.pageDocument.querySelector('[data-testid="issue-header"]') ??
      this.pageDocument
        .querySelector('h1')
        ?.closest('[data-component="PageHeader"], .gh-header, header') ??
      null;
    return hasBotMarker(pageHeader);
  }

  private editableComment(comment: HTMLElement): boolean {
    const cached = this.scanEditors?.get(comment);
    if (cached !== undefined) return cached;
    const active = hasActiveCommentEditor(comment, this.pageWindow);
    this.scanEditors?.set(comment, active);
    return active;
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
    const button =
      this.enhancedButtons.get(comment) ??
      comment.querySelector<HTMLButtonElement>('.tlpr-comment-toggle');
    if (!body) return;

    body.classList.add('tlpr-body');
    body.dataset.tlprCollapsed = collapsed ? '1' : '0';
    body.style.removeProperty('--tlpr-reveal-proximity');

    if (button?.isConnected && comment.contains(button)) {
      const label = collapsed ? message('expand') : message('collapse');
      this.renderButton(button, icons.down, label);
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  }

  private setComment(comment: HTMLElement, collapsed: boolean): void {
    if (this.destroyed || this.botComment(comment) || this.editableComment(comment)) return;
    const id = this.getId(comment);
    if (!id) return;

    if (this.lastLinkedTarget && comment.contains(this.lastLinkedTarget)) {
      this.linkedCommentManuallyToggled = true;
    }
    this.getPageState().comments[id] = collapsed;
    this.saveStore([id]);
    this.paintComment(comment, collapsed);
    this.discardOwnMutations();
  }

  private reconcileBodyTarget(
    body: HTMLElement,
    button: HTMLButtonElement,
    commentId: string,
  ): void {
    if (!body.id) {
      body.id = `tlpr-body-${commentId}`;
      body.dataset.tlprGeneratedId = body.id;
    } else if (body.dataset.tlprGeneratedId && body.dataset.tlprGeneratedId !== body.id) {
      // The application replaced our generated ID; it now owns the current one.
      delete body.dataset.tlprGeneratedId;
    }
    if (button.getAttribute('aria-controls') !== body.id)
      button.setAttribute('aria-controls', body.id);
  }

  /** Saved choice, temporary link expansion, or the automatic length rule (a layout read). */
  private defaultState(comment: HTMLElement): boolean {
    const id = this.getId(comment);
    const body = this.bodyOf(comment);
    if (!id || !body) return false;
    const keepLinkedExpansion =
      this.lastLinkedTarget &&
      comment.contains(this.lastLinkedTarget) &&
      !this.linkedCommentManuallyToggled;
    if (keepLinkedExpansion) return false;
    const saved = this.getPageState().comments[id];
    return typeof saved === 'boolean' ? saved : body.scrollHeight > LONG_COMMENT_PX;
  }

  /** Where the comment toggle lives: the header's action area or a TL;PR bar. */
  private controlSlotOf(comment: HTMLElement, header: HTMLElement | null): HTMLElement | null {
    if (header) {
      for (const selector of HEADER_SLOTS) {
        const slot = header.querySelector<HTMLElement>(selector);
        if (slot) return slot;
      }
      return header;
    }
    if (!comment.matches(DESCRIPTION_SELECTOR)) return null;
    const existing = [...comment.children].find((child) =>
      child.classList.contains('tlpr-comment-bar'),
    );
    if (existing instanceof HTMLElement) return existing;
    const bar = this.pageDocument.createElement('div');
    bar.className = 'tlpr-comment-bar';
    comment.prepend(bar);
    return bar;
  }

  private enhanceComment(comment: HTMLElement, collapsed: boolean): void {
    if (this.botComment(comment) || this.editableComment(comment)) return;

    const id = this.getId(comment);
    const body = this.bodyOf(comment);
    const header = this.headerOf(comment);
    if (!id || !body || (!header && !comment.matches(DESCRIPTION_SELECTOR))) return;
    const enhancedButton = this.enhancedButtons.get(comment);
    if (
      comment.dataset.tlprEnhanced === '1' &&
      enhancedButton?.isConnected &&
      comment.querySelector('.tlpr-comment-toggle') === enhancedButton &&
      (header ? header.contains(enhancedButton) : !body.contains(enhancedButton)) &&
      this.enhancedBodies.get(comment) === body
    ) {
      // Reconcile extension-owned effects as well as node identity: hydration may
      // replace className or id without replacing the body or its control.
      this.reconcileBodyTarget(body, enhancedButton, id);
      if (
        !body.classList.contains('tlpr-body') ||
        body.dataset.tlprCollapsed !== (collapsed ? '1' : '0')
      ) {
        this.paintComment(comment, collapsed);
      }
      return;
    }

    const slot = this.controlSlotOf(comment, header);
    if (!slot) return;
    comment.dataset.tlprEnhanced = '1';
    this.enhancedBodies.set(comment, body);
    (header ?? slot)
      .querySelectorAll('.tlpr-control, .tlpr-comment-toggle')
      .forEach((node) => node.remove());

    const control = this.pageDocument.createElement('span');
    control.className = 'tlpr-control';
    const button = this.makeButton(icons.down, message('collapse'), 'tlpr-btn tlpr-comment-toggle');
    this.reconcileBodyTarget(body, button, id);
    control.append(button);
    if (slot.matches(HEADER_SLOT_SELECTOR)) slot.prepend(control);
    else slot.append(control);
    this.enhancedButtons.set(comment, button);
    this.paintComment(comment, collapsed);

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
      this.bodyListeners.set(body, () => {
        body.removeEventListener('click', handleClick);
        body.removeEventListener('focusin', handleFocus);
        body.removeEventListener('pointermove', handlePointerMove);
        body.removeEventListener('pointerleave', clearRevealCue);
        body.removeEventListener('pointercancel', clearRevealCue);
        body.removeEventListener('pointerdown', clearRevealCue);
        clearRevealCue();
        if (this.enhancedBodies.get(comment) === body) this.enhancedBodies.delete(comment);
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

  private getTimelineItems(root: HTMLElement): HTMLElement[] {
    const raw = [...root.querySelectorAll<HTMLElement>(TIMELINE_ITEM_SELECTOR)];
    const unique = [
      ...new Set(raw.map((item) => item.closest<HTMLElement>(TIMELINE_CONTAINER_SELECTOR) ?? item)),
    ];

    const candidates = new Set(unique);
    return unique.filter((item) => {
      if (
        !item.parentElement ||
        item.classList.contains('tlpr-timeline-summary') ||
        item.classList.contains('tlpr-toolbar')
      )
        return false;
      for (
        let ancestor: HTMLElement | null = item.parentElement;
        ancestor && ancestor !== root;
        ancestor = ancestor.parentElement
      ) {
        if (candidates.has(ancestor)) return false;
      }
      return true;
    });
  }

  private clearTimelineControls(root: HTMLElement): void {
    root.querySelectorAll('.tlpr-timeline-summary').forEach((node) => node.remove());
    root.querySelectorAll('.tlpr-timeline-hidden').forEach((item) => {
      item.classList.remove('tlpr-timeline-hidden');
    });
  }

  private renderViewSwitch(rail: HTMLElement, layout: ConversationLayout): void {
    const target = alternateViewUrl(this.pageWindow.location, layout.kind);
    if (!target) {
      this.viewSwitch?.remove();
      this.viewSwitch = null;
      return;
    }
    const label = message(layout.kind === 'overview' ? 'viewClassic' : 'viewOverview');
    if (!this.viewSwitch || !rail.contains(this.viewSwitch)) {
      this.viewSwitch?.remove();
      const link = this.pageDocument.createElement('a');
      link.className = 'tlpr-btn tlpr-view-switch';
      link.innerHTML = icons.view;
      link.append(this.pageDocument.createElement('span'));
      rail.append(link);
      this.viewSwitch = link;
    }
    const link = this.viewSwitch;
    if (link.getAttribute('href') !== target.href) link.href = target.href;
    if (link.title !== label) {
      link.title = label;
      link.setAttribute('aria-label', label);
      link.lastElementChild!.textContent = label;
    }
  }

  private renderGlobalRail(host: HTMLElement, layout: ConversationLayout): void {
    if (this.globalRail && host.querySelector('.tlpr-global-rail') === this.globalRail) {
      this.renderViewSwitch(this.globalRail, layout);
      return;
    }
    host.querySelectorAll('.tlpr-global-rail').forEach((node) => node.remove());
    this.removeMergeHelper?.();
    this.removeMergeHelper = null;
    this.viewSwitch = null;
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
      const changedIds: string[] = [];
      this.getHumanComments(host).forEach((comment) => {
        const id = this.getId(comment);
        if (id) {
          state.comments[id] = collapsed;
          changedIds.push(id);
        }
        this.paintComment(comment, collapsed);
      });
      state.timelineCollapsed = collapsed;
      if (this.lastLinkedLocation) {
        this.linkedCommentManuallyToggled = true;
        this.linkedTimelineManuallyToggled = true;
      }
      this.linkedTarget = null;
      this.saveStore(changedIds, true);
      if (this.layout) this.renderTimeline(this.layout, true);
      this.discardOwnMutations();
    };
    expand.addEventListener('click', () => apply(false));
    collapse.addEventListener('click', () => apply(true));
    rail.append(expand, collapse);
    host.prepend(rail);
    this.globalRail = rail;
    this.renderViewSwitch(rail, layout);
    if (this.options.mergeHelper && /\/pull\/\d+/.test(this.pageWindow.location.pathname)) {
      this.removeMergeHelper = mountMergeHelper(this.pageDocument, this.pageWindow, rail, {
        mergeInsert: message('mergeInsert'),
        mergeReplace: message('mergeReplace'),
        mergeInserted: message('mergeInserted'),
        mergeUndo: message('mergeUndo'),
        mergeUndone: message('mergeUndone'),
        mergeEdited: message('mergeEdited'),
        mergeFormUnavailable: message('mergeFormUnavailable'),
        mergeChooseSource: message('mergeChooseSource'),
        mergePreview: message('mergePreview'),
        mergeOpen: message('mergeOpen'),
        mergeTitle: message('mergeTitle'),
        mergeDetectedNotice: message('mergeDetectedNotice'),
        mergeCandidateLabel: message('mergeCandidateLabel'),
        mergeCandidateOption: message('mergeCandidateOption'),
        mergeCandidateLatest: message('mergeCandidateLatest'),
        mergeSubjectLabel: message('mergeSubjectLabel'),
        mergeDescriptionLabel: message('mergeDescriptionLabel'),
        mergePreviewLabel: message('mergePreviewLabel'),
        mergeMissingTitle: message('mergeMissingTitle'),
        mergeNoCandidates: message('mergeNoCandidates'),
        mergeViewSource: message('mergeViewSource'),
        mergeCopy: message('mergeCopy'),
        mergeCopying: message('mergeCopying'),
        mergeCopied: message('mergeCopied'),
        mergeCopyError: message('mergeCopyError'),
        mergeClose: message('mergeClose'),
      });
    }
  }

  private renderTimeline(layout: ConversationLayout, force = false): void {
    const root = layout.timeline;
    if (!root) return;
    const items = this.getTimelineItems(root);
    const isEditing = (item: HTMLElement): boolean =>
      [item, ...item.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)].some(
        (comment) => comment.matches(COMMENT_SELECTOR) && this.editableComment(comment),
      );
    const editingItems = new Set(items.filter(isEditing));
    const order = chronologyOf(items, layout);
    const signature = `${order}|${items
      .map((item) => {
        let identity = this.timelineNodeIds.get(item);
        if (identity === undefined) {
          identity = ++this.nextTimelineNodeId;
          this.timelineNodeIds.set(item, identity);
        }
        return `${identity}:${editingItems.has(item) ? 'editing' : 'reading'}`;
      })
      .join('|')}`;

    // Keep the chronological start and end: with newest-first lists, the oldest
    // items are at the bottom of the page.
    const keepStart =
      order === 'descending' ? KEEP_TRAILING_TIMELINE_ITEMS : KEEP_LEADING_TIMELINE_ITEMS;
    const keepEnd =
      order === 'descending' ? KEEP_LEADING_TIMELINE_ITEMS : KEEP_TRAILING_TIMELINE_ITEMS;
    const hidden = items
      .slice(keepStart, Math.max(keepStart, items.length - keepEnd))
      .filter((item) => !editingItems.has(item));
    const needsSummary = hidden.length > 0;
    if (
      !force &&
      signature === this.lastTimelineSignature &&
      (!needsSummary ||
        (this.timelineSummary &&
          root.querySelector('.tlpr-timeline-summary') === this.timelineSummary))
    ) {
      return;
    }
    this.lastTimelineSignature = signature;
    this.clearTimelineControls(root);
    this.timelineSummary = null;

    if (items.length <= KEEP_LEADING_TIMELINE_ITEMS + KEEP_TRAILING_TIMELINE_ITEMS) {
      return;
    }

    if (!needsSummary) return;
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
      hidden.forEach((item) =>
        item.classList.toggle('tlpr-timeline-hidden', collapsed && !isEditing(item)),
      );
    };
    paint();

    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      if (this.lastLinkedLocation) this.linkedTimelineManuallyToggled = true;
      this.linkedTarget = null;
      this.getPageState().timelineCollapsed = collapsed;
      this.saveStore([], true);
      // Update in place so keyboard focus and the icon transition survive the click.
      paint();
      this.discardOwnMutations();
    });
  }
}
