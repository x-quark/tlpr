import { mountPopup } from './popup';

void mountPopup(document).then((dispose) => {
  window.addEventListener('pagehide', dispose, { once: true });
});
