export type Settings = {
  enabled: boolean;
  language: 'auto' | 'fr' | 'en';
  /** GitHub pull request view: detected automatically unless the user pins one. */
  layout: 'auto' | 'classic' | 'overview';
  animations: boolean;
  stateColors: boolean;
  mergeHelper: boolean;
};

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabled: true,
  language: 'auto',
  layout: 'auto',
  animations: true,
  stateColors: true,
  mergeHelper: false,
});

const STORAGE_KEY = 'tlpr-settings:v1';
const BOOLEAN_KEYS = ['enabled', 'animations', 'stateColors', 'mergeHelper'] as const;
const CHOICES = {
  language: ['auto', 'fr', 'en'],
  layout: ['auto', 'classic', 'overview'],
} as const;
let pendingWrite: Promise<unknown> = Promise.resolve();

function isChoice<K extends keyof typeof CHOICES>(key: K, value: unknown): value is Settings[K] {
  return (CHOICES[key] as readonly unknown[]).includes(value);
}

function sanitizeSettings(value: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  const settings = { ...fallback };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return settings;
  const stored = value as Record<string, unknown>;
  for (const key of BOOLEAN_KEYS) {
    if (typeof stored[key] === 'boolean') settings[key] = stored[key];
  }
  if (isChoice('language', stored.language)) settings.language = stored.language;
  if (isChoice('layout', stored.layout)) settings.layout = stored.layout;
  return settings;
}

export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return sanitizeSettings(stored[STORAGE_KEY]);
}

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  // Serialize writes in this extension context so rapid changes cannot overwrite each other.
  const write = pendingWrite.then(async () => {
    const settings = sanitizeSettings(patch, await readSettings());
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    return settings;
  });
  pendingWrite = write.catch(() => undefined);
  return write;
}

export function subscribeSettings(listener: (settings: Settings) => void): () => void {
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !Object.hasOwn(changes, STORAGE_KEY)) return;
    listener(sanitizeSettings(changes[STORAGE_KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}
