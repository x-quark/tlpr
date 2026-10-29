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
  const infoToggle = root.querySelector<HTMLButtonElement>('[data-info-toggle]')!;
  const infoPanel = root.querySelector<HTMLElement>('#popup-info')!;
  root.querySelector<HTMLElement>('[data-version]')!.textContent =
    chrome.runtime.getManifest().version;
  const languageToggle = root.querySelector<HTMLButtonElement>('[data-language-toggle]')!;
  const languageList = root.querySelector<HTMLElement>('#language-options')!;
  const languageOptions = [...root.querySelectorAll<HTMLButtonElement>('[data-language]')];
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
    for (const control of controls)
      control.checked = next[control.name as Exclude<keyof Settings, 'language'>];
    for (const option of languageOptions)
      option.setAttribute('aria-selected', String(option.dataset.language === next.language));
    root.querySelector<HTMLElement>('#language-value')!.textContent = languageOptions.find(
      (option) => option.dataset.language === next.language,
    )!.textContent;
    activity.textContent = message(next.enabled ? 'popupOn' : 'popupOff');
    activity.dataset.enabled = String(next.enabled);
  }

  function busy(value: boolean): void {
    form.setAttribute('aria-busy', String(value));
    fieldset.disabled = value || !loaded;
    for (const control of controls) control.disabled = value || !loaded;
    languageToggle.disabled = value || !loaded;
    for (const option of languageOptions) option.disabled = value || !loaded;
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

  async function persist(
    name: keyof Settings,
    value: boolean | Settings['language'],
    control: HTMLInputElement | HTMLButtonElement,
  ): Promise<void> {
    if (!loaded || form.getAttribute('aria-busy') === 'true') return;
    const restoreFocus = root.activeElement === control;
    busy(true);
    error.textContent = '';
    status.textContent = message('popupSaving');
    try {
      const next = await saveSettings({ [name]: value });
      if (disposed) return;
      render(next);
      status.textContent = '';
    } catch {
      if (disposed) return;
      render(settings);
      status.textContent = '';
      error.textContent = message('popupSaveError');
    } finally {
      if (!disposed) {
        busy(false);
        if (restoreFocus && (root.activeElement === root.body || root.activeElement === control)) {
          control.focus();
        }
      }
    }
  }

  function closeLanguage(restoreFocus = false): void {
    languageList.hidden = true;
    languageToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) languageToggle.focus();
  }
  function openLanguage(index?: number): void {
    if (languageToggle.disabled) return;
    closeInfo();
    dismissHelp();
    languageList.hidden = false;
    languageToggle.setAttribute('aria-expanded', 'true');
    (languageOptions[
      index ?? languageOptions.findIndex((option) => option.dataset.language === settings.language)
    ] ?? languageOptions[0])!.focus();
  }
  const onLanguageToggle = () => (languageList.hidden ? openLanguage() : closeLanguage(true));
  const onLanguageChoose = (event: MouseEvent) => {
    const option =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-language]')
        : null;
    if (!option || option.disabled || languageList.hidden) return;
    const value = option.dataset.language as Settings['language'];
    closeLanguage(true);
    void persist('language', value, languageToggle);
  };
  const onLanguageKey = (event: KeyboardEvent) => {
    if (event.target === languageToggle) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        openLanguage(
          event.key === 'Home' ? 0 : event.key === 'End' ? languageOptions.length - 1 : undefined,
        );
      }
      return;
    }
    const current = languageOptions.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || languageList.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeLanguage(true);
      return;
    }
    if (event.key === 'Tab') {
      closeLanguage(true);
      return;
    }
    let next: number;
    if (event.key === 'ArrowDown') next = (current + 1) % languageOptions.length;
    else if (event.key === 'ArrowUp')
      next = (current + languageOptions.length - 1) % languageOptions.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = languageOptions.length - 1;
    else if (event.key.length === 1 && event.key !== ' ') {
      const match = languageOptions.findIndex((option) =>
        option.textContent?.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()),
      );
      if (match < 0) return;
      next = match;
    } else return;
    event.preventDefault();
    languageOptions[next]!.focus();
  };
  const onEntryEnd = (event: Event) => {
    if (event.target === main) main.classList.remove('popup-enter');
  };
  const preventSubmit = (event: Event) => event.preventDefault();
  const onChange = (event: Event) => {
    const control = event.target;
    if (control instanceof HTMLInputElement)
      void persist(control.name as keyof Settings, control.checked, control);
  };
  const onRetry = () => {
    void load();
  };
  const help = [...root.querySelectorAll<HTMLElement>('[data-help]')].map((trigger) => ({
    trigger,
    tooltip: root.getElementById(trigger.getAttribute('aria-describedby')!)!,
  }));
  type Help = (typeof help)[number];
  let hovered: Help | undefined;
  const dismissed = new Set<Help>();
  let closeHelpTimer: ReturnType<typeof setTimeout> | undefined;
  function cancelHelpClose(): void {
    clearTimeout(closeHelpTimer);
    closeHelpTimer = undefined;
  }
  function helpOf(target: EventTarget | null): Help | undefined {
    if (!(target instanceof Node)) return undefined;
    return help.find(
      ({ trigger, tooltip }) =>
        trigger.contains(target) || (!tooltip.hidden && tooltip.contains(target)),
    );
  }
  function reconcileHelp(): void {
    const current = hovered && !dismissed.has(hovered) ? hovered : undefined;
    for (const item of help) item.tooltip.hidden = item !== current;
  }
  function dismissHelp(): boolean {
    cancelHelpClose();
    let visible = false;
    for (const item of help) {
      if (!item.tooltip.hidden) visible = true;
      dismissed.add(item);
      item.tooltip.hidden = true;
    }
    return visible;
  }
  const onHelpOver = (event: MouseEvent) => {
    const item = helpOf(event.target);
    if (!item || item === helpOf(event.relatedTarget)) return;
    cancelHelpClose();
    hovered = item;
    dismissed.delete(item);
    reconcileHelp();
  };
  const onHelpOut = (event: MouseEvent) => {
    const item = helpOf(event.target);
    if (!item || item === helpOf(event.relatedTarget)) return;
    cancelHelpClose();
    closeHelpTimer = setTimeout(() => {
      closeHelpTimer = undefined;
      if (hovered === item) hovered = undefined;
      reconcileHelp();
    }, 250);
  };
  function closeInfo(restoreFocus = false): void {
    infoPanel.hidden = true;
    infoToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) infoToggle.focus();
  }
  const onInfoToggle = () => {
    if (!infoPanel.hidden) {
      closeInfo(true);
      return;
    }
    closeLanguage();
    dismissHelp();
    infoPanel.hidden = false;
    infoToggle.setAttribute('aria-expanded', 'true');
    infoPanel.focus();
  };
  const onOutsideClick = (event: MouseEvent) => {
    if (!(event.target instanceof Node)) return;
    if (!infoPanel.contains(event.target) && !infoToggle.contains(event.target))
      closeInfo(infoPanel.contains(root.activeElement));
    if (!languageList.contains(event.target) && !languageToggle.contains(event.target))
      closeLanguage(languageList.contains(root.activeElement));
  };
  const onOverlayFocus = (event: FocusEvent) => {
    if (!(event.target instanceof Node)) return;
    if (!infoPanel.contains(event.target) && !infoToggle.contains(event.target)) closeInfo();
    if (!languageList.contains(event.target) && !languageToggle.contains(event.target))
      closeLanguage();
  };
  const onInfoEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dismissHelp()) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Escape' || infoPanel.hidden) return;
    event.preventDefault();
    closeInfo(true);
  };
  render(settings);
  infoToggle.addEventListener('click', onInfoToggle);
  root.addEventListener('keydown', onInfoEscape);
  root.addEventListener('mouseover', onHelpOver);
  root.addEventListener('mouseout', onHelpOut);
  form.addEventListener('submit', preventSubmit);
  form.addEventListener('change', onChange);
  form.addEventListener('keydown', onLanguageKey);
  languageToggle.addEventListener('click', onLanguageToggle);
  languageList.addEventListener('click', onLanguageChoose);
  root.addEventListener('click', onOutsideClick);
  root.addEventListener('focusin', onOverlayFocus);
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
    cancelHelpClose();
    infoToggle.removeEventListener('click', onInfoToggle);
    root.removeEventListener('keydown', onInfoEscape);
    root.removeEventListener('mouseover', onHelpOver);
    root.removeEventListener('mouseout', onHelpOut);
    unsubscribe();
    form.removeEventListener('submit', preventSubmit);
    form.removeEventListener('change', onChange);
    form.removeEventListener('keydown', onLanguageKey);
    languageToggle.removeEventListener('click', onLanguageToggle);
    languageList.removeEventListener('click', onLanguageChoose);
    root.removeEventListener('click', onOutsideClick);
    root.removeEventListener('focusin', onOverlayFocus);
    main.removeEventListener('animationend', onEntryEnd);
    retry.removeEventListener('click', onRetry);
  };
}
