'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

/** Polymer の要素を模した最小のスタブ。dataset の付け外しだけ見られればよい */
class El {
  constructor(tag, data, text = '') {
    this.tag = tag;
    this.data = data;
    this.textContent = text;
    this.dataset = {};
  }
}

/**
 * main.js を毎回まっさらな文脈で実行し、判定対象の要素と警告ログを返す。
 * テストごとに作り直すので、順序に依存しない。
 */
function run() {
  // サイドバーの「ショート」。Polymer のデータは親子で相互参照を持つ
  const shortsData = {
    title: 'ショート',
    endpoint: { commandMetadata: { webCommandMetadata: { url: '/shorts' } } },
  };
  shortsData.self = shortsData;              // 自己参照
  shortsData.endpoint.parent = shortsData;   // 相互参照

  const homeData = {
    title: 'ホーム',
    endpoint: { commandMetadata: { webCommandMetadata: { url: '/' } } },
  };
  homeData.self = homeData;

  // webCommandMetadata を持たない項目。url が見つからないので walk はグラフ全体を
  // 舐めきることになり、循環参照があるとここで初めて踏み抜く
  const cyclic = { title: 'なにか', kind: 'no-url' };
  cyclic.parent = cyclic;
  cyclic.child = { up: cyclic, list: [cyclic, { back: cyclic }] };

  const el = {
    guideShorts: new El('ytd-guide-entry-renderer', shortsData),
    guideHome: new El('ytd-guide-entry-renderer', homeData),
    guideCyclic: new El('ytd-guide-entry-renderer', cyclic),
    tabShorts: new El('yt-tab-shape', null, ' ショート '),
    tabVideos: new El('yt-tab-shape', null, ' 動画 '),
  };

  const warnings = [];
  const navigations = [];

  const document = {
    documentElement: {},
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll(sel) {
      if (sel.includes('guide-entry')) return [el.guideShorts, el.guideHome, el.guideCyclic];
      if (sel.includes('yt-tab-shape')) return [el.tabShorts, el.tabVideos];
      return [];
    },
  };

  const location = {
    pathname: '/',
    origin: 'https://www.youtube.com',
    replace: (u) => navigations.push(u),
  };

  const sandbox = {
    document,
    location,
    history: { pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {},
    console: { warn: (...a) => warnings.push(a.join(' ')), log() {} },
    MutationObserver: class { observe() {} },
    setTimeout: () => 0,
    setInterval: () => 0,
    URL,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  // 例外はそのまま呼び出し元へ投げる。落ちること自体がテスト対象
  vm.runInNewContext(SRC, vm.createContext(sandbox), { filename: 'main.js' });

  return { el, warnings, navigations };
}

test('循環参照つきの .data を渡しても落ちない', () => {
  assert.doesNotThrow(run);
});

test('sweep が例外を握りつぶしていない（そもそも投げない）', () => {
  const { warnings } = run();
  assert.deepEqual(warnings, [], `警告が出ている: ${warnings.join(' | ')}`);
});

test('サイドバーの「ショート」に印が付く', () => {
  const { el } = run();
  assert.equal(el.guideShorts.dataset.noShorts, '1');
});

test('サイドバーの「ホーム」には印が付かない', () => {
  const { el } = run();
  assert.equal(el.guideHome.dataset.noShorts, undefined);
});

test('URL を持たず循環参照だけある項目でも落ちず、印も付かない', () => {
  const { el } = run();
  assert.equal(el.guideCyclic.dataset.noShorts, undefined);
});

test('チャンネルページの「ショート」タブに印が付く', () => {
  const { el } = run();
  assert.equal(el.tabShorts.dataset.noShorts, '1');
});

test('「動画」タブには印が付かない', () => {
  const { el } = run();
  assert.equal(el.tabVideos.dataset.noShorts, undefined);
});
