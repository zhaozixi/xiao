import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, fold, renderResearch, researchQuery, summarizeSearch } from '../persona.js';

const START = Date.UTC(2026, 9, 28, 9, 32, 0);

function birth(seed) {
  return {
    seq: 1,
    at: START,
    kind: 'birth',
    data: { instanceId: `i-${seed}`, seed, birthAt: START, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

test('the daily question is about her own life, and the same all day', () => {
  const view = fold([birth('research-seed-1')], {}, START);
  const first = researchQuery(view, 20_000);
  const second = researchQuery(view, 20_000);
  assert.equal(first, second);
  const mentionsHerLife =
    view.interests.some((interest) => first.includes(interest)) ||
    first.includes(view.hobby) ||
    first.includes(view.currentCity);
  assert.ok(mentionsHerLife, first);
});

test('three interests, distinct, and they steer what she reads', () => {
  const view = fold([birth('research-seed-2')], {}, START);
  assert.equal(view.interests.length, 3);
  assert.equal(new Set(view.interests).size, 3);

  let fromInterest = 0;
  for (let day = 20_000; day < 20_060; day += 1) {
    const query = researchQuery(view, day);
    if (view.interests.some((interest) => query.includes(interest))) fromInterest += 1;
  }
  assert.ok(fromInterest > 0 && fromInterest < 60, `interests drove ${fromInterest}/60 queries`);
});

test('different days ask different things', () => {
  const view = fold([birth('research-seed-1')], {}, START);
  const queries = new Set();
  for (let day = 20_000; day < 20_030; day += 1) queries.add(researchQuery(view, day));
  assert.ok(queries.size > 1, 'the question must rotate');
});

test('a search is compressed to something short', () => {
  const summary = summarizeSearch({
    content: '这是一段很长的回答。'.repeat(40),
    sources: [{ url: 'https://a', title: '标题一' }, { url: 'https://b', title: '标题二' }],
    truncated: false,
  });
  assert.ok(summary.length <= 200);
});

test('an empty search yields nothing worth remembering', () => {
  assert.equal(summarizeSearch({ sources: [], truncated: false }), '');
  assert.equal(summarizeSearch(undefined), '');
});

test('her notes render in their own block, newest first, within budget', () => {
  const notes = [
    { at: START, day: 1, query: '养植物 新手 要注意什么', summary: '少浇水，多晒太阳' },
    { at: START + 1, day: 2, query: '大连 周末 适合一个人去的地方', summary: '海边栈道不错' },
  ];
  const text = renderResearch(notes, { researchMaxChars: 200 });
  assert.ok(text.startsWith('你最近自己查过这些：'));
  assert.ok(text.includes('海边栈道不错'));
  assert.ok(text.indexOf('海边栈道') < text.indexOf('少浇水'), 'newest note comes first');
  assert.ok(text.length <= 200);
});

test('no notes or no budget renders nothing', () => {
  assert.equal(renderResearch([], { researchMaxChars: 200 }), '');
  assert.equal(renderResearch(undefined, { researchMaxChars: 200 }), '');
  assert.equal(renderResearch([{ at: 1, day: 1, query: 'x', summary: 'y' }], { researchMaxChars: 0 }), '');
  assert.equal(renderResearch([{ at: 1, day: 1, query: 'x', summary: '' }], { researchMaxChars: 200 }), '');
});
