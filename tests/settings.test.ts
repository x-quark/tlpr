import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, readSettings, saveSettings, subscribeSettings } from '../src/settings';

type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const key = 'tlpr-settings:v1';
let values: Record<string, unknown>;
let listeners: Set<ChangeListener>;
let readError: Error | undefined;
let writeError: Error | undefined;

beforeEach(() => {
  values = {};
  listeners = new Set();
  readError = undefined;
  writeError = undefined;
  Object.defineProperty(chrome, 'storage', {
    configurable: true,
    value: {
      local: {
        async get(name: string) {
          if (readError) throw readError;
          return { [name]: values[name] };
        },
        async set(items: Record<string, unknown>) {
          if (writeError) throw writeError;
          Object.assign(values, items);
        },
      },
      onChanged: {
        addListener(listener: ChangeListener) {
          listeners.add(listener);
        },
        removeListener(listener: ChangeListener) {
          listeners.delete(listener);
        },
      },
    },
  });
});

describe('local extension settings', () => {
  it('uses safe defaults with the optional helper off and no writes on read', async () => {
    expect(await readSettings()).toEqual({
      enabled: true,
      language: 'auto',
      animations: true,
      stateColors: true,
      mergeHelper: false,
    });
    expect(values).toEqual({});
  });

  it('reads valid persisted settings from the versioned local key', async () => {
    values[key] = {
      enabled: false,
      language: 'fr',
      animations: false,
      stateColors: false,
      mergeHelper: true,
    };
    expect(await readSettings()).toEqual(values[key]);
  });

  it('rejects malformed fields and ignores unknown stored keys', async () => {
    values[key] = {
      enabled: 'false',
      language: 'de',
      animations: null,
      stateColors: 0,
      mergeHelper: 'true',
      remoteUrl: 'https://example.com',
    };
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
    for (const invalid of [null, 'false', 4, [], true]) {
      values[key] = invalid;
      expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('merges a patch without resetting other preferences or touching legacy storage', async () => {
    values[key] = { ...DEFAULT_SETTINGS, language: 'fr', stateColors: false };
    values['gh-pr-comment-collapse:v3'] = 'legacy';
    expect(await saveSettings({ enabled: false })).toEqual({
      ...DEFAULT_SETTINGS,
      enabled: false,
      language: 'fr',
      stateColors: false,
    });
    expect(values['gh-pr-comment-collapse:v3']).toBe('legacy');
    expect(Object.keys(values)).toEqual([key, 'gh-pr-comment-collapse:v3']);
  });

  it('sanitizes patches and keeps valid existing values', async () => {
    values[key] = { ...DEFAULT_SETTINGS, enabled: false, language: 'fr' };
    const patch = { enabled: 'invalid', language: 'de', stateColors: false, unexpected: true };
    expect(await saveSettings(patch as never)).toEqual({
      ...DEFAULT_SETTINGS,
      enabled: false,
      language: 'fr',
      stateColors: false,
    });
  });

  it('serializes simultaneous patches so neither preference is lost', async () => {
    await Promise.all([saveSettings({ enabled: false }), saveSettings({ language: 'en' })]);
    expect(values[key]).toEqual({ ...DEFAULT_SETTINGS, enabled: false, language: 'en' });
  });

  it('reports storage failures without claiming the change was saved', async () => {
    readError = new Error('Read denied');
    await expect(readSettings()).rejects.toThrow('Read denied');
    readError = undefined;
    writeError = new Error('Write denied');
    await expect(saveSettings({ enabled: false })).rejects.toThrow('Write denied');
    expect(values).toEqual({});
    writeError = undefined;
    expect(await saveSettings({ enabled: false })).toEqual({ ...DEFAULT_SETTINGS, enabled: false });
  });

  it('only subscribes to local settings, sanitizes changes, and unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSettings(listener);
    const dispatch = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      for (const callback of listeners) callback(changes, area);
    };
    dispatch({ [key]: { newValue: { enabled: false, language: 'en' } } }, 'sync');
    dispatch({ unrelated: { newValue: false } }, 'local');
    expect(listener).not.toHaveBeenCalled();
    dispatch({ [key]: { newValue: { enabled: false, language: 'invalid' } } }, 'local');
    expect(listener).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, enabled: false });
    dispatch({ [key]: {} }, 'local');
    expect(listener).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
