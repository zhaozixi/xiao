/**
 * The consistency rules the audits paid for, in one place so both simulation scripts use
 * the same ones. Each check returns null when the view is fine, or a short message.
 *
 * Every entry here traces back to a real bug found in a real reset; a check that cannot be
 * traced to one should not be added, or the suite fills up with rules nobody needs.
 */
import { CATALOG, deriveDay, looksTraditional, researchQuery, renderCard } from '../persona.js';

const DAY = 86_400_000;

const pools = {
  young: /幼儿园|在老家由父母带着|照片里/,
  kid: /小学|在老家由父母带着|照片里/,
  teen: /中学|不太爱说话|周末才回家/,
  adult: /外地工作|过年才回来|偶尔打个电话/,
};

function childPoolFor(age) {
  if (age < 7) return pools.young;
  if (age < 13) return pools.kid;
  if (age < 19) return pools.teen;
  return pools.adult;
}

/**
 * Build the list of checks bound to one run (they need `now` and the birth fact).
 * @param {{now: number}} options - the instant the views are folded at.
 * @returns {{name: string, run: Function}[]} checks.
 */
export function makeChecks({ now }) {
  return [
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
      name: 'every name matches the role it belongs to',
      run(view) {
        const female = new Set(CATALOG.givenNames.female);
        const male = new Set(CATALOG.givenNames.male);
        for (const relation of view.relations) {
          const given = String(relation.name).slice(1);
          const wantsFemale =
            relation.id === 'mother' ||
            relation.role === '女儿' ||
            (relation.id === 'partner' && view.gender === 'male');
          const wantsMale =
            relation.id === 'father' ||
            relation.role === '儿子' ||
            (relation.id === 'partner' && view.gender === 'female');
          if (wantsFemale && !female.has(given)) return `${relation.role} ${relation.name} should be a female name`;
          if (wantsMale && !male.has(given)) return `${relation.role} ${relation.name} should be a male name`;
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
        return childPoolFor(childAge).test(child.detail) ? null : `child aged ${childAge}: ${child.detail}`;
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
      name: 'a workplace exists exactly when work does',
      run(view) {
        const needsWork = view.jobChosen && (view.jobCategory === 'employed' || view.jobCategory === 'student');
        if (needsWork && !view.work) return `${view.jobCategory} without a workplace`;
        if (!needsWork && view.work) return `a workplace while ${view.jobChosen ? view.jobCategory : 'undecided'}`;
        return typeof view.commute === 'string' && view.commute.length > 0 ? null : 'no commute line';
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
      name: 'the day fits what she does now',
      run(view) {
        const text = deriveDay(view, now)
          .map((slot) => slot.text)
          .join('|');
        if (!view.jobChosen) return /开会|工位|收银|理货|上课|简历/.test(text) ? `undecided: ${text}` : null;
        const expectations = {
          student: /上课|图书馆|食堂|自习室|宿舍|操场/,
          job_seeking: /简历|面试|招聘|回复|求职/,
          unemployed: /作品集|人才市场|余额|睡到自然醒|临时/,
          retired: /公园|下棋|相册|社区|收音机|买菜/,
        };
        const expected = expectations[view.jobCategory];
        if (expected && !expected.test(text)) return `${view.jobCategory} got ${text}`;
        if (view.jobCategory === 'employed') {
          const remote = /自由/.test(view.job);
          const shop = /便利店|店员|小店/.test(view.job);
          if (remote && /通勤|工位|开会/.test(text)) return `remote got ${text}`;
          if (!remote && !shop && /收银|理货|稿子|甲方/.test(text)) return `office got ${text}`;
        }
        return null;
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
}

/**
 * Run every check against one view.
 * @param {object} view - a folded view.
 * @param {object} ctx - { now, birth, facts } and anything else the checks need.
 * @returns {string[]} problems, empty when the view is consistent.
 */
export function runChecks(view, ctx) {
  const problems = [];
  for (const check of makeChecks({ now: ctx.now })) {
    try {
      const message = check.run(view, ctx);
      if (message) problems.push(`${check.name}: ${message}`);
    } catch (error) {
      problems.push(`${check.name}: threw ${error?.message ?? error}`);
    }
  }
  return problems;
}
