import { readSettings, subscribeSettings } from '../settings';
import { ReadingRuntime } from './runtime';

const runtime = new ReadingRuntime();
let revision = 0;
subscribeSettings((settings) => {
  revision += 1;
  runtime.apply(settings);
});
void readSettings()
  .then((settings) => {
    if (revision === 0) runtime.apply(settings);
  })
  .catch(() => {
    // A failed preference read must not reactivate effects the user may have disabled.
    if (revision === 0) runtime.destroy();
  });
