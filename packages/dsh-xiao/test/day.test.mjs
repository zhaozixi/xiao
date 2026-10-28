import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, currentMoment, deriveDay, fold, renderNow, slotLabel, timeLabel } from '../persona.js';

const DAY = 86_400_000;
// A fixed local noon, so the test does not depend on the machine's timezone offset.
const NOON = new Date(2026, 9, 28, 12, 30, 0).getTime();

function viewOf(seed, jobCategory = 'employed', job = '在一家小公司做产品') {
  const birth = {
    seq: 1,
    at: NOON,
    kind: 'birth',
    data: { instanceId: `i-${seed}`, seed, birthAt: NOON, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
  return { ...fold([birth], {}, NOON), jobCategory, job };
}

test('a day has five parts that cover the whole clock', () => {
  const plan = deriveDay(viewOf('day-seed-1'), NOON);
  assert.equal(plan.length, 5);
  for (const slot of plan) {
    assert.ok(Number.isFinite(slot.from) && Number.isFinite(slot.to));
    assert.ok(typeof slot.text === 'string' && slot.text.length > 0);
  }
  // night wraps past midnight, so the other four must be contiguous.
  const sorted = plan.filter((slot) => slot.key !== 'night').sort((a, b) => a.from - b.from);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.equal(sorted[index].from, sorted[index - 1].to, `gap before ${sorted[index].key}`);
  }
  assert.ok(plan.some((slot) => slot.key === 'night' && slot.from > slot.to));
});

test('the same day keeps the same plan, a different day does not', () => {
  const view = viewOf('day-seed-2');
  assert.deepEqual(deriveDay(view, NOON), deriveDay(view, NOON + 60_000));
  const texts = new Set();
  for (let day = 0; day < 10; day += 1) {
    texts.add(deriveDay(view, NOON + day * DAY).map((slot) => slot.text).join('|'));
  }
  assert.ok(texts.size > 1, 'the plan should change with the date');
});

test('a day starts at local midnight, not at UTC midnight', () => {
  const view = viewOf('day-seed-6');
  const early = new Date(2026, 9, 28, 0, 10).getTime();
  const late = new Date(2026, 9, 28, 23, 50).getTime();
  const nextMorning = new Date(2026, 9, 29, 0, 20).getTime();
  assert.deepEqual(deriveDay(view, early), deriveDay(view, late), 'one local day, one plan');
  assert.notDeepEqual(deriveDay(view, late), deriveDay(view, nextMorning), 'a new day, a new plan');
});

test('the current moment falls in exactly one part of the day', () => {
  const view = viewOf('day-seed-3');
  for (const hour of [0, 7, 10, 12, 15, 19, 23]) {
    const at = new Date(2026, 9, 28, hour, 15, 0).getTime();
    const moment = currentMoment(view, at);
    assert.ok(moment.slot, `no slot at ${hour}:15`);
    assert.ok(moment.plan.some((slot) => slot.key === moment.slot && slot.text === moment.text));
  }
});

test('what she is doing depends on what she does for a living', () => {
  const office = deriveDay(viewOf('day-seed-4', 'employed', '在一家小公司做产品'), NOON);
  const student = deriveDay(viewOf('day-seed-4', 'student', '还在读书'), NOON);
  assert.notDeepEqual(
    office.map((slot) => slot.text),
    student.map((slot) => slot.text),
  );
});

test('the line says what time it is and what she is doing, within budget', () => {
  const view = viewOf('day-seed-5');
  const moment = currentMoment(view, NOON);
  const line = renderNow(moment, { nowMaxChars: 120 });
  assert.ok(line.includes(moment.text));
  assert.ok(line.length <= 120);
  assert.equal(timeLabel(NOON), '中午');
  assert.equal(renderNow(moment, { nowMaxChars: 0 }), '');
  assert.equal(renderNow(undefined, { nowMaxChars: 120 }), '');
});

test('the label always agrees with the part of the day she is in', () => {
  const view = viewOf('day-seed-7');
  const edges = [
    [0, 30],
    [6, 59],
    [7, 1],
    [11, 29],
    [11, 31],
    [13, 29],
    [13, 31],
    [17, 59],
    [18, 1],
    [21, 59],
    [22, 1],
  ];
  for (const [hour, minute] of edges) {
    const at = new Date(2026, 9, 28, hour, minute).getTime();
    const moment = currentMoment(view, at);
    const line = renderNow(moment, { nowMaxChars: 200 });
    assert.ok(line.startsWith(`此刻是${slotLabel(moment.slot)}`), `${hour}:${minute} produced ${line}`);
  }
});
