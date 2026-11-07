import { message, setLanguage, type MessageKey } from '../content/i18n';
import {
  DEFAULT_SETTINGS,
  readSettings,
  saveSettings,
  subscribeSettings,
  type Settings,
} from '../settings';

type ChoiceName = 'language' | 'layout';
type SwitchName = Exclude<keyof Settings, ChoiceName>;

/** One closed select: a button and a listbox of option buttons, like the language picker. */
interface Select {
  name: ChoiceName;
  toggle: HTMLButtonElement;
  list: HTMLElement;
  options: HTMLButtonElement[];
  value: HTMLElement;
}

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
  const selects: Select[] = (['language', 'layout'] as const).flatMap((name) => {
    const toggle = root.querySelector<HTMLButtonElement>(`[data-${name}-toggle]`);
    const list = root.querySelector<HTMLElement>(`#${name}-options`);
    const value = root.querySelector<HTMLElement>(`#${name}-value`);
    if (!toggle || !list || !value) return [];
    const options = [...list.querySelectorAll<HTMLButtonElement>(`[data-${name}]`)];
    return [{ name, toggle, list, options, value }];
  });
  const controls = [...root.querySelectorAll<HTMLInputElement>('input[name]')];
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let disposed = false;
  let loaded = false;
  let revision = 0;

  const optionValue = (select: Select, option: HTMLElement): string | undefined =>
    option.dataset[select.name];

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
    for (const control of controls) control.checked = next[control.name as SwitchName];
    for (const select of selects) {
      for (const option of select.options)
        option.setAttribute(
          'aria-selected',
          String(optionValue(select, option) === next[select.name]),
        );
      select.value.textContent =
        select.options.find((option) => optionValue(select, option) === next[select.name])
          ?.textContent ?? '';
    }
    activity.textContent = message(next.enabled ? 'popupOn' : 'popupOff');
    activity.dataset.enabled = String(next.enabled);
  }

  function busy(value: boolean): void {
    form.setAttribute('aria-busy', String(value));
    fieldset.disabled = value || !loaded;
    for (const control of controls) control.disabled = value || !loaded;
    for (const select of selects) {
      select.toggle.disabled = value || !loaded;
      for (const option of select.options) option.disabled = value || !loaded;
    }
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
    patch: Partial<Settings>,
    control: HTMLInputElement | HTMLButtonElement,
  ): Promise<void> {
    if (!loaded || form.getAttribute('aria-busy') === 'true') return;
    const restoreFocus = root.activeElement === control;
    busy(true);
    error.textContent = '';
    status.textContent = message('popupSaving');
    try {
      const next = await saveSettings(patch);
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

  function closeSelect(select: Select, restoreFocus = false): void {
    select.list.hidden = true;
    select.toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) select.toggle.focus();
  }
  function openSelect(select: Select, index?: number): void {
    if (select.toggle.disabled) return;
    closeInfo();
    dismissHelp();
    for (const other of selects) if (other !== select) closeSelect(other);
    select.list.hidden = false;
    select.toggle.setAttribute('aria-expanded', 'true');
    (select.options[
      index ??
        select.options.findIndex((option) => optionValue(select, option) === settings[select.name])
    ] ?? select.options[0])!.focus();
  }
  const selectOf = (target: EventTarget | null): Select | undefined =>
    target instanceof Node
      ? selects.find((select) => select.toggle.contains(target) || select.list.contains(target))
      : undefined;
  const onSelectToggle = (event: MouseEvent) => {
    const select = selects.find(
      (candidate) => event.target instanceof Node && candidate.toggle.contains(event.target),
    );
    if (!select) return;
    if (select.list.hidden) openSelect(select);
    else closeSelect(select, true);
  };
  const onSelectChoose = (event: MouseEvent) => {
    const select = selectOf(event.target);
    if (!select || !(event.target instanceof Element) || select.list.hidden) return;
    const option = event.target.closest<HTMLButtonElement>(`[data-${select.name}]`);
    if (!option || option.disabled) return;
    const value = optionValue(select, option);
    closeSelect(select, true);
    if (value !== undefined)
      void persist({ [select.name]: value } as Partial<Settings>, select.toggle);
  };
  const onSelectKey = (event: KeyboardEvent) => {
    const select = selectOf(event.target);
    if (!select) return;
    if (event.target === select.toggle) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        openSelect(
          select,
          event.key === 'Home' ? 0 : event.key === 'End' ? select.options.length - 1 : undefined,
        );
      }
      return;
    }
    const current = select.options.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || select.list.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSelect(select, true);
      return;
    }
    if (event.key === 'Tab') {
      closeSelect(select, true);
      return;
    }
    const count = select.options.length;
    let next: number;
    if (event.key === 'ArrowDown') next = (current + 1) % count;
    else if (event.key === 'ArrowUp') next = (current + count - 1) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else if (event.key.length === 1 && event.key !== ' ') {
      const match = select.options.findIndex((option) =>
        option.textContent?.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()),
      );
      if (match < 0) return;
      next = match;
    } else return;
    event.preventDefault();
    select.options[next]!.focus();
  };
  const onEntryEnd = (event: Event) => {
    if (event.target === main) main.classList.remove('popup-enter');
  };
  const preventSubmit = (event: Event) => event.preventDefault();
  const onChange = (event: Event) => {
    const control = event.target;
    if (control instanceof HTMLInputElement)
      void persist({ [control.name as SwitchName]: control.checked }, control);
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
    for (const select of selects) closeSelect(select);
    dismissHelp();
    infoPanel.hidden = false;
    infoToggle.setAttribute('aria-expanded', 'true');
    infoPanel.focus();
  };
  const onOutsideClick = (event: MouseEvent) => {
    if (!(event.target instanceof Node)) return;
    if (!infoPanel.contains(event.target) && !infoToggle.contains(event.target))
      closeInfo(infoPanel.contains(root.activeElement));
    for (const select of selects) {
      if (!select.list.contains(event.target) && !select.toggle.contains(event.target))
        closeSelect(select, select.list.contains(root.activeElement));
    }
  };
  const onOverlayFocus = (event: FocusEvent) => {
    if (!(event.target instanceof Node)) return;
    if (!infoPanel.contains(event.target) && !infoToggle.contains(event.target)) closeInfo();
    for (const select of selects) {
      if (!select.list.contains(event.target) && !select.toggle.contains(event.target))
        closeSelect(select);
    }
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
  form.addEventListener('keydown', onSelectKey);
  for (const select of selects) {
    select.toggle.addEventListener('click', onSelectToggle);
    select.list.addEventListener('click', onSelectChoose);
  }
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
    form.removeEventListener('keydown', onSelectKey);
    for (const select of selects) {
      select.toggle.removeEventListener('click', onSelectToggle);
      select.list.removeEventListener('click', onSelectChoose);
    }
    root.removeEventListener('click', onOutsideClick);
    root.removeEventListener('focusin', onOverlayFocus);
    main.removeEventListener('animationend', onEntryEnd);
    retry.removeEventListener('click', onRetry);
  };
}
