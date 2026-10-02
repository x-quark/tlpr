import messages from '../src/_locales/en/messages.json';
import { setLanguage } from '../src/content/i18n';

const translations: Record<string, { message: string }> = messages;

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    i18n: {
      getMessage(key: string, substitutions?: string | string[]): string {
        const template = translations[key]?.message ?? '';
        const first = Array.isArray(substitutions) ? substitutions[0] : substitutions;
        return first ? template.replace('$COUNT$', first) : template;
      },
    },
  },
});

beforeEach(() => {
  setLanguage('auto');
  document.body.innerHTML = '';
  localStorage.clear();
  window.history.replaceState({}, '', '/x-quark/tlpr/issues/1');
});

afterEach(() => {
  vi.restoreAllMocks();
});
