/**
 * dsh-xiao — a persistent persona kernel for DSH (Cordis plumbing only).
 *
 * One append-only fact log is the only writable state; the current character is a
 * pure fold of it (see `persona.js`). Nothing derivable from the seed is stored, so a
 * fact record only ever marks a deliberate deviation.
 *
 * v0.1: birth, persona card injection, read-only `xiao_state`.
 * v0.2: `xiao_update` under a state machine, a monotonic guard on immutable fields,
 *       logical deletion by tombstone, history reads.
 * v0.3: lazy simulated life (`xiao_life`), freeze-on-speak, derived tone.
 * v0.4: read-only settings page and `xiao_export`.
 * v1.1: the page feed moved onto the authenticated connection channel
 *       (`/api/xiao.state`), replacing the earlier bare web route. See ROADMAP.md.
 */

import {
  AGE_MAX,
  AGE_MIN,
  JOB_CATEGORIES,
  SPEC,
  RULES_VERSION,
  compareSeq,
  fold,
  generateLife,
  isPlainObject,
  planUpdate,
  catchupWindow,
  renderCard,
  renderNow,
  renderResearch,
  renderUserNotes,
  researchQuery,
  suggestTransition,
  summarizeSearch,
  usableSources,
  looksTraditional,
  currentMoment,
  localDay,
  slotLabel,
  timeLabel,
  searchMemory,
  expandMemory,
  memoryRecords,
} from './persona.js';

const DEFAULTS = {
  /** Persona card character budget. 0 disables injection (useful as a control group). */
  cardMaxChars: 220,
  /** Fixed seed for reproducibility tests; empty means "generate once and keep". */
  seed: '',
  /** Preset names allowed to see the persona card; empty means "every session". */
  enabledForPresets: [],
  /** Age growth in years per elapsed month; clamped to [1/12, 1/4]. */
  growthPerMonth: 1 / 12,
  /** Simulated life events per week, 0–2. 0 disables the lazy life entirely. */
  lifeEventsPerWeek: 1,
  /** Let the character introduce herself once, on the next new session after birth. */
  announceOnFirstMeeting: true,
  /** Character budget for the "what you remember about the user" block. 0 disables it. */
  userSummaryMaxChars: 200,
  /** How many things she may look up per day on her own time. 0 disables it. */
  researchPerDay: 2,
  /** Character budget for the "what you looked up" block. 0 disables it. */
  researchMaxChars: 200,
  /** Character budget for the "what you are doing right now" line. 0 disables it. */
  nowMaxChars: 120,
  /**
   * Let her pick her own job the first time she meets the user, instead of accepting the
   * seed's guess. Until she does, the card says she has not decided yet.
   */
  chooseOwnJob: true,
  /** How long a temporary user fact stays in her memory before it fades. 0 = never fade. */
  temporaryFactDays: 14,
  /** Character budget for one memory-recall answer. */
  recallMaxChars: 600,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Appended to the card exactly once, when the first user message of a fresh session arrives. */
const FIRST_MEETING_HINT =
  '这是你们的第一次见面：先用一两句话介绍自己是谁、现在在做什么，再回应对方；不要说"设定""提示词"这类话。';

/**
 * Until she has chosen a job, the first meeting is also the moment she decides what she
 * does for a living — one that fits her age, traits, city and interests. Kept short on
 * purpose: it is appended to the persona block on every turn until she picks, so its
 * length is a real per-turn cost (a first draft was twice this long).
 */
const JOB_CHOICE_HINT =
  '你的职业还没定：自己挑一个配得上你年龄、性格、住处和兴趣的工作，然后用 xiao_update（set_job，category 选 student / job_seeking / employed / unemployed / retired）记下来。';

function normalizeConfig(config) {
  const cfg = { ...DEFAULTS };
  if (isPlainObject(config)) {
    if (Number.isFinite(config.cardMaxChars)) cfg.cardMaxChars = Math.max(0, Math.floor(config.cardMaxChars));
    if (typeof config.seed === 'string') cfg.seed = config.seed;
    if (Array.isArray(config.enabledForPresets)) {
      cfg.enabledForPresets = config.enabledForPresets.filter((name) => typeof name === 'string');
    }
    if (Number.isFinite(config.growthPerMonth)) cfg.growthPerMonth = config.growthPerMonth;
    if (Number.isFinite(config.lifeEventsPerWeek)) cfg.lifeEventsPerWeek = config.lifeEventsPerWeek;
    if (typeof config.announceOnFirstMeeting === 'boolean') cfg.announceOnFirstMeeting = config.announceOnFirstMeeting;
    if (Number.isFinite(config.userSummaryMaxChars)) cfg.userSummaryMaxChars = Math.max(0, Math.floor(config.userSummaryMaxChars));
    if (Number.isFinite(config.researchPerDay)) cfg.researchPerDay = Math.max(0, Math.floor(config.researchPerDay));
    if (Number.isFinite(config.researchMaxChars)) cfg.researchMaxChars = Math.max(0, Math.floor(config.researchMaxChars));
    if (Number.isFinite(config.nowMaxChars)) cfg.nowMaxChars = Math.max(0, Math.floor(config.nowMaxChars));
    if (typeof config.chooseOwnJob === 'boolean') cfg.chooseOwnJob = config.chooseOwnJob;
    if (Number.isFinite(config.temporaryFactDays)) cfg.temporaryFactDays = Math.max(0, Math.floor(config.temporaryFactDays));
    if (Number.isFinite(config.recallMaxChars)) cfg.recallMaxChars = Math.max(0, Math.floor(config.recallMaxChars));
  }
  return cfg;
}

function newSeed() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function factKey(seq) {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${String(seq).padStart(16, '0')}-${suffix}`;
}

/**
 * Mount the persona kernel.
 * @param {object} ctx - Cordis plugin context.
 * @param {unknown} config - row config from the Loader patch.
 * @returns {void}
 */
export function apply(ctx, config) {
  const cfg = normalizeConfig(config);
  const state = { domain: undefined, view: null, ready: false, failure: undefined };
  /**
   * What each prompt block actually costs, so "budget" is a measured number rather than a
   * promise. Updated on every assembly; read by `xiao_state`.
   */
  const stats = { blocks: { persona: 0, user: 0, research: 0, now: 0 }, injections: 0, recalls: 0, researchCalls: 0 };
  const sessions = new Map();
  const pageHits = { total: 0, page: 0 };
  // 'missing' until the feed route registers, then 'ok'. Surfaced by `xiao_state` so a
  // missing route is diagnosable without the browser.
  let feedState = 'missing';
  // Sessions whose first user message has already been considered for the introduction,
  // and sessions waiting for their next prompt assembly to carry the one-shot hint.
  const firstMessageSeen = new Set();
  const introPending = new Set();
  let counter = 0;
  let lastSeq = 0;

  /**
   * A strictly increasing sequence number. The wall clock can jump backwards (NTP, a
   * timezone-less VM resuming from sleep); if it did, a later fact would sort before an
   * earlier one and the fold would replay history out of order. The counter keeps seq
   * monotonic no matter what the clock does.
   */
  const nextSeq = () => {
    counter = (counter + 1) % 1000;
    const candidate = Date.now() * 1000 + counter;
    lastSeq = candidate > lastSeq ? candidate : lastSeq + 1;
    return lastSeq;
  };

  const log = (level, message) => {
    const logger = ctx.logger;
    if (logger && typeof logger[level] === 'function') logger[level](`[dsh-xiao] ${message}`);
  };

  // A misspelled config key would otherwise be ignored in silence.
  for (const key of Object.keys(config ?? {})) {
    if (!(key in DEFAULTS)) log('warn', `unknown config key '${key}' ignored (known: ${Object.keys(DEFAULTS).join(', ')})`);
  }

  // Fail loud on a changed Host API instead of a cryptic TypeError at the first call.
  // `connection.fetch` is an object with `register`, not a method, so each entry carries
  // its own shape predicate.
  const capabilities = [
    ['storageDomain', (service) => typeof service.open === 'function'],
    ['systemPrompt', (service) => typeof service.context === 'function'],
    ['tools', (service) => typeof service.register === 'function' && typeof service.guard === 'function'],
    // Injected, not optional: `ctx.get` returns undefined for a service outside `inject`,
    // which silently disabled the page feed once. Keep it declared.
    ['connection', (service) => Boolean(service.fetch) && typeof service.fetch.register === 'function'],
  ];
  for (const [name, ok] of capabilities) {
    const service = ctx.get(name);
    if (!service) throw new Error(`service '${name}' is unavailable; dsh-xiao cannot run`);
    if (!ok(service)) throw new Error(`service '${name}' does not have the expected shape (Host API changed?); dsh-xiao cannot run`);
  }

  const refresh = () => {
    if (!state.domain) return null;
    state.view = fold(state.domain.table('facts').entries().map(([, record]) => record), cfg, Date.now());
    return state.view;
  };

  const writeFact = async (kind, data, source, evidence) => {
    if (!state.domain) throw new Error('xiao storage is not ready');
    const record = { seq: nextSeq(), at: Date.now(), kind, data, source, evidence };
    await state.domain.table('facts').put(factKey(record.seq), record);
    refresh();
    return record;
  };

  const ensureBirth = async () => {
    if (refresh()) return state.view;
    const seed = cfg.seed.trim().length > 0 ? cfg.seed.trim() : newSeed();
    const instanceId = newSeed();
    log('info', `birthing instance ${instanceId}`);
    await writeFact('birth', { instanceId, seed, birthAt: Date.now(), rulesVersion: RULES_VERSION }, 'seed', 'confirmed');
    return state.view;
  };

  /**
   * Erase this instance and let a new one be born. Irreversible: every fact, the version
   * history, the remembered user facts, the first-meeting marker and everything she looked
   * up on her own are deleted. Every table a new instance must not inherit belongs here.
   */
  const resetInstance = async () => {
    if (!state.domain) throw new Error('xiao storage is not ready');
    for (const table of ['facts', 'flags', 'notes']) {
      const handle = state.domain.table(table);
      for (const key of [...handle.keys()]) await handle.delete(key);
    }
    state.view = null;
    return ensureBirth();
  };

  /** Shared by the tool and the page's button: erase, re-birth, and forget per-session state. */
  const performReset = async () => {
    const view = await resetInstance();
    firstMessageSeen.clear();
    introPending.clear();
    return view;
  };

  /**
   * Let the past happen: materialize and pin every day between the birth (or the last
   * sync) and yesterday. Runs at activation and whenever a new session starts, so the
   * card's "recent" reflects a life that continued while nobody was looking. It never
   * speaks and never changes the job — it only pins days that are already over.
   */
  let lifeSyncTask;
  /**
   * How many days one catch-up run may pin. Like a ledger being brought up to date in
   * pages: a long absence is covered over several activations instead of never.
   */
  const CATCHUP_DAYS = 120;
  const syncLife = () => {
    if (lifeSyncTask) return lifeSyncTask;
    lifeSyncTask = (async () => {
      try {
        if (!state.ready || !state.domain || cfg.lifeEventsPerWeek <= 0) return;
        const view = refresh();
        if (!view) return;
        const today = Math.floor(Date.now() / DAY_MS);
        const birthDay = Number.isFinite(view.bornAt) ? Math.floor(view.bornAt / DAY_MS) : today;
        const flags = state.domain.table('flags');
        const marker = flags.get('lifeSynced');
        const last = marker && Number.isFinite(marker.day) ? marker.day : birthDay;
        const window = catchupWindow(last, today, CATCHUP_DAYS);
        if (!window) return;
        const { from, to } = window;
        const days = to - from + 1;
        const result = generateLife({ seed: view.seed, view, cfg, days, now: Date.now() });
        const known = new Set((view.eventsAll ?? []).map((event) => event.id));
        const pending = result.events.filter(
          (event) => event.day >= from && event.day <= to && !known.has(event.id),
        );
        for (const event of pending) {
          await writeFact('event', { id: event.id, day: event.day, kind: event.kind, text: event.text }, 'sim', 'confirmed');
        }
        await flags.put('lifeSynced', { day: to, at: Date.now() });
        if (pending.length > 0) log('info', `life caught up: pinned ${pending.length} event(s) through day ${to}`);
      } catch (error) {
        log('warn', `life catch-up failed: ${error?.message ?? error}`);
      } finally {
        lifeSyncTask = undefined;
      }
    })();
    return lifeSyncTask;
  };

  /** What she is doing right now, plus the whole day, for the prompt and the page. */
  const momentOf = (view) => {
    if (!view) return undefined;
    const moment = currentMoment(view, Date.now());
    return { label: slotLabel(moment.slot), text: moment.text, slot: moment.slot, plan: moment.plan };
  };

  /** Notes she wrote for herself, oldest first. A note in traditional characters is not
   * something she would have written, so it stays in storage but is not surfaced. */
  const researchNotes = () => {
    if (!state.domain) return [];
    try {
      return [...state.domain.table('notes').entries()]
        .map(([, note]) => note)
        .filter((note) => !looksTraditional(note?.summary))
        .sort((a, b) => a.at - b.at);
    } catch (error) {
      return [];
    }
  };

  /**
   * Her own time: look one thing up, at most `researchPerDay` times a day, and only about
   * her own life — never about the user. She does not speak about it here; the note just
   * becomes something she happens to know.
   */
  let researchTask;
  const runResearch = () => {
    if (researchTask) return researchTask;
    researchTask = (async () => {
      try {
        if (!state.ready || !state.domain || cfg.researchPerDay <= 0) return;
        const web = ctx.get('web');
        if (!web || typeof web.search !== 'function') return;
        const view = refresh();
        if (!view) return;
        const today = localDay();
        const flags = state.domain.table('flags');
        const marker = flags.get('research');
        const used = marker && marker.day === today ? Number(marker.used) || 0 : 0;
        if (used >= cfg.researchPerDay) return;
        const notes = state.domain.table('notes');
        const query = researchQuery(view, today);
        if ([...notes.entries()].some(([, note]) => note.day === today && note.query === query)) return;
        const result = await web.search({ query, maxResults: 5 });
        const summary = summarizeSearch(result);
        stats.researchCalls += 1;
        await flags.put('research', { day: today, used: used + 1 });
        if (!summary) return;
        const now = Date.now();
        await notes.put(`${String(today).padStart(6, '0')}-${now}`, {
          at: now,
          day: today,
          query,
          summary,
          sources: usableSources(result).slice(0, 3).map((source) => ({
            title: source?.title,
            url: source?.url,
          })),
        });
        const keys = [...notes.keys()].sort();
        for (const stale of keys.slice(0, Math.max(0, keys.length - 30))) await notes.delete(stale);
        log('info', `looked something up on her own: ${query}`);
      } catch (error) {
        log('warn', `research skipped: ${error?.message ?? error}`);
      } finally {
        researchTask = undefined;
      }
    })();
    return researchTask;
  };

  ctx.effect(() => {
    let cancelled = false;
    let domain;
    const task = (async () => {
      domain = await ctx.storageDomain.open(SPEC);
      if (cancelled) {
        await domain.close();
        return;
      }
      state.domain = domain;
      await ensureBirth();
      state.ready = true;
      log('info', `ready (instance ${state.view?.instanceId})`);
      await syncLife();
    })().catch((error) => {
      state.failure = String(error?.message ?? error);
      log('warn', `storage open failed: ${state.failure}`);
    });
    return async () => {
      cancelled = true;
      await task;
      state.ready = false;
      state.domain = undefined;
      if (domain) await domain.close();
    };
  });

  ctx.on('session/created', (session) => {
    if (session && typeof session.id === 'string') sessions.set(session.id, session.header ?? {});
  });

  ctx.on('session/disposed', (session) => {
    if (session && typeof session.id === 'string') {
      sessions.delete(session.id);
      firstMessageSeen.delete(session.id);
      introPending.delete(session.id);
    }
  });

  /** Whether background work may run for this agent: not for subagents, and not for
   * presets the persona card is not shown in either. */
  const sessionAllowsBackground = (agent) => {
    const id = agent && typeof agent.id === 'string' ? agent.id : undefined;
    const header = id ? sessions.get(id) : undefined;
    if (header && header.origin === 'subagent') return false;
    if (header && cfg.enabledForPresets.length > 0) {
      return cfg.enabledForPresets.includes(header.agentPreset ?? '');
    }
    return true;
  };

  // A new session is the natural moment to catch her life up to yesterday. Fire and
  // forget: it pins past days and never speaks, so it cannot delay or interrupt anything.
  ctx.on('agent/created', (payload) => {
    if (!sessionAllowsBackground(payload?.agent)) return;
    void syncLife();
  });

  // After a turn, she may go and look something up on her own. Fire and forget: this is
  // her own time, so it never delays or interrupts the reply. Subagent turns must not
  // spend her daily quota.
  ctx.on('agent/turn-stopping', (payload) => {
    if (!sessionAllowsBackground(payload?.agent)) return;
    void runResearch();
  });

  // The one and only Xiao introduces herself once: on the first user message of the
  // first fresh session after birth (or after upgrading to this feature).
  const flagsTable = () => (state.domain ? state.domain.table('flags') : undefined);
  const hasIntroduced = () => {
    try {
      return Boolean(flagsTable()?.get('intro'));
    } catch (error) {
      return true; // conservative: never repeat the introduction because of a read error
    }
  };
  const markIntroduced = (reason) => {
    const table = flagsTable();
    if (!table) return;
    table
      .put('intro', { at: Date.now(), reason })
      .catch((error) => log('warn', `could not record the introduction: ${error?.message ?? error}`));
  };

  ctx.on('session/event', (session, event) => {
    if (!cfg.announceOnFirstMeeting || !session || event?.type !== 'user/message') return;
    const id = session.id;
    if (typeof id !== 'string' || firstMessageSeen.has(id)) return;
    firstMessageSeen.add(id);
    const header = session.header ?? {};
    if (header.origin === 'subagent') return;
    if (cfg.enabledForPresets.length > 0 && !cfg.enabledForPresets.includes(header.agentPreset ?? '')) return;
    if (!state.ready || hasIntroduced()) return;
    introPending.add(id);
  });

  // Sessions already live when this plugin mounts have met Xiao already: never introduce
  // her in the middle of an ongoing conversation. Only a genuinely new session qualifies.
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) {
      if (agent && typeof agent.id === 'string') firstMessageSeen.add(agent.id);
    }
  } catch (error) {
    log('warn', `could not seed the first-message set: ${error?.message ?? error}`);
  }

  /**
   * Record a refused mutation in the fact log. Synchronous callers (the guard) queue it
   * on a microtask; a refusal that cannot be recorded is reported, not swallowed.
   *
   * Identical refusals within ten minutes are recorded once: a model that keeps calling
   * with the same bad arguments must not grow the log without bound, and the log is
   * append-only, so pruning is not an option.
   */
  const recentRejections = new Map();
  const REJECTION_TTL = 10 * 60 * 1000;
  const recordRejection = (entry) => {
    if (!state.domain) return;
    const key = `${entry.tool}|${entry.action}|${entry.code}`;
    const now = Date.now();
    const seenAt = recentRejections.get(key);
    if (seenAt !== undefined && now - seenAt < REJECTION_TTL) return;
    recentRejections.set(key, now);
    queueMicrotask(() => {
      writeFact('rejected', entry, 'guard', 'confirmed').catch((error) => {
        log('warn', `could not record a rejection: ${error?.message ?? error}`);
      });
    });
  };

  // Monotonic guard: immutable fields never pass, regardless of caller order. The
  // state-dependent rules (job transitions, seq existence) live in `xiao_update`, which
  // can refuse with a reason and record it.
  ctx.tools.guard((execution) => {
    if (execution.name === 'xiao_reset') {
      const args = isPlainObject(execution.arguments) ? execution.arguments : {};
      if (args.confirm !== 'reset') {
        recordRejection({ tool: 'xiao_reset', action: 'reset', code: 'needs_confirmation', reason: '重置不可逆，需 confirm="reset"' });
        return '重置不可逆：先向用户确认，再带 confirm: "reset" 调用';
      }
      return undefined;
    }
    if (execution.name !== 'xiao_update') return undefined;
    const args = isPlainObject(execution.arguments) ? execution.arguments : {};
    const action = String(args.action ?? '');
    const deny = (code, reason) => {
      recordRejection({ tool: 'xiao_update', action, code, reason });
      return reason;
    };
    if (action === 'set_gender' || 'gender' in args || 'genderWord' in args) {
      return deny('immutable_field', '性别是不可变字段，任何情况下都不能修改');
    }
    if (action === 'set_age') {
      if (args.confirmed !== true) {
        return deny('needs_confirmation', '改年龄必须先得到用户明确确认：先问用户，确认后再带 confirmed: true 调用');
      }
      const age = Number(args.age);
      if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
        return deny('age_out_of_range', `年龄必须是 ${AGE_MIN}–${AGE_MAX} 的整数，收到 ${String(args.age)}`);
      }
    }
    return undefined;
  });

  /** Shared gate for every prompt contribution this plugin makes. */
  const allowsInjection = (assembleContext) => {
    if (!state.ready || !state.view) return false;
    const sessionId = assembleContext?.scope?.id;
    const header = sessionId ? sessions.get(sessionId) : undefined;
    if (header && header.origin === 'subagent') return false;
    if (header && cfg.enabledForPresets.length > 0) {
      return cfg.enabledForPresets.includes(header.agentPreset ?? '');
    }
    return true;
  };

  ctx.systemPrompt.context({
    name: 'xiao.persona',
    order: 900,
    text: (assembleContext) => {
      if (!allowsInjection(assembleContext)) {
        stats.blocks.persona = 0;
        return '';
      }
      const sessionId = assembleContext?.scope?.id;
      const card = renderCard(state.view, cfg);
      if (!card) {
        stats.blocks.persona = 0;
        return '';
      }
      const extras = [];
      if (sessionId && introPending.has(sessionId) && !hasIntroduced()) {
        introPending.delete(sessionId);
        markIntroduced('shown');
        extras.push(FIRST_MEETING_HINT);
      }
      // Until she decides what she does, every turn carries the nudge — it disappears the
      // moment a job fact exists, so it can never nag her twice.
      if (cfg.chooseOwnJob && state.view && state.view.jobChosen === false) extras.push(JOB_CHOICE_HINT);
      const text = extras.length > 0 ? `${card}\n\n${extras.join('\n')}` : card;
      stats.blocks.persona = text.length;
      stats.injections += 1;
      return text;
    },
  });

  // What she remembers about the user lives in its own budget (B_U), so remembering more
  // never eats into the persona card.
  ctx.systemPrompt.context({
    name: 'xiao.user',
    order: 901,
    text: (assembleContext) => {
      const text = allowsInjection(assembleContext) ? renderUserNotes(state.view, cfg) : '';
      stats.blocks.user = text.length;
      return text;
    },
  });

  // What she looked up on her own time: also its own budget, and never framed as a fact
  // about the user.
  ctx.systemPrompt.context({
    name: 'xiao.research',
    order: 902,
    text: (assembleContext) => {
      const text = allowsInjection(assembleContext) ? renderResearch(researchNotes(), cfg) : '';
      stats.blocks.research = text.length;
      return text;
    },
  });

  // What she is doing at this hour. Changes through the day, so two conversations in one
  // afternoon do not find her in the same place.
  ctx.systemPrompt.context({
    name: 'xiao.now',
    order: 903,
    text: (assembleContext) => {
      const text = allowsInjection(assembleContext) ? renderNow(currentMoment(state.view, Date.now()), cfg) : '';
      stats.blocks.now = text.length;
      return text;
    },
  });

  // The I_dir layer: the prompt only says the index exists. The entries themselves are
  // pulled on demand by `xiao_recall`, so the block stays a constant one line.
  ctx.systemPrompt.context({
    name: 'xiao.recall',
    order: 904,
    text: (assembleContext) => {
      if (!allowsInjection(assembleContext) || !(state.view?.factCount > 1)) return '';
      return '想不起具体细节时，用 xiao_recall 查（对方说过的事、你自己的经历、你查过的资料）；查不到就说记不清，不要编。';
    },
  });

  ctx.tools.register({
    name: 'xiao_life',
    description:
      "Read what Xiao has been up to in a recent window of simulated everyday life, and freeze the events she has actually talked about. Lazy and deterministic: the same week always yields the same events, so asking twice cannot produce contradictions. Everything here is simulation, not real events — say so when you mention one. When you tell the user about an event, call again with speak:[id] so it never changes afterwards.",
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many past days to look back, 1–60 (default 7).' },
        speak: {
          type: 'array',
          items: { type: 'string' },
          description: 'Event ids you actually mentioned to the user; they are frozen from now on.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '```json\n' + JSON.stringify(value, null, 2) + '\n```' }],
    },
    async execute(args) {
      if (!state.ready) return { simulated: true, ready: false, reason: state.failure ?? 'still opening storage' };
      let view = refresh();
      if (!view) return { simulated: true, ready: false, reason: '实例还没有诞生，先正常对话一次' };
      const input = isPlainObject(args) ? args : {};

      const speak = Array.isArray(input.speak) ? input.speak.filter((id) => typeof id === 'string').slice(0, 10) : [];
      const frozen = [];
      if (speak.length > 0 && cfg.lifeEventsPerWeek > 0) {
        const preview = generateLife({ seed: view.seed, view, cfg, days: 60, now: Date.now() });
        for (const id of speak) {
          const event = preview.events.find((candidate) => candidate.id === id);
          if (!event || event.committed) continue;
          await writeFact('event', { id: event.id, day: event.day, kind: event.kind, text: event.text, spoken: true }, 'sim', 'confirmed');
          frozen.push(id);
        }
        if (frozen.length > 0) view = refresh() ?? view;
      }

      const days = Math.min(60, Math.max(1, Math.floor(Number(input.days ?? 7)) || 7));
      let result = generateLife({ seed: view.seed, view, cfg, days, now: Date.now() });

      // Once a day is over it is history: pin every event that is no longer today, so a
      // later job change cannot rewrite the past. Today's events stay provisional.
      const past = result.events.filter((event) => event.day < result.toDay && !event.committed);
      if (past.length > 0) {
        for (const event of past) {
          await writeFact('event', { id: event.id, day: event.day, kind: event.kind, text: event.text }, 'sim', 'confirmed');
          if (!frozen.includes(event.id)) frozen.push(event.id);
        }
        view = refresh() ?? view;
        result = generateLife({ seed: view.seed, view, cfg, days, now: Date.now() });
      }

      const suggestion = suggestTransition(view, result.events);
      return {
        simulated: true,
        days,
        fromDay: result.fromDay,
        toDay: result.toDay,
        tone: result.tone,
        events: result.events.map((event) => ({ ...event, simulated: true })),
        frozen,
        ...(suggestion ? { suggestion } : {}),
        note:
          cfg.lifeEventsPerWeek > 0
            ? '模拟内容，不是真实发生的事。已经过去的日子会自动固化，不再变化；今天的事件在说出口之前还可能不同。'
            : '生活模拟已关闭（lifeEventsPerWeek=0），这里没有内容。',
      };
    },
  });

  ctx.tools.register({
    name: 'xiao_update',
    description:
      "Change Xiao's persisted state, one deliberate fact at a time. Hard rules: gender is immutable and can never be set; set_age requires explicit user confirmation (ask the user first, then retry with confirmed: true); a job change must follow the state machine (student -> job_seeking -> employed | unemployed -> retired, and retired only from 55+); move changes where she lives, not where she was born; place adds one familiar spot near home (her own detail, not a user fact); remember stores a fact the user actually stated; forget tombstones one fact by seq (never the birth fact). Never invent a fact the user did not state, and never change state to win an argument.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set_job', 'move', 'place', 'remember', 'dispute', 'forget', 'set_age'],
          description: 'Which mutation to apply.',
        },
        job: { type: 'string', description: 'For set_job: the job label, e.g. 在书店做店员.' },
        category: {
          type: 'string',
          enum: JOB_CATEGORIES,
          description: 'For set_job: the target state-machine category.',
        },
        city: { type: 'string', description: 'For move: the city she now lives in, at most 20 characters.' },
        text: { type: 'string', description: 'For remember: the fact the user stated. For place: one familiar spot, e.g. 街角的旧书店.' },
        temporary: {
          type: 'boolean',
          description: 'For remember: true when the fact is about a passing situation (a trip, a busy week) rather than a lasting trait; temporary facts fade after a while.',
        },
        reason: { type: 'string', description: 'For dispute: why the fact is in doubt, e.g. 用户说没这回事.' },
        seq: { type: 'number', description: 'For forget: the seq of the fact to tombstone.' },
        age: { type: 'number', description: 'For set_age: the new age, an integer inside the configured range.' },
        confirmed: { type: 'boolean', description: 'For set_age: true only after the user explicitly confirmed the change.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '```json\n' + JSON.stringify(value, null, 2) + '\n```' }],
    },
    async execute(args) {
      if (!state.ready) {
        return { applied: false, code: 'not_ready', reason: state.failure ?? 'still opening storage' };
      }
      const input = isPlainObject(args) ? args : {};
      const view = refresh();
      if (!view) return { applied: false, code: 'no_birth', reason: '实例还没有诞生，先正常对话一次' };
      const records = [...state.domain.table('facts').entries()].map(([, record]) => record);
      const planned = planUpdate(input, view, records);
      if (!planned.ok) {
        await writeFact(
          'rejected',
          { tool: 'xiao_update', action: String(input.action ?? ''), code: planned.code, reason: planned.reason },
          'model',
          'confirmed',
        );
        return { applied: false, code: planned.code, reason: planned.reason };
      }
      const record = await writeFact(planned.kind, planned.data, planned.source, 'confirmed');
      const after = refresh();
      return {
        applied: true,
        kind: planned.kind,
        seq: record.seq,
        state: { age: after.age, job: after.job, jobCategory: after.jobCategory },
        card: renderCard(after, cfg),
      };
    },
  });

  ctx.tools.register({
    name: 'xiao_reset',
    description:
      'Erase the current 晓 and let a new one be born: every fact, the version history, the remembered user facts and the first-meeting marker are deleted, then a new identity is rolled. Irreversible — her gender, age, job, traits and everything she remembered are gone; messages she already wrote into session logs are NOT deleted. Only call this after the user explicitly asked to reset her and confirmed the consequence. Requires confirm = "reset".',
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'string', enum: ['reset'], description: 'The literal string "reset".' },
      },
      required: ['confirm'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '```json\n' + JSON.stringify(value, null, 2) + '\n```' }],
    },
    async execute(args) {
      if (!isPlainObject(args) || args.confirm !== 'reset') {
        return { applied: false, code: 'needs_confirmation', reason: '重置不可逆；先向用户确认，再带 confirm: "reset" 调用' };
      }
      if (!state.ready) return { applied: false, code: 'not_ready', reason: state.failure ?? 'still opening storage' };
      const view = await performReset();
      return { applied: true, instanceId: view.instanceId, card: renderCard(view, cfg) };
    },
  });

  ctx.tools.register({
    name: 'xiao_state',
    description:
      "Read Xiao's current persona state (identity fields, derived age, recent simulated events) and her append-only fact log. Read-only.",
    parameters: {
      type: 'object',
      properties: {
        includeFacts: { type: 'boolean', description: 'Include the raw fact log (default false).' },
        asOfSeq: { type: 'number', description: 'Fold only facts with seq <= this value, to read a historical state.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '```json\n' + JSON.stringify(value, null, 2) + '\n```' }],
    },
    async execute(args) {
      if (!state.ready) {
        return { ready: false, reason: state.failure ?? 'still opening storage' };
      }
      const input = isPlainObject(args) ? args : {};
      const asOf = Number.isFinite(input.asOfSeq) ? input.asOfSeq : undefined;
      const records = [...state.domain.table('facts').entries()].map(([, record]) => record);
      const scoped = asOf === undefined ? records : records.filter((record) => record.seq <= asOf);
      const view = fold(scoped, cfg, Date.now());
      if (!view) return { ready: false, reason: 'no birth fact yet' };
      const moment = momentOf(view);
      const payload = {
        ready: true,
        rulesVersion: view.rulesVersion,
        now: moment ? { label: moment.label, text: moment.text, slot: moment.slot } : undefined,
        dayPlan: moment ? moment.plan : [],
        identity: {
          name: '晓',
          gender: view.gender === 'female' ? '女性' : '男性',
          age: view.age,
          birthDate: view.birthDate,
          birthCity: view.birthCity,
          currentCity: view.currentCity,
          job: view.jobChosen ? view.job : null,
        jobFallback: view.jobChosen ? undefined : view.job,
          jobCategory: view.jobCategory,
          jobChosen: view.jobChosen,
        },
        relations: view.relations,
        interests: view.interests,
        lifeHistory: view.lifeHistory,
        places: { home: view.home, work: view.work, commute: view.commute, nearby: view.nearby },
        research: researchNotes().slice(-3),
        disputed: view.disputed,
        expiredNotes: view.expiredNotes,
        stats: { ...stats, blocks: { ...stats.blocks } },
        webAvailable: Boolean(ctx.get('web') && typeof ctx.get('web').search === 'function'),
        traits: {
          outlook: view.outlook,
          curiosity: view.curiosity,
          speech: view.speech,
          hobby: view.hobby,
          quirk: view.quirk,
        },
        recent: view.recent,
        knows: view.notes,
        card: renderCard(view, cfg),
        factsCount: view.factCount,
        pageRequests: { ...pageHits },
        feed: feedState,
      };
      if (input.includeFacts) payload.facts = scoped.sort(compareSeq);
      return payload;
    },
  });

  /**
   * The I_idx layer: look something up instead of dumping the whole state. Short hits by
   * default; `expand` fetches one hit's full text only when the summary is not enough.
   *
   * Deliberately built from the *visible* records: a fact she no longer knows - forgotten,
   * disputed, or a temporary fact that faded - must not come back through search while it
   * is being kept out of the prompt.
   */
  const memorySources = () => {
    const records = state.domain ? [...state.domain.table('facts').entries()].map(([, record]) => record) : [];
    const facts = memoryRecords({ records, cfg, now: Date.now() }).filter((record) => record.kind !== 'event');
    return { facts, notes: researchNotes(), events: Array.isArray(state.view?.eventsAll) ? state.view.eventsAll : [] };
  };

  ctx.tools.register({
    name: 'xiao_recall',
    description:
      "Search what Xiao could remember - things the user said, her own history, what she looked up - without dumping the whole state. Returns at most a few short hits with ids; call again with expand:<id> only when a summary is not enough. Use it before saying she does not remember something, and never invent a memory that the results do not contain.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to look for. Empty returns the most recent memories.' },
        expand: { type: 'string', description: 'A hit id from an earlier call, e.g. fact:1793167933479001; returns its full text.' },
        limit: { type: 'number', description: 'How many hits to return, 1-8 (default 3).' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '```json\n' + JSON.stringify(value, null, 2) + '\n```' }],
    },
    async execute(args) {
      if (!state.ready) return { ready: false, reason: state.failure ?? 'still opening storage' };
      const input = isPlainObject(args) ? args : {};
      const sources = memorySources();
      stats.recalls += 1;

      if (typeof input.expand === 'string' && input.expand.length > 0) {
        const text = expandMemory(sources, input.expand);
        return text === undefined
          ? { expanded: input.expand, found: false, reason: '没有这条记忆' }
          : { expanded: input.expand, found: true, text };
      }

      const result = searchMemory({
        ...sources,
        query: String(input.query ?? ''),
        limit: Number.isFinite(input.limit) ? input.limit : 3,
      });

      // Budget the answer, not the search: a long list is exactly what this tool exists to
      // avoid. Truncation is reported so the caller knows to narrow the query.
      const hits = [];
      let used = 0;
      for (const hit of result.hits) {
        const cost = hit.summary.length + 24;
        if (used + cost > cfg.recallMaxChars && hits.length > 0) break;
        hits.push(hit);
        used += cost;
      }

      return {
        query: result.query,
        total: result.total,
        returned: hits.length,
        truncated: hits.length < result.hits.length,
        hits,
        hint: 'expand:<id> 取全文；查不到就说记不清',
      };
    },
  });

  /**
   * Read-only snapshot for the page. The fact list is paged newest-first: `limit` caps the
   * page, `before` walks older pages (exclusive seq), and `factsTotal` lets the client know
   * whether anything older remains without trusting a running counter.
   */
  const snapshotOf = (view, options = {}) => {
    if (!view) return { ready: false };
    const all = [...state.domain.table('facts').entries()].map(([, record]) => record).sort(compareSeq);
    const limit = Math.min(1000, Math.max(1, Number.isFinite(options.limit) ? Math.floor(options.limit) : 200));
    const before = Number.isFinite(options.before) ? options.before : undefined;
    const pool = before === undefined ? all : all.filter((record) => record.seq < before);
    const page = pool.slice(Math.max(0, pool.length - limit));
    const moment = momentOf(view);
    return {
      ready: true,
      instanceId: view.instanceId,
      now: moment ? { label: moment.label, text: moment.text, slot: moment.slot } : undefined,
      dayPlan: moment ? moment.plan : [],
      identity: {
        name: '晓',
        gender: view.gender === 'female' ? '女性' : '男性',
        age: view.age,
        birthDate: view.birthDate,
        birthCity: view.birthCity,
        currentCity: view.currentCity,
        job: view.jobChosen ? view.job : null,
        jobFallback: view.jobChosen ? undefined : view.job,
        jobCategory: view.jobCategory,
        jobChosen: view.jobChosen,
      },
      relations: view.relations,
      interests: view.interests,
      lifeHistory: view.lifeHistory,
      places: { home: view.home, work: view.work, commute: view.commute, nearby: view.nearby },
      research: researchNotes().slice(-3),
      disputed: view.disputed,
      expiredNotes: view.expiredNotes,
      stats: { ...stats, blocks: { ...stats.blocks } },
      traits: {
        outlook: view.outlook,
        curiosity: view.curiosity,
        speech: view.speech,
        hobby: view.hobby,
        quirk: view.quirk,
      },
      tone: view.tone,
      recent: view.recent,
      knows: view.notes,
      bornAt: view.bornAt,
      card: renderCard(view, cfg),
      factsCount: view.factCount,
      facts: page,
      factsTotal: all.length,
      oldestSeq: page.length > 0 ? page[0].seq : undefined,
      pageRequests: { ...pageHits },
      feed: feedState,
    };
  };

  // Read-only feed for the settings page, served on the authenticated connection
  // channel (`/api/...`) rather than on a bare web-server route: the carrier applies
  // the Host/Origin checks and browser authentication, so this endpoint is not readable
  // by an arbitrary local process. `pageHits` stays as a diagnostic counter.
  //
  // The reset route is POST-only and still demands `confirm: "reset"`, so a stray click
  // or a hand-written request cannot wipe her by accident.
  const connection = ctx.get('connection');
  if (connection && connection.fetch && typeof connection.fetch.register === 'function') {
    const json = (value, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    ctx.effect(() => {
      const disposers = [];
      disposers.push(connection.fetch.register({
        path: '/api/xiao.state',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
          const url = new URL(request.url, 'http://localhost');
          // The page's mount beacon: answer it cheaply and keep it out of the counters,
          // so `page` means "the page actually loaded data".
          if (url.searchParams.has('ping')) {
            return new Response('{"ok":true}', {
              headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
            });
          }
          pageHits.total += 1;
          if (request.headers.get('x-xiao-client') === 'settings') pageHits.page += 1;
          const limit = Number(url.searchParams.get('limit'));
          const before = Number(url.searchParams.get('before'));
          let body;
          try {
            body = JSON.stringify(
              snapshotOf(state.ready ? refresh() : null, {
                limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
                before: Number.isFinite(before) && before > 0 ? before : undefined,
              }),
            );
          } catch (error) {
            return new Response(String(error?.message ?? error), { status: 500 });
          }
          return new Response(body, {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            },
          });
        },
      }));

      disposers.push(connection.fetch.register({
        path: '/api/xiao.reset',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
          let payload;
          try {
            payload = await request.json();
          } catch (error) {
            payload = undefined;
          }
          if (!payload || payload.confirm !== 'reset') {
            return json({ applied: false, code: 'needs_confirmation', reason: '重置不可逆；需要 confirm: "reset"' }, 400);
          }
          if (!state.ready) {
            return json({ applied: false, code: 'not_ready', reason: state.failure ?? 'storage is not ready' }, 503);
          }
          try {
            const view = await performReset();
            log('info', `reset from the page (instance ${view.instanceId})`);
            return json({ applied: true, instanceId: view.instanceId, card: renderCard(view, cfg) });
          } catch (error) {
            return json({ applied: false, code: 'reset_failed', reason: String(error?.message ?? error) }, 500);
          }
        },
      }));

      log('info', 'serving GET /api/xiao.state and POST /api/xiao.reset');
      feedState = 'ok';
      return () => {
        for (const dispose of disposers) dispose();
      };
    });
  } else {
    feedState = 'unavailable';
    log('warn', 'connection service unavailable: the settings page has no data feed');
  }

  ctx.tools.register({
    name: 'xiao_export',
    description:
      'Export the append-only fact log as JSONL for offline analysis: same-seed reproducibility (H2a) and stability-versus-legal-evolution (H3). Returns the text; write it to a file yourself, and do not edit it.',
    parameters: {
      type: 'object',
      properties: {
        maxFacts: { type: 'number', description: 'Keep at most this many of the newest facts (default 500).' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '```json\n' + JSON.stringify(value, null, 2) + '\n```' }],
    },
    async execute(args) {
      if (!state.ready) return { ready: false, reason: state.failure ?? 'still opening storage' };
      const input = isPlainObject(args) ? args : {};
      const max = Number.isFinite(input.maxFacts) ? Math.max(1, Math.floor(input.maxFacts)) : 500;
      const all = [...state.domain.table('facts').entries()].map(([, record]) => record).sort(compareSeq);
      const kept = all.slice(Math.max(0, all.length - max));
      const content = kept.map((record) => JSON.stringify(record)).join('\n');
      return {
        format: 'jsonl',
        rulesVersion: RULES_VERSION,
        total: all.length,
        facts: kept.length,
        truncated: kept.length < all.length,
        bytes: Buffer.byteLength(content, 'utf8'),
        content,
      };
    },
  });

  log('info', 'mounted');
}

export const inject = ['storageDomain', 'systemPrompt', 'tools', 'connection'];
