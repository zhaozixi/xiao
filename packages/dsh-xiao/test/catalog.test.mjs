import test from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, JOB_CATEGORIES } from '../persona.js';

test('every day pool covers all five parts of the day', () => {
  const slots = CATALOG.day.slots.map((slot) => slot.key);
  assert.deepEqual(slots, ['morning', 'midday', 'afternoon', 'evening', 'night']);
  for (const [pool, activities] of Object.entries(CATALOG.day.activities)) {
    for (const slot of slots) {
      assert.ok(Array.isArray(activities[slot]) && activities[slot].length > 0, `${pool}.${slot} is missing`);
      for (const text of activities[slot]) assert.ok(text.length > 0 && !text.includes('{'), `${pool}.${slot}: ${text}`);
    }
  }
});

test('every life template is a [kind, text] pair with a known kind', () => {
  const kinds = new Set(['work', 'study', 'social', 'rest', 'good', 'mishap']);
  for (const [pool, templates] of Object.entries(CATALOG.lifeTemplates)) {
    assert.ok(templates.length > 0, `${pool} is empty`);
    for (const entry of templates) {
      assert.equal(entry.length, 2, `${pool} has a malformed entry`);
      assert.ok(kinds.has(entry[0]), `${pool}: unknown kind ${entry[0]}`);
      assert.ok(entry[1].length > 0, `${pool}: empty text`);
    }
  }
});

test('placeholder templates only use the placeholders the generator fills', () => {
  const allowed = /^\{(city|person|interest)\}/;
  const all = [...CATALOG.placeholders.local, ...CATALOG.placeholders.social, ...CATALOG.placeholders.interest];
  assert.ok(all.length > 0);
  for (const [, text] of all) {
    const found = text.match(/\{[a-z]+\}/g) ?? [];
    assert.ok(found.length > 0, `no placeholder in ${text}`);
    for (const token of found) assert.ok(allowed.test(token), `unknown placeholder ${token} in ${text}`);
  }
});

test('every job in the fallback pool carries a real category', () => {
  for (const pool of [CATALOG.jobs.young, CATALOG.jobs.mid, CATALOG.jobs.late]) {
    for (const entry of pool) {
      assert.ok(entry.job.length > 0);
      assert.ok(JOB_CATEGORIES.includes(entry.category), `${entry.job} has category ${entry.category}`);
    }
  }
});

test('the catalogue is not empty where it matters', () => {
  assert.ok(CATALOG.birthCities.length >= 10);
  assert.ok(CATALOG.interests.length >= 10);
  assert.ok(CATALOG.surnames.length >= 10);
  assert.ok(CATALOG.places.nearby.length >= 3);
  assert.ok(CATALOG.traits.hobby.length >= 5);
});
