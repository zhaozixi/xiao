/**
 * Full-coverage simulation: twenty personas, each walked through a different state path.
 *
 * The matrix is every job category crossed with stayed/moved, two seeds each, so every
 * combination the product can be in is visited at least twice:
 *
 *   student · job_seeking · employed · unemployed · retired   ×   stayed · moved   ×   2
 *
 * Each persona is folded three times: fresh (no job), after choosing that job, and after
 * moving if the scenario moved. The shared checks run at every stage.
 *
 * Run: node scripts/simulate-coverage.mjs
 */
import { randomUUID } from 'node:crypto';
import { RULES_VERSION, expandMemory, fold, memoryRecords, planUpdate, searchMemory } from '../persona.js';
import { runChecks } from './checks.mjs';

const DAY = 86_400_000;
const now = Date.now();
const CITIES = ['杭州', '成都', '长沙', '哈尔滨', '昆明', '青岛', '西安', '厦门', '苏州', '重庆', '郑州', '合肥', '福州', '大连', '无锡', '南昌'];

const CATEGORIES = ['student', 'job_seeking', 'employed', 'unemployed', 'retired'];
const MOVES = [false, true];
const SEEDS_PER_CELL = 2;

const JOBS = {
  student: '还在读书',
  job_seeking: '刚离职，在找工作',
  employed: '在一家小公司做产品',
  unemployed: '暂时没工作，在接零活',
  retired: '退休了，在家',
};

let failures = 0;
const lines = [];

function birthFact(seed) {
  const born = now - Math.floor(Math.random() * 20) * DAY;
  return {
    seq: 1,
    at: born,
    kind: 'birth',
    data: { instanceId: randomUUID(), seed, birthAt: born, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

/** Retired only becomes legal at 55+, so the seed is re-rolled until the persona is old enough. */
function birthFor(category) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const fact = birthFact(randomUUID());
    if (category !== 'retired') return fact;
    const view = fold([fact], {}, now);
    if (view && view.age >= 55) return fact;
  }
  return birthFact(randomUUID());
}

let index = 0;
for (const category of CATEGORIES) {
  for (const moved of MOVES) {
    for (let round = 0; round < SEEDS_PER_CELL; round += 1) {
      index += 1;
      const birth = birthFor(category);
      const label = `#${String(index).padStart(2)} ${category.padEnd(11)} ${moved ? '搬家' : '未搬家'}`;
      const problems = [];

      // Stage 1: fresh, job not chosen yet.
      const fresh = fold([birth], {}, now);
      problems.push(...runChecks(fresh, { now, birth }).map((p) => `fresh: ${p}`));

      // Stage 2: she picks this scenario's job.
      const jobFact = {
        seq: 2,
        at: birth.at + 1_000,
        kind: 'job',
        data: { job: JOBS[category], category },
        source: 'model',
        evidence: 'confirmed',
      };
      const facts = [birth, jobFact];
      const withJob = fold(facts, {}, now);
      problems.push(...runChecks(withJob, { now, birth }).map((p) => `job: ${p}`));
      if (withJob.jobChosen !== true) problems.push('job: choosing a job did not mark her as decided');
      if (withJob.jobCategory !== category) problems.push(`job: category is ${withJob.jobCategory}, expected ${category}`);
      if (category === 'retired' && withJob.age < 55) problems.push(`job: retired at ${withJob.age}`);
      // The past cannot change when the present does.
      if (JSON.stringify(withJob.lifeHistory) !== JSON.stringify(fresh.lifeHistory)) {
        problems.push('job: the timeline changed when a job was chosen');
      }

      // Stage 3: moving to another city.
      let finalView = withJob;
      if (moved) {
        const target = CITIES.find((city) => city !== withJob.currentCity) ?? '杭州';
        const moveFact = {
          seq: 3,
          at: birth.at + 2_000,
          kind: 'override',
          data: { field: 'city', value: target },
          source: 'user',
          evidence: 'confirmed',
        };
        finalView = fold([...facts, moveFact], {}, now);
        problems.push(...runChecks(finalView, { now, birth }).map((p) => `move: ${p}`));
        if (finalView.currentCity !== target) problems.push(`move: still in ${finalView.currentCity}, expected ${target}`);
        if (finalView.home.city !== target) problems.push(`move: the flat is in ${finalView.home.city}`);
        // Moving back to her birth city is legitimate, so compare with the previous birth
        // city rather than with the destination.
        if (finalView.birthCity !== withJob.birthCity) problems.push('move: the birth city changed');
        // The familiar spots come from a pool of eight, so two cities can legitimately draw
        // the same three; only the flat's own city is a hard requirement.
        if (finalView.nearby.length !== 3) problems.push(`move: ${finalView.nearby.length} familiar spots`);
        if (JSON.stringify(finalView.lifeHistory) !== JSON.stringify(withJob.lifeHistory)) {
          problems.push('move: the timeline changed when she moved');
        }
      }

      const summary =
        `${finalView.genderWord} ${String(finalView.age).padStart(2)} 岁 ${finalView.birthCity}→${finalView.currentCity} ` +
        `${finalView.jobChosen ? finalView.job : '（未定）'} | ${finalView.work ? finalView.work.name : '无工作地点'} | ${finalView.home.detail}`;
      lines.push(`${label} ${summary}`);
      failures += problems.length;
      if (problems.length === 0) lines.push('      ✓ 三个阶段的检查全部通过');
      for (const problem of problems) lines.push(`      ✗ ${problem}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Memory and time: the half the job matrix cannot reach
// ---------------------------------------------------------------------------

/**
 * One persona walked through the whole memory chain: remember a lasting and a temporary
 * fact, recall them, dispute one, forget one, let the temporary one expire, and read the
 * result at three points in time.
 */
function memoryScenario(index) {
  const problems = [];
  const birth = birthFact(randomUUID());
  const facts = [birth];
  let seq = 2;
  const push = (kind, data, at) => {
    const fact = { seq: seq++, at, kind, data, source: 'user', evidence: 'confirmed' };
    facts.push(fact);
    return fact;
  };

  const lasting = push('user_fact', { text: '他在上海做程序员' }, now - 2 * DAY);
  const temporary = push('user_fact', { text: '他这周在出差', temporary: true }, now - 2 * DAY);

  const fresh = fold(facts, {}, now);
  if (fresh.notes.length !== 2) problems.push(`fresh: expected 2 remembered facts, got ${fresh.notes.length}`);
  if (fresh.expiredNotes !== 0) problems.push(`fresh: ${fresh.expiredNotes} expired too early`);

  // Ten days later the temporary fact is still there; twenty days later it is not.
  const tenDays = fold(facts, {}, now + 10 * DAY);
  if (tenDays.notes.length !== 2) problems.push(`+10d: expected 2 facts, got ${tenDays.notes.length}`);
  const twentyDays = fold(facts, {}, now + 20 * DAY);
  if (twentyDays.notes.length !== 1) problems.push(`+20d: the temporary fact should have faded, got ${twentyDays.notes.length}`);

  // Recall finds the lasting fact and not the expired one. The expiry has to be asked
  // about at the later instant — at "now" the temporary fact is only two days old.
  const before = memoryRecords({ records: facts, cfg: {}, now });
  const hit = searchMemory({ facts: before, query: '程序员' });
  if (hit.total !== 1) problems.push(`recall: expected 1 hit, got ${hit.total}`);
  if (hit.hits[0] && expandMemory({ facts: before }, hit.hits[0].id) !== '他在上海做程序员') {
    problems.push('recall: expanding the hit did not return the fact');
  }
  const afterExpiry = memoryRecords({ records: facts, cfg: {}, now: now + 20 * DAY });
  if (searchMemory({ facts: afterExpiry, query: '出差' }).total !== 0) {
    problems.push('recall: an expired fact is still reachable');
  }

  // Disputing the lasting fact hides it everywhere, and the log keeps it.
  const dispute = planUpdate({ action: 'dispute', seq: lasting.seq, reason: '他说没这回事' }, fresh, facts);
  if (!dispute.ok) problems.push(`dispute: refused with ${dispute.code}`);
  else {
    push('dispute', dispute.data, now - DAY);
    const disputed = fold(facts, {}, now);
    if (disputed.notes.length !== 1) problems.push(`dispute: expected 1 remaining fact, got ${disputed.notes.length}`);
    if (disputed.disputed.length !== 1) problems.push('dispute: the dispute is not listed');
    const afterDispute = memoryRecords({ records: facts, cfg: {}, now });
    if (searchMemory({ facts: afterDispute, query: '程序员' }).total !== 0) {
      problems.push('dispute: a disputed fact is still reachable through recall');
    }
    if (facts.filter((fact) => fact.seq === lasting.seq).length !== 1) problems.push('dispute: the fact was deleted from the log');
  }

  // Forgetting the temporary fact removes it even before it would have faded.
  const forget = planUpdate({ action: 'forget', seq: temporary.seq }, fresh, facts);
  if (!forget.ok) problems.push(`forget: refused with ${forget.code}`);
  else {
    push('tombstone', forget.data, now - DAY);
    const forgotten = fold(facts, {}, now);
    if (forgotten.notes.length !== 0) problems.push(`forget: ${forgotten.notes.length} facts remain`);
  }

  // The birth fact is the one thing neither operation may touch.
  if (planUpdate({ action: 'forget', seq: birth.seq }, fresh, facts).ok) problems.push('forget: the birth fact was removable');
  if (planUpdate({ action: 'dispute', seq: birth.seq }, fresh, facts).ok) problems.push('dispute: the birth fact was disputable');

  lines.push(
    `M${String(index).padStart(2)} 记忆链：记住 2 条 → 10 天 → 20 天 → 检索 → 存疑 → 遗忘`,
  );
  return problems;
}

/**
 * One persona walked through time: an age correction, a year of her clock, and the child
 * crossing the boundary between the schoolchild and teenager sentences.
 */
function timeScenario(index) {
  const problems = [];
  // A child is needed for the interesting part, so the seed is re-rolled until one exists.
  let birth;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const candidate = birthFact(randomUUID());
    const view = fold([candidate], {}, now);
    if (view && view.relations.some((relation) => relation.kind === 'child')) {
      birth = candidate;
      break;
    }
  }
  if (!birth) {
    lines.push(`T${String(index).padStart(2)} 时间链：没有抽到有孩子的种子`);
    return ['time: no seed with a child'];
  }

  const facts = [birth];
  let seq = 2;
  const push = (kind, data, at) => {
    const fact = { seq: seq++, at, kind, data, source: 'user', evidence: 'confirmed' };
    facts.push(fact);
    return fact;
  };

  // An age correction re-anchors the timeline instead of freezing it. It happens "now"
  // rather than yesterday: a correction made the day before her birthday legitimately
  // reads one year older the next morning, which would make this an ambiguous test.
  const base = fold(facts, {}, now);
  const target = Math.min(60, base.age + 4);
  const planned = planUpdate({ action: 'set_age', age: target, confirmed: true }, base, facts);
  if (!planned.ok) problems.push(`age: refused with ${planned.code}`);
  else {
    push('override', planned.data, now);
    const corrected = fold(facts, {}, now);
    if (corrected.age !== target) problems.push(`age: expected ${target}, got ${corrected.age}`);
    const yearAfter = fold(facts, {}, now + 365 * DAY);
    if (yearAfter.age < target) problems.push('age: she got younger over a year');
    if (yearAfter.age > 60) problems.push(`age: ${yearAfter.age} exceeds the ceiling`);
    for (let i = 1; i < corrected.lifeHistory.length; i += 1) {
      if (corrected.lifeHistory[i].age < corrected.lifeHistory[i - 1].age) problems.push('age: timeline out of order');
    }
    failures += 0;
  }

  // A year of her clock: the child's sentence must still fit, and may legitimately change.
  const before = fold(facts, {}, now);
  const later = fold(facts, {}, now + 365 * DAY);
  const childBefore = before.relations.find((relation) => relation.kind === 'child');
  const childLater = later.relations.find((relation) => relation.kind === 'child');
  if (!childLater) problems.push('time: the child disappeared after a year');
  else {
    const milestone = later.lifeHistory.find((m) => m.text.endsWith('出生') && !m.text.startsWith('出生在'));
    const childAge = milestone ? later.age - milestone.age : 0;
    const fits =
      childAge < 7
        ? /幼儿园|在老家由父母带着|照片里/
        : childAge < 13
          ? /小学|在老家由父母带着|照片里/
          : childAge < 19
            ? /中学|不太爱说话|周末才回家/
            : /外地工作|过年才回来|偶尔打个电话/;
    if (!fits.test(childLater.detail)) problems.push(`time: child aged ${childAge} says ${childLater.detail}`);
  }
  if (later.age < before.age) problems.push('time: she got younger over a year');

  lines.push(
    `T${String(index).padStart(2)} 时间链：年龄更正 ${base.age}→${target}，一年后 ${later.age} 岁，` +
      `孩子「${childBefore.detail}」→「${childLater ? childLater.detail : '消失'}」`,
  );
  return problems;
}

const MEMORY_SCENARIOS = 10;
const TIME_SCENARIOS = 10;
for (let round = 1; round <= MEMORY_SCENARIOS; round += 1) {
  const problems = memoryScenario(round);
  failures += problems.length;
  if (problems.length === 0) lines.push('      ✓ 记忆链全部检查通过');
  for (const problem of problems) lines.push(`      ✗ ${problem}`);
}
for (let round = 1; round <= TIME_SCENARIOS; round += 1) {
  const problems = timeScenario(round);
  failures += problems.length;
  if (problems.length === 0) lines.push('      ✓ 时间链全部检查通过');
  for (const problem of problems) lines.push(`      ✗ ${problem}`);
}

lines.push('');
const total = index + MEMORY_SCENARIOS + TIME_SCENARIOS;
lines.push(
  failures === 0
    ? `${total} 个场景全部通过：${index} 个状态场景（5 职业 × 搬家/未搬家 × 2 种子，各走三个阶段）` +
        ` + ${MEMORY_SCENARIOS} 条记忆链 + ${TIME_SCENARIOS} 条时间链。`
    : `${total} 个场景，${failures} 处问题。`,
);
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = failures === 0 ? 0 : 1;
