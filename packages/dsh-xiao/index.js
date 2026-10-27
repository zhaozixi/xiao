/**
 * dsh-xiao — a persistent persona kernel for DSH (Cordis plumbing only).
 *
 * One append-only fact log is the only writable state; the current character is a
 * pure fold of it (see `persona.js`). Nothing derivable from the seed is stored, so a
 * fact record only ever marks a deliberate deviation.
 *
 * v0.1 scope: birth, persona card injection, read-only `xiao_state`. See ROADMAP.md.
 */

import { SPEC, RULES_VERSION, compareSeq, fold, isPlainObject, renderCard } from './persona.js';

const DEFAULTS = {
  /** Persona card character budget. 0 disables injection (useful as a control group). */
  cardMaxChars: 220,
  /** Fixed seed for reproducibility tests; empty means "generate once and keep". */
  seed: '',
  /** Preset names allowed to see the persona card; empty means "every session". */
  enabledForPresets: [],
  /** Age growth in years per elapsed month; clamped to [1/12, 1/4]. */
  growthPerMonth: 1 / 12,
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
