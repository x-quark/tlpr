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

function languageControl(value: Settings['language']): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(
    `input[name="language"][value="${value}"]`,
  );
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
  stored = { ...DEFAULT_SETTINGS };
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
  cleanup = undefined;
});

describe('toolbar popup', () => {
  it('loads saved preferences into native, labelled switches and a labelled language radio group', async () => {
    stored = { ...DEFAULT_SETTINGS, enabled: false, language: 'en', animations: false };
    cleanup = await mountPopup(document);
    expect((control('enabled') as HTMLInputElement).checked).toBe(false);
    expect((control('animations') as HTMLInputElement).checked).toBe(false);
    expect((control('mergeHelper') as HTMLInputElement).checked).toBe(false);
    expect(languageControl('en').checked).toBe(true);
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBe(
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

  it('persists every switch and displays a saved confirmation', async () => {
    cleanup = await mountPopup(document);
    for (const name of ['enabled', 'animations', 'stateColors', 'mergeHelper'] as const) {
      const next = !stored[name];
      toggle(name, next);
      await vi.waitFor(() => expect(stored[name]).toBe(next));
      await vi.waitFor(() => expect(control(name).disabled).toBe(false));
    }
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Preferences saved');
  });

  it('changes the popup language immediately after a successful save', async () => {
    cleanup = await mountPopup(document);
    languageControl('fr').click();
    await vi.waitFor(() => expect(stored.language).toBe('fr'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('Aide à la lecture'));
    expect(document.documentElement.lang).toBe('fr');
    expect(document.title).toBe('Réglages de lecture TL;PR');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Préférences enregistrées');
  });

  it('provides full language labels and one keyboard tab stop for the radio group', async () => {
    cleanup = await mountPopup(document);
    expect(
      [...document.querySelectorAll<HTMLInputElement>('input[name="language"]')].map(
        (radio) => radio.type,
      ),
    ).toEqual(['radio', 'radio', 'radio']);
    expect(languageControl('auto').checked).toBe(true);
    expect(languageControl('auto').tabIndex).toBe(0);
    expect(languageControl('en').tabIndex).toBe(-1);
    expect(languageControl('fr').tabIndex).toBe(-1);
    expect(document.querySelector('label[for="language-auto"]')?.textContent).toContain(
      'Browser default',
    );
    expect(document.querySelector('label[for="language-en"]')?.textContent).toContain('English');
    expect(document.querySelector('label[for="language-fr"]')?.textContent).toContain('Français');
  });

  it('moves and wraps between language segments with arrow keys and preserves focus after saving', async () => {
    cleanup = await mountPopup(document);
    const automatic = languageControl('auto');
    automatic.focus();
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    automatic.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(stored.language).toBe('fr'));
    await vi.waitFor(() => expect(languageControl('fr').disabled).toBe(false));
    expect(document.activeElement).toBe(languageControl('fr'));
    expect(languageControl('fr').tabIndex).toBe(0);
    languageControl('fr').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(stored.language).toBe('en'));
    await vi.waitFor(() => expect(languageControl('en').disabled).toBe(false));
    languageControl('en').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(stored.language).toBe('auto'));
  });

  it('disables every segment while saving and restores the previous selection on failure', async () => {
    cleanup = await mountPopup(document);
    writeError = true;
    languageControl('fr').click();
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="language"]'))
      expect(radio.disabled).toBe(true);
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save'),
    );
    expect(languageControl('auto').checked).toBe(true);
    expect(languageControl('fr').checked).toBe(false);
    expect(languageControl('auto').tabIndex).toBe(0);
    expect(stored.language).toBe('auto');
  });

  it('does not animate or enable language segments before stored preferences arrive', async () => {
    let finishRead: (() => void) | undefined;
    pendingRead = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    const mounted = mountPopup(document);
    expect(document.querySelector('main')?.classList.contains('popup-enter')).toBe(false);
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="language"]'))
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
