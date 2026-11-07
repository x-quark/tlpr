import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubCommentCollapser } from '../../src/content/controller';

let controller: GitHubCommentCollapser | undefined;
afterEach(() => {
  controller?.destroy();
  controller = undefined;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 65));

async function start(count = 7): Promise<HTMLElement> {
  window.history.replaceState({}, '', '/example/project/pull/5');
  document.body.innerHTML = `<main class="js-discussion">${Array.from(
    { length: count },
    (_, index) =>
      `<div class="TimelineItem"><div class="js-comment timeline-comment" id="issuecomment-${index}"><div class="timeline-comment-header">octocat</div><div class="comment-body">Comment ${index}</div></div></div>`,
  ).join('')}</main>`;
  document
    .querySelectorAll<HTMLElement>('.comment-body')
    .forEach((body) =>
      Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 300 }),
    );
  controller = new GitHubCommentCollapser();
  controller.start();
  await settle();
  return document.querySelector<HTMLElement>('.js-discussion')!;
}

describe('mutation filtering', () => {
  it('does not rescan after its own toggles, labels, classes and generated ids', async () => {
    const host = await start();
    const scan = vi.spyOn(controller!, 'scan');
    host.querySelector<HTMLButtonElement>('#issuecomment-0 .tlpr-comment-toggle')!.click();
    host.querySelector<HTMLButtonElement>('.tlpr-timeline-toggle')!.click();
    host.querySelector<HTMLButtonElement>('[data-tlpr-action="collapse-all"]')!.click();
    await settle();
    expect(scan).not.toHaveBeenCalled();
  });

  it('restores a control and fold class that GitHub removed', async () => {
    const host = await start();
    const body = host.querySelector<HTMLElement>('#issuecomment-6 .comment-body')!;
    host.querySelector('#issuecomment-6 .tlpr-control')!.remove();
    await settle();
    expect(host.querySelectorAll('#issuecomment-6 .tlpr-comment-toggle')).toHaveLength(1);
    body.className = 'comment-body';
    await settle();
    expect(body.classList.contains('tlpr-body')).toBe(true);
  });

  it('still reacts to GitHub class hydration on conversation elements', async () => {
    const host = await start(1);
    host.insertAdjacentHTML(
      'beforeend',
      '<div class="TimelineItem"><div class="js-comment timeline-comment" id="issuecomment-9"><div class="timeline-comment-header">octocat</div><div class="pending">Hydrating</div></div></div>',
    );
    await settle();
    host.querySelector('.pending')!.className = 'comment-body';
    await settle();
    expect(host.querySelector('#issuecomment-9 .tlpr-comment-toggle')).not.toBeNull();
  });
});
