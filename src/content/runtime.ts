import type { Settings } from '../settings';
import { GitHubCommentCollapser } from './controller';
import { setLanguage } from './i18n';

export class ReadingRuntime {
  private controller: GitHubCommentCollapser | null = null;

  public constructor(
    private readonly pageDocument: Document = document,
    private readonly pageWindow: Window = window,
  ) {}

  public apply(settings: Settings): void {
    this.destroy();
    setLanguage(settings.language);
    if (!settings.enabled) return;
    const root = this.pageDocument.documentElement;
    root.dataset.tlprAnimations = settings.animations ? 'on' : 'off';
    root.dataset.tlprStateColors = settings.stateColors ? 'on' : 'off';
    this.controller = new GitHubCommentCollapser(this.pageDocument, this.pageWindow, {
      mergeHelper: settings.mergeHelper,
    });
    this.controller.start();
  }

  public destroy(): void {
    this.controller?.destroy();
    this.controller = null;
    delete this.pageDocument.documentElement.dataset.tlprAnimations;
    delete this.pageDocument.documentElement.dataset.tlprStateColors;
  }
}
