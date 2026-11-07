const svg = (paths: string, className = ''): string =>
  `<svg class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  down: svg('<path d="m4.5 6.25 3.5 3.5 3.5-3.5"/>', 'tlpr-chevron'),
  fold: svg('<path d="M8 1v5m-2.5-2.5L8 6l2.5-2.5M8 15v-5m-2.5 2.5L8 10l2.5 2.5"/>'),
  unfold: svg('<path d="M8 6V1M5.5 3.5 8 1l2.5 2.5M8 10v5m-2.5-2.5L8 15l2.5-2.5"/>'),
  view: svg(
    '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><path d="M6.25 2.75v10.5"/>',
  ),
  merge: svg(
    '<circle cx="4.5" cy="3.5" r="1.75"/><circle cx="4.5" cy="12.5" r="1.75"/><circle cx="11.5" cy="8" r="1.75"/><path d="M4.5 5.25v5.5M4.5 5.25c0 2 1.5 2.75 5.25 2.75"/>',
  ),
} as const;
