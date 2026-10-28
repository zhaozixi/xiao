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
import { RULES_VERSION, fold } from '../persona.js';
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
        if (finalView.birthCity === target) problems.push('move: the birth city changed');
        if (JSON.stringify(finalView.nearby) === JSON.stringify(withJob.nearby)) {
          problems.push('move: the same familiar spots in a different city');
        }
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

lines.push('');
lines.push(
  failures === 0
    ? `${index} 个场景（5 种职业 × 搬家/未搬家 × 2 个种子），每个走三个阶段，全部检查通过。`
    : `${index} 个场景，${failures} 处问题。`,
);
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = failures === 0 ? 0 : 1;
