import test from 'node:test';
import assert from 'node:assert/strict';

import { generateLife, toneOf } from '../persona.js';

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const CFG = { lifeEventsPerWeek: 2 };

function viewOf(jobCategory, eventsAll = []) {
  return { jobCategory, eventsAll };
}

test('life generation is deterministic', () => {
  const view = viewOf('employed');
  const a = generateLife({ seed: 'life-seed-1', view, cfg: CFG, days: 60, now: NOW });
  const b = generateLife({ seed: 'life-seed-1', view, cfg: CFG, days: 60, now: NOW });
  assert.deepEqual(a, b);
});

test('asking the same week twice yields the same events', () => {
  const view = viewOf('student');
  const first = generateLife({ seed: 'life-seed-1', view, cfg: CFG, days: 7, now: NOW });
  const second = generateLife({ seed: 'life-seed-1', view, cfg: CFG, days: 7, now: NOW });
  assert.deepEqual(
    first.events.map((event) => [event.id, event.text]),
    second.events.map((event) => [event.id, event.text]),
  );
});

test('different seeds produce different lives', () => {
  const view = viewOf('employed');
  const a = generateLife({ seed: 'seed-a', view, cfg: CFG, days: 60, now: NOW });
  const b = generateLife({ seed: 'seed-b', view, cfg: CFG, days: 60, now: NOW });
  assert.notDeepEqual(
    a.events.map((event) => event.text),
    b.events.map((event) => event.text),
  );
});

test('a window of 60 days is populated', () => {
  const result = generateLife({ seed: 'life-seed-1', view: viewOf('employed'), cfg: CFG, days: 60, now: NOW });
  assert.ok(result.events.length > 0, 'expected at least one event in 60 days');
  assert.ok(result.events.every((event) => event.day >= result.fromDay && event.day <= result.toDay));
  assert.ok(result.events.every((event) => event.simulated === true));
});

test('work events never appear for categories that cannot work', () => {
  const workWords = /上班|加班|开会|表格|办公室/;
  for (const category of ['student', 'job_seeking', 'unemployed', 'retired']) {
    const result = generateLife({ seed: 'life-seed-2', view: viewOf(category), cfg: CFG, days: 60, now: NOW });
    for (const event of result.events) {
      assert.ok(!workWords.test(event.text), `${category} produced a work event: ${event.text}`);
    }
  }
});

test('job seeking and retirement never produce a go-to-work event', () => {
  for (const category of ['job_seeking', 'retired']) {
    const result = generateLife({ seed: 'life-seed-3', view: viewOf(category), cfg: CFG, days: 60, now: NOW });
    assert.ok(result.events.every((event) => event.kind !== 'work' || !/上班|通勤/.test(event.text)));
  }
});

test('a committed event wins over the generated one', () => {
  const view = viewOf('student');
  const preview = generateLife({ seed: 'life-seed-4', view, cfg: CFG, days: 60, now: NOW });
  const target = preview.events[0];
  assert.ok(target, 'preview must not be empty');

  const frozen = viewOf('student', [{ ...target, text: '固化之后不会变的一句', at: NOW }]);
  const after = generateLife({ seed: 'life-seed-4', view: frozen, cfg: CFG, days: 60, now: NOW });
  const found = after.events.find((event) => event.id === target.id);
  assert.equal(found.text, '固化之后不会变的一句');
  assert.equal(found.committed, true);
});

test('lifeEventsPerWeek 0 produces nothing', () => {
  const result = generateLife({ seed: 'life-seed-1', view: viewOf('employed'), cfg: { lifeEventsPerWeek: 0 }, days: 60, now: NOW });
  assert.deepEqual(result.events, []);
});

test('the window is clamped to 60 days', () => {
  const result = generateLife({ seed: 'life-seed-1', view: viewOf('employed'), cfg: CFG, days: 1000, now: NOW });
  assert.equal(result.toDay - result.fromDay + 1, 60);
});

test('tone is a pure function of the latest event kind', () => {
  assert.equal(toneOf([]), '平静');
  assert.equal(toneOf([{ at: 1, kind: 'work' }]), '有点累');
  assert.equal(toneOf([{ at: 1, kind: 'study' }]), '有点累');
  assert.equal(toneOf([{ at: 1, kind: 'good' }]), '心情不错');
  assert.equal(toneOf([{ at: 1, kind: 'rest' }]), '松下来');
  assert.equal(toneOf([{ at: 1, kind: 'mishap' }]), '不太顺');
  assert.equal(toneOf([{ at: 5, kind: 'work' }, { at: 9, kind: 'good' }]), '心情不错');
});
