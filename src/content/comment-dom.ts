// HTML enumerated values are case-insensitive; invalid or absent values inherit.
function isContentEditable(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const value = node.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return false;
    if (value === '' || value === 'true' || value === 'plaintext-only') return true;
  }
  return false;
}

/** GitHub retains its edit form in the DOM after editing or lazy hydration. */
export function hasActiveCommentEditor(comment: HTMLElement, pageWindow: Window): boolean {
  const editors = [
    comment,
    ...comment.querySelectorAll<HTMLElement>('textarea, [contenteditable]'),
  ].filter((element) => element.matches('textarea') || isContentEditable(element));
  if (!editors.length) return false;

  // Inspect native visibility without our own timeline mask. This temporary attribute
  // is deliberately outside the controller's observed attribute filter (no rescan loop).
  const marker = 'data-tlpr-checking-editor';
  const suppressMask =
    comment.classList.contains('tlpr-timeline-hidden') && !comment.hasAttribute(marker);
  if (suppressMask) comment.setAttribute(marker, '');
  try {
    return editors.some((editor) => {
      for (let node: HTMLElement | null = editor; node; node = node.parentElement) {
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
        const style = pageWindow.getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse'
        )
          return false;
        if (node === comment) break;
      }
      return true;
    });
  } finally {
    if (suppressMask) comment.removeAttribute(marker);
  }
}
