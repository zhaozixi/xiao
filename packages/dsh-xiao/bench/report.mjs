/**
 * Offline evaluation bench for dsh-xiao.
 *
 * Runs the two hypotheses that can be measured without an LLM in the loop:
 *   H2a — same seed reproduces the same character, different seeds give usable variety.
 *   H3  — the fact log keeps state stable when nothing legitimate happened, and changes
 *         it exactly where a legitimate event applies.
 * H4 is only approximated (card size and stable-prefix cost); a real H4 needs cross-session
 * consistency runs with the same prompt budget, which this bench cannot do.
 *
 * Usage: node bench/report.mjs
 * Writes bench/report.md and prints a one-line summary.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RULES_VERSION,
  derivePersona,
  fold,
  planUpdate,
  renderCard,
} from '../persona.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'report.md');

const SEEDS = Array.from({ length: 200 }, (_, index) => `bench-seed-${index}`);
const BIRTH_AT = 1_790_000_000_000;
const MONTH = 30 * 24 * 60 * 60 * 1000;

const results = [];
function record(section, name, passed, detail) {
  results.push({ section, name, passed, detail });
}

function birthFact(seed, seq = 1, at = BIRTH_AT) {
  return {
    seq,
    at,
    kind: 'birth',
    data: { instanceId: `bench-${seed}`, seed, birthAt: at, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
}

function viewOf(facts, now = BIRTH_AT) {
  return fold(facts, { growthPerMonth: 1 / 12 }, now);
}

/** Fields that a legitimate event must never touch unless it is the one being tested. */
function stableFields(view) {
  return {
    gender: view.gender,
    genderWord: view.genderWord,
    job: view.job,
    jobCategory: view.jobCategory,
    outlook: view.outlook,
    curiosity: view.curiosity,
    speech: view.speech,
    hobby: view.hobby,
    quirk: view.quirk,
    tone: view.tone,
    recent: view.recent,
  };
}

// ---------------------------------------------------------------------------
// H2a — reproducibility and variety
// ---------------------------------------------------------------------------

function measureH2a() {
  let mismatches = 0;
  const profiles = new Set();
  const ages = [];
  const genders = new Map();
  const categories = new Map();

  for (const seed of SEEDS) {
    const first = derivePersona(seed);
    const second = derivePersona(seed);
    if (JSON.stringify(first) !== JSON.stringify(second)) mismatches += 1;
    profiles.add(JSON.stringify(first));
    ages.push(first.age);
    genders.set(first.gender, (genders.get(first.gender) ?? 0) + 1);
    categories.set(first.jobCategory, (categories.get(first.jobCategory) ?? 0) + 1);
  }

  const pct = (n) => `${((n / SEEDS.length) * 100).toFixed(1)}%`;
  record('H2a', '同一 seed 两次推导逐字段一致', mismatches === 0, `${SEEDS.length - mismatches}/${SEEDS.length} 一致`);
  record('H2a', '不同 seed 产生不同角色', profiles.size === SEEDS.length, `${profiles.size}/${SEEDS.length} 个不同角色`);
  record('H2a', '年龄落在 [18, 60]', ages.every((age) => age >= 18 && age <= 60), `范围 ${Math.min(...ages)}–${Math.max(...ages)}`);
  record('H2a', '性别分布不退化', genders.size === 2, [...genders].map(([k, v]) => `${k} ${pct(v)}`).join(' / '));

  const sorted = [...ages].sort((a, b) => a - b);
  return {
    section: 'H2a',
    detail: [
      `| 指标 | 值 |`,
      `|---|---|`,
      `| 样本 | ${SEEDS.length} 个种子 |`,
      `| 逐字段复现 | ${SEEDS.length - mismatches}/${SEEDS.length} |`,
      `| 有效多样性 | ${profiles.size}/${SEEDS.length} 个互不相同的角色 |`,
      `| 年龄 | 中位 ${sorted[Math.floor(sorted.length / 2)]}，范围 ${Math.min(...ages)}–${Math.max(...ages)} |`,
      `| 性别 | ${[...genders].map(([k, v]) => `${k} ${pct(v)}`).join('，')} |`,
      `| 职业类别 | ${[...categories].map(([k, v]) => `${k} ${pct(v)}`).join('，')} |`,
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// H3 — stability versus legal evolution
// ---------------------------------------------------------------------------

function measureH3() {
  const base = birthFact('h3');
  const jobFact = {
    seq: 2,
    at: BIRTH_AT + 1_000,
    kind: 'job',
    data: { job: '在书店做店员', category: 'employed' },
    source: 'model',
    evidence: 'confirmed',
  };
  const noteFact = { seq: 3, at: BIRTH_AT + 2_000, kind: 'user_fact', data: { text: '住在杭州' }, source: 'user', evidence: 'confirmed' };
  const tombstone = { seq: 4, at: BIRTH_AT + 3_000, kind: 'tombstone', data: { targetSeq: 3 }, source: 'user', evidence: 'confirmed' };

  // 1. order independence: the fold must not depend on record order
  const facts = [base, jobFact, noteFact];
  const a = viewOf(facts);
  const b = viewOf([...facts].reverse());
  const c = viewOf([noteFact, base, jobFact]);
  record('H3', '记录顺序不影响折叠结果', JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c));

  // 2. repeated fold is idempotent
  record('H3', '重复折叠结果一致', JSON.stringify(viewOf(facts)) === JSON.stringify(viewOf(facts)));

  // 3. passage of time changes only the derived age
  const later = viewOf(facts, BIRTH_AT + 24 * MONTH);
  const sameExceptAge = { ...stableFields(a) };
  const laterStable = { ...stableFields(later) };
  record(
    'H3',
    '无合法事件时，时间推进只改变年龄',
    JSON.stringify(sameExceptAge) === JSON.stringify(laterStable) && later.age >= a.age,
    `age ${a.age} → ${later.age}`,
  );

  // 4. a legitimate job event changes only the job fields
  const withJob = viewOf([base, jobFact]);
  const withoutJob = viewOf([base]);
  const jobOnly =
    withJob.job === '在书店做店员' &&
    withJob.jobCategory === 'employed' &&
    JSON.stringify({ ...stableFields(withJob), job: null, jobCategory: null }) ===
      JSON.stringify({ ...stableFields(withoutJob), job: null, jobCategory: null });
  record('H3', '合法职业事件只改职业字段', jobOnly, `${withoutJob.job} → ${withJob.job}`);

  // 5. a tombstone removes exactly one fact
  const withNote = viewOf([base, noteFact]);
  const afterForget = viewOf([base, noteFact, tombstone]);
  record('H3', '删除只移除目标事实', withNote.notes.length === 1 && afterForget.notes.length === 0);
  record('H3', '删除不改变其它字段', JSON.stringify(stableFields(withNote)) === JSON.stringify(stableFields(afterForget)));

  // 6. illegal mutations are refused before they can become facts
  const view = viewOf([base]);
  const illegalJob = planUpdate({ action: 'set_job', job: '还在读书', category: 'student' }, { ...view, jobCategory: 'employed' });
  const unconfirmedAge = planUpdate({ action: 'set_age', age: 30 }, view);
  const forgottenBirth = planUpdate({ action: 'forget', seq: 1 }, view, [base]);
  record(
    'H3',
    '非法变更在写入前被拒绝',
    !illegalJob.ok && !unconfirmedAge.ok && !forgottenBirth.ok,
    [illegalJob.code, unconfirmedAge.code, forgottenBirth.code].join(' / '),
  );

  // 7. an empty log yields no character
  record('H3', '没有出生事实时返回 null', fold([], {}, BIRTH_AT) === null);

  // 8. a corrupted birth record cannot poison the fold
  const corrupted = { ...birthFact('x'), data: {} };
  record('H3', '损坏的出生记录被跳过', fold([corrupted, birthFact('ok')], {}, BIRTH_AT)?.seed === 'ok');

  return {
    section: 'H3',
    detail: [
      '| 场景 | 结果 |',
      '|---|---|',
      ...results.filter((r) => r.section === 'H3').map((r) => `| ${r.name} | ${r.passed ? '通过' : '**失败**'}${r.detail ? `（${r.detail}）` : ''} |`),
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// H4 (approximation only) — what the injected card costs
// ---------------------------------------------------------------------------

function measureH4() {
  const plain = [];
  const withEvent = [];
  const eventFact = (seed) => ({
    seq: 2,
    at: BIRTH_AT + 1_000,
    kind: 'event',
    data: { id: '20750.0', day: 20750, kind: 'rest', text: '课少，回宿舍补了个觉' },
    source: 'sim',
    evidence: 'confirmed',
  });
  for (const seed of SEEDS.slice(0, 50)) {
    plain.push([...renderCard(viewOf([birthFact(seed)]), { cardMaxChars: 220 })].length);
    withEvent.push([...renderCard(viewOf([birthFact(seed), eventFact(seed)]), { cardMaxChars: 220 })].length);
  }
  plain.sort((a, b) => a - b);
  withEvent.sort((a, b) => a - b);
  const empty = renderCard(viewOf([birthFact('h4')]), { cardMaxChars: 0 }) === '';
  record('H4', 'cardMaxChars = 0 时不注入', empty);

  return {
    section: 'H4',
    detail: [
      '| 指标 | 值 |',
      '|---|---|',
      `| 预算 | 220 字符 |`,
      `| 无近期事件 | 中位 ${plain[Math.floor(plain.length / 2)]}，范围 ${plain[0]}–${plain[plain.length - 1]} |`,
      `| 有一条已固化事件 | 中位 ${withEvent[Math.floor(withEvent.length / 2)]}，范围 ${withEvent[0]}–${withEvent[withEvent.length - 1]} |`,
      `| 「最近：」尾巴的成本 | 约 ${withEvent[Math.floor(withEvent.length / 2)] - plain[Math.floor(plain.length / 2)]} 字符 |`,
      `| 卡片关闭时为空白 | ${empty ? '是' : '**否**'} |`,
      '',
      '> 这是成本侧近似，不是 H4 的结论。真正的 H4 需要在固定总 token 预算下比较"有摘要/等长结构化文本/直接注入全字段"三种条件的跨会话一致性。',
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const h2a = measureH2a();
const h3 = measureH3();
const h4 = measureH4();

const failed = results.filter((r) => r.passed === false);
const lines = [
  '# dsh-xiao 评估报告',
  '',
  `生成时间：${new Date().toISOString()}`,
  `规则版本：${RULES_VERSION}　种子样本：${SEEDS.length}`,
  '',
  '本报告由 `node bench/report.mjs` 生成，只覆盖不依赖 LLM 的部分。H2a 与 H3 的判定是布尔断言，H4 只有成本侧近似。',
  '',
  '## H2a　同种子可复现',
  '',
  h2a.detail,
  '',
  '## H3　稳定性与合法演化',
  '',
  h3.detail,
  '',
  '## H4　人设卡成本（近似，非结论）',
  '',
  h4.detail,
  '',
  '## 汇总',
  '',
  `- 断言：${results.length - failed.length}/${results.length} 通过`,
  failed.length === 0 ? '- 没有失败项。' : `- 失败：${failed.map((r) => r.name).join('、')}`,
  '',
];

mkdirSync(HERE, { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`bench: ${results.length - failed.length}/${results.length} assertions passed → ${OUT}`);
if (failed.length > 0) process.exitCode = 1;
