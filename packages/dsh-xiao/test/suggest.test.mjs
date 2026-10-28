import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES_VERSION, fold, suggestTransition } from '../persona.js';

const START = 1_760_000_000_000;

function viewOf(jobCategory) {
  const birth = {
    seq: 1,
    at: START,
    kind: 'birth',
    data: { instanceId: 'suggest', seed: 'suggest-seed', birthAt: START, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
  const view = fold([birth], {}, START);
  return { ...view, jobCategory };
}

function event(text, kind = 'work', id = '1.0') {
  return { id, day: 1, kind, text, simulated: true, committed: false };
}

test('an interview while job seeking suggests a move to employed', () => {
  const suggestion = suggestTransition(viewOf('job_seeking'), [event('去面了一家小公司，聊了四十分钟')]);
  assert.ok(suggestion);
  assert.equal(suggestion.kind, 'job_transition');
  assert.equal(suggestion.from, 'job_seeking');
  assert.equal(suggestion.to, 'employed');
  assert.ok(suggestion.because.includes('面试') || suggestion.because.includes('面了'));
});

test('no suggestion when the category does not match the event', () => {
  assert.equal(suggestTransition(viewOf('employed'), [event('去面了一家小公司')]), undefined);
  assert.equal(suggestTransition(viewOf('student'), [event('去面了一家小公司')]), undefined);
});

test('a layoff while employed suggests job seeking', () => {
  const suggestion = suggestTransition(viewOf('employed'), [event('公司裁员，被裁了', 'mishap')]);
  assert.ok(suggestion);
  assert.equal(suggestion.to, 'job_seeking');
});

test('nothing plausible yields no suggestion', () => {
  assert.equal(suggestTransition(viewOf('employed'), [event('加班到地铁最后一班')]), undefined);
  assert.equal(suggestTransition(viewOf('job_seeking'), []), undefined);
  assert.equal(suggestTransition(undefined, [event('去面试')]), undefined);
  assert.equal(suggestTransition(viewOf('job_seeking'), undefined), undefined);
});

test('a suggestion never mutates the view', () => {
  const view = viewOf('job_seeking');
  const before = JSON.stringify(view);
  suggestTransition(view, [event('去面了一家小公司')]);
  assert.equal(JSON.stringify(view), before);
});
