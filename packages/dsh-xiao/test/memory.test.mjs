import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RULES_VERSION,
  expandMemory,
  fold,
  generateLife,
  memoryRecords,
  planUpdate,
  searchMemory,
} from '../persona.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 15, 0).getTime();

function birth(seed, at = NOW - 90 * DAY) {
  return {
    seq: 1,
    at,
    kind: 'birth',
    data: { instanceId: `i-${seed}`, seed, birthAt: at, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

const userFact = (seq, text, at = NOW - 20 * DAY, extra = {}) => ({
  seq,
  at,
  kind: 'user_fact',
  data: { text, ...extra },
  source: 'user',
  evidence: 'confirmed',
});

// ---------------------------------------------------------------------------
// Recall
// ---------------------------------------------------------------------------

test('recall finds the fact and says where it came from', () => {
  const facts = [birth('mem-1'), userFact(2, '他是一名程序员，在上海工作'), userFact(3, '他养了一只橘猫，叫年糕')];
  const result = searchMemory({ facts, query: '猫' });
  assert.equal(result.total, 1);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].source, 'fact');
  assert.equal(result.hits[0].id, 'fact:3');
  assert.ok(result.hits[0].summary.includes('橘猫'));
});

test('an empty query returns the most recent memories', () => {
  const facts = [birth('mem-2'), userFact(2, '旧的事'), userFact(3, '新的事', NOW - 2 * DAY)];
  const result = searchMemory({ facts, query: '' });
  assert.equal(result.hits[0].summary, '新的事');
});

test('recall covers what she looked up and what she lived', () => {
  const notes = [{ at: NOW - DAY, day: 1, query: '手工装帧 入门', summary: '从线装开始' }];
  const events = [{ id: '1.0', kind: 'rest', at: NOW - 2 * DAY, text: '下雨，在大连的街上走了一段' }];
  const byNote = searchMemory({ notes, events, query: '装帧' });
  assert.equal(byNote.hits[0].source, 'note');
  const byEvent = searchMemory({ notes, events, query: '大连' });
  assert.equal(byEvent.hits[0].source, 'event');
});

test('recall says nothing when nothing matches', () => {
  const facts = [birth('mem-3'), userFact(2, '他喜欢咖啡')];
  const result = searchMemory({ facts, query: '潜水艇' });
  assert.equal(result.total, 0);
  assert.deepEqual(result.hits, []);
});

test('a hit expands to its full text, and a bad id does not', () => {
  const long = '他一直想学做面包，但总是没时间，最近买了个烤箱还在箱子里'.repeat(3);
  const facts = [birth('mem-4'), userFact(2, long)];
  const hit = searchMemory({ facts, query: '面包' }).hits[0];
  assert.ok(hit.summary.length <= 61, 'summary stays short');
  const full = expandMemory({ facts }, hit.id);
  assert.equal(full, long);
  assert.equal(expandMemory({ facts }, 'fact:999999'), undefined);
  assert.equal(expandMemory({ facts }, 'nonsense'), undefined);
});

// ---------------------------------------------------------------------------
// What is hidden from the prompt must be hidden from search too
// ---------------------------------------------------------------------------

test('search cannot reach a fact the prompt no longer shows', () => {
  const records = [
    birth('mem-10'),
    userFact(2, '他养了一只猫'),
    userFact(3, '他在上海工作'),
    userFact(4, '他这周在出差', NOW - 40 * DAY, { temporary: true }),
    { seq: 5, at: NOW - 18 * DAY, kind: 'dispute', data: { targetSeq: 2 }, source: 'user', evidence: 'confirmed' },
    { seq: 6, at: NOW - 17 * DAY, kind: 'tombstone', data: { targetSeq: 3 }, source: 'user', evidence: 'confirmed' },
  ];
  const visible = memoryRecords({ records, cfg: { temporaryFactDays: 14 }, now: NOW });
  assert.deepEqual(visible.map((record) => record.seq), [], 'nothing visible in this fixture');

  assert.equal(searchMemory({ facts: visible, query: '猫' }).total, 0, 'disputed');
  assert.equal(searchMemory({ facts: visible, query: '上海' }).total, 0, 'forgotten');
  assert.equal(searchMemory({ facts: visible, query: '出差' }).total, 0, 'expired temporary');
});

test('a visible fact is still reachable through the same filter', () => {
  const records = [birth('mem-11'), userFact(2, '他养了一只猫')];
  const visible = memoryRecords({ records, cfg: { temporaryFactDays: 14 }, now: NOW });
  assert.equal(searchMemory({ facts: visible, query: '猫' }).total, 1);
});

// ---------------------------------------------------------------------------
// Query shape
// ---------------------------------------------------------------------------

test('a Chinese phrase finds the memory even without a space to split on', () => {
  const facts = [birth('mem-12'), userFact(2, '他是一名程序员，在上海工作')];
  const result = searchMemory({ facts, query: '他在上海做什么' });
  assert.equal(result.total, 1, 'bigram fallback should match');
  assert.ok(result.hits[0].summary.includes('上海'));
});

test('asking with a different word still finds the memory', () => {
  const facts = [
    birth('mem-16'),
    { seq: 2, at: NOW - DAY, kind: 'job', data: { job: '在市里的方志办做编辑', category: 'employed' }, source: 'model', evidence: 'confirmed' },
    userFact(3, '他养了一只猫'),
  ];
  assert.equal(searchMemory({ facts, query: '她在哪里工作' }).total, 1, '工作 → 职业');
  assert.equal(searchMemory({ facts, query: '上班的地方' }).total, 1, '上班 → 职业');
  assert.equal(searchMemory({ facts, query: '他的宠物' }).total, 1, '宠物 → 猫');
  assert.equal(searchMemory({ facts, query: '潜水艇' }).total, 0, 'unrelated is still empty');
});

test('a life event is not returned twice, once as a fact and once as an event', () => {
  const event = { seq: 2, at: NOW - 2 * DAY, kind: 'event', data: { id: '1.0', day: 1, kind: 'rest', text: '在大连的街上走了一段' }, source: 'sim', evidence: 'confirmed' };
  const facts = [birth('mem-13'), event];
  const events = [{ id: '1.0', kind: 'rest', at: NOW - 2 * DAY, text: '在大连的街上走了一段' }];
  const result = searchMemory({ facts, events, query: '大连' });
  assert.equal(result.total, 1);
  assert.equal(result.hits[0].id, 'event:1.0');
});

test('a disputed fact leaves her memory but stays in the log', () => {
  const facts = [birth('mem-5'), userFact(2, '他说他养了猫')];
  const dispute = {
    seq: 3,
    at: NOW - DAY,
    kind: 'dispute',
    data: { targetSeq: 2, reason: '他说没有这回事' },
    source: 'user',
    evidence: 'confirmed',
  };
  const before = fold(facts, {}, NOW);
  assert.deepEqual(before.notes, ['他说他养了猫']);

  const after = fold([...facts, dispute], {}, NOW);
  assert.deepEqual(after.notes, [], 'a disputed fact is not treated as known');
  assert.equal(after.disputed.length, 1);
  assert.equal(after.disputed[0].seq, 2);
  assert.equal(after.disputed[0].reason, '他说没有这回事');
});

test('dispute refuses the birth fact, a missing fact and a repeat', () => {
  const facts = [birth('mem-6'), userFact(2, '他在上海')];
  const view = fold(facts, {}, NOW);
  assert.equal(planUpdate({ action: 'dispute', seq: 1 }, view, facts).code, 'cannot_dispute');
  assert.equal(planUpdate({ action: 'dispute', seq: 99 }, view, facts).code, 'unknown_fact');
  const dispute = {
    seq: 3,
    at: NOW,
    kind: 'dispute',
    data: { targetSeq: 2 },
    source: 'user',
    evidence: 'confirmed',
  };
  assert.equal(planUpdate({ action: 'dispute', seq: 2 }, view, [...facts, dispute]).code, 'already_disputed');
});

// ---------------------------------------------------------------------------
// Temporary facts
// ---------------------------------------------------------------------------

test('a temporary fact fades, a lasting one does not', () => {
  const facts = [
    birth('mem-7'),
    userFact(2, '他这周在出差', NOW - 30 * DAY, { temporary: true }),
    userFact(3, '他是程序员', NOW - 30 * DAY),
  ];
  const view = fold(facts, { temporaryFactDays: 14 }, NOW);
  assert.deepEqual(view.notes, ['他是程序员']);
  assert.equal(view.expiredNotes, 1);

  const early = fold(facts, { temporaryFactDays: 14 }, NOW - 20 * DAY);
  assert.equal(early.notes.length, 2, 'it is still fresh before the window closes');

  const never = fold(facts, { temporaryFactDays: 0 }, NOW);
  assert.equal(never.notes.length, 2, '0 turns expiry off');
});

test('remember can mark a fact temporary', () => {
  const view = fold([birth('mem-8')], {}, NOW);
  const planned = planUpdate({ action: 'remember', text: '他这周在出差', temporary: true }, view, []);
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.data, { text: '他这周在出差', temporary: true });
  const lasting = planUpdate({ action: 'remember', text: '他是程序员' }, view, []);
  assert.deepEqual(lasting.data, { text: '他是程序员' });
});

// ---------------------------------------------------------------------------
// Spoken events come second
// ---------------------------------------------------------------------------

test('what she has not told the user yet comes first', () => {
  const facts = [
    birth('mem-9'),
    {
      seq: 2,
      at: NOW - 2 * DAY,
      kind: 'event',
      data: { id: '1.0', day: 1, kind: 'rest', text: '已经说过的事', spoken: true },
      source: 'sim',
      evidence: 'confirmed',
    },
    {
      seq: 3,
      at: NOW - 3 * DAY,
      kind: 'event',
      data: { id: '1.1', day: 1, kind: 'good', text: '还没提过的事' },
      source: 'sim',
      evidence: 'confirmed',
    },
  ];
  const view = fold(facts, {}, NOW);
  assert.equal(view.recent[0], '还没提过的事', 'unspoken news ranks above spoken, even if older');
  assert.equal(view.eventsAll.find((event) => event.id === '1.0').spoken, true);
  assert.equal(view.eventsAll.find((event) => event.id === '1.1').spoken, false);
});

// ---------------------------------------------------------------------------
// A disputed event must not come back
// ---------------------------------------------------------------------------

test('a disputed life event is not regenerated under the same id', () => {
  const born = NOW - 30 * DAY;
  const facts = [birth('mem-14', born)];
  const before = fold(facts, { lifeEventsPerWeek: 2 }, NOW);
  const life = generateLife({ seed: before.seed, view: before, cfg: { lifeEventsPerWeek: 2 }, days: 30, now: NOW });
  const target = life.events.find((event) => event.day < life.toDay);
  assert.ok(target, 'the fixture needs a past event');

  const pinned = {
    seq: 2,
    at: NOW - 1_000,
    kind: 'event',
    data: { id: target.id, day: target.day, kind: target.kind, text: target.text },
    source: 'sim',
    evidence: 'confirmed',
  };
  const dispute = {
    seq: 3,
    at: NOW - 500,
    kind: 'dispute',
    data: { targetSeq: 2 },
    source: 'user',
    evidence: 'confirmed',
  };
  const after = fold([...facts, pinned, dispute], { lifeEventsPerWeek: 2 }, NOW);
  assert.equal(after.eventsAll.some((event) => event.id === target.id), false);
  assert.deepEqual(after.disputedEventIds, [target.id]);

  const regenerated = generateLife({ seed: after.seed, view: after, cfg: { lifeEventsPerWeek: 2 }, days: 30, now: NOW });
  assert.equal(regenerated.events.some((event) => event.id === target.id), false, 'the correction must stick');
});

test('a hit carries a readable local date', () => {
  const facts = [birth('mem-15'), userFact(2, '他喜欢咖啡', NOW)];
  const hit = searchMemory({ facts, query: '咖啡' }).hits[0];
  assert.match(hit.date, /^\d{4}-\d{2}-\d{2}$/);
  const local = new Date(NOW);
  assert.equal(
    hit.date,
    `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
  );
});
