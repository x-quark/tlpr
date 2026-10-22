import { describe, expect, it, vi } from 'vitest';
import { mountMergeFormControls, type MergeFormLabels } from '../../src/content/merge-form';

const labels: MergeFormLabels = {
  mergeInsert: 'Insert',
  mergeInserted: 'Inserted',
  mergeEdited: 'Edited',
  mergeFormUnavailable: 'Unavailable',
  mergeChooseSource: 'Choose',
  mergePreview: 'Preview',
  mergeDetectedNotice: 'Notice',
  mergeCandidateOption: 'Candidate {count}',
  mergeMissingTitle: 'Missing',
  mergeNoCandidates: 'None',
};

function candidate(): string {
  return '<section><input name="commit_title" value="Merge pull request #42 from example/branch"><textarea name="commit_message"></textarea></section>';
}

describe('merge form discovery work budget', () => {
  it('does not calculate visibility for unrelated textareas on repeated refreshes', () => {
    window.history.replaceState({}, '', '/example/repo/pull/42');
    document.body.innerHTML = Array.from(
      { length: 100 },
      (_, i) => `<section><textarea name="comment-${i}">Draft ${i}</textarea></section>`,
    ).join('');
    const styles = vi.spyOn(window, 'getComputedStyle');
    const controls = mountMergeFormControls(document, window, labels);
    try {
      controls.refresh();
      controls.refresh();
      expect(styles).not.toHaveBeenCalled();
      expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(0);
      expect(document.querySelector('textarea')?.value).toBe('Draft 0');
    } finally {
      controls.destroy();
    }
  });

  it('still checks candidate visibility and discovers a previously hidden candidate', () => {
    window.history.replaceState({}, '', '/example/repo/pull/42');
    document.body.innerHTML = candidate();
    const field = document.querySelector<HTMLTextAreaElement>('textarea')!;
    field.hidden = true;
    const controls = mountMergeFormControls(document, window, labels);
    try {
      expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(0);
      field.hidden = false;
      controls.refresh();
      expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(1);
      controls.refresh();
      expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(1);
    } finally {
      controls.destroy();
    }
  });
  it.each(['name', 'id', 'label'])(
    'discovers late %s identity without retaining negative results',
    (identity) => {
      window.history.replaceState({}, '', '/example/repo/pull/42');
      document.body.innerHTML = candidate().replace('name="commit_message"', 'id="draft"');
      const field = document.querySelector<HTMLTextAreaElement>('textarea')!;
      field.value = 'Keep my draft';
      const controls = mountMergeFormControls(document, window, labels);
      try {
        expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(0);
        if (identity === 'name') field.name = 'commit_message';
        else if (identity === 'id') field.id = 'merge_message_field';
        else {
          const label = document.createElement('label');
          label.htmlFor = field.id;
          label.textContent = 'Extended description';
          field.before(label);
        }
        controls.refresh();
        expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(1);
        expect(field.value).toBe('Keep my draft');
      } finally {
        controls.destroy();
      }
      expect(document.querySelectorAll('.tlpr-merge-form-controls')).toHaveLength(0);
    },
  );
});
