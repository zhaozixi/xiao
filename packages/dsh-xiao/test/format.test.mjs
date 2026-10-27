import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SPEC, fold, isFactRecord } from '../persona.js';

/**
 * Golden test for the v1 fact format.
 *
 * This fixture is the frozen contract: stored records from any earlier run must keep
 * folding to these values. If a change to `derivePersona`, `fold` or the record shape
 * makes this fail, the change is a format change — bump `SPEC.version`, add the old
 * version to `compatibleVersions`, and update the fixture deliberately.
 */
const FACTS = readFileSync(new URL('./fixtures/facts.sample.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));

const NOW = 1_760_000_300_000;

const GOLDEN = {
  gender: 'female',
  genderWord: '女性',
  age: 41,
  job: '在书店做店员',
  jobCategory: 'employed',
  outlook: '外向，想到什么就说什么',
  curiosity: '谨慎，习惯先看清楚再动',
  speech: '语气直接，不绕弯子',
  hobby: '听老歌',
  quirk: '不太会用感叹号',
  recent: ['课少，回宿舍补了个觉'],
  tone: '松下来',
  factCount: 4,
};

function stable(view) {
  return {
    gender: view.gender,
    genderWord: view.genderWord,
    age: view.age,
    job: view.job,
    jobCategory: view.jobCategory,
    outlook: view.outlook,
    curiosity: view.curiosity,
    speech: view.speech,
    hobby: view.hobby,
    quirk: view.quirk,
    recent: view.recent,
    tone: view.tone,
    factCount: view.factCount,
  };
}

test('the domain declaration is frozen at version 1', () => {
  assert.equal(SPEC.name, 'dsh_xiao');
  assert.equal(SPEC.version, 1);
  assert.equal(SPEC.invalidRecords, 'backup-and-skip');
  assert.deepEqual(Object.keys(SPEC.tables), ['facts']);
});

test('every stored record in the fixture still validates', () => {
  for (const fact of FACTS) assert.equal(isFactRecord(fact), true, JSON.stringify(fact));
});

test('the fixture folds to the frozen golden view', () => {
  assert.deepEqual(stable(fold(FACTS, { growthPerMonth: 1 / 12 }, NOW)), GOLDEN);
});

test('a JSON round-trip does not change the view', () => {
  const roundTripped = FACTS.map((fact) => JSON.parse(JSON.stringify(fact)));
  assert.deepEqual(stable(fold(roundTripped, { growthPerMonth: 1 / 12 }, NOW)), GOLDEN);
});

test('an added field on a stored record is ignored, not fatal', () => {
  const withExtra = FACTS.map((fact) => ({ ...fact, futureField: { note: 'written by a newer version' } }));
  assert.deepEqual(stable(fold(withExtra, { growthPerMonth: 1 / 12 }, NOW)), GOLDEN);
});

test('an unknown kind is rejected by the schema instead of entering silently', () => {
  const future = { seq: 5000, at: NOW, kind: 'daydream', data: {}, source: 'sim', evidence: 'confirmed' };
  assert.equal(isFactRecord(future), false);
  // The domain layer would move such a record aside (invalidRecords: 'backup-and-skip')
  // rather than serve a state built on a record this version cannot interpret.
  assert.throws(() => SPEC.tables.facts.valueSchema.parse(future), /does not match its schema/);
});

test('records missing a required envelope field are rejected', () => {
  for (const missing of ['seq', 'at', 'kind', 'data', 'source', 'evidence']) {
    const broken = { ...FACTS[0] };
    delete broken[missing];
    assert.equal(isFactRecord(broken), false, `missing ${missing} must be rejected`);
  }
});
