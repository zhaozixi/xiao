import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, derivePersona, fold, generateLife, planUpdate, renderCard } from '../persona.js';

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

// ---------------------------------------------------------------------------
// Where she lives now
// ---------------------------------------------------------------------------

test('she may have moved away from her birth city, deterministically', () => {
  const persona = derivePersona('city-seed-1');
  assert.ok(typeof persona.currentCity === 'string' && persona.currentCity.length > 0);
  if (persona.movedAt === undefined) {
    assert.equal(persona.currentCity, persona.birthCity, 'no move means she stayed');
  } else {
    assert.notEqual(persona.currentCity, persona.birthCity, 'a move means a different city');
    assert.ok(persona.movedAt <= persona.age, 'a move cannot happen after today');
  }
  assert.deepEqual(derivePersona('city-seed-1'), persona);
});

test('a move is a state change, not a rewrite of history', () => {
  const move = { seq: 2, at: START + 1_000, kind: 'override', data: { field: 'city', value: '苏州' }, source: 'user', evidence: 'confirmed' };
  const before = fold([birth('city-seed-2')], { growthPerMonth: 1 / 12 }, START);
  const after = fold([birth('city-seed-2'), move], { growthPerMonth: 1 / 12 }, START + 1_000);
  assert.equal(after.currentCity, '苏州');
  assert.equal(after.birthCity, before.birthCity, 'birth city never changes');
  assert.deepEqual(after.lifeHistory, before.lifeHistory, 'history is frozen');
});

test('the card says where she lives when it differs from where she was born', () => {
  const moved = {
    seq: 1,
    at: START,
    kind: 'birth',
    data: { instanceId: 'm', seed: 'city-seed-3', birthAt: START, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
  const override = { seq: 2, at: START + 1, kind: 'override', data: { field: 'city', value: '苏州' }, source: 'user', evidence: 'confirmed' };
  const card = renderCard(fold([moved, override], { growthPerMonth: 1 / 12 }, START + 2), { cardMaxChars: 400 });
  assert.ok(card.includes('现在住在苏州'), 'the current city is missing from the card');
  assert.ok(card.includes('出生在'), 'the birth city is missing from the card');
});

test('move refuses an empty or oversized city', () => {
  const view = fold([birth('city-seed-4')], { growthPerMonth: 1 / 12 }, START);
  assert.equal(planUpdate({ action: 'move', city: '  ' }, view).code, 'missing_city');
  assert.equal(planUpdate({ action: 'move', city: 'x'.repeat(21) }, view).code, 'city_too_long');
  const ok = planUpdate({ action: 'move', city: '苏州' }, view);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data, { field: 'city', value: '苏州' });
});

test('life events name the city she lives in and the people she knows', () => {
  const born = START - 400 * 24 * 60 * 60 * 1000;
  const view = fold([birth('place-seed-1', born)], { growthPerMonth: 1 / 12 }, START);
  const names = view.relations.map((relation) => relation.name);
  const texts = [];
  for (let week = 0; week < 12; week += 1) {
    const now = START + week * 7 * 24 * 60 * 60 * 1000;
    const result = generateLife({ seed: view.seed, view, cfg: { lifeEventsPerWeek: 2 }, days: 60, now });
    for (const event of result.events) texts.push(event.text);
  }
  assert.ok(
    texts.some((text) => text.includes(view.currentCity)),
    `no event mentioned ${view.currentCity}`,
  );
  assert.ok(
    texts.some((text) => names.some((name) => text.includes(name))),
    'no event mentioned anyone she knows',
  );
  assert.ok(texts.every((text) => !text.includes('{city}') && !text.includes('{person}')), 'a placeholder leaked');
});

// ---------------------------------------------------------------------------
// Where exactly
// ---------------------------------------------------------------------------

test('she has one flat, three familiar spots, and somewhere to be once she has a job', () => {
  const view = fold([birth('place-seed-2')], { growthPerMonth: 1 / 12 }, START);
  assert.equal(view.home.city, view.currentCity);
  assert.ok(view.home.area && view.home.detail);
  assert.equal(view.nearby.length, 3);
  assert.equal(new Set(view.nearby).size, 3, 'familiar spots must be distinct');
  assert.equal(view.jobChosen, false);
  assert.equal(view.work, null, 'before she picks a job there is nowhere to be');

  const hired = {
    seq: 2,
    at: START + 1,
    kind: 'job',
    data: { job: '在书店做店员', category: 'employed' },
    source: 'model',
    evidence: 'confirmed',
  };
  const after = fold([birth('place-seed-2'), hired], { growthPerMonth: 1 / 12 }, START + 1);
  assert.ok(after.work && after.work.area, 'once she has a job she has somewhere to be');
  assert.ok(typeof after.commute === 'string' && after.commute.length > 0);
});

test('the flat does not move when the job changes', () => {
  const view = fold([birth('place-seed-2')], { growthPerMonth: 1 / 12 }, START);
  assert.deepEqual(fold([birth('place-seed-2')], { growthPerMonth: 1 / 12 }, START).home, view.home);
});

test('a familiar spot she mentions is appended, not replacing the others', () => {
  const add = {
    seq: 2,
    at: START + 1,
    kind: 'override',
    data: { field: 'nearby', value: '街角的旧书店' },
    source: 'model',
    evidence: 'confirmed',
  };
  const before = fold([birth('place-seed-3')], { growthPerMonth: 1 / 12 }, START);
  const after = fold([birth('place-seed-3'), add], { growthPerMonth: 1 / 12 }, START + 1);
  assert.equal(after.nearby.length, before.nearby.length + 1);
  assert.ok(after.nearby.includes('街角的旧书店'));
  for (const spot of before.nearby) assert.ok(after.nearby.includes(spot), `${spot} disappeared`);

  const repeat = fold([birth('place-seed-3'), add, { ...add, seq: 3 }], { growthPerMonth: 1 / 12 }, START + 2);
  assert.equal(repeat.nearby.filter((spot) => spot === '街角的旧书店').length, 1, 'duplicates must collapse');
});

test('place refuses an empty or oversized spot', () => {
  const view = fold([birth('place-seed-4')], { growthPerMonth: 1 / 12 }, START);
  assert.equal(planUpdate({ action: 'place', text: '   ' }, view).code, 'missing_text');
  assert.equal(planUpdate({ action: 'place', text: 'x'.repeat(41) }, view).code, 'text_too_long');
  assert.equal(planUpdate({ action: 'place', text: '街角的旧书店' }, view).ok, true);
});

test('the card names the neighbourhood she lives in', () => {
  const view = fold([birth('place-seed-5')], { growthPerMonth: 1 / 12 }, START);
  const card = renderCard(view, { cardMaxChars: 400 });
  assert.ok(card.includes(view.home.area), 'the neighbourhood is missing from the card');
});

test('moving her moves the flat and the workplace with her', () => {
  const move = { seq: 2, at: START + 1, kind: 'override', data: { field: 'city', value: '苏州' }, source: 'user', evidence: 'confirmed' };
  const before = fold([birth('place-seed-6')], { growthPerMonth: 1 / 12 }, START);
  const after = fold([birth('place-seed-6'), move], { growthPerMonth: 1 / 12 }, START + 1);
  assert.equal(after.currentCity, '苏州');
  assert.equal(after.home.city, '苏州', 'the flat must be in the city she lives in');
  if (after.work) assert.equal(after.work.city, '苏州', 'the workplace must be in the same city');
});

test('losing the job takes the workplace away', () => {
  const quit = {
    seq: 2,
    at: START + 1,
    kind: 'job',
    data: { job: '在家待着', category: 'unemployed' },
    source: 'user',
    evidence: 'confirmed',
  };
  const before = fold([birth('place-seed-7')], { growthPerMonth: 1 / 12 }, START);
  const after = fold([birth('place-seed-7'), quit], { growthPerMonth: 1 / 12 }, START + 1);
  assert.equal(after.jobCategory, 'unemployed');
  assert.equal(after.work, null, 'no job means nowhere to go');
  assert.ok(after.commute.includes('没有'), 'the commute must say so');
  assert.equal(after.home.area, before.home.area, 'losing a job does not move her furniture');
});

test('a partner and a child appear on the timeline, in that order', () => {
  let seed;
  let view;
  for (let index = 0; index < 300 && !view; index += 1) {
    const candidate = `fam-${index}`;
    const kinds = derivePersona(candidate).relations.map((relation) => relation.kind);
    if (kinds.includes('partner') && kinds.includes('child')) {
      seed = candidate;
      view = fold([birth(candidate)], { growthPerMonth: 1 / 12 }, START);
    }
  }
  assert.ok(view, 'expected a seed with both a partner and a child');
  const partner = view.lifeHistory.find((milestone) => milestone.text.includes('在一起'));
  const child = view.lifeHistory.find(
    (milestone) => milestone.text.endsWith('出生') && !milestone.text.startsWith('出生在'),
  );
  assert.ok(partner, `no partner milestone for ${seed}`);
  assert.ok(child, `no child milestone for ${seed}`);
  assert.ok(partner.age < child.age, 'the relationship must start before the child');
});
