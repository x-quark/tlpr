import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationBootstrap } from '../../src/content/bootstrap';
import { ReadingRuntime } from '../../src/content/runtime';
import { GitHubCommentCollapser } from '../../src/content/controller';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';

let bootstrap: ConversationBootstrap | undefined;
afterEach(() => bootstrap?.destroy());
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture() {
  document.body.innerHTML =
    '<main class="js-discussion"><article class="js-comment timeline-comment" id="issuecomment-1"><header class="timeline-comment-header">human</header><div class="comment-body">Text</div></article></main>';
}
function source(settings: Settings = DEFAULT_SETTINGS) {
  return { read: vi.fn(async () => settings), subscribe: vi.fn(() => vi.fn()) };
}
function navigate(path: string) {
  window.history.replaceState({}, '', path);
  document.dispatchEvent(new Event('turbo:load'));
}
describe('navigation-only bootstrap', () => {
  it('does not read content or storage or create an observer outside conversations', async () => {
    window.history.replaceState({}, '', '/x-quark/tlpr');
    const settings = source();
    const query = vi.spyOn(document, 'querySelector');
    const queryAll = vi.spyOn(document, 'querySelectorAll');
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    document.dispatchEvent(new Event('turbo:render'));
    await flush();
    expect(query).not.toHaveBeenCalled();
    expect(queryAll).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(settings.read).not.toHaveBeenCalled();
    expect(settings.subscribe).not.toHaveBeenCalled();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
  });
  it('enters once, leaves cleanly and restores on re-entry', async () => {
    fixture();
    window.history.replaceState({}, '', '/x-quark/tlpr');
    const settings = source();
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    navigate('/x-quark/tlpr/pull/1');
    await flush();
    expect(document.querySelectorAll('.tlpr-global-rail')).toHaveLength(1);
    expect(document.head.querySelectorAll('[data-tlpr-styles]')).toHaveLength(1);
    document.dispatchEvent(new Event('turbo:render'));
    await flush();
    expect(settings.read).toHaveBeenCalledTimes(1);
    navigate('/x-quark/tlpr');
    await flush();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
    navigate('/x-quark/tlpr/issues/2');
    await flush();
    expect(document.querySelectorAll('.tlpr-global-rail')).toHaveLength(1);
  });
  it('does not activate for malformed or unsupported routes', async () => {
    const settings = source();
    bootstrap = new ConversationBootstrap(document, window, settings);
    window.history.replaceState({}, '', '/');
    bootstrap.start();
    for (const path of [
      '/owner/repo/pulls',
      '/owner/repo/issues/new',
      '/extra/owner/repo/pull/1',
      '/owner/repo/pull/1evil',
      '/owner/repo/issues/1/anything',
      '/owner/repo/pull/1/checks',
    ])
      navigate(path);
    await flush();
    expect(settings.read).not.toHaveBeenCalled();
  });
  it('ignores a settings response that arrives after leaving the conversation', async () => {
    fixture();
    let resolve!: (value: Settings) => void;
    const settings = {
      read: () =>
        new Promise<Settings>((done) => {
          resolve = done;
        }),
      subscribe: () => () => {},
    };
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    navigate('/x-quark/tlpr');
    resolve(DEFAULT_SETTINGS);
    await flush();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
  });
  it('keeps disabled settings disabled through navigation', async () => {
    fixture();
    const settings = source({ ...DEFAULT_SETTINGS, enabled: false });
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    await flush();
    navigate('/x-quark/tlpr');
    navigate('/x-quark/tlpr/pull/1/files');
    await flush();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
  });
  it('guards the runtime itself from out-of-scope application', () => {
    window.history.replaceState({}, '', '/x-quark/tlpr');
    const runtime = new ReadingRuntime();
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    runtime.apply(DEFAULT_SETTINGS);
    runtime.destroy();
    expect(storage).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.tlprAnimations).toBeUndefined();
  });
  it('gives a newer settings notification priority over the initial read', async () => {
    fixture();
    let resolve!: (value: Settings) => void;
    let notify!: (value: Settings) => void;
    const settings = {
      read: () =>
        new Promise<Settings>((done) => {
          resolve = done;
        }),
      subscribe: (listener: (value: Settings) => void) => {
        notify = listener;
        return () => {};
      },
    };
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    notify({ ...DEFAULT_SETTINGS, enabled: false });
    resolve(DEFAULT_SETTINGS);
    await flush();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
  });

  it('ignores a stale entry response after a newer conversation is active', async () => {
    fixture();
    const pending: Array<(value: Settings) => void> = [];
    const settings = {
      read: () =>
        new Promise<Settings>((done) => {
          pending.push(done);
        }),
      subscribe: () => () => {},
    };
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    navigate('/x-quark/tlpr/pull/2');
    pending[1]!({ ...DEFAULT_SETTINGS, enabled: false });
    await flush();
    pending[0]!(DEFAULT_SETTINGS);
    await flush();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
  });

  it('unsubscribes on exit and ignores retained callbacks outside scope', async () => {
    fixture();
    let notify!: (value: Settings) => void;
    const unsubscribe = vi.fn();
    const settings = {
      read: async () => DEFAULT_SETTINGS,
      subscribe: (listener: (value: Settings) => void) => {
        notify = listener;
        return unsubscribe;
      },
    };
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    await flush();
    navigate('/x-quark/tlpr');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    const query = vi.spyOn(document, 'querySelector');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    notify(DEFAULT_SETTINGS);
    await flush();
    expect(query).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it('preserves saved manual choices after leaving and returning', async () => {
    fixture();
    bootstrap = new ConversationBootstrap(document, window, source());
    bootstrap.start();
    await flush();
    document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');
    navigate('/x-quark/tlpr');
    navigate('/x-quark/tlpr/issues/1');
    await flush();
    expect(document.querySelector<HTMLElement>('.comment-body')!.dataset.tlprCollapsed).toBe('1');
  });
  it('does not enhance a lookalike route during a delayed navigation event', () => {
    fixture();
    const controller = new GitHubCommentCollapser();
    controller.start();
    window.history.replaceState({}, '', '/extra/x-quark/tlpr/pull/1');
    controller.scan();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    controller.destroy();
  });

  it('honors a synchronous settings notification during subscription', async () => {
    fixture();
    const unsubscribe = vi.fn();
    const settings = {
      read: async () => DEFAULT_SETTINGS,
      subscribe: (listener: (value: Settings) => void) => {
        listener({ ...DEFAULT_SETTINGS, enabled: false });
        return unsubscribe;
      },
    };
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    await flush();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    navigate('/x-quark/tlpr');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the initial settings reader throws synchronously', () => {
    fixture();
    const settings = {
      read: (): Promise<Settings> => {
        throw new Error('Unavailable');
      },
      subscribe: () => () => {},
    };
    bootstrap = new ConversationBootstrap(document, window, settings);
    expect(() => bootstrap!.start()).not.toThrow();
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
  });
  it('disconnects immediately on an off-route mutation before the navigation event and can re-enter', async () => {
    fixture();
    const unsubscribe = vi.fn();
    const settings = { read: async () => DEFAULT_SETTINGS, subscribe: () => unsubscribe };
    bootstrap = new ConversationBootstrap(document, window, settings);
    bootstrap.start();
    await flush();
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    window.history.replaceState({}, '', '/x-quark/tlpr');
    document.body.append(document.createElement('div'));
    await flush();
    expect(disconnect).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.tlpr-global-rail')).toBeNull();
    expect(document.head.querySelector('[data-tlpr-styles]')).toBeNull();
    navigate('/x-quark/tlpr/issues/1');
    await flush();
    expect(document.querySelectorAll('.tlpr-global-rail')).toHaveLength(1);
  });
});
