import test from 'node:test';
import assert from 'node:assert/strict';

import { generateLife } from '../persona.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const TODAY = Math.floor(NOW / DAY);

test('life never starts before the birth day', () => {
  const bornAt = NOW - 2 * DAY;
  const birthDay = Math.floor(bornAt / DAY);
  const result = generateLife({
    seed: 'clamp-seed',
    view: { jobCategory: 'student', eventsAll: [], bornAt },
    cfg: { lifeEventsPerWeek: 2 },
    days: 60,
    now: NOW,
  });
  assert.equal(result.fromDay, birthDay);
  assert.ok(result.events.every((event) => event.day >= birthDay), 'event before birth leaked in');
});

test('an instance born today has no past window at all', () => {
  const result = generateLife({
    seed: 'clamp-seed',
    view: { jobCategory: 'student', eventsAll: [], bornAt: NOW },
    cfg: { lifeEventsPerWeek: 2 },
    days: 30,
    now: NOW,
  });
  assert.equal(result.fromDay, TODAY);
  assert.equal(result.toDay, TODAY);
  assert.ok(result.events.every((event) => event.day === TODAY));
});

test('a view without a birth timestamp keeps the plain window', () => {
  const result = generateLife({
    seed: 'clamp-seed',
    view: { jobCategory: 'student', eventsAll: [] },
    cfg: { lifeEventsPerWeek: 1 },
    days: 7,
    now: NOW,
  });
  assert.equal(result.fromDay, TODAY - 6);
});
