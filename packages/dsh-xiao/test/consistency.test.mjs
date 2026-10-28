import test from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, RULES_VERSION, catchupWindow, deriveHome, fold, generateLife, suggestTransition } from '../persona.js';

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

// ---------------------------------------------------------------------------
// Catching up is a ledger, not a single jump
// ---------------------------------------------------------------------------

test('a long absence is caught up in one bounded slice, ending yesterday', () => {
  const today = 20_000;
  const window = catchupWindow(today - 1_000, today, 120);
  assert.equal(window.to, today - 1, 'the run always reaches yesterday');
  assert.equal(window.to - window.from + 1, 120, 'and covers at most the cap');

  // Anything older than the cap is abandoned on purpose: it can never be shown anyway.
  assert.ok(window.from > today - 1_000 + 1);

  // Once yesterday is pinned there is nothing left to do, and nothing to rewrite.
  assert.equal(catchupWindow(today - 1, today, 120), undefined);
});

test('a short gap only pins the missing days', () => {
  const today = 20_000;
  const window = catchupWindow(today - 3, today, 120);
  assert.deepEqual(window, { from: today - 2, to: today - 1 });
});

// ---------------------------------------------------------------------------
// The cast has to match the present
// ---------------------------------------------------------------------------

test('a colleague only exists while she has a job', () => {
  const undecided = fold([birth('jobless-1')], {}, NOW);
  const past = undecided.relations.find((relation) => relation.kind === 'work');
  if (past) {
    assert.equal(past.role, '前同事', 'before she picks a job, the person is a former colleague');
    assert.ok(!past.detail.includes('工位'), past.detail);
    assert.ok(!past.detail.includes('同一个组'), past.detail);
  }

  const hired = {
    seq: 2,
    at: BORN + 1,
    kind: 'job',
    data: { job: '在书店做店员', category: 'employed' },
    source: 'model',
    evidence: 'confirmed',
  };
  const working = fold([birth('jobless-1'), hired], {}, NOW);
  const now = working.relations.find((relation) => relation.kind === 'work');
  assert.ok(now, 'with a job the colleague is back');
  assert.ok(['同事', '前同事'].includes(now.role), now.role);
});

// ---------------------------------------------------------------------------
// Moving is a physical event, not just a label
// ---------------------------------------------------------------------------

test('moving to another city gives her a different flat and different corners', () => {
  let changed = 0;
  for (let index = 0; index < 20; index += 1) {
    const seed = `move-seed-${index}`;
    const here = deriveHome(seed, '大连');
    const there = deriveHome(seed, '苏州');
    assert.equal(there.home.city, '苏州');
    assert.equal(here.home.city, '大连');
    if (JSON.stringify(here) !== JSON.stringify(there)) changed += 1;
  }
  assert.equal(changed, 20, 'the same street cannot exist in two cities');
});
