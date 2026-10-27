import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, fold, renderUserNotes } from '../persona.js';

const MONTH = 30 * 24 * 60 * 60 * 1000;
const START = 1_760_000_000_000;

function birth() {
  return {
    seq: 1,
    at: START,
    kind: 'birth',
    data: { instanceId: 'notes', seed: 'notes-seed', birthAt: START, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

function note(seq, at, text) {
  return { seq, at, kind: 'user_fact', data: { text }, source: 'user', evidence: 'confirmed' };
}

function ageCorrection(seq, at, age) {
  return { seq, at, kind: 'override', data: { field: 'age', value: age }, source: 'user', evidence: 'confirmed' };
}

// ---------------------------------------------------------------------------
// B_U: remembered facts must actually reach the prompt
// ---------------------------------------------------------------------------

test('nothing to remember renders nothing', () => {
  const view = fold([birth()], {}, START);
  assert.equal(renderUserNotes(view, { userSummaryMaxChars: 200 }), '');
});

test('a zero budget disables the block', () => {
  const view = fold([birth(), note(2, START + 1, '住在杭州')], {}, START);
  assert.equal(renderUserNotes(view, { userSummaryMaxChars: 0 }), '');
});

test('remembered facts are rendered newest first', () => {
  const facts = [birth(), note(2, START + 1, '住在杭州'), note(3, START + 2, '晚上工作')];
  const view = fold(facts, {}, START + 3);
  const text = renderUserNotes(view, { userSummaryMaxChars: 200 });
  assert.ok(text.includes('住在杭州'));
  assert.ok(text.includes('晚上工作'));
  assert.ok(text.indexOf('晚上工作') < text.indexOf('住在杭州'), 'newest note must come first');
});

test('the remembered block never exceeds its own budget', () => {
  const facts = [birth()];
  for (let index = 0; index < 12; index += 1) {
    facts.push(note(index + 2, START + index, `第 ${index} 条比较长的用户事实，用来把预算撑满`));
  }
  const view = fold(facts, {}, START + 20);
  for (const budget of [40, 80, 120, 200]) {
    const text = renderUserNotes(view, { userSummaryMaxChars: budget });
    assert.ok(text.length <= budget, `budget ${budget} produced ${text.length}`);
  }
});

test('forgetting removes the fact from the remembered block', () => {
  const facts = [
    birth(),
    note(2, START + 1, '住在杭州'),
    { seq: 3, at: START + 2, kind: 'tombstone', data: { targetSeq: 2 }, source: 'user', evidence: 'confirmed' },
  ];
  const view = fold(facts, {}, START + 3);
  assert.equal(renderUserNotes(view, { userSummaryMaxChars: 200 }), '');
});

// ---------------------------------------------------------------------------
// A corrected age keeps aging
// ---------------------------------------------------------------------------

test('an age correction is a new starting point, not a freeze', () => {
  const corrected = ageCorrection(2, START + 1_000, 30);
  const atCorrection = fold([birth(), corrected], { growthPerMonth: 1 / 12 }, START + 1_000);
  assert.equal(atCorrection.age, 30);

  const aYearLater = fold([birth(), corrected], { growthPerMonth: 1 / 12 }, START + 1_000 + 12 * MONTH);
  assert.equal(aYearLater.age, 31, 'age must keep growing after the correction');

  const muchLater = fold([birth(), corrected], { growthPerMonth: 1 / 12 }, START + 1_000 + 600 * MONTH);
  assert.equal(muchLater.age, 60, 'growth stops at the ceiling');
});

test('the latest age correction wins', () => {
  const facts = [birth(), ageCorrection(2, START + 1_000, 30), ageCorrection(3, START + 2_000, 25)];
  const view = fold(facts, { growthPerMonth: 1 / 12 }, START + 2_000);
  assert.equal(view.age, 25);
});

test('a correction cannot escape the declared range', () => {
  const tooHigh = fold([birth(), ageCorrection(2, START + 1_000, 99)], { growthPerMonth: 1 / 12 }, START + 1_000);
  assert.equal(tooHigh.age, 60);
});
