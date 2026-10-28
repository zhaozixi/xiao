import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, derivePersona, fold, renderCard } from '../persona.js';

const SEED = 'test-seed-0001';

function birthFact(overrides = {}) {
  return {
    seq: 1,
    at: 1_000,
    kind: 'birth',
    data: { instanceId: 'instance-a', seed: SEED, birthAt: 1_000, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
    ...overrides,
  };
}

test('derivePersona is deterministic for one seed', () => {
  assert.deepEqual(derivePersona(SEED), derivePersona(SEED));
});

test('age always agrees with the birth date', () => {
  const now = Date.now();
  for (let index = 0; index < 120; index += 1) {
    const born = now - 60 * 24 * 60 * 60 * 1000;
    const fact = {
      seq: 1,
      at: born,
      kind: 'birth',
      data: { instanceId: `age-${index}`, seed: `age-seed-${index}`, birthAt: born, rulesVersion: RULES_VERSION },
      source: 'seed',
      evidence: 'confirmed',
    };
    const view = fold([fact], {}, now);
    const [year, month, day] = view.birthDate.split('-').map(Number);
    const thisYear = new Date(now).getFullYear();
    const birthday = new Date(thisYear, month - 1, day).getTime();
    const fromCalendar = thisYear - year - (birthday > now ? 1 : 0);
    assert.equal(view.age, fromCalendar, `${view.birthDate} shown as ${view.age}, calendar says ${fromCalendar}`);
  }
});

test('different seeds produce different characters', () => {
  const a = derivePersona('seed-a');
  const b = derivePersona('seed-b');
  assert.notDeepEqual(a, b);
});

test('derived fields stay inside the declared ranges', () => {
  for (let i = 0; i < 200; i += 1) {
    const persona = derivePersona(`seed-${i}`);
    assert.ok(persona.age >= 18 && persona.age <= 60, `age out of range: ${persona.age}`);
    assert.ok(['female', 'male'].includes(persona.gender));
    assert.ok(persona.job.length > 0);
  }
});

test('fold returns null without a birth fact', () => {
  assert.equal(fold([], {}, Date.now()), null);
});

test('fold is pure: same facts, same view', () => {
  const facts = [birthFact()];
  const now = 1_000 + 12 * 30 * 24 * 60 * 60 * 1000;
  assert.deepEqual(fold(facts, { growthPerMonth: 1 / 12 }, now), fold(facts, { growthPerMonth: 1 / 12 }, now));
});

test('age grows with elapsed time and stops at 60', () => {
  const start = 1_000;
  const oneYear = 12 * 30 * 24 * 60 * 60 * 1000;
  const young = fold([birthFact()], { growthPerMonth: 1 / 12 }, start);
  const later = fold([birthFact()], { growthPerMonth: 1 / 12 }, start + 3 * oneYear);
  assert.equal(later.age, Math.min(60, young.age + 3));
});

test('job fact overrides the derived job, newest wins', () => {
  const facts = [
    birthFact(),
    { seq: 2, at: 2_000, kind: 'job', data: { job: '在书店做店员' }, source: 'user', evidence: 'confirmed' },
    { seq: 3, at: 3_000, kind: 'job', data: { job: '自己开了间小店' }, source: 'user', evidence: 'confirmed' },
  ];
  const view = fold(facts, {}, 3_000);
  assert.equal(view.job, '自己开了间小店');
});

test('tombstone removes the fact it targets', () => {
  const facts = [
    birthFact(),
    { seq: 2, at: 2_000, kind: 'job', data: { job: '在书店做店员' }, source: 'user', evidence: 'confirmed' },
    { seq: 3, at: 3_000, kind: 'tombstone', data: { targetSeq: 2 }, source: 'user', evidence: 'confirmed' },
  ];
  const view = fold(facts, {}, 3_000);
  assert.notEqual(view.job, '在书店做店员');
});

test('events fold newest-first and keep at most three', () => {
  const facts = [birthFact()];
  for (let i = 1; i <= 5; i += 1) {
    facts.push({ seq: i + 1, at: 1_000 + i, kind: 'event', data: { text: `event-${i}` }, source: 'sim', evidence: 'confirmed' });
  }
  const view = fold(facts, {}, 10_000);
  assert.deepEqual(view.recent, ['event-5', 'event-4', 'event-3']);
});

test('renderCard respects the budget and always keeps the disclaimer', () => {
  const view = fold([birthFact()], {}, 1_000);
  for (const budget of [60, 120, 220, 400]) {
    const card = renderCard(view, { cardMaxChars: budget });
    assert.ok(card.length <= budget, `card over budget ${budget}: ${card.length}`);
    assert.ok(card.includes('虚拟角色'), `disclaimer missing at budget ${budget}`);
  }
});

test('cardMaxChars 0 disables the card', () => {
  const view = fold([birthFact()], {}, 1_000);
  assert.equal(renderCard(view, { cardMaxChars: 0 }), '');
});
