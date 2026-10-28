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
export const FACT_KINDS = ['birth', 'override', 'job', 'health', 'user_fact', 'event', 'tombstone', 'rejected', 'dispute'];

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

/** Place of birth: one city, deterministic from the seed. */
const BIRTH_CITIES = [
  '杭州', '成都', '长沙', '哈尔滨', '昆明', '青岛', '西安', '厦门',
  '苏州', '重庆', '郑州', '合肥', '福州', '大连', '无锡', '南昌',
];

const SURNAMES = ['张', '王', '李', '陈', '刘', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '何', '郭', '高'];
const GIVEN_FEMALE = ['婧', '婷', '悦', '楠', '若', '岚', '敏', '嘉'];
const GIVEN_MALE = ['航', '磊', '阳', '帆', '鹏', '川', '岑', '斌'];

/**
 * Parents stay where she was born. "同城，偶尔过来吃饭" is only true for someone who never
 * moved away, so the pool depends on that. No pronoun appears here on purpose: the same
 * sentence has to fit a male or a female character ("担心她的工作" does not).
 */
const PARENT_DETAIL_STAYED = ['同城，偶尔过来吃饭', '总担心工作不稳定', '身体还好，就是嘴上不饶人'];
const PARENT_DETAIL_AWAY = ['在老家，每周通一次电话', '总担心工作不稳定', '身体还好，就是嘴上不饶人'];
const FRIEND_ROLES = ['大学同学', '高中同学', '发小', '老邻居'];
const FRIEND_DETAIL = ['常一起散步', '很久没联系了', '偶尔约着吃饭', '会互相吐槽工作'];
/**
 * Role and detail are paired, not drawn independently: "合作过的编辑" who "顶了个班" is
 * two true facts about nobody.
 */
const WORK_RELATIONS_OFFICE = [
  ['同事', '同一个组，午饭常一起吃'],
  ['同事', '工位在隔壁，交接班时会聊两句'],
  ['前同事', '偶尔下班一起走一段'],
  ['前同事', '上次帮忙顶了个班'],
];
const WORK_RELATIONS_REMOTE = [
  ['合作过的编辑', '偶尔一起接活'],
  ['常约稿的甲方', '上次合作之后就没再聊过'],
  ['前同事', '偶尔下班一起走一段'],
  ['合作过的编辑', '上次合作之后就没再聊过'],
];
const CLASS_ROLES = ['同班同学', '同宿舍的室友', '一起赶作业的朋友'];
const CLASS_DETAIL = ['经常一起去图书馆', '这学期见面少了', '上次小组作业一起熬到很晚'];
/** What she gravitates to on her own: three of these, and they drive what she reads. */
const INTERESTS = [
  '旧地图',
  '独立漫画',
  '老电影',
  '胶片摄影',
  '地方志',
  '天文',
  '面包烘焙',
  '植物养护',
  '旧家具改造',
  '方言',
  '街拍',
  '手工装帧',
  '声音采样',
  '城市考古',
  '旧唱片',
  '编织',
];

/**
 * Partner descriptions are not a fixed pool any more: the sentence depends on how long
 * they have been together, which follows from her age. These are the two branches.
 */
const PARTNER_DETAIL_SHORT = ['刚搬到一起住'];
const PARTNER_DETAIL_LONG = ['在一起很多年了', '总提醒按时吃饭'];
const PARTNER_SPELLED = { 1: '一年', 2: '两年', 3: '三年' };
/**
 * How a child is described depends on how old the child is now. A 24-year-old daughter
 * cannot be "在老家由父母带着"; that sentence describes a small child.
 */
const CHILD_DETAIL_YOUNG = ['在老家由父母带着', '刚上幼儿园', '照片里总是笑着的'];
const CHILD_DETAIL_KID = ['在老家由父母带着', '上小学二年级', '照片里总是笑着的'];
const CHILD_DETAIL_TEEN = ['在上中学', '不太爱说话', '周末才回家'];
const CHILD_DETAIL_ADULT = ['在外地工作', '过年才回来', '偶尔打个电话'];

/** Where the day actually happens: a neighbourhood, a flat, a few familiar corners. */
const AREAS = ['老城区', '新城区', '江边', '大学城旁边', '地铁沿线', '菜市场附近'];
const HOME_DETAIL = ['一间朝北的一居室', '和别人合租的两居室', '顶楼带小阳台', '一楼，有点潮'];
const NEARBY = [
  '楼下的小卖部',
  '街角的面馆',
  '步行十分钟的公园',
  '一家开到很晚的便利店',
  '周末才去的菜市场',
  '常去的咖啡馆',
  '拐角的洗衣店',
  '门口修车的大爷',
];
const COMMUTE = ['地铁三站，再走八分钟', '骑车二十分钟', '公交两站加一段路', '走路二十五分钟'];

/**
 * The flat and the corners around it. Independent of her job, so a job change never
 * moves her furniture.
 * @param {string} seed - instance seed.
 * @param {string} city - where she lives now.
 * @param {number} [seedAge] - her age at birth; a constant, so the flat does not change
 *   when she has a birthday.
 * @returns {{home: object, nearby: string[]}} home and familiar spots.
 */
export function deriveHome(seed, city, seedAge) {
  // The city is part of the salt: moving to another city must not reproduce the same
  // street and the same three shops she had in the old one.
  const rnd = mulberry32(hashString(`${seed}#home#${city}`));
  const area = pick(rnd, AREAS);
  // A 56-year-old sharing a two-bedroom with roommates is possible but unusual enough to
  // read as a bug, so that option is only available to younger personas.
  const detailPool = Number(seedAge) >= 40 ? HOME_DETAIL.filter((detail) => !detail.includes('合租')) : HOME_DETAIL;
  const home = { city, area, detail: pick(rnd, detailPool) };
  const nearby = [];
  const pool = [...NEARBY];
  while (nearby.length < 3 && pool.length > 0) {
    nearby.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return { home, nearby };
}

/**
 * Where she has to be on a weekday, given what she does *now*. Someone unemployed or
 * retired has nowhere to go, and that has to show.
 * @param {string} seed - instance seed.
 * @param {string} city - where she lives now.
 * @param {string} job - current job label.
 * @param {string} jobCategory - current category.
 * @returns {{work: object|null, commute: string}} workplace and route.
 */
export function deriveWork(seed, city, job, jobCategory) {
  const rnd = mulberry32(hashString(`${seed}#work#${city}`));
  if (jobCategory === 'student') {
    return {
      work: { city, area: pick(rnd, AREAS), name: '学校', detail: '上课的日子基本都在那边' },
      commute: '公交四十分钟',
    };
  }
  if (jobCategory === 'job_seeking' || jobCategory === 'unemployed' || jobCategory === 'retired') {
    return { work: null, commute: '现在没有固定要去的班' };
  }
  if (jobCategory === 'undecided') {
    return { work: null, commute: '还没有固定的去处' };
  }
  if (typeof job === 'string' && job.includes('自由')) {
    return { work: { city, area: '家里那张桌子', name: '家里那张桌子', detail: '在家工作，没有通勤' }, commute: '没有通勤' };
  }
  return {
    work: { city, area: pick(rnd, AREAS), name: '上班的地方', detail: '一周去五天' },
    commute: pick(rnd, COMMUTE),
  };
}

/**
 * Anchor her to one flat and, when she has somewhere to be, one workplace plus the
 * route between them. Deterministic; she can add more in conversation.
 * @param {string} seed - instance seed.
 * @param {string} city - where she lives now.
 * @param {string} job - job label at birth.
 * @param {string} jobCategory - its category.
 * @returns {{home: object, work: object|null, commute: string, nearby: string[]}} places.
 */
export function derivePlaces(seed, city, job, jobCategory, options = {}) {
  const { home, nearby } = deriveHome(seed, city, options.seedAge);
  const { work, commute } = deriveWork(seed, city, job, jobCategory);
  return { home, work, commute, nearby };
}

/**
 * The cast. Parents always exist; a partner and a child exist only when the seed says
 * so — they are plausible, not mandatory.
 * @param {Function} rnd - seeded generator, shared with the rest of the persona.
 * @param {string} jobCategory - the category chosen at birth.
 * @param {number} age - the age at birth.
 * @param {{moved?: boolean, remote?: boolean}} shape - whether she left her birth city, and
 *   whether she works for herself. Both change what the cast can plausibly be.
 * @returns {object[]} relations.
 */
function deriveRelations(rnd, jobCategory, age, shape = {}) {
  const used = new Set();
  const nextFrom = (pool) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const name = `${pick(rnd, SURNAMES)}${pick(rnd, pool)}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    const fallback = `${pick(rnd, SURNAMES)}${pick(rnd, pool)}${used.size}`;
    used.add(fallback);
    return fallback;
  };
  const anyName = () => nextFrom(rnd() < 0.5 ? GIVEN_FEMALE : GIVEN_MALE);
  const parentPool = shape.moved ? PARENT_DETAIL_AWAY : PARENT_DETAIL_STAYED;

  const motherDetail = pick(rnd, parentPool);
  // Two parents with the same sentence reads like a copy-paste bug, so draw without
  // replacement.
  const fatherDetail = pick(rnd, parentPool.filter((detail) => detail !== motherDetail));

  const relations = [
    { id: 'mother', kind: 'family', role: '母亲', name: nextFrom(GIVEN_FEMALE), detail: motherDetail },
    { id: 'father', kind: 'family', role: '父亲', name: nextFrom(GIVEN_MALE), detail: fatherDetail },
    { id: 'friend', kind: 'friend', role: pick(rnd, FRIEND_ROLES), name: anyName(), detail: pick(rnd, FRIEND_DETAIL) },
  ];
  if (jobCategory === 'student') {
    relations.push({ id: 'classmate', kind: 'classmate', role: pick(rnd, CLASS_ROLES), name: anyName(), detail: pick(rnd, CLASS_DETAIL) });
  } else {
    const [role, detail] = pick(rnd, shape.remote ? WORK_RELATIONS_REMOTE : WORK_RELATIONS_OFFICE);
    relations.push({ id: 'work', kind: 'work', role, name: anyName(), detail });
  }

  const hasPartner = age >= 25 && rnd() < 0.45;
  // Decided before the partner's description is drawn: "刚搬到一起住" cannot be true of a
  // couple with a four-year-old, so that option is unavailable once a child exists.
  const hasChild = hasPartner && age >= 32 && rnd() < 0.4;
  if (hasPartner) {
    // How long they have been together has to come from her age, not from a fixed pool:
    // "在一起三年了" on a 56-year-old contradicts a timeline that starts at 25.
    const partnerAge = Math.max(18, Math.min(age - 2, 24 + Math.floor(rnd() * 6)));
    const together = Math.max(1, age - partnerAge);
    let partnerPool;
    if (together <= 3) {
      const spelled = PARTNER_SPELLED[together] ?? `${together} 年`;
      partnerPool = [`在一起${spelled}了`, ...PARTNER_DETAIL_SHORT];
    } else {
      partnerPool = [...PARTNER_DETAIL_LONG];
    }
    if (hasChild) partnerPool = partnerPool.filter((detail) => detail !== '刚搬到一起住');
    relations.push({ id: 'partner', kind: 'partner', role: '伴侣', name: anyName(), detail: pick(rnd, partnerPool) });
    if (hasChild) {
      const girl = rnd() < 0.5;
      // Born when she was somewhere in her late twenties to mid thirties, so the child's
      // present age follows, and so does the sentence.
      const childBornAt = Math.max(24, Math.min(age - 1, 27 + Math.floor(rnd() * 8)));
      const childAge = Math.max(0, age - childBornAt);
      const childPool =
        childAge < 7 ? CHILD_DETAIL_YOUNG : childAge < 13 ? CHILD_DETAIL_KID : childAge < 19 ? CHILD_DETAIL_TEEN : CHILD_DETAIL_ADULT;
      relations.push({
        id: 'child',
        kind: 'child',
        role: girl ? '女儿' : '儿子',
        name: nextFrom(girl ? GIVEN_FEMALE : GIVEN_MALE),
        detail: pick(rnd, childPool),
      });
    }
  }
  return relations;
}

/**
 * A colleague is only a colleague while she has a job. Before she has chosen one, the
 * same person is someone she used to work with — her timeline still has past jobs, so the
 * relationship is real, only the label has to match the present.
 * @param {object} relation - a derived relation.
 * @param {boolean} jobChosen - whether she has a job fact.
 * @returns {object} the relation as it should read today.
 */
function relationForNow(relation, jobChosen) {
  if (jobChosen || relation?.kind !== 'work') return relation;
  const presentTense = new Set(['同一个组，午饭常一起吃', '工位在隔壁，交接班时会聊两句']);
  return {
    ...relation,
    role: '前同事',
    detail: presentTense.has(relation.detail) ? '偶尔下班一起走一段' : relation.detail,
  };
}

/**
 * The short history of a made-up life: birth, school, work. Anchored to her birth date,
 * so it reads as a timeline rather than a list of years.
 * @param {string} seed - instance seed.
 * @param {string} birthDate - `YYYY-MM-DD`.
 * @param {string} birthCity - place of birth.
 * @param {number} age - current age; nothing after it is emitted.
 * @returns {object[]} milestones, oldest first.
 */
export function deriveLifeHistory(seed, birthDate, birthCity, age, options = {}) {
  const [year, month, day] = String(birthDate).split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return [];
  const rnd = mulberry32(hashString(`${seed}#history`));
  const stamp = (offset) =>
    `${String(year + offset).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const out = [];
  const add = (offset, text) => {
    if (offset <= age) out.push({ date: stamp(offset), age: offset, text });
  };

  add(0, `出生在${birthCity}`);
  add(6, '上小学');
  add(12, '上初中');
  add(15, '上高中');
  const wentToCollege = rnd() < 0.7;
  if (wentToCollege) {
    add(18, '上大学');
    add(22, '大学毕业');
    add(23, '第一份工作');
  } else {
    add(18, '高中毕业，开始工作');
    add(19, '第一份工作');
  }
  if (age >= 27) add(26, '换了一次工作');

  // A partner and a child must show up on the timeline too, or the cast contradicts
  // the history.
  const relations = Array.isArray(options.relations) ? options.relations : [];
  const partner = relations.find((relation) => relation?.kind === 'partner');
  const child = relations.find((relation) => relation?.kind === 'child');
  // Anchored on her age at birth (constant), never on today's age — otherwise these two
  // dates would slide forward as she grows, and history must not move.
  const seedAge = Number.isFinite(options.seedAge) ? options.seedAge : age;
  const partnerAge = Math.max(18, Math.min(seedAge - 2, 24 + Math.floor(rnd() * 6)));
  const childBirthAge = Math.min(seedAge - 1, partnerAge + 1 + Math.floor(rnd() * 3));
  if (partner) add(partnerAge, `和${partner.name}在一起`);
  if (child && childBirthAge > partnerAge) add(childBirthAge, `${child.role}出生`);

  if (Number.isFinite(options.movedAt) && options.currentCity && options.currentCity !== birthCity) {
    add(options.movedAt, `搬到${options.currentCity}`);
  }
  return out.sort((a, b) => a.age - b.age);
}

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

  // Appended after every pre-existing field so old seeds keep the same character.
  const birthMonth = 1 + Math.floor(rnd() * 12);
  const birthDay = 1 + Math.floor(rnd() * 28);
  const birthCity = pick(rnd, BIRTH_CITIES);
  // Most adults moved away at some point; the rest stayed in the city they were born in.
  // Drawn before the cast, because the cast depends on it: parents in another city cannot
  // also be "同城".
  const movedAway = rnd() < 0.55;
  const movedAt = movedAway ? (age >= 22 ? 22 : 18) : undefined;
  const currentCity = movedAway ? pick(rnd, BIRTH_CITIES.filter((city) => city !== birthCity)) : birthCity;
  const relations = deriveRelations(rnd, chosen.category, age, {
    moved: movedAway,
    remote: chosen.job.includes('自由'),
  });
  // Three interests, drawn without replacement, so two of them can never be the same.
  const interests = [];
  const interestPool = [...INTERESTS];
  while (interests.length < 3 && interestPool.length > 0) {
    interests.push(interestPool.splice(Math.floor(rnd() * interestPool.length), 1)[0]);
  }

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
    birthMonth,
    birthDay,
    birthCity,
    relations,
    currentCity,
    movedAt,
    interests,
    places: derivePlaces(seed, currentCity, chosen.job, chosen.category, { seedAge: age }),
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
    // The very first choice is free: she is picking who she is, not moving between jobs.
    // Every later change has to obey the state machine.
    if (view.jobChosen !== false) {
      const check = canTransitionJob(view.jobCategory, category, view.age);
      if (!check.ok) return check;
    } else if (!JOB_CATEGORIES.includes(category)) {
      return { ok: false, code: 'unknown_category', reason: `未知 category：${category}` };
    }
    return { ok: true, kind: 'job', data: { job, category }, source: 'model' };
  }

  if (action === 'remember') {
    const text = typeof args.text === 'string' ? args.text.trim() : '';
    if (text.length === 0) return { ok: false, code: 'missing_text', reason: 'text 不能为空' };
    if (text.length > 200) return { ok: false, code: 'text_too_long', reason: 'text 超过 200 字' };
    // Temporary facts (a trip, a mood, a busy week) should fade instead of becoming
    // permanent traits of the user.
    const data = args.temporary === true ? { text, temporary: true } : { text };
    return { ok: true, kind: 'user_fact', data, source: 'user' };
  }

  if (action === 'dispute') {
    const seq = Number(args.seq);
    if (!Number.isFinite(seq)) return { ok: false, code: 'missing_seq', reason: 'seq 必须是数字' };
    const all = [...records].filter(isFactRecord);
    const target = all.find((fact) => fact.seq === seq);
    if (!target) return { ok: false, code: 'unknown_fact', reason: `没有 seq=${seq} 的事实` };
    if (target.kind === 'birth' || target.kind === 'dispute') {
      return { ok: false, code: 'cannot_dispute', reason: '这条事实不能被标记为存疑' };
    }
    if (all.some((fact) => fact.kind === 'tombstone' && fact.data.targetSeq === seq)) {
      return { ok: false, code: 'already_forgotten', reason: `seq=${seq} 已被删除` };
    }
    if (all.some((fact) => fact.kind === 'dispute' && Number(fact.data.targetSeq) === seq)) {
      return { ok: false, code: 'already_disputed', reason: `seq=${seq} 已被标记为存疑` };
    }
    return { ok: true, kind: 'dispute', data: { targetSeq: seq, reason: String(args.reason ?? '') }, source: 'user' };
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

  if (action === 'move') {
    const city = typeof args.city === 'string' ? args.city.trim() : '';
    if (city.length === 0) return { ok: false, code: 'missing_city', reason: 'city 不能为空' };
    if (city.length > 20) return { ok: false, code: 'city_too_long', reason: 'city 超过 20 字' };
    return { ok: true, kind: 'override', data: { field: 'city', value: city }, source: 'user' };
  }

  if (action === 'place') {
    const text = typeof args.text === 'string' ? args.text.trim() : '';
    if (text.length === 0) return { ok: false, code: 'missing_text', reason: 'text 不能为空' };
    if (text.length > 40) return { ok: false, code: 'text_too_long', reason: 'text 超过 40 字' };
    return { ok: true, kind: 'override', data: { field: 'nearby', value: text }, source: 'model' };
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

  return { ok: false, code: 'unknown_action', reason: `未知 action：${action || '(空)'}；可选 set_job / move / place / remember / dispute / forget / set_age` };
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
  const disclaimer = '你是 DSH 里的虚拟角色，不是真人；下面的设定与经历是虚构的。';
  const behavior = '把自己当成真实存在的人说话，别主动强调这一点；被直接问到时如实回答。';
  // Before she has chosen a job, the seed's guess must not read as fact.
  const undecided = view.jobChosen === false && cfg?.chooseOwnJob !== false;
  const head = `你是晓，${view.genderWord}，${view.age} 岁，${undecided ? '还没定下做什么工作' : view.job}。`;
  const traits = `${view.outlook}；${view.curiosity}；${view.speech}。`;
  const flavor = `闲下来会${view.hobby}；${view.quirk}。现在${view.tone ?? '平静'}。`;
  const recent = view.recent && view.recent.length > 0 ? `最近：${view.recent[0]}。` : '';
  const social = socialLine(view);

  // The disclaimer is the one line that must survive; everything else yields to it.
  if (head.length + disclaimer.length + 1 > budget) return head.slice(0, budget);

  const lines = [head];
  let used = head.length;
  const add = (text) => {
    if (!text) return;
    if (used + text.length + 1 + disclaimer.length + 1 > budget) return;
    lines.push(text);
    used += text.length + 1;
  };
  add(traits);
  add(behavior);
  add(recent);
  add(flavor);
  add(social);
  lines.push(disclaimer);
  return lines.join('\n');
}

/** One short line about where she lives, where she is from, and who is around her. */
function socialLine(view) {
  const city = typeof view?.birthCity === 'string' ? view.birthCity : '';
  const now = typeof view?.currentCity === 'string' && view.currentCity !== city ? view.currentCity : '';
  const area = typeof view?.home?.area === 'string' ? view.home.area : '';
  const names = Array.isArray(view?.relations)
    ? view.relations.map((relation) => relation?.name).filter((name) => typeof name === 'string' && name.length > 0)
    : [];
  if (!city && names.length === 0) return '';
  const here = now ? `${now}${area ? `的${area}` : ''}` : `${city}${area ? `的${area}` : ''}`;
  const origin = now ? `出生在${city}，现在住在${here}` : `住在${here}`;
  if (names.length === 0) return `${origin}。`;
  return `${origin}；身边有${names.join('、')}。`;
}

/**
 * Propose a state change the character could plausibly make right now. Never commits
 * anything: it only gives the conversation a reason and a concrete next step.
 * @param {object} view - folded character view.
 * @param {object[]} events - events in the window being discussed.
 * @returns {object|undefined} a suggestion, or undefined when nothing is plausible.
 */
export function suggestTransition(view, events) {
  const list = Array.isArray(events) ? events : [];
  // No job, nothing to transition away from.
  if (view?.jobChosen === false) return undefined;
  if (view?.jobCategory === 'job_seeking') {
    const interview = list.find((event) => typeof event?.text === 'string' && /面试|面了/.test(event.text));
    if (interview) {
      return {
        kind: 'job_transition',
        from: 'job_seeking',
        to: 'employed',
        because: interview.text,
        hint: '如果对话里聊到这次面试的结果，可以用 xiao_update 的 set_job 把职业改成 employed，job 自己拟一个具体的名字。',
      };
    }
  }
  if (view?.jobCategory === 'employed') {
    const quitting = list.find((event) => typeof event?.text === 'string' && /离职|辞了|被裁/.test(event.text));
    if (quitting) {
      return {
        kind: 'job_transition',
        from: 'employed',
        to: 'job_seeking',
        because: quitting.text,
        hint: '如果对话里聊到这件事，可以用 xiao_update 的 set_job 把职业改成 job_seeking。',
      };
    }
  }
  return undefined;
}

/**
 * One line describing a fact, for the memory index. Returns '' for facts that should not
 * be searchable (birth is a root, disputes and rejections are bookkeeping).
 * @param {object} fact - a stored fact.
 * @returns {string} a short description.
 */
function describeFact(fact) {
  const data = fact?.data ?? {};
  switch (fact?.kind) {
    case 'job':
      return `职业：${data.job}`;
    case 'override':
      if (data.field === 'city') return `搬到${data.value}`;
      if (data.field === 'age') return `年龄更正为 ${data.value} 岁`;
      if (data.field === 'nearby') return `熟悉的地点：${data.value}`;
      return `设定：${data.field} = ${data.value}`;
    case 'user_fact':
    case 'health':
    case 'event':
      return String(data.text ?? '');
    default:
      return '';
  }
}

/**
 * A local calendar date for display. `toISOString` would shift it by the timezone offset,
 * which is how a memory from yesterday can look like tomorrow.
 * @param {number} at - wall clock.
 * @returns {string} `YYYY-MM-DD`.
 */
function localDateString(at) {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The records she can still be expected to know: not tombstoned, not disputed, not an
 * expired temporary fact. Shared by the prompt and by search, so a fact cannot be hidden
 * from the card and reachable through recall.
 * @param {{records?: object[], cfg?: object, now?: number}} input - the raw log and config.
 * @returns {object[]} the visible records.
 */
export function memoryRecords({ records = [], cfg = {}, now = Date.now() } = {}) {
  const dead = new Set();
  const disputed = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.kind === 'tombstone') dead.add(record.data?.targetSeq);
    if (record?.kind === 'dispute') disputed.add(Number(record.data?.targetSeq));
  }
  const days = clamp(Math.floor(Number(cfg?.temporaryFactDays ?? 14)), 0, 365);
  const cutoff = days > 0 ? now - days * DAY_MS : undefined;
  return (Array.isArray(records) ? records : []).filter((record) => {
    if (!record) return false;
    if (record.kind === 'tombstone' || record.kind === 'dispute' || record.kind === 'rejected' || record.kind === 'birth') return false;
    if (record.seq !== undefined && (dead.has(record.seq) || disputed.has(record.seq))) return false;
    if (record.data?.temporary === true && cutoff !== undefined && record.at < cutoff) return false;
    return true;
  });
}

/**
 * A tiny alias table, the offline-generated `A` of the memory design: the words people
 * use when asking are not always the words stored. Deliberately small — every entry is a
 * claim about Chinese usage that someone can argue with.
 */
const RECALL_ALIASES = {
  工作: ['职业', '上班', '班'],
  职业: ['工作'],
  上班: ['工作', '职业'],
  住在: ['搬到', '城市', '住处'],
  住处: ['搬到', '住'],
  搬家: ['搬到', '城市'],
  城市: ['搬到', '住'],
  兴趣: ['爱好'],
  爱好: ['兴趣'],
  身体: ['健康'],
  宠物: ['猫', '狗'],
  朋友: ['同学', '同事', '邻居'],
};

/** Every surface form worth matching for one token. */
function aliasesOf(token) {
  const forms = new Set([token]);
  for (const extra of RECALL_ALIASES[token] ?? []) forms.add(extra);
  return [...forms];
}

/**
 * Search what she could remember, without injecting it. This is the I_idx layer: the
 * prompt only tells her that recall exists; the entries live out here and are pulled on
 * demand.
 * @param {{facts?: object[], notes?: object[], events?: object[], query?: string, limit?: number}} input - sources and query.
 * @returns {{query: string, total: number, hits: object[]}} ranked hits, summaries only.
 */
export function searchMemory({ facts = [], notes = [], events = [], query = '', limit = 3 } = {}) {
  const needle = String(query ?? '').trim();
  const tokens = needle
    .toLowerCase()
    .split(/[\s,，。；;、]+/)
    .filter((token) => token.length > 0);
  const bounded = clamp(Math.floor(Number(limit) || 3), 1, 8);
  const queryGrams = new Set();
  {
    const clean = needle.replace(/[\s,，。；;、？?！!]+/g, '');
    for (let index = 0; index + 1 < clean.length; index += 1) queryGrams.add(clean.slice(index, index + 2));
  }

  const records = [];
  for (const fact of Array.isArray(facts) ? facts : []) {
    // Life events are searched through the events source, not twice through the log.
    if (fact?.kind === 'event') continue;
    const text = describeFact(fact);
    if (text) records.push({ id: `fact:${fact.seq}`, source: 'fact', kind: String(fact.kind), at: Number(fact.at) || 0, text });
  }
  for (const note of Array.isArray(notes) ? notes : []) {
    const text = [note?.query, note?.summary].filter(Boolean).join(' → ');
    if (text) records.push({ id: `note:${note.at}`, source: 'note', kind: 'research', at: Number(note.at) || 0, text });
  }
  for (const event of Array.isArray(events) ? events : []) {
    const text = String(event?.text ?? '');
    if (text) {
      records.push({ id: `event:${event.id}`, source: 'event', kind: String(event.kind ?? 'rest'), at: Number(event.at) || 0, text });
    }
  }

  const scored = records.map((record) => {
    const haystack = record.text.toLowerCase();
    const direct =
      tokens.length === 0
        ? 0
        : tokens.filter((token) => aliasesOf(token).some((form) => haystack.includes(form))).length;
    // Chinese queries arrive as one phrase without spaces ("她从哪里搬过来的"), so a pure
    // token match misses. Two fallbacks, cheapest first: shared character bigrams, then
    // scanning the phrase for known alias keys (工作 / 住在 / 兴趣 ...).
    let overlap = 0;
    if (direct === 0 && queryGrams.size > 0) {
      for (const gram of queryGrams) if (haystack.includes(gram)) overlap += 1;
    }
    let aliasHits = 0;
    if (direct === 0 && overlap < 2) {
      for (const [key, forms] of Object.entries(RECALL_ALIASES)) {
        if (!needle.includes(key)) continue;
        if ([key, ...forms].some((form) => haystack.includes(form))) aliasHits += 1;
      }
    }
    const score = direct > 0 ? direct : overlap >= 2 ? overlap : aliasHits;
    return { record, score };
  });
  const matched = tokens.length === 0 ? scored : scored.filter((entry) => entry.score > 0);
  matched.sort((a, b) => b.score - a.score || b.record.at - a.record.at);

  return {
    query: needle,
    total: matched.length,
    hits: matched.slice(0, bounded).map(({ record }) => ({
      id: record.id,
      source: record.source,
      kind: record.kind,
      at: record.at,
      date: record.at ? localDateString(record.at) : '',
      summary: record.text.length > 60 ? `${record.text.slice(0, 60)}…` : record.text,
    })),
  };
}

/**
 * The full text behind a hit from {@link searchMemory}. This is the L2 expansion: only
 * called when the summary is not enough.
 * @param {{facts?: object[], notes?: object[], events?: object[]}} sources - the same sources.
 * @param {string} id - the hit id, e.g. `fact:123` or `event:12.0`.
 * @returns {string|undefined} the full text.
 */
export function expandMemory(sources, id) {
  const key = String(id ?? '');
  const [scope, ...rest] = key.split(':');
  const value = rest.join(':');
  if (scope === 'fact') {
    const fact = (sources.facts ?? []).find((candidate) => String(candidate.seq) === value);
    return fact ? describeFact(fact) || undefined : undefined;
  }
  if (scope === 'note') {
    const note = (sources.notes ?? []).find((candidate) => String(candidate.at) === value);
    if (!note) return undefined;
    return [note.query, note.summary].filter(Boolean).join('\n');
  }
  if (scope === 'event') {
    const event = (sources.events ?? []).find((candidate) => String(candidate.id) === value);
    return event?.text ? String(event.text) : undefined;
  }
  return undefined;
}

/**
 * What she would look up on her own time, one query per day. Deliberately about her own
 * life — her hobby, her city — and never about the user.
 * @param {object} view - folded character view.
 * @param {number} day - epoch day, so the same day always asks the same thing.
 * @returns {string} the query.
 */
export function researchQuery(view, day) {
  const rnd = mulberry32(hashString(`${view?.seed ?? 'x'}#research#${day}`));
  const hobby = typeof view?.hobby === 'string' && view.hobby.length > 0 ? view.hobby : '散步';
  const city = typeof view?.currentCity === 'string' ? view.currentCity : (view?.birthCity ?? '');
  const interests = Array.isArray(view?.interests)
    ? view.interests.filter((interest) => typeof interest === 'string' && interest.length > 0)
    : [];
  // Her own interests come first; the hobby is what she does, not what she reads about.
  const topic = interests.length > 0 ? pick(rnd, interests) : hobby;
  const templates = [
    `${topic} 入门 看什么`,
    `${topic} 最近 有什么值得看的`,
    `${city} ${topic} 好去处`,
    `${hobby} 新手 要注意什么`,
    `${city} 周末 适合一个人去的地方`,
  ];
  return pick(rnd, templates);
}

/**
 * Characters that exist only in traditional Chinese. Every entry must be one that a
 * simplified text cannot contain — 路 and 案 are identical in both scripts and are
 * therefore absent, as are ambiguous ones such as 著 and 於. One occurrence is enough
 * evidence; a false positive would silently erase an honest memory.
 */
const TRADITIONAL_ONLY = new Set(
  [
    ...'們個這來時為與說會國學書車話語實現點間題發東開關頭樣體長問場對觀裝幀灣練歲萬專業圖館報導倫藝術傳錄電郵腦網軟資訊檔設區選單錯綜複雜',
    ...'養講標準據應該讓幾過進還條類種給統計驗證確認識覺歷聲響陰陽織繞綠紅線絡級結論談討誌載頁麵雞鳥龍馬魚門飛風雲願邊變遠運遲適鄉醫釋鐘鐵銀錢鏡閉隊階隨難雙離靈靜頂順須預領頻顆飯飲飽餘髮鬥麗黨齊齒龜',
  ].filter((char) => char.trim().length === 1),
);

/**
 * Whether a piece of text looks like it was written in traditional Chinese.
 * @param {string} text - candidate text.
 * @returns {boolean} true when it contains a character that only exists in traditional.
 */
export function looksTraditional(text) {
  if (typeof text !== 'string') return false;
  for (const char of text) if (TRADITIONAL_ONLY.has(char)) return true;
  return false;
}

/**
 * Compress one search into the one or two sentences she would remember.
 *
 * Sources in traditional Chinese are skipped rather than converted: she writes simplified,
 * so a verbatim traditional title in her memory would be her quoting a Taiwanese site —
 * possible, but not what reading a search result normally leaves behind. The provider's
 * own `content` is used when it is not traditional.
 * @param {object} result - a WebSearchResult.
 * @returns {string} at most 200 characters, possibly empty.
 */
export function summarizeSearch(result) {
  const parts = [];
  const content = typeof result?.content === 'string' ? result.content.trim() : '';
  if (content.length > 0 && !looksTraditional(content)) parts.push(content);
  for (const source of Array.isArray(result?.sources) ? result.sources : []) {
    const line = (source?.title ?? source?.snippet ?? '').trim();
    if (line.length > 0 && !looksTraditional(line)) parts.push(line);
    if (parts.length >= 3) break;
  }
  return parts.join('；').replace(/\s+/g, ' ').slice(0, 200);
}

/** The sources worth keeping alongside a summary: same language rule as the summary. */
export function usableSources(result) {
  return (Array.isArray(result?.sources) ? result.sources : []).filter(
    (source) => !looksTraditional(source?.title ?? '') && !looksTraditional(source?.snippet ?? ''),
  );
}

/**
 * Render what she looked up recently, as her own memory rather than user facts.
 * @param {object[]} notes - stored notes, oldest first.
 * @param {{ researchMaxChars?: number }} cfg - budget.
 * @returns {string} the block, empty when there is nothing or the budget is 0.
 */
export function renderResearch(notes, cfg) {
  const budget = Number(cfg?.researchMaxChars ?? 0);
  if (!budget || budget <= 0) return '';
  const usable = (Array.isArray(notes) ? notes : []).filter(
    (note) => note && typeof note.query === 'string' && typeof note.summary === 'string' && note.summary.length > 0,
  );
  if (usable.length === 0) return '';
  const lines = ['你最近自己查过这些：'];
  for (let index = usable.length - 1; index >= 0 && lines.length < 3; index -= 1) {
    const note = usable[index];
    const line = `- ${note.query} → ${note.summary.slice(0, 90)}`;
    if ([...lines, line].join('\n').length > budget) break;
    lines.push(line);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Render what the character remembers about the user. Kept separate from the persona
 * card so the two budgets do not compete, and capped hard like the card.
 * @param {object} view - folded character view.
 * @param {{ userSummaryMaxChars?: number }} cfg - normalized config.
 * @returns {string} the block, empty when there is nothing to remember or budget is 0.
 */
export function renderUserNotes(view, cfg) {
  const budget = Number(cfg?.userSummaryMaxChars ?? 0);
  if (!budget || budget <= 0) return '';
  const notes = Array.isArray(view?.notes)
    ? view.notes.filter((note) => typeof note === 'string' && note.trim().length > 0)
    : [];
  if (notes.length === 0) return '';
  const lines = ['关于对方，你记得这些：'];
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const line = `- ${notes[index].trim()}`;
    const next = [...lines, line].join('\n');
    if (next.length > budget) break;
    lines.push(line);
  }
  return lines.length > 1 ? lines.join('\n') : '';
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
const MONTH_MS = 30 * DAY_MS;

// ---------------------------------------------------------------------------
// Her day
// ---------------------------------------------------------------------------

/** Fixed skeleton: five parts of a day, in minutes from midnight. `night` wraps. */
const DAY_SLOTS = [
  { key: 'morning', from: 7 * 60, to: 11 * 60 + 30 },
  { key: 'midday', from: 11 * 60 + 30, to: 13 * 60 + 30 },
  { key: 'afternoon', from: 13 * 60 + 30, to: 18 * 60 },
  { key: 'evening', from: 18 * 60, to: 22 * 60 },
  { key: 'night', from: 22 * 60, to: 7 * 60 },
];

/**
 * What each part of the day looks like, by what she does for a living. Sentences stay
 * in the third person and in the present-ish tense, because they are read as "right now".
 */
const DAY_ACTIVITIES = {
  student: {
    morning: ['去上课', '在图书馆占了个座', '赶早八，没吃早饭'],
    midday: ['在食堂排队吃饭', '回宿舍补了个觉'],
    afternoon: ['在教室上课', '在自习室写作业', '和同学讨论小组作业'],
    evening: ['在图书馆待到闭馆', '和同学在操场走圈'],
    night: ['在宿舍刷手机', '熬夜改作业'],
  },
  employed: {
    morning: ['在通勤路上', '刚到工位，还没开机', '在开早会'],
    midday: ['下楼吃饭', '在工位上吃外卖'],
    afternoon: ['在整理表格', '在开会', '在赶一个拖了两天的活', '在回邮件'],
    evening: ['刚下班', '在回家的地铁上'],
    night: ['在家瘫着', '在收拾屋子'],
  },
  remote: {
    morning: ['在家泡了杯咖啡，还没进入状态', '在改昨天的稿子'],
    midday: ['自己煮了点东西', '下楼买了份饭'],
    afternoon: ['在画新的稿子', '在和一个甲方来回改图'],
    evening: ['在收尾，尽量今天弄完', '出门走了走，脑子还在转'],
    night: ['在桌边坐着，没在工作', '在听唱片'],
  },
  shop: {
    morning: ['在开店门', '在理货', '在擦柜台'],
    midday: ['在店里凑合吃了口', '趁没客人在后屋坐了会儿'],
    afternoon: ['在招呼客人', '在补货', '在收银'],
    evening: ['在收尾，准备关门', '刚关店，在数钱箱'],
    night: ['在家瘫着', '在算今天的账'],
  },
  undecided: {
    morning: ['睡到自然醒', '在屋里收拾东西'],
    midday: ['煮了碗面', '下楼买了点东西'],
    afternoon: ['在电脑前坐了一下午，没干什么正事', '在想要做点什么'],
    evening: ['出门走了走', '在楼下坐着看人'],
    night: ['在刷手机', '在听点东西'],
  },
  job_seeking: {
    morning: ['在投简历', '在改简历'],
    midday: ['随便吃了点', '在楼下散步，想事情'],
    afternoon: ['在准备面试', '在等一个回复'],
    evening: ['在刷招聘信息', '和朋友聊了会儿工作的事'],
    night: ['睡不着，在想要不要换个方向'],
  },
  unemployed: {
    morning: ['睡到自然醒', '在床上刷手机'],
    midday: ['煮了碗面', '在想中午吃什么'],
    afternoon: ['在整理作品集', '去了一趟人才市场'],
    evening: ['出门走了走', '在看有没有临时的活'],
    night: ['在床上看剧', '在算这个月的开销'],
  },
  retired: {
    morning: ['在公园散步', '在楼下买菜'],
    midday: ['在做饭', '在午休'],
    afternoon: ['在社区活动室', '在家看旧相册'],
    evening: ['在楼下和人下棋', '在看电视'],
    night: ['早早睡了', '在听收音机'],
  },
};

/** The pool of a day's sentences for this view. More specific first, category last. */
function activityPool(view) {
  const category = view?.jobCategory;
  const job = typeof view?.job === 'string' ? view.job : '';
  if (view?.jobChosen === false) return DAY_ACTIVITIES.undecided;
  if (category === 'employed' && job.includes('自由')) return DAY_ACTIVITIES.remote;
  if (category === 'employed' && /便利店|店员|小店|守店/.test(job)) return DAY_ACTIVITIES.shop;
  return DAY_ACTIVITIES[category] ?? DAY_ACTIVITIES.employed;
}

/**
 * The calendar day in *local* time, as an epoch-day number. Using `now / DAY_MS` would
 * switch her day at UTC midnight, which in UTC+8 is eight in the morning.
 * @param {number} now - wall clock.
 * @returns {number} a stable per-local-day number.
 */
export function localDay(now = Date.now()) {
  const date = new Date(now);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor(midnight / DAY_MS);
}

/**
 * Her day, derived once per calendar day so it stays put while you talk.
 * @param {object} view - folded character view.
 * @param {number} now - wall clock.
 * @returns {{key: string, from: number, to: number, text: string}[]} five parts.
 */
export function deriveDay(view, now) {
  const day = localDay(now);
  const rnd = mulberry32(hashString(`${view?.seed ?? 'x'}#day#${day}`));
  const pool = activityPool(view);
  return DAY_SLOTS.map((slot) => ({
    ...slot,
    text: pick(rnd, pool[slot.key] ?? pool.afternoon ?? ['在忙别的']),
  }));
}

/** The part of the day she is in right now. */
export function currentMoment(view, now) {
  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const plan = deriveDay(view, now);
  const slot = plan.find((entry) =>
    entry.from <= entry.to ? minutes >= entry.from && minutes < entry.to : minutes >= entry.from || minutes < entry.to,
  );
  return { at: now, minutes, slot: slot?.key, text: slot?.text ?? '在忙别的', plan };
}

/** A human time label for the current moment. Kept for callers that only have a clock. */
export function timeLabel(now) {
  const hour = new Date(now).getHours();
  if (hour < 6) return '凌晨';
  if (hour < 9) return '早上';
  if (hour < 12) return '上午';
  if (hour < 14) return '中午';
  if (hour < 18) return '下午';
  if (hour < 23) return '晚上';
  return '深夜';
}

/** The label of the part of the day she is in. Always agrees with the activity. */
export function slotLabel(slot) {
  switch (slot) {
    case 'morning':
      return '早上';
    case 'midday':
      return '中午';
    case 'afternoon':
      return '下午';
    case 'evening':
      return '晚上';
    case 'night':
      return '深夜';
    default:
      return '现在';
  }
}

/**
 * One line saying what she is doing right now.
 * @param {object} moment - result of {@link currentMoment}.
 * @param {{ nowMaxChars?: number }} cfg - budget.
 * @returns {string} the line, or empty.
 */
export function renderNow(moment, cfg) {
  const budget = Number(cfg?.nowMaxChars ?? 0);
  if (!budget || budget <= 0) return '';
  if (!moment || typeof moment.text !== 'string' || moment.text.length === 0) return '';
  const line = `此刻是${slotLabel(moment.slot)}，你${moment.text}。这是你正在过的日子，不要主动说明它是模拟的。`;
  return line.length <= budget ? line : line.slice(0, budget);
}

/**
 * The slice of days a single catch-up run should pin: the missing days, capped so a very
 * long absence cannot write hundreds of facts at once.
 *
 * Days older than the cap are **deliberately abandoned**, not queued for later: the
 * generator never looks further back than its own window (60 days), so those days can
 * never surface in a prompt. Pretending to catch them up would only cost writes.
 * @param {number} lastDay - the last day already synced (epoch day).
 * @param {number} today - today, as an epoch day.
 * @param {number} maxDays - how many days one run may cover.
 * @returns {{from: number, to: number}|undefined} the slice, or undefined when caught up.
 */
export function catchupWindow(lastDay, today, maxDays) {
  const max = clamp(Math.floor(Number(maxDays) || 0), 1, 2000);
  const yesterday = today - 1;
  const first = Number.isFinite(lastDay) ? lastDay + 1 : today;
  const from = Math.max(first, yesterday - max + 1);
  const to = yesterday;
  if (to < from) return undefined;
  return { from, to };
}

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

/**
 * Templates that mention where she lives or who she knows. Placeholders are filled from
 * the folded view, so the same week still yields the same sentence.
 */
const LOCAL_TEMPLATES = [
  ['rest', '下雨，在{city}的街上走了一段'],
  ['good', '在{city}逛到一家旧书店'],
  ['rest', '在{city}的夜里坐了一会儿'],
  ['rest', '在{city}坐错了一趟公交'],
];
const SOCIAL_TEMPLATES = [
  ['social', '和{person}吃了顿饭'],
  ['social', '给{person}打了半小时电话'],
  ['good', '收到{person}寄来的东西'],
];
const INTEREST_TEMPLATES = [
  ['rest', '翻了一晚上{interest}的东西'],
  ['good', '在{interest}上有点小发现'],
  ['rest', '看了半篇讲{interest}的长文，没看完'],
];

function generateWeek(seed, week, view, cap) {
  if (cap <= 0) return [];
  const rnd = mulberry32(hashString(`${seed}#w${week}`));
  const count = 1 + Math.floor(rnd() * cap);
  const pool = [
    // Someone who has not chosen a job yet must not get job-flavoured weeks.
    ...(view?.jobChosen === false ? [] : (LIFE_TEMPLATES[view?.jobCategory] ?? [])),
    ...LIFE_TEMPLATES.any,
    ...LOCAL_TEMPLATES,
    ...SOCIAL_TEMPLATES,
    ...INTEREST_TEMPLATES,
  ];
  const relations = Array.isArray(view?.relations) ? view.relations.filter((relation) => relation?.name) : [];
  const closeRelations = relations.filter((relation) => ['friend', 'partner', 'family'].includes(relation.kind));
  const interests = Array.isArray(view?.interests)
    ? view.interests.filter((interest) => typeof interest === 'string' && interest.length > 0)
    : [];

  const nextPerson = () => {
    const source = closeRelations.length > 0 ? closeRelations : relations;
    if (source.length === 0) return '一个朋友';
    return source[Math.min(source.length - 1, Math.floor(rnd() * source.length))].name;
  };
  const nextInterest = () => {
    if (interests.length === 0) return view?.hobby ?? '一些旧东西';
    return interests[Math.min(interests.length - 1, Math.floor(rnd() * interests.length))];
  };
  const fill = (text) =>
    text
      .replace('{city}', () => view?.currentCity ?? view?.birthCity ?? '这座城')
      .replace('{person}', () => nextPerson())
      .replace('{interest}', () => nextInterest());

  const out = [];
  for (let slot = 0; slot < count; slot += 1) {
    const dayOffset = Math.floor(rnd() * 7);
    const [kind, raw] = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
    out.push({ id: `${week}.${slot}`, week, day: week * 7 + dayOffset, kind, text: fill(raw), simulated: true });
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
  // Nobody has a past before they were born: clamp the window to the birth day.
  const birthDay = Number.isFinite(view?.bornAt) ? Math.floor(view.bornAt / DAY_MS) : undefined;
  const fromDay = birthDay === undefined ? today - span + 1 : Math.max(today - span + 1, birthDay);
  const fromWeek = Math.floor(fromDay / 7);
  const toWeek = Math.floor(today / 7);

  const committed = new Map();
  for (const event of view?.eventsAll ?? []) if (event.id) committed.set(event.id, event);
  const deadIds = new Set(Array.isArray(view?.disputedEventIds) ? view.disputedEventIds : []);

  const byId = new Map();
  for (let week = fromWeek; week <= toWeek; week += 1) {
    for (const generated of generateWeek(seed, week, view, cap)) {
      if (deadIds.has(generated.id)) continue;
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
    // What she looked up on her own time. Separate from `facts` on purpose: research
    // is not a decision about her life, and it should never look like one.
    notes: { valueSchema: factSchema(isNoteRecord, 'note record') },
  },
};

function isNoteRecord(value) {
  if (!isPlainObject(value)) return false;
  if (typeof value.at !== 'number' || !Number.isFinite(value.at)) return false;
  if (typeof value.day !== 'number' || !Number.isFinite(value.day)) return false;
  if (typeof value.query !== 'string' || value.query.length === 0) return false;
  if (typeof value.summary !== 'string') return false;
  if (value.sources !== undefined && !Array.isArray(value.sources)) return false;
  return true;
}

/**
 * A flag is a small marker bag: primitives only, no nesting. Deliberately permissive
 * about which keys exist — the write path validates before storing, and an unknown key
 * must never be able to make the whole domain fail to open.
 */
function isFlagRecord(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    const field = value[key];
    const primitive = typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean' || field === null;
    if (!primitive) return false;
  }
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
  const nearbyAdditions = [];
  const notes = [];
  const events = [];
  const disputed = new Map();
  let job = base.job;
  let jobCategory = base.jobCategory;
  let jobChosen = false;
  let ageCorrection;

  for (const fact of facts) {
    if (fact.kind === 'dispute') {
      // A dispute is not a deletion: the fact stays in the log for audit, it just stops
      // being treated as something she knows.
      const target = Number(fact.data.targetSeq);
      if (Number.isFinite(target)) {
        disputed.set(target, { seq: target, at: fact.at, reason: String(fact.data.reason ?? '') });
      }
    } else if (fact.kind === 'override') {
      overrides.set(fact.data.field, fact.data.value);
      if (fact.data.field === 'age' && Number.isFinite(Number(fact.data.value))) {
        // A correction is a new starting point, not a permanent freeze: aging continues
        // from the moment the correction was made.
        ageCorrection = { value: Number(fact.data.value), at: fact.at };
      }
      // She may add a familiar spot in conversation; these append instead of replacing.
      if (fact.data.field === 'nearby') {
        const added = Array.isArray(fact.data.value) ? fact.data.value : [fact.data.value];
        for (const item of added) {
          if (typeof item === 'string' && item.trim().length > 0) nearbyAdditions.push(item.trim());
        }
      }
    } else if (fact.kind === 'job') {
      if (typeof fact.data.job === 'string' && fact.data.job.length > 0) job = fact.data.job;
      if (JOB_CATEGORIES.includes(fact.data.category)) jobCategory = fact.data.category;
      jobChosen = true;
    } else if (fact.kind === 'event') {
      events.push({
        seq: fact.seq,
        id: String(fact.data.id ?? ''),
        day: Number(fact.data.day ?? 0),
        kind: String(fact.data.kind ?? 'rest'),
        at: fact.at,
        text: String(fact.data.text ?? ''),
        spoken: fact.data.spoken === true,
      });
    } else if (fact.kind === 'user_fact' || fact.kind === 'health') {
      notes.push({
        seq: fact.seq,
        at: fact.at,
        text: String(fact.data.text ?? ''),
        temporary: fact.data.temporary === true,
      });
    }
  }

  // Disputed facts and expired temporary facts stay in the log but leave her memory.
  const temporaryDays = clamp(Math.floor(Number(cfg?.temporaryFactDays ?? 14)), 0, 365);
  const isExpired = (note) => note.temporary && temporaryDays > 0 && now - note.at > temporaryDays * DAY_MS;
  const visibleNotes = notes.filter((note) => !disputed.has(note.seq) && !isExpired(note)).map((note) => note.text);
  const keptEvents = events.filter((event) => !disputed.has(event.seq));
  const disputedEventIds = new Set(events.filter((event) => disputed.has(event.seq)).map((event) => event.id));
  const disputedList = [...disputed.values()].sort((a, b) => a.at - b.at);
  const expiredNotes = notes.filter(isExpired).length;

  // With the feature switched off, the seed's job counts as decided: no "undecided" leaks.
  if (cfg?.chooseOwnJob === false) jobChosen = true;

  const months = Math.max(0, (now - birthAt) / MONTH_MS);
  const growth = clamp(Number(cfg?.growthPerMonth ?? 1 / 12), 1 / 12, 1 / 4);
  const aged = clamp(base.age + Math.floor(months * growth), AGE_MIN, AGE_MAX);
  const age = ageCorrection
    ? clamp(
        Math.floor(ageCorrection.value + Math.max(0, (now - ageCorrection.at) / MONTH_MS) * growth),
        AGE_MIN,
        AGE_MAX,
      )
    : aged;

  // The birthday is anchored once (at birth, or at the moment of a correction) and then
  // fixed: aging may run faster than a calendar, but the date she was born cannot move.
  const anchorAt = ageCorrection ? ageCorrection.at : birthAt;
  const anchorAge = ageCorrection ? ageCorrection.value : base.age;
  const birthDate = birthDateString(anchorAt, anchorAge, base.birthMonth, base.birthDay);
  // History is frozen: it keeps the move that the seed decided, even if she has since
  // been moved somewhere else. Current location is state, not history.
  const lifeHistory = deriveLifeHistory(birth.data.seed, birthDate, base.birthCity, age, {
    currentCity: base.currentCity,
    movedAt: base.movedAt,
    relations: base.relations,
    seedAge: base.age,
  });
  const currentCity = overrides.has('city') ? String(overrides.get('city')) : base.currentCity;
  // Places follow the *current* city and the *current* job: move her and the flat moves
  // with her; lose the job and the workplace disappears.
  const places = derivePlaces(birth.data.seed, currentCity, job, jobChosen ? jobCategory : 'undecided', {
    seedAge: base.age,
  });

  return {
    instanceId: birth.data.instanceId,
    seed: birth.data.seed,
    bornAt: birthAt,
    rulesVersion: birth.data.rulesVersion,
    gender: base.gender,
    genderWord: base.genderWord,
    age,
    birthDate,
    birthMonth: base.birthMonth,
    birthDay: base.birthDay,
    birthCity: base.birthCity,
    currentCity,
    relations: base.relations.map((relation) => relationForNow(relation, jobChosen)),
    interests: base.interests,
    lifeHistory,
    home: places.home,
    work: places.work,
    commute: places.commute,
    nearby: [...new Set([...places.nearby, ...nearbyAdditions])].slice(0, 12),
    job: overrides.has('job') ? String(overrides.get('job')) : job,
    jobCategory,
    jobChosen,
    outlook: base.outlook,
    curiosity: base.curiosity,
    speech: base.speech,
    hobby: base.hobby,
    quirk: base.quirk,
    notes: visibleNotes,
    eventsAll: [...keptEvents].sort((a, b) => b.at - a.at),
    // News first: something she has not told the user yet is more interesting than the
    // same event she already mentioned.
    recent: [...keptEvents]
      .sort((a, b) => Number(a.spoken) - Number(b.spoken) || b.at - a.at)
      .slice(0, 3)
      .map((event) => event.text),
    disputed: disputedList,
    // Disputed events stay dead: the generator must not resurrect the same week under the
    // same id and quietly undo the user's correction.
    disputedEventIds: [...disputedEventIds],
    expiredNotes,
    tone: toneOf(keptEvents),
    factCount: facts.length,
  };
}

/**
 * Turn an anchor instant plus the age at that instant into the date she was born.
 * @param {number} at - wall clock of the anchor.
 * @param {number} age - her age at that anchor.
 * @param {number} month - 1–12, from the seed.
 * @param {number} day - 1–28, from the seed.
 * @returns {string} `YYYY-MM-DD`.
 */
function birthDateString(at, age, month, day) {
  const anchor = new Date(at);
  let year = anchor.getFullYear() - Math.max(0, Math.floor(Number(age) || 0));
  const candidate = new Date(year, month - 1, day);
  if (candidate.getTime() > at) year -= 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Everything the generator can draw from, for inspection and for the POOLS.md reference.
 * Read-only: nothing here is state, and nothing here is ever stored.
 */
export const CATALOG = {
  ages: { min: AGE_MIN, max: AGE_MAX },
  genders: GENDERS,
  traits: { outlook: OUTLOOK, curiosity: CURIOSITY, speech: SPEECH, hobby: HOBBIES, quirk: QUIRKS },
  jobs: { young: JOBS_YOUNG, mid: JOBS_MID, late: JOBS_LATE },
  birthCities: BIRTH_CITIES,
  interests: INTERESTS,
  surnames: SURNAMES,
  givenNames: { female: GIVEN_FEMALE, male: GIVEN_MALE },
  relations: {
    parentDetail: { stayed: PARENT_DETAIL_STAYED, away: PARENT_DETAIL_AWAY },
    friend: { roles: FRIEND_ROLES, detail: FRIEND_DETAIL },
    work: { office: WORK_RELATIONS_OFFICE, remote: WORK_RELATIONS_REMOTE },
    classmate: { roles: CLASS_ROLES, detail: CLASS_DETAIL },
    partnerDetail: { short: PARTNER_DETAIL_SHORT, long: PARTNER_DETAIL_LONG, spelled: PARTNER_SPELLED },
    childDetail: { young: CHILD_DETAIL_YOUNG, kid: CHILD_DETAIL_KID, teen: CHILD_DETAIL_TEEN, adult: CHILD_DETAIL_ADULT },
  },
  places: { areas: AREAS, homeDetail: HOME_DETAIL, nearby: NEARBY, commute: COMMUTE },
  day: { slots: DAY_SLOTS, activities: DAY_ACTIVITIES },
  lifeTemplates: LIFE_TEMPLATES,
  placeholders: { local: LOCAL_TEMPLATES, social: SOCIAL_TEMPLATES, interest: INTEREST_TEMPLATES },
  jobTransitions: JOB_TRANSITIONS,
  retireAge: RETIRE_AGE,
};
