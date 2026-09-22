// MAIN ワールドで動く。理由は2つ:
//  - ページ本体の history API をパッチするため（隔離ワールドからは触れない）
//  - サイドバーの「ショート」は <a href> を持たず、Polymer の .data でしか判定できないため
(() => {
  'use strict';

  const KEY = 'ytNoShorts:enabled';
  const HOME = 'https://www.youtube.com/';
  // チャンネルページの「ショート」タブは href も .data も取れないため、
  // 表示ラベルで判定するしかない。UI言語を変える場合はここに追加する。
  const TAB_LABELS = ['ショート', 'Shorts'];

  // chrome.storage は非同期なので、document_start の時点では
  // bridge.js がミラーしている localStorage を同期的に読む。
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== '0'; } catch (e) { /* 無視 */ }

  // ON/OFF の切り替えを bridge.js から受け取る（リロード不要）
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || !('__ytNoShorts' in d)) return;
    enabled = !!d.__ytNoShorts;
    if (enabled) sweep();
  });

  const toPath = (u) => { try { return new URL(u, location.origin).pathname; } catch (e) { return ''; } };
  const isShorts = (p) => p === '/shorts' || p.startsWith('/shorts/');

  // ---- 1) /shorts/ を直接開いた / 履歴で戻った場合は再生前に離脱 ----
  const bounce = () => { if (enabled && isShorts(location.pathname)) location.replace(HOME); };
  bounce();
  window.addEventListener('popstate', bounce);

  // ---- 2) SPA内のショートへの遷移を無視する ----
  for (const name of ['pushState', 'replaceState']) {
    const orig = history[name];
    history[name] = function (state, title, url) {
      if (enabled && url != null && isShorts(toPath(url))) return;
      return orig.apply(this, arguments);
    };
  }

  // ---- 3) ショートへのリンクのクリックを握りつぶす ----
  document.addEventListener('click', (e) => {
    if (!enabled) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && isShorts(toPath(a.getAttribute('href')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ---- 4) href を持たない要素に data-no-shorts を付ける（CSS側で非表示にする） ----
  // Polymer の .data は親子で相互参照を持つことがあり、素朴な再帰は
  // スタックオーバーフローで落ちる。sweep() の中で投げると以降の
  // MutationObserver 経由の呼び出しも毎回死ぬので、必ず打ち切る。
  //  - seen: 同じオブジェクトを二度たどらない（循環の停止）
  //  - MAX_DEPTH: 循環が無くても深い木で時間を使わない
  //  - Object.keys: for-in と違いプロトタイプ側を舐めない
  const MAX_DEPTH = 12;
  const navUrl = (el) => {
    const d = el.data || (el.__data && el.__data.data);
    if (!d) return null;
    const seen = new WeakSet();
    let u = null;
    const walk = (x, depth) => {
      if (u || !x || typeof x !== 'object' || depth > MAX_DEPTH) return;
      if (seen.has(x)) return;
      seen.add(x);
      if (x.webCommandMetadata && typeof x.webCommandMetadata.url === 'string') { u = x.webCommandMetadata.url; return; }
      if (Array.isArray(x)) { for (const v of x) walk(v, depth + 1); return; }
      for (const k of Object.keys(x)) walk(x[k], depth + 1);
    };
    walk(d, 0);
    return u;
  };

  // Polymer は要素を使い回すので、毎回判定し直して付け外しする
  const setMark = (el, on) => {
    if (on) el.dataset.noShorts = '1';
    else if (el.dataset.noShorts) delete el.dataset.noShorts;
  };

  const sweep = () => {
    if (!enabled) return;
    // 1要素の失敗で sweep 全体を落とさない（落ちるとサイドバーが出たままになる）
    try {
      for (const el of document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')) {
        const u = navUrl(el);
        setMark(el, !!(u && isShorts(u)));
      }
      for (const el of document.querySelectorAll('yt-tab-shape')) {
        setMark(el, TAB_LABELS.indexOf(el.textContent.trim()) !== -1);
      }
    } catch (e) {
      console.warn('[yt-no-shorts] sweep 失敗', e);
    }
  };

  let scheduled = 0;
  const scheduleSweep = () => {
    if (scheduled) return;
    scheduled = setTimeout(() => { scheduled = 0; sweep(); }, 250);
  };
  sweep();
  document.addEventListener('DOMContentLoaded', sweep);
  window.addEventListener('yt-navigate-finish', sweep);
  new MutationObserver(scheduleSweep).observe(document.documentElement, { childList: true, subtree: true });

  // ---- 5) 1〜4をすり抜けてショートプレーヤーが出た場合の保険 ----
  setInterval(() => {
    if (enabled && document.querySelector('ytd-shorts, ytm-shorts')) location.replace(HOME);
  }, 700);
})();
