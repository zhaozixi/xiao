import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, fold, looksTraditional, renderResearch, researchQuery, summarizeSearch, usableSources } from '../persona.js';

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

// ---------------------------------------------------------------------------
// She writes simplified characters
// ---------------------------------------------------------------------------

test('traditional sources are not quoted into her memory', () => {
  const result = {
    sources: [
      { title: '觀葉植物', url: 'https://a' },
      { title: '选购盆花，别只看颜值（信息服务台）', url: 'https://b' },
      { title: '裝幀事典:倫敦書籍藝術中心, 手工裝幀創作技法全書', url: 'https://c' },
    ],
  };
  const summary = summarizeSearch(result);
  assert.equal(summary, '选购盆花，别只看颜值（信息服务台）');
  assert.deepEqual(usableSources(result).map((source) => source.url), ['https://b']);
});

test('a traditional provider summary is dropped rather than converted', () => {
  const result = { content: '這是一段繁體中文的摘要，講的是植物養護。', sources: [{ title: '植物養護', url: 'https://a' }] };
  assert.equal(summarizeSearch(result), '');
});

test('the traditional check does not fire on simplified text', () => {
  assert.equal(looksTraditional('他的職業是編輯'), true);
  assert.equal(looksTraditional('他的职业是编辑'), false);
  assert.equal(looksTraditional(''), false);
  assert.equal(looksTraditional(undefined), false);
  // 著 and 於 exist in simplified too, so they are not in the set.
  assert.equal(looksTraditional('著名设计师'), false);
  // 路 and 案 are identical in both scripts: a false positive here would erase honest
  // simplified memories, which is worse than letting a traditional title through.
  assert.equal(looksTraditional('这条路线的方案'), false);
  assert.equal(looksTraditional('图书馆里的植物养护'), false);
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
