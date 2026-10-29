import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The client bundle is a browser module: it registers itself with the page's module loader
 * and gets React from it. This harness supplies both, then reaches into the plugin object
 * for the pure brain helpers, so the layout can be tested without a browser.
 */
let plugin;
const ReactStub = {
  // A tiny vnode shape, so the component's tree can be inspected.
  createElement: (type, props, ...children) => ({ type, props, children }),
  // Hooks return their initial value, which is enough to run a component once — and that
  // catches things like referencing a later `const` from a dependency array.
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  Component: class {},
};

globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      plugin = spec.factory((name) => {
        if (name === 'react') return ReactStub;
        return {};
      });
    },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  devicePixelRatio: 1,
};

await import('../client.js');

const { buildBrain, stepBrain, MemoryBrain, XiaoPage } = plugin._internals;

const VALUE = {
  relations: [
    { id: 'mother', kind: 'family', name: '刘若' },
    { id: 'friend', kind: 'friend', name: '周斌' },
  ],
  interests: ['地方志', '天文'],
  places: { home: { city: '合肥', area: '老城区' }, work: { name: '上班的地方' }, nearby: ['街角的面馆'] },
  research: [{ at: 1, query: '地方志 入门 看什么' }],
  facts: [
    { seq: 2, kind: 'user_fact', data: { text: '他和周斌一起吃过饭' }, at: 10 },
    { seq: 3, kind: 'event', data: { text: '在老城区的面馆坐了会儿' }, at: 11 },
    { seq: 4, kind: 'job', data: { job: '在书店做店员' }, at: 12 },
    { seq: 5, kind: 'override', data: { field: 'city', value: '苏州' }, at: 13 },
    { seq: 6, kind: 'birth', data: {}, at: 14 },
  ],
};

test('the graph has a centre, the cast, the interests and the memories', () => {
  const graph = buildBrain(VALUE);
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(ids.has('self'));
  assert.ok(ids.has('rel:mother'));
  assert.ok(ids.has('int:地方志'));
  assert.ok(ids.has('place:home'));
  assert.ok(ids.has('fact:2'));
  assert.ok(ids.has('note:1'));
  // A birth record carries no text, so it does not become a node.
  assert.ok(!ids.has('fact:6'));
});

test('every node but the centre is anchored to it', () => {
  const graph = buildBrain(VALUE);
  const self = graph.nodes.find((node) => node.id === 'self');
  const anchors = graph.edges.filter((edge) => edge.a === self);
  assert.equal(anchors.length, graph.nodes.length - 1);
});

test('a sentence that names someone is connected to that person', () => {
  const graph = buildBrain(VALUE);
  const fact = graph.nodes.find((node) => node.id === 'fact:2');
  const friend = graph.nodes.find((node) => node.id === 'rel:friend');
  assert.ok(graph.edges.some((edge) => edge.kind === 'mention' && ((edge.a === fact && edge.b === friend) || (edge.a === friend && edge.b === fact))));
});

test('the layout settles instead of flying apart', () => {
  const graph = buildBrain(VALUE);
  for (let step = 0; step < 400; step += 1) stepBrain(graph);
  const positions = graph.nodes.map((node) => Math.hypot(node.x, node.y, node.z));
  for (const radius of positions) assert.ok(Number.isFinite(radius) && radius < 4000, `radius ${radius}`);
  // The centre is pinned.
  const self = graph.nodes.find((node) => node.id === 'self');
  assert.deepEqual([self.x, self.y, self.z], [0, 0, 0]);
});

test('a hundred memories still build and settle quickly', () => {
  const big = {
    ...VALUE,
    facts: Array.from({ length: 120 }, (_, index) => ({
      seq: index + 2,
      kind: 'user_fact',
      data: { text: `第 ${index} 条记忆，提到周斌和合肥` },
      at: index,
    })),
  };
  const started = process.hrtime.bigint();
  const graph = buildBrain(big);
  for (let step = 0; step < 60; step += 1) stepBrain(graph);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(graph.nodes.length >= 120);
  assert.ok(elapsed < 3000, `took ${elapsed} ms`);
});

test('the component renders a canvas and a hint', () => {
  const tree = MemoryBrain({ graph: buildBrain(VALUE), dict: { brainHint: '拖动旋转' } });
  assert.equal(tree.type, 'div');
  const canvas = tree.children.find((child) => child && child.type === 'canvas');
  assert.ok(canvas, 'a canvas element is rendered');
  assert.equal(canvas.props.style.height, 420);
  const hint = tree.children.find((child) => child && child.type === 'div');
  assert.ok(hint, 'the hint line is rendered');
});

test('the page runs once without touching a variable before it exists', () => {
  // This is the guard for a real crash: the view toggle was declared after the effect that
  // listed it as a dependency, and the dependency array is evaluated during render.
  const ctx = { locale: { getLocale: () => ({ active: 'zh' }) } };
  const tree = XiaoPage({ ctx });
  assert.ok(tree, 'the page produced a tree');
  const toggle = JSON.stringify(tree).includes('viewBrain') || JSON.stringify(tree).includes('记忆脑图');
  assert.ok(toggle, 'the view toggle is present');
});
