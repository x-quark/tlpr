import english from '../_locales/en/messages.json';
import french from '../_locales/fr/messages.json';

export type MessageKey = keyof typeof english;
export type Language = 'auto' | 'fr' | 'en';
let language: Language = 'auto';

export function setLanguage(value: Language): void {
  language = value;
}

export function message(key: MessageKey, substitutions?: string | string[]): string {
  if (language === 'auto') {
    const translated = chrome.i18n.getMessage(key, substitutions);
    if (translated) return translated;
  }

  const locale = language === 'auto' ? chrome.i18n.getUILanguage?.() : language;
  const dictionary = locale?.startsWith('fr') ? french : english;
  const template = dictionary[key]?.message;
  if (!template) throw new Error(`Missing Chrome i18n message: ${key}`);
  const count = Array.isArray(substitutions) ? substitutions[0] : substitutions;
  return count === undefined ? template : template.replaceAll('$COUNT$', count);
}
