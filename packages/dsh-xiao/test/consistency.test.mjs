import test from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, RULES_VERSION, fold, generateLife, suggestTransition } from '../persona.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 15, 0).getTime();
const BORN = NOW - 90 * DAY;

function birth(seed, at = BORN) {
  return {
    seq: 1,
    at,
    kind: 'birth',
    data: { instanceId: `i-${seed}`, seed, birthAt: at, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

// ---------------------------------------------------------------------------
// An undecided job must not leak into anything job-shaped
// ---------------------------------------------------------------------------

test('someone without a job gets no job-flavoured life events', () => {
  const view = fold([birth('undecided-1')], {}, NOW);
  assert.equal(view.jobChosen, false);
  const jobSentences = new Set(
    Object.entries(CATALOG.lifeTemplates)
      .filter(([pool]) => pool !== 'any')
      .flatMap(([, templates]) => templates.map(([, text]) => text)),
  );
  for (let week = 0; week < 8; week += 1) {
    const now = NOW + week * 7 * DAY;
    const result = generateLife({ seed: view.seed, view, cfg: { lifeEventsPerWeek: 2 }, days: 30, now });
    for (const event of result.events) {
      assert.ok(!jobSentences.has(event.text), `job sentence for an undecided persona: ${event.text}`);
    }
  }
});

test('someone without a job is never nudged to change one', () => {
  const view = fold([birth('undecided-2')], {}, NOW);
  const quitting = [{ text: '被裁了，收拾东西走人', kind: 'mishap', day: 1 }];
  assert.equal(suggestTransition(view, quitting), undefined);
});

// ---------------------------------------------------------------------------
// Turning the feature off must keep the view coherent
// ---------------------------------------------------------------------------

test('with chooseOwnJob off the seed job counts as decided', () => {
  const on = fold([birth('decided-1')], {}, NOW);
  assert.equal(on.jobChosen, false);
  assert.equal(on.work, null, 'undecided means no workplace');

  const off = fold([birth('decided-1')], { chooseOwnJob: false }, NOW);
  assert.equal(off.jobChosen, true, 'the seed job is taken as her job');
  assert.ok(off.work && off.work.name, 'and she has somewhere to be');
  assert.ok(off.commute.length > 0);
});

test('a job fact makes the same view decided, with no config change', () => {
  const hired = {
    seq: 2,
    at: BORN + 1,
    kind: 'job',
    data: { job: '在书店做店员', category: 'employed' },
    source: 'model',
    evidence: 'confirmed',
  };
  const view = fold([birth('decided-2'), hired], {}, NOW);
  assert.equal(view.jobChosen, true);
  assert.ok(view.work && view.work.name);
  assert.equal(view.job, '在书店做店员');
});
