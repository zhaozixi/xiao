import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, fold } from '../persona.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 15, 0).getTime();

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function birth(seed) {
  return {
    seq: 1,
    at: NOW - 90 * DAY,
    kind: 'birth',
    data: { instanceId: `i-${seed}`, seed, birthAt: NOW - 90 * DAY, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

test('fold never mutates its input', () => {
  const facts = deepFreeze([
    birth('frozen-1'),
    {
      seq: 2,
      at: NOW - 80 * DAY,
      kind: 'override',
      data: { field: 'city', value: '苏州' },
      source: 'user',
      evidence: 'confirmed',
    },
    {
      seq: 3,
      at: NOW - 70 * DAY,
      kind: 'job',
      data: { job: '在书店做店员', category: 'employed' },
      source: 'model',
      evidence: 'confirmed',
    },
    {
      seq: 4,
      at: NOW - 60 * DAY,
      kind: 'user_fact',
      data: { text: '他养了一只猫' },
      source: 'user',
      evidence: 'confirmed',
    },
  ]);
  const view = fold(facts, {}, NOW);
  assert.ok(view && view.instanceId);
  assert.equal(view.currentCity, '苏州');
  assert.equal(view.job, '在书店做店员');
  assert.deepEqual(view.notes, ['他养了一只猫']);
});

test('folding is idempotent and order-independent for the same seq set', () => {
  const facts = [
    birth('frozen-2'),
    {
      seq: 2,
      at: NOW - 10 * DAY,
      kind: 'job',
      data: { job: '在书店做店员', category: 'employed' },
      source: 'model',
      evidence: 'confirmed',
    },
  ];
  const a = fold(facts, {}, NOW);
  const b = fold([...facts].reverse(), {}, NOW);
  assert.deepEqual(a.job, b.job);
  assert.deepEqual(a.home, b.home);
  assert.deepEqual(a.interests, b.interests);
});

test('a clock that jumps backwards still folds in fact order', () => {
  // seq 2 is written "later" but its wall clock is behind seq 1's.
  const facts = [
    {
      seq: 1,
      at: NOW - 5 * DAY,
      kind: 'birth',
      data: { instanceId: 'i-clock', seed: 'clock-seed', birthAt: NOW - 5 * DAY, rulesVersion: RULES_VERSION },
      source: 'seed',
      evidence: 'confirmed',
    },
    {
      seq: 2,
      at: NOW - 4 * DAY,
      kind: 'override',
      data: { field: 'city', value: '成都' },
      source: 'user',
      evidence: 'confirmed',
    },
    {
      // Written with a clock that went backwards, but with a higher seq: it must win.
      seq: 3,
      at: NOW - 6 * DAY,
      kind: 'override',
      data: { field: 'city', value: '苏州' },
      source: 'user',
      evidence: 'confirmed',
    },
  ];
  const view = fold(facts, {}, NOW);
  assert.equal(view.currentCity, '苏州', 'the highest seq wins, not the latest clock');
});
