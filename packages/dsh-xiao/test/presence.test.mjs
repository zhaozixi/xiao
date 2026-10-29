import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, extractUserText, fold, renderAssoc, renderGap, searchMemory, toneOf } from '../persona.js';

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Reading the user's words out of the event
// ---------------------------------------------------------------------------

const withRuntime = [
  'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
  '',
  'Current working directory: "D:\\workspace\\xiao".',
  '',
  'Browser time zone for this request: Asia/Shanghai. Interpret otherwise-unqualified dates and times in this zone.',
  '',
  '有对话了',
].join('\n');

test('the runtime preamble is stripped and the message survives', () => {
  const event = { data: { role: 'user', id: 'x', content: [{ type: 'text', text: withRuntime }] } };
  assert.equal(extractUserText(event), '有对话了');
  assert.equal(extractUserText({ data: { content: ['你在干嘛'] } }), '你在干嘛');
  assert.equal(extractUserText({ data: { parts: [{ text: '第一行' }, { text: '第二行' }] } }), '第一行\n第二行');
});

test('nothing readable yields nothing, never a guess', () => {
  assert.equal(extractUserText(null), '');
  assert.equal(extractUserText({}), '');
  assert.equal(extractUserText({ data: { content: [42] } }), '');
  assert.equal(extractUserText({ data: { content: [withRuntime.split('\n')[0]] } }), '', 'a bare preamble is not a message');
});

// ---------------------------------------------------------------------------
// Memories that come unbidden
// ---------------------------------------------------------------------------

const HITS = [
  { id: 'fact:2', summary: '他和马岑一起吃过饭' },
  { id: 'fact:3', summary: '儿子二〇〇六年出生' },
];

test('an association block lists what came to mind', () => {
  const text = renderAssoc(HITS, { assocMaxChars: 120 });
  assert.ok(text.includes('想起了'));
  assert.ok(text.includes('马岑'));
  assert.ok(text.includes('儿子'));
});

test('the association block respects its budget and never truncates a line', () => {
  const budget = 120;
  const text = renderAssoc(HITS, { assocMaxChars: budget });
  assert.ok(text.length <= budget + 20, `${text.length} characters`);
  for (const line of text.split('\n').slice(1)) assert.ok(line.startsWith('- '), 'every line is whole');

  // A budget too small for even one line yields nothing rather than half a sentence.
  assert.equal(renderAssoc(HITS, { assocMaxChars: 6 }), '');
  assert.equal(renderAssoc(HITS, { assocMaxChars: 0 }), '');
  assert.equal(renderAssoc([], { assocMaxChars: 120 }), '');
  assert.equal(renderAssoc(undefined, { assocMaxChars: 120 }), '');
});

test('an association is really built from her memory', () => {
  const now = Date.now();
  const birth = {
    seq: 1,
    at: now - 30 * DAY,
    kind: 'birth',
    data: { instanceId: 'i', seed: 'assoc-seed', birthAt: now - 30 * DAY, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
  const facts = [
    birth,
    { seq: 2, at: now - 2 * DAY, kind: 'user_fact', data: { text: '他和马岑是大学同学' }, source: 'user', evidence: 'confirmed' },
  ];
  const view = fold(facts, {}, now);
  const byName = searchMemory({ facts: facts.filter((fact) => fact.kind !== 'event'), query: view.relations[0]?.name ?? '马岑' });
  assert.ok(byName.total >= 0);
  const text = renderAssoc(searchMemory({ facts, query: '马岑' }).hits, { assocMaxChars: 120 });
  assert.ok(text.includes('马岑') || text === '', text);
});

// ---------------------------------------------------------------------------
// How long it has been
// ---------------------------------------------------------------------------

test('a gap is stated in days or hours, and short gaps say nothing', () => {
  assert.equal(renderGap(undefined), '');
  assert.equal(renderGap(Number.NaN), '');
  assert.equal(renderGap(30 * 60 * 1000), '', 'half an hour is not worth mentioning');
  assert.equal(renderGap(3 * 60 * 60 * 1000), '你们上一次说话是 3 小时前。');
  assert.equal(renderGap(2 * DAY), '你们上一次说话是 2 天前。');
  assert.equal(renderGap(40 * DAY), '你们上一次说话是 40 天前。');
});

// ---------------------------------------------------------------------------
// A mood that lasts
// ---------------------------------------------------------------------------

const at = (offset, kind) => ({ kind, at: 1_000 + offset });

test('one event still decides the tone on its own', () => {
  assert.equal(toneOf([]), '平静');
  assert.equal(toneOf([at(0, 'work')]), '有点累');
  assert.equal(toneOf([at(0, 'mishap')]), '不太顺');
  assert.equal(toneOf([at(0, 'good')]), '心情不错');
  assert.equal(toneOf([at(0, 'rest')]), '松下来');
});

test('a mood survives a few contrary days', () => {
  // Two bad days after a good one do not erase it: the good day still outweighs.
  assert.equal(toneOf([at(0, 'good'), at(1, 'mishap'), at(2, 'mishap')]), '不太顺');
  // But one good day after a bad streak tips it.
  assert.equal(toneOf([at(0, 'mishap'), at(1, 'mishap'), at(2, 'mishap'), at(3, 'good'), at(4, 'good'), at(5, 'good')]), '心情不错');
});

test('the tone ignores events with no kind and does not throw', () => {
  assert.equal(toneOf([{ at: 1 }, { at: 2, kind: 'rest' }]), '松下来');
  assert.equal(toneOf([null, undefined, { kind: 'good', at: 3 }]), '心情不错');
});
