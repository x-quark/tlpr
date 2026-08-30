export type MessageKey =
  | 'collapse'
  | 'expand'
  | 'collapseAll'
  | 'expandAll'
  | 'show'
  | 'hide'
  | 'timelineHiddenOne'
  | 'timelineHiddenMany';

export function message(key: MessageKey, substitutions?: string | string[]): string {
  const translated = chrome.i18n.getMessage(key, substitutions);

  if (!translated) {
    throw new Error(`Missing Chrome i18n message: ${key}`);
  }

  return translated;
}
