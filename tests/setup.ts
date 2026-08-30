const translations: Record<string, string> = {
  collapse: 'Collapse',
  expand: 'Expand',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  show: 'Show',
  hide: 'Hide',
  timelineHiddenOne: '$COUNT$ item hidden in the middle of the conversation',
  timelineHiddenMany: '$COUNT$ items hidden in the middle of the conversation',
};

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    i18n: {
      getMessage(key: string, substitutions?: string | string[]): string {
        const template = translations[key] ?? '';
        const first = Array.isArray(substitutions) ? substitutions[0] : substitutions;
        return first ? template.replace('$COUNT$', first) : template;
      },
    },
  },
});

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  window.history.replaceState({}, '', '/x-quark/tlpr/issues/1');
});

afterEach(() => {
  vi.restoreAllMocks();
});
