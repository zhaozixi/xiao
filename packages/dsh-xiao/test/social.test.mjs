import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, derivePersona, fold, renderCard } from '../persona.js';

const START = Date.UTC(2026, 9, 28, 9, 32, 0);
const YEAR = 365.25 * 24 * 60 * 60 * 1000;

function birth(seed, at = START) {
  return {
    seq: 1,
    at,
    kind: 'birth',
    data: { instanceId: `i-${seed}`, seed, birthAt: at, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

test('a persona is born somewhere, on some date, with parents', () => {
  const persona = derivePersona('social-seed-1');
  assert.ok(typeof persona.birthCity === 'string' && persona.birthCity.length > 0);
  assert.ok(persona.birthMonth >= 1 && persona.birthMonth <= 12);
  assert.ok(persona.birthDay >= 1 && persona.birthDay <= 28);
  const ids = persona.relations.map((relation) => relation.id);
  assert.ok(ids.includes('mother'), 'a mother is mandatory');
  assert.ok(ids.includes('father'), 'a father is mandatory');
  assert.ok(ids.length >= 4, 'parents, a friend, and someone from school or work');
  for (const relation of persona.relations) {
    assert.ok(relation.name && relation.role && relation.detail);
    assert.ok(['family', 'friend', 'classmate', 'work', 'partner', 'child'].includes(relation.kind));
  }
});

test('a partner and a child are plausible but never mandatory', () => {
  let withPartner = 0;
  for (let index = 0; index < 60; index += 1) {
    const persona = derivePersona(`partner-seed-${index}`);
    const ids = persona.relations.map((relation) => relation.id);
    const hasPartner = ids.includes('partner');
    const hasChild = ids.includes('child');
    if (hasPartner) {
      withPartner += 1;
      assert.ok(persona.age >= 25, 'a partner only appears for adults');
    }
    if (hasChild) {
      assert.ok(hasPartner, 'a child implies a partner');
      assert.ok(persona.age >= 32, 'a child only appears for older adults');
    }
  }
  assert.ok(withPartner > 0 && withPartner < 60, 'some personas have a partner, not all');
});

test('relations are deterministic and never share a name', () => {
  const a = derivePersona('social-seed-2');
  const b = derivePersona('social-seed-2');
  assert.deepEqual(a.relations, b.relations);
  const names = a.relations.map((relation) => relation.name);
  assert.equal(new Set(names).size, names.length);
});

test('the life history runs from birth to now, in order', () => {
  const view = fold([birth('social-seed-11')], { growthPerMonth: 1 / 12 }, START);
  const history = view.lifeHistory;
  assert.ok(history.length >= 5, `expected a timeline, got ${history.length}`);
  assert.equal(history[0].text, `出生在${view.birthCity}`);
  assert.equal(history[0].date, view.birthDate);
  for (let index = 1; index < history.length; index += 1) {
    assert.ok(history[index].date > history[index - 1].date, 'milestones must be ordered');
    assert.ok(history[index].age > history[index - 1].age);
  }
  assert.ok(history[history.length - 1].age <= view.age, 'nothing may happen after her current age');
});

test('the life history is stable across time and different for different seeds', () => {
  const a = fold([birth('social-seed-12')], { growthPerMonth: 1 / 12 }, START);
  const aLater = fold([birth('social-seed-12')], { growthPerMonth: 1 / 12 }, START + 2 * YEAR);
  const kept = a.lifeHistory.filter((milestone) => milestone.age <= aLater.age);
  assert.deepEqual(kept, aLater.lifeHistory.slice(0, kept.length));

  const b = fold([birth('social-seed-13')], { growthPerMonth: 1 / 12 }, START);
  assert.notDeepEqual(
    a.lifeHistory.map((milestone) => milestone.text),
    b.lifeHistory.map((milestone) => milestone.text),
  );
});

test('a student gets a classmate instead of a colleague', () => {
  const jobs = ['social-seed-3', 'social-seed-4', 'social-seed-5', 'social-seed-6'];
  for (const seed of jobs) {
    const persona = derivePersona(seed);
    const kinds = persona.relations.map((relation) => relation.kind);
    if (persona.jobCategory === 'student') {
      assert.ok(kinds.includes('classmate'), `${seed} should have a classmate`);
      assert.ok(!kinds.includes('work'), `${seed} should not have a colleague`);
    } else {
      assert.ok(kinds.includes('work'), `${seed} should have a colleague`);
    }
  }
});

test('the birth date matches her age and does not move as time passes', () => {
  const now = START;
  const view = fold([birth('social-seed-7')], { growthPerMonth: 1 / 12 }, now);
  const bornYear = Number(view.birthDate.slice(0, 4));
  assert.equal(Number.isInteger(bornYear), true);
  assert.ok(bornYear <= new Date(now).getFullYear() - view.age);
  assert.ok(bornYear >= new Date(now).getFullYear() - view.age - 1);

  const later = fold([birth('social-seed-7')], { growthPerMonth: 1 / 12 }, now + 3 * YEAR);
  assert.equal(later.birthDate, view.birthDate, 'the date she was born cannot move');
});

test('an age correction re-anchors the birth date', () => {
  const correction = {
    seq: 2,
    at: START + 1_000,
    kind: 'override',
    data: { field: 'age', value: 30 },
    source: 'user',
    evidence: 'confirmed',
  };
  const view = fold([birth('social-seed-8'), correction], { growthPerMonth: 1 / 12 }, START + 1_000);
  assert.equal(view.age, 30);
  assert.equal(Number(view.birthDate.slice(0, 4)), new Date(START).getFullYear() - 30);
});

test('the card mentions where she is from and who is around her when the budget allows', () => {
  const view = fold([birth('social-seed-9')], { growthPerMonth: 1 / 12 }, START);
  const card = renderCard(view, { cardMaxChars: 400 });
  assert.ok(card.includes(view.birthCity), 'city missing from the card');
  for (const relation of view.relations) assert.ok(card.includes(relation.name), `${relation.name} missing`);
});

test('the card stays within a tight budget even without the social line', () => {
  const view = fold([birth('social-seed-9')], { growthPerMonth: 1 / 12 }, START);
  for (const budget of [30, 45, 60, 80]) {
    const card = renderCard(view, { cardMaxChars: budget });
    assert.ok(card.length <= budget, `budget ${budget} produced ${card.length}`);
  }
});
