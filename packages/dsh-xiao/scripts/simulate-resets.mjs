/**
 * Simulate N resets and check every invariant the audits have established.
 *
 * Each seed goes through fold exactly as a fresh birth would, then the view is checked
 * against the rules that were paid for with real bugs: age vs birth date, parents vs the
 * move, a colleague vs having a job, a partner's sentence vs how long they have been
 * together, a child's sentence vs the child's age, a shared flat vs age, and so on.
 *
 * Run: node scripts/simulate-resets.mjs [count]
 * Exit code 1 when any check fails, so it can gate a commit.
 */
import { randomUUID } from 'node:crypto';
import { RULES_VERSION, deriveDay, fold, looksTraditional, researchQuery, renderCard } from '../persona.js';

const DAY = 86_400_000;
const count = Math.max(1, Math.min(200, Number(process.argv[2]) || 10));
const now = Date.now();

const checks = [
  {
    name: 'age matches the birth date',
    run(view) {
      const [year, month, day] = view.birthDate.split('-').map(Number);
      const thisYear = new Date(now).getFullYear();
      const birthday = new Date(thisYear, month - 1, day).getTime();
      const calendar = thisYear - year - (birthday > now ? 1 : 0);
      return view.age === calendar ? null : `shown ${view.age}, calendar says ${calendar} (${view.birthDate})`;
    },
  },
  {
    name: 'parents are 同城 only if she never moved',
    run(view) {
      const moved = view.currentCity !== view.birthCity;
      for (const relation of view.relations.filter((r) => r.id === 'mother' || r.id === 'father')) {
        if (moved && relation.detail.includes('同城')) return `${relation.role} 同城 while living in ${view.currentCity}`;
        if (!moved && relation.detail.includes('在老家')) return `${relation.role} 在老家 while never moving`;
      }
      return null;
    },
  },
  {
    name: 'the two parents are described differently',
    run(view) {
      const mother = view.relations.find((r) => r.id === 'mother');
      const father = view.relations.find((r) => r.id === 'father');
      return mother.detail === father.detail ? `both say ${mother.detail}` : null;
    },
  },
  {
    name: 'relation details carry no pronoun',
    run(view) {
      for (const relation of view.relations) {
        if (/[她他]/.test(relation.detail)) return `${relation.role}: ${relation.detail}`;
      }
      return null;
    },
  },
  {
    name: 'a colleague only exists with a job',
    run(view) {
      const work = view.relations.find((r) => r.kind === 'work');
      if (!work) return null;
      if (!view.jobChosen && work.role !== '前同事') return `${work.role} without a job`;
      return null;
    },
  },
  {
    name: 'a long relationship is not described as recent',
    run(view) {
      const partner = view.relations.find((r) => r.kind === 'partner');
      if (!partner) return null;
      const milestone = view.lifeHistory.find((m) => /和.+在一起/.test(m.text));
      const together = milestone ? view.age - milestone.age : null;
      if (together !== null && together > 3 && /在一起[一二两三]年了|刚搬到一起住/.test(partner.detail)) {
        return `together ${together} years but says ${partner.detail}`;
      }
      return null;
    },
  },
  {
    name: "a child's sentence matches the child's age",
    run(view) {
      const child = view.relations.find((r) => r.kind === 'child');
      if (!child) return null;
      const milestone = view.lifeHistory.find((m) => m.text.endsWith('出生') && !m.text.startsWith('出生在'));
      if (!milestone) return 'a child with no birth on the timeline';
      const childAge = view.age - milestone.age;
      const fits =
        childAge < 7
          ? /幼儿园|在老家由父母带着|照片里/
          : childAge < 13
            ? /小学|在老家由父母带着|照片里/
            : childAge < 19
              ? /中学|不太爱说话|周末才回家/
              : /外地工作|过年才回来|偶尔打个电话/;
      return fits.test(child.detail) ? null : `child aged ${childAge}: ${child.detail}`;
    },
  },
  {
    name: 'nobody over forty shares a flat',
    run(view) {
      return view.age >= 40 && view.home.detail.includes('合租') ? view.home.detail : null;
    },
  },
  {
    name: 'the timeline is ordered and inside her life',
    run(view) {
      for (let index = 1; index < view.lifeHistory.length; index += 1) {
        if (view.lifeHistory[index].age < view.lifeHistory[index - 1].age) return 'milestones out of order';
      }
      const last = view.lifeHistory[view.lifeHistory.length - 1];
      return last && last.age > view.age ? `a milestone at ${last.age} on a ${view.age}-year-old` : null;
    },
  },
  {
    name: 'the flat is in the city she lives in',
    run(view) {
      return view.home.city === view.currentCity ? null : `flat in ${view.home.city}, lives in ${view.currentCity}`;
    },
  },
  {
    name: 'no job means nowhere to be',
    run(view) {
      if (view.jobChosen) return null;
      if (view.work !== null) return 'a workplace without a job';
      return view.commute.includes('还没有') || view.commute.includes('没有固定') ? null : view.commute;
    },
  },
  {
    name: 'the card stays inside every budget',
    run(view) {
      for (const budget of [60, 120, 220]) {
        const card = renderCard(view, { cardMaxChars: budget });
        if (card.length > budget) return `budget ${budget} produced ${card.length}`;
        if (!card.includes('虚拟角色')) return `disclaimer missing at budget ${budget}`;
      }
      return null;
    },
  },
  {
    name: 'a month later the child sentence still fits',
    run(view, ctx) {
      const child = view.relations.find((r) => r.kind === 'child');
      if (!child) return null;
      const later = fold([ctx.birth], {}, now + 30 * DAY);
      if (!later) return 'fold returned nothing a month later';
      const laterChild = later.relations.find((r) => r.kind === 'child');
      if (!laterChild) return 'the child disappeared a month later';
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
      return fits.test(laterChild.detail) ? null : `a month later, child aged ${childAge}: ${laterChild.detail}`;
    },
  },
  {
    name: 'a day without a job has no office in it',
    run(view) {
      if (view.jobChosen) return null;
      const text = deriveDay(view, now)
        .map((slot) => slot.text)
        .join('|');
      return /开会|工位|收银|理货/.test(text) ? text : null;
    },
  },
  {
    name: 'the daily question is about her, in simplified characters',
    run(view) {
      const query = researchQuery(view, Math.floor(now / DAY));
      if (!query) return 'empty query';
      if (looksTraditional(query)) return `traditional: ${query}`;
      return null;
    },
  },
];

let failures = 0;
const lines = [];
for (let index = 0; index < count; index += 1) {
  const seed = randomUUID();
  const born = now - Math.floor(Math.random() * 20) * DAY;
  const birth = {
    seq: 1,
    at: born,
    kind: 'birth',
    data: { instanceId: randomUUID(), seed, birthAt: born, rulesVersion: RULES_VERSION },
    source: 'seed',
    evidence: 'confirmed',
  };
  const view = fold([birth], {}, now);
  const problems = [];
  for (const check of checks) {
    try {
      const message = check.run(view, { birth });
      if (message) problems.push(`${check.name}: ${message}`);
    } catch (error) {
      problems.push(`${check.name}: threw ${error?.message ?? error}`);
    }
  }
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
