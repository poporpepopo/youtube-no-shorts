(() => {
  'use strict';
  const toggle = document.getElementById('toggle');
  const state = document.getElementById('state');

  const render = (on) => {
    toggle.checked = on;
    state.textContent = on ? 'ブロック中' : '停止中（ショートを表示）';
  };

  chrome.storage.local.get({ enabled: true }, (v) => render(v.enabled));

  toggle.addEventListener('change', () => {
    const on = toggle.checked;
    chrome.storage.local.set({ enabled: on }, () => render(on));
  });
})();
