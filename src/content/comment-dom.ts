/** GitHub retains its edit form in the DOM after editing or lazy hydration. */
export function hasActiveCommentEditor(comment: HTMLElement, pageWindow: Window): boolean {
  return [...comment.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]')].some(
    (editor) => {
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
    },
  );
}
