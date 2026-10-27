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
export const FACT_KINDS = ['birth', 'override', 'job', 'health', 'user_fact', 'event', 'tombstone', 'rejected'];

const AGE_MIN = 18;
const AGE_MAX = 60;

export { AGE_MIN, AGE_MAX };

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
/** Job pools, each label tagged with the state-machine category it belongs to. */
const JOBS_YOUNG = [
  { job: '还在读书', category: 'student' },
  { job: '刚毕业，在做一份实习', category: 'employed' },
  { job: '在便利店做兼职', category: 'employed' },
];
const JOBS_MID = [
  { job: '在一家小公司做产品', category: 'employed' },
  { job: '在一家外包公司写前端', category: 'employed' },
  { job: '在书店做店员', category: 'employed' },
  { job: '在社区医院做行政', category: 'employed' },
  { job: '在做自由插画', category: 'employed' },
  { job: '在物流公司做调度', category: 'employed' },
];
const JOBS_LATE = [
  { job: '在一家小公司做财务', category: 'employed' },
  { job: '自己开了间小店', category: 'employed' },
  { job: '在做行政，快退休了', category: 'employed' },
];

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
  const chosen = pick(rnd, jobPool);
  return {
    gender: gender.key,
    genderWord: gender.word,
    age,
    job: chosen.job,
    jobCategory: chosen.category,
    outlook,
    curiosity,
    speech,
    hobby,
    quirk,
  };
}

// ---------------------------------------------------------------------------
// Job state machine (v0.2)
// ---------------------------------------------------------------------------

export const JOB_CATEGORIES = ['student', 'job_seeking', 'employed', 'unemployed', 'retired'];

/** Allowed transitions. `retired` is terminal. */
const JOB_TRANSITIONS = {
  student: ['job_seeking'],
  job_seeking: ['employed', 'unemployed'],
  employed: ['job_seeking', 'unemployed'],
  unemployed: ['job_seeking', 'retired'],
  retired: [],
};

/** Minimum age at which `retired` is reachable; the adult default range is 18–60. */
const RETIRE_AGE = 55;

/**
 * Validate one job transition against the state machine.
 * @param {string} from - current category.
 * @param {string} to - requested category.
 * @param {number} age - current (derived) age.
 * @returns {{ok: true} | {ok: false, code: string, reason: string}} decision.
 */
export function canTransitionJob(from, to, age) {
  if (!JOB_CATEGORIES.includes(from)) {
    return { ok: false, code: 'unknown_job_category', reason: `当前职业类别未知：${from}` };
  }
  if (!JOB_CATEGORIES.includes(to)) {
    return { ok: false, code: 'unknown_job_category', reason: `目标类别未知：${to}；可选：${JOB_CATEGORIES.join(', ')}` };
  }
  if (to === 'retired' && Number(age) < RETIRE_AGE) {
    return { ok: false, code: 'retire_too_young', reason: `退休需要年龄 ≥ ${RETIRE_AGE}，当前 ${age} 岁` };
  }
  if (!JOB_TRANSITIONS[from].includes(to)) {
    const allowed = JOB_TRANSITIONS[from];
    return {
      ok: false,
      code: 'illegal_job_transition',
      reason: `不允许 ${from} → ${to}；${allowed.length > 0 ? `允许：${allowed.join(', ')}` : '当前状态不可转移'}`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update planning: turn a requested mutation into a fact, or into a refusal
// ---------------------------------------------------------------------------

/**
 * Decide what one `xiao_update` call would write. Pure: no I/O, no clock.
 * The guard layer (`index.js`) independently refuses immutable-field shapes, so a
 * refusal here is about state, not about shape.
 * @param {unknown} input - tool arguments.
 * @param {object} view - folded character view.
 * @param {Iterable} records - the whole fact log, for `forget`.
 * @returns {object} `{ ok: true, kind, data, source, note? }` or `{ ok: false, code, reason }`.
 */
export function planUpdate(input, view, records = []) {
  const args = isPlainObject(input) ? input : {};
  const action = String(args.action ?? '');

  if (action === 'set_job') {
    const job = typeof args.job === 'string' ? args.job.trim() : '';
    const category = String(args.category ?? '');
    if (job.length === 0) return { ok: false, code: 'missing_job', reason: 'job 不能为空' };
    if (job.length > 40) return { ok: false, code: 'job_too_long', reason: 'job 超过 40 字' };
    const check = canTransitionJob(view.jobCategory, category, view.age);
    if (!check.ok) return check;
    return { ok: true, kind: 'job', data: { job, category }, source: 'model' };
  }

  if (action === 'remember') {
    const text = typeof args.text === 'string' ? args.text.trim() : '';
    if (text.length === 0) return { ok: false, code: 'missing_text', reason: 'text 不能为空' };
    if (text.length > 200) return { ok: false, code: 'text_too_long', reason: 'text 超过 200 字' };
    return { ok: true, kind: 'user_fact', data: { text }, source: 'user' };
  }

  if (action === 'forget') {
    const seq = Number(args.seq);
    if (!Number.isFinite(seq)) return { ok: false, code: 'missing_seq', reason: 'seq 必须是数字' };
    const all = [...records].filter(isFactRecord);
    const target = all.find((fact) => fact.seq === seq);
    if (!target) return { ok: false, code: 'unknown_fact', reason: `没有 seq=${seq} 的事实` };
    if (target.kind === 'birth') return { ok: false, code: 'cannot_forget_birth', reason: '出生事实不能删除；要重来请重置实例' };
    const already = all.some((fact) => fact.kind === 'tombstone' && fact.data.targetSeq === seq);
    if (already) return { ok: false, code: 'already_forgotten', reason: `seq=${seq} 已被删除` };
    return { ok: true, kind: 'tombstone', data: { targetSeq: seq }, source: 'user' };
  }

  if (action === 'set_age') {
    if (args.confirmed !== true) {
      return {
        ok: false,
        code: 'needs_confirmation',
        reason: '改年龄必须先得到用户明确确认；先问用户，确认后再带 confirmed: true 调用',
      };
    }
    const age = Number(args.age);
    if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
      return { ok: false, code: 'age_out_of_range', reason: `年龄必须是 ${AGE_MIN}–${AGE_MAX} 的整数` };
    }
    return { ok: true, kind: 'override', data: { field: 'age', value: age }, source: 'user' };
  }

  return { ok: false, code: 'unknown_action', reason: `未知 action：${action || '(空)'}；可选 set_job / remember / forget / set_age` };
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
  const flavor = `闲下来会${view.hobby}；${view.quirk}。现在${view.tone ?? '平静'}。`;
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
  // Hard guarantee: the card never exceeds the budget, even when the budget cannot
  // hold the head and the disclaimer together.
  return card.length > budget ? card.slice(0, budget) : card;
}

// ---------------------------------------------------------------------------
// Lazy simulated life (v0.3)
// ---------------------------------------------------------------------------

/**
 * Event templates per job category. Nothing here may describe work for a category
 * that cannot work: the shared `any` pool is deliberately work-free.
 */
const LIFE_TEMPLATES = {
  student: [
    ['study', '上午连着两节课，笔记记到手酸'],
    ['study', '在图书馆待到闭馆才走'],
    ['study', '小组作业开到晚上，还是没定题'],
    ['social', '和同学在食堂多聊了半小时'],
    ['rest', '课少，回宿舍补了个觉'],
    ['rest', '逃了一节早课，醒来有点愧疚'],
    ['good', '在旧书店翻到一本便宜的诗集'],
    ['mishap', '忘记交作业，被提醒了一次'],
  ],
  employed: [
    ['work', '开了一个拖到下班前的会'],
    ['work', '把拖了两天的表格终于写完'],
    ['work', '加班到地铁最后一班'],
    ['work', '帮同事顶了一个急活'],
    ['social', '和同事下楼吃了碗面'],
    ['rest', '准点下班，绕路走了两站'],
    ['mishap', '电脑蓝屏，半天的工作要重做'],
    ['good', '一直悬着的需求终于通过了'],
  ],
  job_seeking: [
    ['work', '去面了一家小公司，聊了四十分钟'],
    ['mishap', '投出去的简历又没有回音'],
    ['study', '下午改简历改到烦'],
    ['work', '跑了第二趟招聘会'],
    ['rest', '在家躺了一天，晚上才觉得该动起来'],
    ['good', '约到了一场下周的面试'],
  ],
  unemployed: [
    ['rest', '睡到自然醒，然后有点心虚'],
    ['work', '跑了一趟人才市场'],
    ['mishap', '算了算余额，决定这个月少买东西'],
    ['rest', '把简历摊在桌上，看了一会儿又合上'],
    ['good', '朋友介绍了一个临时活'],
    ['social', '和朋友吃了顿饭，被问起近况'],
  ],
  retired: [
    ['rest', '早上绕公园走了两圈'],
    ['social', '和老邻居在楼下下了一盘棋'],
    ['good', '养的茉莉开了第二茬'],
    ['rest', '把旧相册翻出来看了一下午'],
    ['social', '去社区活动室听了一场讲座'],
    ['mishap', '膝盖有点疼，少走了两圈'],
  ],
  any: [
    ['rest', '试着做了道新菜，盐放多了'],
    ['rest', '把攒了一周的纪录片看了半集'],
    ['good', '路过花店，买了一小盆绿植'],
    ['rest', '把屋子收拾了一遍，扔掉一袋旧东西'],
    ['good', '走错路，发现一家没去过的小店'],
    ['mishap', '手机屏摔裂了一道'],
  ],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tone is a pure function of the committed events — never stored, so it can never
 * drift away from what actually happened.
 * @param {object[]} events - committed events.
 * @returns {string} one of a small closed set.
 */
export function toneOf(events) {
  if (!Array.isArray(events) || events.length === 0) return '平静';
  const latest = [...events].sort((a, b) => b.at - a.at)[0];
  switch (latest.kind) {
    case 'work':
    case 'study':
      return '有点累';
    case 'mishap':
      return '不太顺';
    case 'good':
    case 'social':
      return '心情不错';
    case 'rest':
      return '松下来';
    default:
      return '平静';
  }
}

function generateWeek(seed, week, view, cap) {
  if (cap <= 0) return [];
  const rnd = mulberry32(hashString(`${seed}#w${week}`));
  const count = 1 + Math.floor(rnd() * cap);
  const pool = [...(LIFE_TEMPLATES[view?.jobCategory] ?? []), ...LIFE_TEMPLATES.any];
  const out = [];
  for (let slot = 0; slot < count; slot += 1) {
    const dayOffset = Math.floor(rnd() * 7);
    const [kind, text] = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
    out.push({ id: `${week}.${slot}`, week, day: week * 7 + dayOffset, kind, text, simulated: true });
  }
  return out;
}

/**
 * Generate the simulated life for one recent window. Deterministic and lazy: the same
 * (seed, view, week) always yields the same events, and a committed event always wins
 * over the generated one, so anything already spoken about stops moving.
 * @param {{seed: string, view: object, cfg: object, days?: number, now?: number}} input - generation input.
 * @returns {{events: object[], tone: string, fromDay: number, toDay: number}} window result.
 */
export function generateLife({ seed, view, cfg, days = 7, now = Date.now() }) {
  const cap = clamp(Math.floor(Number(cfg?.lifeEventsPerWeek ?? 0)), 0, 2);
  const span = clamp(Math.floor(Number(days) || 7), 1, 60);
  const today = Math.floor(now / DAY_MS);
  const fromDay = today - span + 1;
  const fromWeek = Math.floor(fromDay / 7);
  const toWeek = Math.floor(today / 7);

  const committed = new Map();
  for (const event of view?.eventsAll ?? []) if (event.id) committed.set(event.id, event);

  const byId = new Map();
  for (let week = fromWeek; week <= toWeek; week += 1) {
    for (const generated of generateWeek(seed, week, view, cap)) {
      if (generated.day < fromDay || generated.day > today) continue;
      byId.set(generated.id, generated);
    }
  }
  for (const [id, event] of committed) {
    if (event.day >= fromDay && event.day <= today) byId.set(id, { ...event, simulated: true });
  }

  const events = [...byId.values()]
    .map((event) => ({
      ...event,
      date: new Date(event.day * DAY_MS).toISOString().slice(0, 10),
      committed: committed.has(event.id),
    }))
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));

  return { events, tone: toneOf(view?.eventsAll ?? []), fromDay, toDay: today };
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
    // Additive table (no record-shape change): one profile-level flag per key, e.g.
    // whether the one and only Xiao has already been introduced.
    flags: { valueSchema: factSchema(isFlagRecord, 'flag record') },
  },
};

function isFlagRecord(value) {
  if (!isPlainObject(value)) return false;
  if (typeof value.at !== 'number' || !Number.isFinite(value.at)) return false;
  if (value.reason !== undefined && typeof value.reason !== 'string') return false;
  return true;
}

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

  // A birth record with no usable seed cannot be folded; skip it instead of throwing,
  // so a corrupt record degrades to "no character yet" rather than a hard failure.
  const births = facts.filter(
    (fact) => fact.kind === 'birth' && typeof fact.data.seed === 'string' && fact.data.seed.length > 0,
  );
  if (births.length === 0) return null;
  const birth = births.reduce((a, b) =>
    a.at < b.at || (a.at === b.at && String(a.data.instanceId) <= String(b.data.instanceId)) ? a : b,
  );
  const birthAt = Number.isFinite(birth.data.birthAt) ? birth.data.birthAt : birth.at;

  const base = derivePersona(birth.data.seed);
  const overrides = new Map();
  const notes = [];
  const events = [];
  let job = base.job;
  let jobCategory = base.jobCategory;

  for (const fact of facts) {
    if (fact.kind === 'override') {
      overrides.set(fact.data.field, fact.data.value);
    } else if (fact.kind === 'job') {
      if (typeof fact.data.job === 'string' && fact.data.job.length > 0) job = fact.data.job;
      if (JOB_CATEGORIES.includes(fact.data.category)) jobCategory = fact.data.category;
    } else if (fact.kind === 'event') {
      events.push({
        id: String(fact.data.id ?? ''),
        day: Number(fact.data.day ?? 0),
        kind: String(fact.data.kind ?? 'rest'),
        at: fact.at,
        text: String(fact.data.text ?? ''),
      });
    } else if (fact.kind === 'user_fact' || fact.kind === 'health') {
      notes.push(String(fact.data.text ?? ''));
    }
  }

  const months = Math.max(0, (now - birthAt) / (30 * 24 * 60 * 60 * 1000));
  const growth = clamp(Number(cfg?.growthPerMonth ?? 1 / 12), 1 / 12, 1 / 4);
  const aged = clamp(base.age + Math.floor(months * growth), AGE_MIN, AGE_MAX);

  return {
    instanceId: birth.data.instanceId,
    seed: birth.data.seed,
    bornAt: birthAt,
    rulesVersion: birth.data.rulesVersion,
    gender: base.gender,
    genderWord: base.genderWord,
    age: overrides.has('age') ? Number(overrides.get('age')) : aged,
    job: overrides.has('job') ? String(overrides.get('job')) : job,
    jobCategory,
    outlook: base.outlook,
    curiosity: base.curiosity,
    speech: base.speech,
    hobby: base.hobby,
    quirk: base.quirk,
    notes,
    eventsAll: [...events].sort((a, b) => b.at - a.at),
    recent: [...events].sort((a, b) => b.at - a.at).slice(0, 3).map((event) => event.text),
    tone: toneOf(events),
    factCount: facts.length,
  };
}
