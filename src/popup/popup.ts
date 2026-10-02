import { message, setLanguage, type MessageKey } from '../content/i18n';
import {
  DEFAULT_SETTINGS,
  readSettings,
  saveSettings,
  subscribeSettings,
  type Settings,
} from '../settings';

export async function mountPopup(root: Document): Promise<() => void> {
  const main = root.querySelector<HTMLElement>('main')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const fieldset = root.querySelector<HTMLFieldSetElement>('fieldset')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const error = root.querySelector<HTMLElement>('[role="alert"]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]')!;
  const activity = root.querySelector<HTMLElement>('[data-activity]')!;
  const controls = [...root.querySelectorAll<HTMLInputElement>('input[name]')];
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let disposed = false;
  let loaded = false;
  let revision = 0;

  function render(next: Settings): void {
    settings = next;
    setLanguage(next.language);
    root.title = message('popupTitle');
    const browserLanguage = chrome.i18n.getUILanguage?.() ?? navigator.language;
    root.documentElement.lang =
      next.language === 'auto'
        ? browserLanguage.toLowerCase().startsWith('fr')
          ? 'fr'
          : 'en'
        : next.language;
    root.documentElement.dataset.animations = String(next.animations);
    if (!next.animations) main.classList.remove('popup-enter');
    for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      element.textContent = message(element.dataset.i18n as MessageKey);
    }
    for (const control of controls) {
      if (control.type === 'radio') {
        control.checked = control.value === next.language;
        control.tabIndex = control.checked ? 0 : -1;
      } else control.checked = next[control.name as Exclude<keyof Settings, 'language'>];
    }
    activity.textContent = message(next.enabled ? 'popupOn' : 'popupOff');
    activity.dataset.enabled = String(next.enabled);
  }

  function busy(value: boolean): void {
    form.setAttribute('aria-busy', String(value));
    fieldset.disabled = value || !loaded;
    for (const control of controls) control.disabled = value || !loaded;
    retry.disabled = value;
  }

  async function load(): Promise<void> {
    busy(true);
    error.textContent = '';
    status.textContent = message('popupLoading');
    const startRevision = revision;
    try {
      const next = await readSettings();
      if (disposed) return;
      if (startRevision === revision) render(next);
      if (
        !loaded &&
        settings.animations &&
        !root.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        main.classList.add('popup-enter');
      }
      loaded = true;
      retry.hidden = true;
      status.textContent = '';
    } catch {
      if (disposed) return;
      error.textContent = message('popupLoadError');
      status.textContent = '';
      retry.hidden = false;
    } finally {
      if (!disposed) busy(false);
    }
  }

  async function change(event: Event): Promise<void> {
    const control = event.target;
    if (!(control instanceof HTMLInputElement)) return;
    if (!loaded || form.getAttribute('aria-busy') === 'true') return;
    const name = control.name as keyof Settings;
    if (control.type === 'radio' && !control.checked) return;
    const value = control.type === 'radio' ? control.value : control.checked;
    const restoreFocus = root.activeElement === control;
    busy(true);
    error.textContent = '';
    status.textContent = message('popupSaving');
    try {
      const next = await saveSettings({ [name]: value });
      if (disposed) return;
      render(next);
      status.textContent = message('popupSaved');
    } catch {
      if (disposed) return;
      render(settings);
      status.textContent = '';
      error.textContent = message('popupSaveError');
    } finally {
      if (!disposed) {
        busy(false);
        if (restoreFocus && (root.activeElement === root.body || root.activeElement === control)) {
          const focusTarget =
            control.type === 'radio'
              ? controls.find((input) => input.type === 'radio' && input.checked)
              : control;
          focusTarget?.focus();
        }
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement) || control.type !== 'radio' || control.disabled)
      return;
    const radios = controls.filter((input) => input.type === 'radio');
    const current = radios.indexOf(control);
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (current + 1) % radios.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current + radios.length - 1) % radios.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = radios.length - 1;
    else return;
    event.preventDefault();
    const selected = radios[next];
    if (!selected || selected === control) return;
    selected.checked = true;
    selected.focus();
    selected.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const onEntryEnd = (event: Event) => {
    if (event.target === main) main.classList.remove('popup-enter');
  };
  const preventSubmit = (event: Event) => event.preventDefault();
  const onChange = (event: Event) => {
    void change(event);
  };
  const onRetry = () => {
    void load();
  };
  render(settings);
  form.addEventListener('submit', preventSubmit);
  form.addEventListener('change', onChange);
  form.addEventListener('keydown', onKeyDown);
  main.addEventListener('animationend', onEntryEnd);
  retry.addEventListener('click', onRetry);
  let unsubscribe = () => {};
  try {
    unsubscribe = subscribeSettings((next) => {
      revision += 1;
      if (!disposed) render(next);
    });
  } catch {
    // The load path below presents a retryable error when storage is unavailable.
  }
  await load();

  return () => {
    disposed = true;
    unsubscribe();
    form.removeEventListener('submit', preventSubmit);
    form.removeEventListener('change', onChange);
    form.removeEventListener('keydown', onKeyDown);
    main.removeEventListener('animationend', onEntryEnd);
    retry.removeEventListener('click', onRetry);
  };
}
