// 隔離ワールド。chrome.storage の設定を読み、
// (1) CSSの出し入れ (2) MAINワールドへの通知 (3) localStorage へのミラー を担当する。
(() => {
  'use strict';

  const KEY = 'ytNoShorts:enabled';
  const STYLE_ID = 'yt-no-shorts-style';

  const CSS = `
  /* main.js が印を付けた要素（サイドバーの「ショート」、チャンネルの「ショート」タブ）。
     これらは <a href> を持たないのでCSSだけでは掴めない */
  [data-no-shorts="1"],
  /* サイドバー（ミニ表示のときは href があるので先に効く） */
  ytd-guide-entry-renderer:has(a[href^="/shorts"]),
  ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
  /* ホーム・登録チャンネル・検索結果のショート棚 */
  ytd-reel-shelf-renderer,
  ytd-rich-shelf-renderer[is-shorts],
  ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
  grid-shelf-view-model,
  /* 個々のショートのサムネイル（レイアウトが複数あるので全部指定） */
  ytm-shorts-lockup-view-model,
  ytm-shorts-lockup-view-model-v2,
  ytd-rich-item-renderer:has(a[href^="/shorts/"]),
  ytd-video-renderer:has(a[href^="/shorts/"]),
  ytd-grid-video-renderer:has(a[href^="/shorts/"]),
  ytd-compact-video-renderer:has(a[href^="/shorts/"]),
  yt-lockup-view-model:has(a[href^="/shorts/"]) {
    display: none !important;
  }`;

  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== '0'; } catch (e) { /* 無視 */ }

  const applyStyle = () => {
    const existing = document.getElementById(STYLE_ID);
    if (enabled) {
      if (existing) return;
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    } else if (existing) {
      existing.remove();
    }
  };

  const apply = (on) => {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) { /* 無視 */ }
    window.postMessage({ __ytNoShorts: enabled }, location.origin);
    applyStyle();
  };

  // まず localStorage のキャッシュ値で即座に適用（チラつき防止）
  applyStyle();

  // 実際の設定は chrome.storage が正。読めたら上書きする。
  chrome.storage.local.get({ enabled: true }, (v) => apply(v.enabled));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) apply(changes.enabled.newValue);
  });

  // <head> が後から生成される場合に備えて再適用する
  new MutationObserver(applyStyle).observe(document.documentElement, { childList: true });
})();
