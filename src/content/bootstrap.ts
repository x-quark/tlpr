import { readSettings, subscribeSettings, type Settings } from '../settings';
import { isConversationLocation } from './routes';
import { ReadingRuntime } from './runtime';

interface SettingsSource {
  read(): Promise<Settings>;
  subscribe(listener: (settings: Settings) => void): () => void;
}
const navigationEvents = ['turbo:load', 'turbo:render', 'soft-nav:success'] as const;

/** Outside conversations this object only reads the URL and listens for navigation. */
export class ConversationBootstrap {
  private started = false;
  private activePath = '';
  private generation = 0;
  private runtime: ReadingRuntime | null = null;
  private unsubscribe: (() => void) | null = null;

  public constructor(
    private readonly pageDocument: Document = document,
    private readonly pageWindow: Window = window,
    private readonly settingsSource: SettingsSource = {
      read: readSettings,
      subscribe: subscribeSettings,
    },
  ) {}

  public start(): void {
    if (this.started) return;
    this.started = true;
    for (const name of navigationEvents) this.pageDocument.addEventListener(name, this.reconcile);
    this.pageWindow.addEventListener('popstate', this.reconcile);
    this.pageWindow.addEventListener('hashchange', this.reconcile);
    this.reconcile();
  }

  public destroy(): void {
    this.started = false;
    for (const name of navigationEvents)
      this.pageDocument.removeEventListener(name, this.reconcile);
    this.pageWindow.removeEventListener('popstate', this.reconcile);
    this.pageWindow.removeEventListener('hashchange', this.reconcile);
    this.leave();
  }

  private leave(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runtime?.destroy();
    this.runtime = null;
    this.activePath = '';
  }

  private readonly reconcile = (): void => {
    if (!this.started) return;
    const location = this.pageWindow.location;
    if (!isConversationLocation(location)) {
      if (this.runtime) this.leave();
      return;
    }
    if (this.activePath === location.pathname) return;
    this.leave();
    this.activePath = location.pathname;
    const generation = this.generation;
    const runtime = new ReadingRuntime(this.pageDocument, this.pageWindow, () => this.leave());
    this.runtime = runtime;
    let revision = 0;
    const current = (): boolean =>
      generation === this.generation &&
      this.started &&
      isConversationLocation(this.pageWindow.location) &&
      this.pageWindow.location.pathname === this.activePath;
    try {
      this.unsubscribe = this.settingsSource.subscribe((settings) => {
        revision += 1;
        if (current()) runtime.apply(settings);
      });
    } catch {
      // A successful initial read can still provide settings if subscription is unavailable.
    }
    const onReadFailure = (): void => {
      if (current() && revision === 0) runtime.destroy();
    };
    try {
      void this.settingsSource
        .read()
        .then((settings) => {
          if (current() && revision === 0) runtime.apply(settings);
        })
        .catch(onReadFailure);
    } catch {
      onReadFailure();
    }
  };
}
