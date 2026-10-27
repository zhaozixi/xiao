/**
 * dsh-xiao — a persistent persona kernel for DSH (Cordis plumbing only).
 *
 * One append-only fact log is the only writable state; the current character is a
 * pure fold of it (see `persona.js`). Nothing derivable from the seed is stored, so a
 * fact record only ever marks a deliberate deviation.
 *
 * v0.1: birth, persona card injection, read-only `xiao_state`.
 * v0.2: `xiao_update` under a state machine, a monotonic guard on immutable fields,
 *       logical deletion by tombstone, history reads. See ROADMAP.md.
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
  renderCard,
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
};

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
  const sessions = new Map();
  let counter = 0;

  const nextSeq = () => {
    counter = (counter + 1) % 1000;
    return Date.now() * 1000 + counter;
  };

  const log = (level, message) => {
    const logger = ctx.logger;
    if (logger && typeof logger[level] === 'function') logger[level](`[dsh-xiao] ${message}`);
  };

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
    if (session && typeof session.id === 'string') sessions.delete(session.id);
  });

  /**
   * Record a refused mutation in the fact log. Synchronous callers (the guard) queue
   * it on a microtask; a refusal that cannot be recorded is reported, not swallowed.
   */
  const recordRejection = (entry) => {
    if (!state.domain) return;
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

  ctx.systemPrompt.context({
    name: 'xiao.persona',
    order: 900,
    text: (assembleContext) => {
      if (!state.ready || !state.view) return '';
      const sessionId = assembleContext?.scope?.id;
      const header = sessionId ? sessions.get(sessionId) : undefined;
      if (header && header.origin === 'subagent') return '';
      if (header && cfg.enabledForPresets.length > 0) {
        const preset = header.agentPreset ?? '';
        if (!cfg.enabledForPresets.includes(preset)) return '';
      }
      return renderCard(state.view, cfg);
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
          await writeFact('event', { id: event.id, day: event.day, kind: event.kind, text: event.text }, 'sim', 'confirmed');
          frozen.push(id);
        }
        if (frozen.length > 0) view = refresh() ?? view;
      }

      const days = Math.min(60, Math.max(1, Math.floor(Number(input.days ?? 7)) || 7));
      const result = generateLife({ seed: view.seed, view, cfg, days, now: Date.now() });
      return {
        simulated: true,
        days,
        fromDay: result.fromDay,
        toDay: result.toDay,
        tone: result.tone,
        events: result.events.map((event) => ({ ...event, simulated: true })),
        frozen,
        note:
          cfg.lifeEventsPerWeek > 0
            ? '模拟内容，不是真实发生的事。未固化的事件下次可能不同；你亲口说过的事件用 speak 固化后不再变化。'
            : '生活模拟已关闭（lifeEventsPerWeek=0），这里没有内容。',
      };
    },
  });

  ctx.tools.register({
    name: 'xiao_update',
    description:
      "Change Xiao's persisted state, one deliberate fact at a time. Hard rules: gender is immutable and can never be set; set_age requires explicit user confirmation (ask the user first, then retry with confirmed: true); a job change must follow the state machine (student -> job_seeking -> employed | unemployed -> retired, and retired only from 55+); remember stores a fact the user actually stated; forget tombstones one fact by seq (never the birth fact). Never invent a fact the user did not state, and never change state to win an argument.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set_job', 'remember', 'forget', 'set_age'],
          description: 'Which mutation to apply.',
        },
        job: { type: 'string', description: 'For set_job: the job label, e.g. 在书店做店员.' },
        category: {
          type: 'string',
          enum: JOB_CATEGORIES,
          description: 'For set_job: the target state-machine category.',
        },
        text: { type: 'string', description: 'For remember: the fact the user stated, verbatim in spirit, at most 200 characters.' },
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
      const payload = {
        ready: true,
        rulesVersion: view.rulesVersion,
        identity: {
          name: '晓',
          gender: view.gender === 'female' ? '女性' : '男性',
          age: view.age,
          job: view.job,
          jobCategory: view.jobCategory,
        },
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
      };
      if (input.includeFacts) payload.facts = scoped.sort(compareSeq);
      return payload;
    },
  });

  log('info', 'mounted');
}

export const inject = ['storageDomain', 'systemPrompt', 'tools'];
