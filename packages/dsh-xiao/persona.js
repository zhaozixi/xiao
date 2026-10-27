/**
 * Pure core of dsh-xiao: seed derivation, the persona card, and the fact fold.
 *
 * Everything here is total and side-effect free — no I/O, no clock, no LLM, no
 * imports — so it can be unit-tested outside the Harness and so that "same facts
 * in, same character out" is a property of the code rather than a hope.
 * `index.js` owns the Cordis plumbing.
 */

/** Storage unit names must match /^[a-z][a-z0-9_]*$/ — no hyphens. */
export const DOMAIN_NAME = 'dsh_xiao';
export const RULES_VERSION = 1;
export const FACT_KINDS = ['birth', 'override', 'job', 'health', 'user_fact', 'event', 'tombstone'];

const AGE_MIN = 18;
const AGE_MAX = 60;

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

function hashString(input) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rnd, list) {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Persona derivation: seed in, character out
// ---------------------------------------------------------------------------

const GENDERS = [
  { key: 'female', word: '女性' },
  { key: 'male', word: '男性' },
];

const OUTLOOK = ['安静内敛，不太主动开口', '平和，喜欢先听再说', '外向，想到什么就说什么'];
const CURIOSITY = ['对新东西好奇，愿意试', '谨慎，习惯先看清楚再动'];
const SPEECH = ['说话简短，不爱夸张', '语气直接，不绕弯子', '温和，会照顾对方情绪'];
const HOBBIES = ['做饭', '散步', '看纪录片', '拼模型', '养植物', '写点没头没尾的笔记', '听老歌'];
const QUIRKS = [
  '怕冷，冬天总是多带一件外套',
  '对甜食没什么抵抗力',
  '熬夜之后会后悔',
  '记得路，但记不住人名',
  '习惯把要做的事写在纸上',
  '不太会用感叹号',
];
const JOBS_YOUNG = ['还在读书', '刚毕业，在做一份实习', '在便利店做兼职'];
const JOBS_MID = [
  '在一家小公司做产品',
  '在一家外包公司写前端',
  '在书店做店员',
  '在社区医院做行政',
  '在做自由插画',
  '在物流公司做调度',
];
const JOBS_LATE = ['在一家小公司做财务', '自己开了间小店', '在做行政，快退休了'];

/**
 * Derive every identity field from a seed. Pure: same seed, same character.
 * @param {string} seed - instance seed.
 * @returns {object} derived persona fields.
 */
export function derivePersona(seed) {
  const rnd = mulberry32(hashString(seed));
  const gender = pick(rnd, GENDERS);
  const age = AGE_MIN + Math.floor(rnd() * (AGE_MAX - AGE_MIN + 1));
  const outlook = pick(rnd, OUTLOOK);
  const curiosity = pick(rnd, CURIOSITY);
  const speech = pick(rnd, SPEECH);
  const hobby = pick(rnd, HOBBIES);
  const quirk = pick(rnd, QUIRKS);
  const jobPool = age < 23 ? JOBS_YOUNG : age < 50 ? JOBS_MID : JOBS_LATE;
  const job = pick(rnd, jobPool);
  return { gender: gender.key, genderWord: gender.word, age, job, outlook, curiosity, speech, hobby, quirk };
}

/**
 * Render the persona card. The first two lines stay stable so they can sit in a
 * cacheable prompt prefix; the disclaimer survives every truncation.
 * @param {object} view - folded character view.
 * @param {{ cardMaxChars?: number }} cfg - normalized config.
 * @returns {string} the card, possibly empty.
 */
export function renderCard(view, cfg) {
  const budget = Number(cfg?.cardMaxChars ?? 0);
  if (!budget || budget <= 0) return '';
  const disclaimer = '你是 DSH 里的虚拟角色，不是真人；下面的设定与经历都是虚构的，不是真实事件。';
  const head = `你是晓，${view.genderWord}，${view.age} 岁，${view.job}。`;
  const traits = `${view.outlook}；${view.curiosity}；${view.speech}。`;
  const flavor = `闲下来会${view.hobby}；${view.quirk}。`;
  const recent = view.recent && view.recent.length > 0 ? `最近：${view.recent[0]}。` : '';

  const lines = [head, traits];
  const room = () => budget - head.length - traits.length - disclaimer.length - 2;
  if (recent && recent.length <= room()) lines.push(recent);
  if (flavor && flavor.length <= room()) lines.push(flavor);
  lines.push(disclaimer);

  let card = lines.join('\n');
  if (card.length > budget) {
    const spare = Math.max(0, budget - head.length - disclaimer.length - 2);
    const trimmed = traits.slice(0, spare);
    card = spare > 0 ? `${head}\n${trimmed}\n${disclaimer}` : `${head}\n${disclaimer}`;
  }
  return card;
}

// ---------------------------------------------------------------------------
// Fact records
// ---------------------------------------------------------------------------

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFactRecord(value) {
  if (!isPlainObject(value)) return false;
  if (typeof value.seq !== 'number' || !Number.isFinite(value.seq)) return false;
  if (typeof value.at !== 'number' || !Number.isFinite(value.at)) return false;
  if (typeof value.kind !== 'string' || !FACT_KINDS.includes(value.kind)) return false;
  if (!isPlainObject(value.data)) return false;
  if (typeof value.source !== 'string') return false;
  if (typeof value.evidence !== 'string') return false;
  return true;
}

/**
 * Minimal schema object: the domain layer only ever calls `parse` / `safeParse`.
 * Hand-written so the plugin needs no package imports.
 * @param {(value: unknown) => boolean} check - validator.
 * @param {string} label - message label.
 * @returns {{parse: Function, safeParse: Function}} schema-like object.
 */
function factSchema(check, label) {
  return {
    parse(value) {
      if (!check(value)) throw new Error(`${label} does not match its schema`);
      return value;
    },
    safeParse(value) {
      return check(value)
        ? { success: true, data: value }
        : { success: false, error: new Error(`${label} does not match its schema`) };
    },
  };
}

export const SPEC = {
  name: DOMAIN_NAME,
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    facts: { valueSchema: factSchema(isFactRecord, 'fact record') },
  },
};

export function compareSeq(a, b) {
  return a.seq - b.seq;
}

/**
 * Fold the fact log into the current character. Pure and total: an empty log yields null.
 * @param {Iterable} records - stored fact records.
 * @param {{ growthPerMonth?: number }} cfg - normalized config.
 * @param {number} now - wall clock in ms.
 * @returns {object|null} folded view.
 */
export function fold(records, cfg, now) {
  const live = [...records].filter(isFactRecord).sort(compareSeq);
  const dead = new Set();
  for (const fact of live) {
    if (fact.kind === 'tombstone') dead.add(fact.data.targetSeq);
  }
  const facts = live.filter((fact) => !dead.has(fact.seq));

  const births = facts.filter((fact) => fact.kind === 'birth');
  if (births.length === 0) return null;
  const birth = births.reduce((a, b) =>
    a.at < b.at || (a.at === b.at && String(a.data.instanceId) <= String(b.data.instanceId)) ? a : b,
  );

  const base = derivePersona(birth.data.seed);
  const overrides = new Map();
  const notes = [];
  const events = [];
  let job = base.job;

  for (const fact of facts) {
    if (fact.kind === 'override') {
      overrides.set(fact.data.field, fact.data.value);
    } else if (fact.kind === 'job') {
      if (typeof fact.data.job === 'string' && fact.data.job.length > 0) job = fact.data.job;
    } else if (fact.kind === 'event') {
      events.push({ at: fact.at, text: String(fact.data.text ?? '') });
    } else if (fact.kind === 'user_fact' || fact.kind === 'health') {
      notes.push(String(fact.data.text ?? ''));
    }
  }

  const months = Math.max(0, (now - birth.data.birthAt) / (30 * 24 * 60 * 60 * 1000));
  const growth = clamp(Number(cfg?.growthPerMonth ?? 1 / 12), 1 / 12, 1 / 4);
  const aged = clamp(base.age + Math.floor(months * growth), AGE_MIN, AGE_MAX);

  return {
    instanceId: birth.data.instanceId,
    seed: birth.data.seed,
    bornAt: birth.data.birthAt,
    rulesVersion: birth.data.rulesVersion,
    gender: base.gender,
    genderWord: base.genderWord,
    age: overrides.has('age') ? Number(overrides.get('age')) : aged,
    job: overrides.has('job') ? String(overrides.get('job')) : job,
    outlook: base.outlook,
    curiosity: base.curiosity,
    speech: base.speech,
    hobby: base.hobby,
    quirk: base.quirk,
    notes,
    recent: events.sort((a, b) => b.at - a.at).slice(0, 3).map((event) => event.text),
    factCount: facts.length,
  };
}
