import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { GitHubCommentCollapser } from '../../src/content/controller';

const fixture = readFileSync('tests/fixtures/github-pr-713.html', 'utf8');
let controller: GitHubCommentCollapser;
afterEach(() => controller?.destroy());
function mount() {
  window.history.replaceState({}, '', '/atlas-labs-hq/atlas/pull/713');
  document.body.innerHTML = fixture;
  const body = document.querySelector<HTMLElement>('.comment-body')!;
  Object.defineProperty(body, 'scrollHeight', { value: 300, configurable: true });
  controller = new GitHubCommentCollapser();
  controller.start();
  return body;
}
function toggle() {
  return document.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!;
}
function settle() {
  return new Promise<void>((resolve) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
  );
}

describe('GitHub asynchronous comment lifecycle', () => {
  it('keeps the last comment interactive after a cached hidden editor arrives', async () => {
    const body = mount();
    const comment = document.querySelector('.js-comment')!;
    comment.insertAdjacentHTML(
      'beforeend',
      '<form class="js-comment-update"><div class="js-previewable-comment-form" style="display:none"><textarea class="js-comment-field">Cached editor</textarea></div></form>',
    );
    await settle();
    for (let i = 0; i < 6; i++) {
      toggle().click();
      expect(body.dataset.tlprCollapsed).toBe(i % 2 === 0 ? '0' : '1');
    }
  });

  it('rebinds a cloned control even when GitHub keeps the same comment body', async () => {
    const body = mount();
    for (let i = 0; i < 6; i++) {
      const header = document.querySelector('.timeline-comment-header')!;
      header.replaceWith(header.cloneNode(true));
      await settle();
      toggle().click();
      expect(body.dataset.tlprCollapsed).toBe(i % 2 === 0 ? '0' : '1');
      expect(document.querySelectorAll('.tlpr-comment-toggle')).toHaveLength(1);
    }
  });

  it('never toggles while a real editor is open and resumes after it closes', async () => {
    const body = mount();
    document
      .querySelector('.js-comment')!
      .insertAdjacentHTML(
        'beforeend',
        '<form class="js-comment-update"><div class="js-previewable-comment-form"><textarea>Editing</textarea></div></form>',
      );
    toggle().click();
    expect(body.dataset.tlprCollapsed).toBe('1');
    document.querySelector<HTMLElement>('.js-previewable-comment-form')!.style.display = 'none';
    await settle();
    toggle().click();
    expect(body.dataset.tlprCollapsed).toBe('0');
  });
});

describe('late GitHub updates', () => {
  it('enhances a comment when the initially visible editor closes by attribute changes', async () => {
    const body = mount();
    controller.destroy();
    document
      .querySelector('.js-comment')!
      .insertAdjacentHTML(
        'beforeend',
        '<div class="js-previewable-comment-form"><textarea>Editing</textarea></div>',
      );
    controller = new GitHubCommentCollapser();
    controller.start();
    expect(toggle()).toBeNull();
    await settle();
    document.querySelector<HTMLElement>('.js-previewable-comment-form')!.style.display = 'none';
    await settle();
    expect(toggle()).not.toBeNull();
    toggle().click();
    expect(body.dataset.tlprCollapsed).toBe('0');
  });
});

describe('reloads and newly received last comments', () => {
  it('survives ten reloads with async body replacement and repeated toggles', async () => {
    for (let reload = 0; reload < 10; reload++) {
      const body = mount();
      const comment = document.querySelector('.js-comment')!;
      const next = body.cloneNode(true) as HTMLElement;
      body.replaceWith(next);
      comment.insertAdjacentHTML('beforeend', '<div hidden><textarea>Cached edit</textarea></div>');
      await settle();
      for (let cycle = 0; cycle < 4; cycle++) {
        const before = next.dataset.tlprCollapsed;
        toggle().click();
        expect(next.dataset.tlprCollapsed).not.toBe(before);
        await settle();
      }
      const wrapper = document.querySelector('.TimelineItem')!.cloneNode(true) as HTMLElement;
      wrapper.querySelector('[id^="issuecomment-"]')!.id = 'issuecomment-new-received';
      wrapper.querySelector('.tlpr-body')?.removeAttribute('id');
      document.querySelector('.js-discussion')!.append(wrapper);
      await settle();
      const last = wrapper.querySelector<HTMLElement>('.comment-body')!;
      const before = last.dataset.tlprCollapsed;
      wrapper.querySelector<HTMLButtonElement>('.tlpr-comment-toggle')!.click();
      expect(last.dataset.tlprCollapsed).not.toBe(before);
      controller.destroy();
    }
  });
});

describe('Turbo cached conversation replacement', () => {
  it('rebinds the rail and middle summary when their entire host is cloned', async () => {
    mount();
    const host = document.querySelector('.js-discussion')!;
    const item = host.querySelector('.TimelineItem')!;
    for (let i = 0; i < 6; i++) {
      const next = item.cloneNode(true) as HTMLElement;
      next.querySelector('[id^="issuecomment-"]')!.id = `issuecomment-more-${i}`;
      host.append(next);
    }
    await settle();
    host.replaceWith(host.cloneNode(true));
    document.dispatchEvent(new Event('turbo:render'));
    await settle();
    document.querySelector<HTMLButtonElement>('[data-tlpr-action="expand-all"]')!.click();
    expect(document.querySelectorAll('.tlpr-body[data-tlpr-collapsed="1"]')).toHaveLength(0);
    expect(document.querySelectorAll('.tlpr-timeline-hidden')).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle')!.click();
    expect(document.querySelectorAll('.tlpr-timeline-hidden').length).toBeGreaterThan(0);
  });
});

describe('merge helper rail recovery', () => {
  it('preserves a manually emptied description when a cloned rail remounts the helper', async () => {
    mount();
    controller.destroy();
    document
      .querySelector('.js-discussion')!
      .insertAdjacentHTML(
        'beforeend',
        '<section><div><label for="retained-title">Commit message</label><input id="retained-title" value="Merge pull request #713 from example/topic"></div><div><label for="retained-desc">Extended description</label><textarea id="retained-desc"></textarea></div></section>',
      );
    controller = new GitHubCommentCollapser(document, window, { mergeHelper: true });
    controller.start();
    await settle();
    const field = document.querySelector<HTMLTextAreaElement>('#retained-desc')!;
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const rail = document.querySelector('.tlpr-global-rail')!;
    rail.replaceWith(rail.cloneNode(true));
    await settle();
    document.querySelector<HTMLButtonElement>('.tlpr-merge-insert')!.click();
    expect(field.value).toBe('');
  });
});
