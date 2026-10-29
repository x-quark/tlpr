import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountPopup } from '../../src/popup/popup';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';

const key = 'tlpr-settings:v1';
let stored: Settings;
let readError: boolean;
let writeError: boolean;
let pendingRead: Promise<void> | undefined;
let cleanup: (() => void) | undefined;
let subscribers: Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>;

function control(name: keyof Settings): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!element) throw new Error(`Missing ${name} control`);
  return element;
}

function languageControl(value: Settings['language']): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(`[data-language="${value}"]`);
  if (!element) throw new Error(`Missing ${value} language radio`);
  return element;
}

function toggle(name: Exclude<keyof Settings, 'language'>, value: boolean): void {
  const element = control(name) as HTMLInputElement;
  element.checked = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync('src/popup/index.html', 'utf8');
  Object.defineProperty(chrome, 'runtime', {
    configurable: true,
    value: { getManifest: () => ({ version: '9.8.7' }) },
  });
  stored = { ...DEFAULT_SETTINGS, language: 'auto' };
  readError = false;
  writeError = false;
  pendingRead = undefined;
  subscribers = new Set();
  Object.defineProperty(chrome, 'storage', {
    configurable: true,
    value: {
      local: {
        async get() {
          await pendingRead;
          if (readError) throw new Error('Unavailable');
          return { [key]: stored };
        },
        async set(items: Record<string, Settings>) {
          if (writeError) throw new Error('Unavailable');
          stored = items[key]!;
          for (const listener of subscribers) listener({ [key]: { newValue: stored } }, 'local');
        },
      },
      onChanged: {
        addListener(listener: typeof subscribers extends Set<infer T> ? T : never) {
          subscribers.add(listener);
        },
        removeListener(listener: typeof subscribers extends Set<infer T> ? T : never) {
          subscribers.delete(listener);
        },
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup?.();
  vi.useRealTimers();
  delete (chrome.i18n as Partial<typeof chrome.i18n>).getUILanguage;
  cleanup = undefined;
});

describe('toolbar popup', () => {
  it('starts new installs in browser-detection mode and renders the select arrow as a stable SVG', async () => {
    stored = { ...DEFAULT_SETTINGS };
    cleanup = await mountPopup(document);
    expect(stored.language).toBe('auto');
    expect(document.querySelector('#language-value')?.textContent).toBe('Browser default');
    const chevron = document.querySelector('[data-language-toggle] svg');
    expect(chevron?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('[data-language-toggle]')?.textContent).not.toContain('⌄');
  });

  it.each([
    ['fr-FR', 'fr', 'Infos'],
    ['en-US', 'en', 'Info'],
    ['de-DE', 'en', 'Info'],
  ])(
    'detects browser UI %s as %s with English fallback for unsupported locales',
    async (browserLocale, expectedLanguage, infoLabel) => {
      stored = { ...DEFAULT_SETTINGS };
      Object.defineProperty(chrome.i18n, 'getUILanguage', {
        configurable: true,
        value: () => browserLocale,
      });
      vi.spyOn(chrome.i18n, 'getMessage').mockReturnValue('');
      cleanup = await mountPopup(document);
      expect(document.documentElement.lang).toBe(expectedLanguage);
      expect(document.querySelector('[data-info-toggle]')?.textContent).toBe(infoLabel);
      expect(stored.language).toBe('auto');
      delete (chrome.i18n as Partial<typeof chrome.i18n>).getUILanguage;
    },
  );

  it('keeps secondary information collapsed and reads the installed version from the manifest', async () => {
    cleanup = await mountPopup(document);
    const button = document.querySelector<HTMLButtonElement>('[data-info-toggle]')!;
    const panel = document.querySelector<HTMLElement>('#popup-info')!;
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.querySelector('[data-version]')?.textContent).toBe('9.8.7');
    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(panel.hidden).toBe(true);
  });

  it('closes information with Escape, restores button focus, and cleans up listeners', async () => {
    cleanup = await mountPopup(document);
    const button = document.querySelector<HTMLButtonElement>('[data-info-toggle]')!;
    const panel = document.querySelector<HTMLElement>('#popup-info')!;
    button.focus();
    button.click();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    cleanup();
    cleanup = undefined;
    button.click();
    expect(panel.hidden).toBe(true);
  });

  it('keeps information usable when storage fails and localizes the popover after a selection', async () => {
    readError = true;
    cleanup = await mountPopup(document);
    const button = document.querySelector<HTMLButtonElement>('[data-info-toggle]')!;
    const panel = document.querySelector<HTMLElement>('#popup-info')!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('9.8.7');
    readError = false;
    document.querySelector<HTMLButtonElement>('[data-retry]')!.click();
    await vi.waitFor(() => expect(control('enabled').disabled).toBe(false));
    document.querySelector<HTMLButtonElement>('[data-language-toggle]')!.click();
    languageControl('fr').click();
    await vi.waitFor(() => expect(stored.language).toBe('fr'));
    expect(panel.hidden).toBe(true);
    button.click();
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('À propos');
    expect(panel.querySelector('[data-version]')?.textContent).toBe('9.8.7');
  });

  it('opens help only over the text, never the row, switch, or help buttons', async () => {
    cleanup = await mountPopup(document);
    const label = document.querySelector<HTMLElement>('label[for="enabled"]')!;
    const row = label.closest<HTMLElement>('.setting-row')!;
    const tooltip = row.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(document.querySelector('.help-trigger')).toBeNull();
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.hidden).toBe(true);
    control('enabled').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    control('enabled').focus();
    expect(tooltip.hidden).toBe(true);
    label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.hidden).toBe(false);
    label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: row }));
    await vi.waitFor(() => expect(tooltip.hidden).toBe(true));
    expect(document.querySelector('#popup-info dl')).toBeNull();
    expect(document.querySelector('#preferences-title')).toBeNull();
  });

  it('never reveals help for focused text after another title hover and preserves Escape dismissal', async () => {
    cleanup = await mountPopup(document);
    const first = document.querySelector<HTMLElement>('label[for="enabled"]')!;
    const second = document.querySelector<HTMLElement>('label[for="animations"]')!;
    const firstHelp = document.getElementById('enabled-description')!;
    const secondHelp = document.getElementById('animations-description')!;
    first.focus();
    expect(firstHelp.hidden).toBe(true);
    second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(secondHelp.hidden).toBe(false);
    expect(firstHelp.hidden).toBe(true);
    second.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
    );
    expect(document.activeElement).toBe(first);
    await vi.waitFor(() => expect(secondHelp.hidden).toBe(true));
    expect(firstHelp.hidden).toBe(true);
    first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(firstHelp.hidden).toBe(false);
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(firstHelp.hidden).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(stored).toEqual({ ...DEFAULT_SETTINGS, language: 'auto' });
  });

  it('retains hovered text help when focus leaves another title and supports hovering the tooltip', async () => {
    cleanup = await mountPopup(document);
    const first = document.querySelector<HTMLElement>('label[for="enabled"]')!;
    const second = document.querySelector<HTMLElement>('label[for="animations"]')!;
    const firstHelp = document.getElementById('enabled-description')!;
    first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    second.focus();
    control('animations').focus();
    expect(firstHelp.hidden).toBe(false);
    first.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: firstHelp }));
    firstHelp.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: first }));
    expect(firstHelp.hidden).toBe(false);
    firstHelp.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
    );
    await vi.waitFor(() => expect(firstHelp.hidden).toBe(true));
  });

  it('keeps help open across the padding corridor, cancels closing on tooltip entry, and clears timers', async () => {
    cleanup = await mountPopup(document);
    vi.useFakeTimers();
    const label = document.querySelector<HTMLElement>('label[for="enabled"]')!;
    const row = label.closest<HTMLElement>('.setting-row')!;
    const tooltip = document.getElementById('enabled-description')!;
    label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: row }));
    vi.advanceTimersByTime(100);
    expect(tooltip.hidden).toBe(false);
    tooltip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: row }));
    vi.advanceTimersByTime(500);
    expect(tooltip.hidden).toBe(false);
    tooltip.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
    );
    vi.advanceTimersByTime(300);
    expect(tooltip.hidden).toBe(true);
    label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: row }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tooltip.hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: row }));
    cleanup();
    cleanup = undefined;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('loads saved preferences into native, labelled switches and a labelled language radio group', async () => {
    stored = { ...DEFAULT_SETTINGS, enabled: false, language: 'en', animations: false };
    cleanup = await mountPopup(document);
    expect((control('enabled') as HTMLInputElement).checked).toBe(false);
    expect((control('animations') as HTMLInputElement).checked).toBe(false);
    expect((control('mergeHelper') as HTMLInputElement).checked).toBe(false);
    expect(languageControl('en').getAttribute('aria-selected') === 'true').toBe(true);
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('[role="listbox"]')?.getAttribute('aria-labelledby')).toBe(
      'language-label',
    );
    for (const input of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      expect(input.type).toBe('checkbox');
      expect(input.getAttribute('role')).toBe('switch');
      expect(document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBeTruthy();
      expect(input.disabled).toBe(false);
    }
    expect(document.body.textContent).toContain('Never merges a pull request.');
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('false');
  });

  it('persists every switch without a permanent saved message', async () => {
    cleanup = await mountPopup(document);
    for (const name of ['enabled', 'animations', 'stateColors', 'mergeHelper'] as const) {
      const next = !stored[name];
      toggle(name, next);
      await vi.waitFor(() => expect(stored[name]).toBe(next));
      await vi.waitFor(() => expect(control(name).disabled).toBe(false));
    }
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('changes the popup language immediately after a successful save', async () => {
    cleanup = await mountPopup(document);
    document.querySelector<HTMLButtonElement>('[data-language-toggle]')!.click();
    languageControl('fr').click();
    await vi.waitFor(() => expect(stored.language).toBe('fr'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('Aide à la lecture'));
    expect(document.documentElement.lang).toBe('fr');
    expect(document.title).toBe('Réglages de lecture TL;PR');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('offers one closed select, opens the current option, and supports keyboard navigation without saving until chosen', async () => {
    cleanup = await mountPopup(document);
    const toggle = document.querySelector<HTMLButtonElement>('[data-language-toggle]')!;
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(list.hidden).toBe(true);
    expect(toggle.textContent).toContain('Browser default');
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    toggle.focus();
    toggle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(list.hidden).toBe(false);
    expect(document.activeElement).toBe(languageControl('auto'));
    languageControl('auto').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(languageControl('fr'));
    expect(stored.language).toBe('auto');
    languageControl('fr').click();
    await vi.waitFor(() => expect(stored.language).toBe('fr'));
    await vi.waitFor(() => expect(toggle.disabled).toBe(false));
    expect(list.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.textContent).toContain('Français');
  });

  it('dismisses the language list and anchored Info popover with Escape or outside click', async () => {
    cleanup = await mountPopup(document);
    const toggle = document.querySelector<HTMLButtonElement>('[data-language-toggle]')!;
    const info = document.querySelector<HTMLButtonElement>('[data-info-toggle]')!;
    toggle.click();
    languageControl('auto').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    document.body.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    info.click();
    expect(document.querySelector('#popup-info')?.getAttribute('role')).toBe('dialog');
    document.body.click();
    expect(info.getAttribute('aria-expanded')).toBe('false');
  });

  it('disables every segment while saving and restores the previous selection on failure', async () => {
    cleanup = await mountPopup(document);
    writeError = true;
    document.querySelector<HTMLButtonElement>('[data-language-toggle]')!.click();
    languageControl('fr').click();
    for (const radio of document.querySelectorAll<HTMLButtonElement>('[data-language]'))
      expect(radio.disabled).toBe(true);
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save'),
    );
    expect(languageControl('auto').getAttribute('aria-selected') === 'true').toBe(true);
    expect(languageControl('fr').getAttribute('aria-selected') === 'true').toBe(false);
    expect(document.querySelector<HTMLButtonElement>('[data-language-toggle]')!.disabled).toBe(
      false,
    );
    expect(stored.language).toBe('auto');
  });

  it('does not animate or enable language segments before stored preferences arrive', async () => {
    let finishRead: (() => void) | undefined;
    pendingRead = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    const mounted = mountPopup(document);
    expect(document.querySelector('main')?.classList.contains('popup-enter')).toBe(false);
    for (const radio of document.querySelectorAll<HTMLButtonElement>('[data-language]'))
      expect(radio.disabled).toBe(true);
    finishRead?.();
    cleanup = await mounted;
    expect(document.querySelector('main')?.classList.contains('popup-enter')).toBe(true);
    expect(languageControl('auto').disabled).toBe(false);
  });

  it('only enters with motion after loading an animation-enabled preference', async () => {
    cleanup = await mountPopup(document);
    const main = document.querySelector('main')!;
    expect(main.classList.contains('popup-enter')).toBe(true);
    main.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(main.classList.contains('popup-enter')).toBe(false);
    toggle('animations', false);
    await vi.waitFor(() => expect(stored.animations).toBe(false));
    await vi.waitFor(() => expect(control('animations').disabled).toBe(false));
    toggle('animations', true);
    await vi.waitFor(() => expect(stored.animations).toBe(true));
    expect(main.classList.contains('popup-enter')).toBe(false);
  });

  it('skips popup entry motion when animations are off', async () => {
    stored.animations = false;
    cleanup = await mountPopup(document);
    expect(document.querySelector('main')?.classList.contains('popup-enter')).toBe(false);
    expect(document.documentElement.dataset.animations).toBe('false');
  });

  it('skips popup entry motion when reduced motion is preferred', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    cleanup = await mountPopup(document);
    expect(document.querySelector('main')?.classList.contains('popup-enter')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('keeps preferences disabled after load failure and supports retry', async () => {
    readError = true;
    cleanup = await mountPopup(document);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    const retry = document.querySelector<HTMLButtonElement>('[data-retry]')!;
    expect(retry.hidden).toBe(false);
    readError = false;
    retry.click();
    await vi.waitFor(() =>
      expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false),
    );
    expect(retry.hidden).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('');
  });

  it('restores the saved preference and reports a failed write', async () => {
    cleanup = await mountPopup(document);
    writeError = true;
    toggle('enabled', false);
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save'),
    );
    expect((control('enabled') as HTMLInputElement).checked).toBe(true);
    expect(stored.enabled).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('reflects settings from another extension context and releases listeners', async () => {
    cleanup = await mountPopup(document);
    stored = { ...stored, enabled: false, language: 'fr' };
    for (const listener of subscribers) listener({ [key]: { newValue: stored } }, 'local');
    expect((control('enabled') as HTMLInputElement).checked).toBe(false);
    expect(document.body.textContent).toContain('En pause');
    cleanup();
    cleanup = undefined;
    expect(subscribers.size).toBe(0);
  });

  it('keeps a newer cross-context language choice when the initial read resolves with stale settings', async () => {
    let resolve!: (value: Record<string, Settings>) => void;
    vi.spyOn(chrome.storage.local, 'get').mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const mounting = mountPopup(document);
    stored = { ...DEFAULT_SETTINGS, language: 'fr', mergeHelper: true };
    for (const listener of subscribers) listener({ [key]: { newValue: stored } }, 'local');
    resolve({ [key]: { ...DEFAULT_SETTINGS, language: 'en' } });
    cleanup = await mounting;
    expect(document.documentElement.lang).toBe('fr');
    expect(languageControl('fr').getAttribute('aria-selected')).toBe('true');
    expect(control('mergeHelper').checked).toBe(true);
    expect(control('mergeHelper').disabled).toBe(false);
  });

  it('settles an in-flight preference write without touching a disposed popup', async () => {
    cleanup = await mountPopup(document);
    let resolve!: () => void;
    pendingRead = new Promise<void>((done) => {
      resolve = done;
    });
    toggle('animations', false);
    cleanup();
    cleanup = undefined;
    expect(subscribers.size).toBe(0);
    const markup = document.documentElement.outerHTML;
    resolve();
    await vi.waitFor(() => expect(stored.animations).toBe(false));
    expect(document.documentElement.outerHTML).toBe(markup);
  });

  it('ships without remote resources, inline code, or form submission', async () => {
    cleanup = await mountPopup(document);
    for (const node of document.querySelectorAll('[src], [href]')) {
      expect(node.getAttribute('src') ?? node.getAttribute('href')).not.toMatch(/^(https?:)?\/\//);
    }
    for (const script of document.scripts) expect(script.textContent?.trim()).toBe('');
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    document.querySelector('form')!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });
});
