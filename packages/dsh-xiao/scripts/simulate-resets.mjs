/**
 * Random-reset simulation: birth N personas from random UUID seeds and check each one
 * against the shared rules. The checks live in checks.mjs, so this script and the
 * full-coverage one can never drift apart.
 *
 * Run: node scripts/simulate-resets.mjs [count]
 * Exit code 1 when any check fails, so it can gate a commit.
 */
import { randomUUID } from 'node:crypto';
import { RULES_VERSION, fold } from '../persona.js';
import { runChecks } from './checks.mjs';

const DAY = 86_400_000;
const count = Math.max(1, Math.min(500, Number(process.argv[2]) || 10));
const now = Date.now();

let failures = 0;
const lines = [];

for (let index = 0; index < count; index += 1) {
  const born = now - Math.floor(Math.random() * 20) * DAY;
  const birth = {
    seq: 1,
    at: born,
    kind: 'birth',
    data: { instanceId: randomUUID(), seed: randomUUID(), birthAt: born, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
  const view = fold([birth], {}, now);
  const problems = runChecks(view, { now, birth });
  failures += problems.length;

  const names = view.relations.map((r) => `${r.role}·${r.name}`).join(' ');
  lines.push(
    `#${String(index + 1).padStart(2)} ${view.genderWord} ${String(view.age).padStart(2)} 岁 ${view.birthCity}→${view.currentCity} ` +
      `${view.jobChosen ? view.job : '（未定职业）'} | ${view.home.detail} | ${names}`,
  );
  if (problems.length === 0) lines.push('      ✓ 全部检查通过');
  for (const problem of problems) lines.push(`      ✗ ${problem}`);
}

lines.push('');
lines.push(failures === 0 ? `${count} 次随机重置，全部检查通过。` : `${count} 次随机重置，${failures} 处问题。`);
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = failures === 0 ? 0 : 1;
