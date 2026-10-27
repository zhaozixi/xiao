import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, canTransitionJob, derivePersona, fold, planUpdate } from '../persona.js';

const SEED = 'test-seed-0001';

function birthFact() {
  return {
    seq: 1,
    at: 1_000,
    kind: 'birth',
    data: { instanceId: 'instance-a', seed: SEED, birthAt: 1_000, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

function viewFor(facts = [birthFact()], now = 1_000) {
  return fold(facts, {}, now);
}

test('derivePersona carries a job category', () => {
  const persona = derivePersona(SEED);
  assert.ok(['student', 'job_seeking', 'employed', 'unemployed', 'retired'].includes(persona.jobCategory));
});

test('job state machine rejects illegal transitions', () => {
  assert.equal(canTransitionJob('employed', 'student', 30).ok, false);
  assert.equal(canTransitionJob('retired', 'employed', 30).ok, false);
  assert.equal(canTransitionJob('student', 'retired', 20).ok, false);
  assert.equal(canTransitionJob('student', 'job_seeking', 20).ok, true);
  assert.equal(canTransitionJob('job_seeking', 'employed', 24).ok, true);
  assert.equal(canTransitionJob('employed', 'unemployed', 24).ok, true);
  assert.equal(canTransitionJob('unemployed', 'retired', 58).ok, true);
});

test('retirement is age-gated even on a legal edge', () => {
  const young = canTransitionJob('unemployed', 'retired', 30);
  assert.equal(young.ok, false);
  assert.equal(young.code, 'retire_too_young');
});

test('set_age without confirmation is refused', () => {
  const view = viewFor();
  const planned = planUpdate({ action: 'set_age', age: 30 }, view);
  assert.equal(planned.ok, false);
  assert.equal(planned.code, 'needs_confirmation');
});

test('set_age with confirmation is accepted inside the range', () => {
  const view = viewFor();
  assert.equal(planUpdate({ action: 'set_age', age: 30, confirmed: true }, view).ok, true);
  assert.equal(planUpdate({ action: 'set_age', age: 17, confirmed: true }, view).ok, false);
  assert.equal(planUpdate({ action: 'set_age', age: 61, confirmed: true }, view).ok, false);
  assert.equal(planUpdate({ action: 'set_age', age: 30.5, confirmed: true }, view).ok, false);
});

test('set_job follows the state machine from the current category', () => {
  const view = viewFor();
  const trained = { ...view, jobCategory: 'job_seeking', age: 24 };
  const ok = planUpdate({ action: 'set_job', job: '在书店做店员', category: 'employed' }, trained);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data, { job: '在书店做店员', category: 'employed' });

  const bad = planUpdate({ action: 'set_job', job: '还在读书', category: 'student' }, { ...view, jobCategory: 'employed' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'illegal_job_transition');
});

test('remember refuses empty and oversized text', () => {
  const view = viewFor();
  assert.equal(planUpdate({ action: 'remember', text: '   ' }, view).code, 'missing_text');
  assert.equal(planUpdate({ action: 'remember', text: 'x'.repeat(201) }, view).code, 'text_too_long');
  assert.equal(planUpdate({ action: 'remember', text: '用户说他住在杭州' }, view).ok, true);
});

test('forget refuses the birth fact, unknown seqs and double deletes', () => {
  const facts = [
    birthFact(),
    { seq: 2, at: 2_000, kind: 'user_fact', data: { text: 'x' }, source: 'user', evidence: 'confirmed' },
  ];
  const view = viewFor(facts, 3_000);
  assert.equal(planUpdate({ action: 'forget', seq: 1 }, view, facts).code, 'cannot_forget_birth');
  assert.equal(planUpdate({ action: 'forget', seq: 99 }, view, facts).code, 'unknown_fact');
  assert.equal(planUpdate({ action: 'forget', seq: 2 }, view, facts).ok, true);

  const withTombstone = [
    ...facts,
    { seq: 3, at: 3_000, kind: 'tombstone', data: { targetSeq: 2 }, source: 'user', evidence: 'confirmed' },
  ];
  assert.equal(planUpdate({ action: 'forget', seq: 2 }, view, withTombstone).code, 'already_forgotten');
});

test('unknown actions are refused', () => {
  const view = viewFor();
  assert.equal(planUpdate({ action: 'set_gender', value: 'male' }, view).code, 'unknown_action');
  assert.equal(planUpdate({}, view).code, 'unknown_action');
});

test('a job fact updates both the label and the category', () => {
  const facts = [
    birthFact(),
    { seq: 2, at: 2_000, kind: 'job', data: { job: '在书店做店员', category: 'employed' }, source: 'model', evidence: 'confirmed' },
  ];
  const view = viewFor(facts, 2_000);
  assert.equal(view.job, '在书店做店员');
  assert.equal(view.jobCategory, 'employed');
});

test('rejected facts are stored but do not change the character', () => {
  const facts = [
    birthFact(),
    { seq: 2, at: 2_000, kind: 'rejected', data: { tool: 'xiao_update', code: 'immutable_field', reason: 'no' }, source: 'guard', evidence: 'confirmed' },
  ];
  const view = viewFor(facts, 2_000);
  assert.equal(view.job, derivePersona(SEED).job);
  assert.equal(view.factCount, 2);
});

test('history reads fold only the prefix', () => {
  const facts = [
    birthFact(),
    { seq: 2, at: 2_000, kind: 'user_fact', data: { text: '住在杭州' }, source: 'user', evidence: 'confirmed' },
  ];
  const before = fold(facts.filter((fact) => fact.seq <= 1), {}, 2_000);
  const after = fold(facts, {}, 2_000);
  assert.deepEqual(before.notes, []);
  assert.deepEqual(after.notes, ['住在杭州']);
});
