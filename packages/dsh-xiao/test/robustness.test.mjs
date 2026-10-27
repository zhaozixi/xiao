import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, derivePersona, fold, generateLife, renderCard, toneOf } from '../persona.js';

function birthFact(seq, at, data) {
  return { seq, at, kind: 'birth', data, source: 'seed', evidence: 'confirmed' };
}

test('the persona card never exceeds its budget, at any budget', () => {
  const view = fold(
    [birthFact(1, 1_000, { instanceId: 'a', seed: 'budget-seed', birthAt: 1_000, rulesVersion: RULES_VERSION })],
    {},
    1_000,
  );
  for (let budget = 1; budget <= 300; budget += 1) {
    const card = renderCard(view, { cardMaxChars: budget });
    assert.ok(card.length <= budget, `budget ${budget} produced ${card.length} characters`);
  }
});

test('a readable card keeps the disclaimer once the budget allows it', () => {
  const view = fold(
    [birthFact(1, 1_000, { instanceId: 'a', seed: 'budget-seed', birthAt: 1_000, rulesVersion: RULES_VERSION })],
    {},
    1_000,
  );
  for (const budget of [80, 120, 220]) {
    assert.ok(renderCard(view, { cardMaxChars: budget }).includes('虚拟角色'), `missing disclaimer at ${budget}`);
  }
});

test('a corrupt birth record is skipped instead of throwing', () => {
  const facts = [
    birthFact(10, 1_000, {}), // destroyed record: no seed
    birthFact(20, 2_000, { instanceId: 'b', seed: 'survivor', birthAt: 2_000, rulesVersion: RULES_VERSION }),
  ];
  const view = fold(facts, {}, 2_000);
  assert.ok(view, 'fold must still find the usable birth');
  assert.equal(view.seed, 'survivor');
  assert.equal(view.age, derivePersona('survivor').age);
});

test('fold returns null when no birth record is usable', () => {
  assert.equal(fold([birthFact(10, 1_000, { instanceId: 'a' })], {}, 1_000), null);
  assert.equal(fold([birthFact(10, 1_000, { seed: '' })], {}, 1_000), null);
});

test('a birth record without birthAt falls back to its own timestamp', () => {
  const at = 1_000_000;
  const view = fold([birthFact(1, at, { instanceId: 'a', seed: 'no-birth-at' })], {}, at);
  assert.ok(Number.isFinite(view.age));
  assert.equal(view.age, derivePersona('no-birth-at').age);
  assert.equal(view.bornAt, at);
});

test('aging is monotonic and stops at the ceiling', () => {
  const start = 1_000_000;
  const month = 30 * 24 * 60 * 60 * 1000;
  const facts = [birthFact(1, start, { instanceId: 'a', seed: 'aging-seed', birthAt: start })];
  const base = fold(facts, { growthPerMonth: 1 / 12 }, start).age;
  assert.equal(fold(facts, { growthPerMonth: 1 / 12 }, start + 12 * month).age, Math.min(60, base + 1));
  assert.equal(fold(facts, { growthPerMonth: 1 / 12 }, start + 2000 * month).age, 60);
});

test('life generation tolerates a view without events', () => {
  const result = generateLife({
    seed: 'no-events',
    view: { jobCategory: 'student' },
    cfg: { lifeEventsPerWeek: 1 },
    days: 14,
    now: Date.UTC(2026, 9, 28),
  });
  assert.ok(Array.isArray(result.events));
  assert.equal(result.tone, '平静');
});

test('toneOf tolerates missing input', () => {
  assert.equal(toneOf(undefined), '平静');
  assert.equal(toneOf(null), '平静');
});
