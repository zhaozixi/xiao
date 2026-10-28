/**
 * Three dimensions the state/memory/time coverage cannot reach:
 *
 *   config    — every feature switched off or pushed to its bound must stay coherent
 *   corruption— a log written by hand, by an older version or by a broken client must
 *               never throw; it may degrade to "no character", never to a crash
 *   horizon   — the same persona folded one day, one month, one year, five and twenty
 *               years later, plus a JSON round-trip of the log
 *
 * Run: node scripts/simulate-matrix.mjs
 */
import { randomUUID } from 'node:crypto';
import { RULES_VERSION, deriveDay, fold, memoryRecords, renderCard } from '../persona.js';
import { runChecks } from './checks.mjs';

const DAY = 86_400_000;
const now = Date.now();
const lines = [];
let failures = 0;

const CONFIGS = [
  ['默认配置', {}],
  ['关闭卡片', { cardMaxChars: 0 }],
  ['卡片预算 40', { cardMaxChars: 40 }],
  ['关闭生活事件', { lifeEventsPerWeek: 0 }],
  ['成长 1/4', { growthPerMonth: 1 / 4 }],
  ['职业随种子', { chooseOwnJob: false }],
  ['临时事实不淡出', { temporaryFactDays: 0 }],
  ['临时事实 30 天', { temporaryFactDays: 30 }],
  ['关闭调研', { researchPerDay: 0, researchMaxChars: 0 }],
  ['关闭记忆与此刻', { userSummaryMaxChars: 0, nowMaxChars: 0 }],
];

function birthFact() {
  const born = now - Math.floor(Math.random() * 20) * DAY;
  return {
    seq: 1,
    at: born,
    kind: 'birth',
    data: { instanceId: randomUUID(), seed: randomUUID(), birthAt: born, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

function log(...parts) {
  lines.push(...parts);
}

// ---------------------------------------------------------------------------
// 1. Config matrix
// ---------------------------------------------------------------------------
log('## 配置矩阵');
for (const [label, cfg] of CONFIGS) {
  const problems = [];
  for (let round = 0; round < 2; round += 1) {
    const birth = birthFact();
    let view;
    try {
      view = fold([birth], cfg, now);
    } catch (error) {
      problems.push(`${label}: fold threw ${error?.message ?? error}`);
      continue;
    }
    if (!view) {
      problems.push(`${label}: fold returned nothing`);
      continue;
    }
    problems.push(...runChecks(view, { now, birth, cfg }).map((p) => `${label}: ${p}`));

    // Feature switches have to actually switch things off.
    if (cfg.cardMaxChars === 0 && renderCard(view, cfg) !== '') problems.push(`${label}: a card was rendered with a 0 budget`);
    if (cfg.chooseOwnJob === false && view.jobChosen !== true) problems.push(`${label}: the seed job was not taken as decided`);
    if (cfg.lifeEventsPerWeek === 0) {
      const day = deriveDay(view, now);
      if (day.length !== 5) problems.push(`${label}: ${day.length} parts of the day`);
    }
  }
  failures += problems.length;
  log(`${label}：${problems.length === 0 ? '✓' : '✗'}`);
  for (const problem of problems) log(`      ✗ ${problem}`);
}

// ---------------------------------------------------------------------------
// 2. Corrupt logs
// ---------------------------------------------------------------------------
log('');
log('## 损坏日志');
const good = birthFact();
const CORRUPTIONS = [
  ['出生事实没有 seed', [{ ...good, data: { ...good.data, seed: undefined } }]],
  ['seed 不是字符串', [{ ...good, data: { ...good.data, seed: 42 } }]],
  ['data 是 null', [good, { seq: 2, at: now, kind: 'user_fact', data: null, source: 'user', evidence: 'confirmed' }]],
  ['seq 是字符串', [good, { ...good, seq: 'two', at: now + 1, kind: 'job', data: { job: 'x', category: 'employed' } }]],
  ['重复的 seq', [good, { seq: 2, at: now, kind: 'job', data: { job: 'a', category: 'employed' }, source: 'model', evidence: 'confirmed' }, { seq: 2, at: now + 1, kind: 'job', data: { job: 'b', category: 'unemployed' }, source: 'model', evidence: 'confirmed' }]],
  ['事件的 day 是 NaN', [good, { seq: 2, at: now, kind: 'event', data: { id: 'x', day: Number.NaN, kind: 'rest', text: 't' }, source: 'sim', evidence: 'confirmed' }]],
  ['override 的 field 为 null', [good, { seq: 2, at: now, kind: 'override', data: { field: null, value: 1 }, source: 'user', evidence: 'confirmed' }]],
  ['墓碑指向不存在的事实', [good, { seq: 2, at: now, kind: 'tombstone', data: { targetSeq: 999999 }, source: 'user', evidence: 'confirmed' }]],
  ['存疑指向不存在的事实', [good, { seq: 2, at: now, kind: 'dispute', data: { targetSeq: 999999 }, source: 'user', evidence: 'confirmed' }]],
  ['未知的 kind', [good, { seq: 2, at: now, kind: 'weird', data: {}, source: 'user', evidence: 'confirmed' }]],
  ['两条出生事实', [good, { ...birthFact(), seq: 2 }]],
  ['出生时刻在遥远的未来', [{ ...good, at: now + 400 * DAY, data: { ...good.data, birthAt: now + 400 * DAY } }]],
];

for (const [label, facts] of CORRUPTIONS) {
  const problems = [];
  let view;
  try {
    view = fold(facts, {}, now);
  } catch (error) {
    problems.push(`${label}: fold threw ${error?.message ?? error}`);
  }
  if (view) {
    // Whatever survives must still be internally consistent.
    problems.push(...runChecks(view, { now, birth: facts[0], cfg: {} }).map((p) => `${label}: ${p}`));
    // A birth in the future must not produce a negative age.
    if (view.age < 18) problems.push(`${label}: age ${view.age}`);
  }
  failures += problems.length;
  log(`${label}：${problems.length === 0 ? `✓ ${view ? 'fold 成功' : 'fold 返回空（降级）'}` : '✗'}`);
  for (const problem of problems) log(`      ✗ ${problem}`);
}

// ---------------------------------------------------------------------------
// 3. Horizons and round-trip
// ---------------------------------------------------------------------------
log('');
log('## 时间跨度与序列化');
const HORIZONS = [
  ['当天', 0],
  ['一天后', 1],
  ['一个月后', 30],
  ['一年后', 365],
  ['五年后', 365 * 5],
  ['二十年后', 365 * 20],
];

for (let round = 0; round < 3; round += 1) {
  const birth = birthFact();
  const problems = [];
  // A temporary fact, to watch it fade at the horizon.
  const temporary = {
    seq: 2,
    at: now - 1 * DAY,
    kind: 'user_fact',
    data: { text: '他这周在出差', temporary: true },
    source: 'user',
    evidence: 'confirmed',
  };
  const facts = [birth, temporary];
  let previousAge = 0;
  let previousDate = '';
  for (const [label, days] of HORIZONS) {
    const at = now + days * DAY;
    const view = fold(facts, {}, at);
    if (!view) {
      problems.push(`${label}: fold returned nothing`);
      continue;
    }
    problems.push(...runChecks(view, { now: at, birth, cfg: {} }).map((p) => `${label}: ${p}`));
    if (view.age < previousAge) problems.push(`${label}: age went backwards (${previousAge} → ${view.age})`);
    if (view.age > 60) problems.push(`${label}: age ${view.age}`);
    if (previousDate && view.birthDate !== previousDate) problems.push(`${label}: the birth date moved`);
    previousAge = view.age;
    previousDate = view.birthDate;
    if (days >= 20) {
      const visible = memoryRecords({ records: facts, cfg: {}, now: at });
      if (visible.some((record) => record.data?.temporary)) problems.push(`${label}: the temporary fact has not faded`);
    }
  }
  // JSON round-trip: the log is stored as JSON, so folding the parsed copy must match.
  const roundTripped = JSON.parse(JSON.stringify(facts));
  const a = fold(facts, {}, now);
  const b = fold(roundTripped, {}, now);
  if (JSON.stringify(a) !== JSON.stringify(b)) problems.push('round-trip: folding the parsed log differs');

  failures += problems.length;
  log(`跨度 ${round + 1}：${problems.length === 0 ? '✓ 六个时间点 + JSON 往返' : '✗'}`);
  for (const problem of problems) log(`      ✗ ${problem}`);
}

log('');
log(failures === 0 ? '三个维度全部通过。' : `${failures} 处问题。`);
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = failures === 0 ? 0 : 1;
