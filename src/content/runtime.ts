import type { Settings } from '../settings';
import { GitHubCommentCollapser } from './controller';
import { setLanguage } from './i18n';
import { isConversationLocation } from './routes';
import styles from './styles.css?inline';

export class ReadingRuntime {
  private controller: GitHubCommentCollapser | null = null;
  private style: HTMLStyleElement | null = null;

  public constructor(
    private readonly pageDocument: Document = document,
    private readonly pageWindow: Window = window,
    private readonly onOutOfScope?: () => void,
  ) {}

  public apply(settings: Settings): void {
    this.destroy();
    setLanguage(settings.language);
    if (!settings.enabled || !isConversationLocation(this.pageWindow.location)) return;
    this.style = this.pageDocument.createElement('style');
    this.style.dataset.tlprStyles = '';
    this.style.textContent = styles;
    this.pageDocument.head.append(this.style);
    const root = this.pageDocument.documentElement;
    root.dataset.tlprAnimations = settings.animations ? 'on' : 'off';
    root.dataset.tlprStateColors = settings.stateColors ? 'on' : 'off';
    this.controller = new GitHubCommentCollapser(this.pageDocument, this.pageWindow, {
      mergeHelper: settings.mergeHelper,
      onOutOfScope: () => {
        this.destroy();
        this.onOutOfScope?.();
      },
    });
    this.controller.start();
  }

  public destroy(): void {
    if (!this.controller && !this.style) return;
    this.controller?.destroy();
    this.style?.remove();
    this.style = null;
    this.controller = null;
    delete this.pageDocument.documentElement.dataset.tlprAnimations;
    delete this.pageDocument.documentElement.dataset.tlprStateColors;
  }
}
