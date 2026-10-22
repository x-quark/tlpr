import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubCommentCollapser, STORAGE_KEY } from '../../src/content/controller';

let controller: GitHubCommentCollapser;
let styles: HTMLStyleElement;
const settle = () => new Promise((resolve) => setTimeout(resolve, 65));
afterEach(() => {
  controller?.destroy();
  styles?.remove();
});
async function mount() {
  styles = document.createElement('style');
  styles.textContent =
    readFileSync('src/content/styles.css', 'utf8') + '\n.native-hidden {display:none}';
  document.head.append(styles);
  document.body.innerHTML =
    '<main class="js-discussion"><article class="react-issue-comment" id="issuecomment-1"><header>octocat</header><div class="comment-body"><div class="editor">Draft</div></div></article></main>';
  const body = document.querySelector<HTMLElement>('.comment-body')!;
  Object.defineProperty(body, 'scrollHeight', { value: 400 });
  controller = new GitHubCommentCollapser();
  controller.start();
  await settle();
  return body;
}
const folded = (body: HTMLElement) => body.classList.contains('tlpr-body');

describe('passive editor lifecycle through real MutationObserver', () => {
  it.each(['body', 'descendant'])(
    'observes contenteditable entry, exit and removal on %s without a manual scan',
    async (location) => {
      const body = await mount();
      const editor = location === 'body' ? body : body.querySelector<HTMLElement>('.editor')!;
      const stored = localStorage.getItem(STORAGE_KEY);
      for (const value of ['true', '', 'TRUE', 'plaintext-only']) {
        editor.setAttribute('contenteditable', value);
        await settle();
        expect(folded(body)).toBe(false);
        expect(getComputedStyle(body).overflow).not.toBe('hidden');
        editor.setAttribute('contenteditable', 'false');
        await settle();
        expect(folded(body)).toBe(true);
        editor.setAttribute('contenteditable', value);
        await settle();
        expect(folded(body)).toBe(false);
        editor.removeAttribute('contenteditable');
        await settle();
        expect(folded(body)).toBe(true);
      }
      editor.setAttribute('contenteditable', 'invalid');
      await settle();
      expect(folded(body)).toBe(true);
      expect(body.textContent).toBe('Draft');
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
      const scan = vi.spyOn(controller, 'scan');
      await settle();
      expect(scan).not.toHaveBeenCalled();
    },
  );
  it('honors inherited editability and explicit false, including invalid inherited values', async () => {
    const body = await mount();
    const article = body.closest('article')!;
    article.setAttribute('contenteditable', 'true');
    body.setAttribute('contenteditable', 'invalid');
    await settle();
    expect(folded(body)).toBe(false);
    article.setAttribute('contenteditable', 'false');
    await settle();
    expect(folded(body)).toBe(true);
    body.setAttribute('contenteditable', 'invalid');
    await settle();
    expect(folded(body)).toBe(true);
  });
  it.each(['style', 'hidden', 'aria-hidden', 'class'])(
    'observes native %s masking and DOM insertion/removal of textarea',
    async (attribute) => {
      const body = await mount();
      const wrapper = body.firstElementChild as HTMLElement;
      const hiddenValue = {
        style: 'display:none',
        hidden: '',
        'aria-hidden': 'true',
        class: 'native-hidden',
      }[attribute]!;
      wrapper.setAttribute(attribute, hiddenValue);
      wrapper.innerHTML = '<textarea>Unsaved draft</textarea>';
      await settle();
      expect(folded(body)).toBe(true);
      wrapper.removeAttribute(attribute);
      await settle();
      expect(folded(body)).toBe(false);
      wrapper.setAttribute(attribute, hiddenValue);
      await settle();
      expect(folded(body)).toBe(true);
      wrapper.removeAttribute(attribute);
      await settle();
      expect(folded(body)).toBe(false);
      wrapper.firstElementChild!.remove();
      await settle();
      expect(folded(body)).toBe(true);
      const scan = vi.spyOn(controller, 'scan');
      await settle();
      expect(scan).not.toHaveBeenCalled();
    },
  );
});
