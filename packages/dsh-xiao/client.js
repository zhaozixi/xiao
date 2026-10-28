window.__ModuleLoader__.load({
  id: '@local/dsh-xiao',
  factory(require) {
    const reactModule = require('react');
    // Accept either the namespace itself or its default export.
    const React = typeof reactModule?.createElement === 'function' ? reactModule : (reactModule?.default ?? reactModule);
    const h = React.createElement;
    if (typeof h !== 'function' || typeof React.useState !== 'function') {
      throw new Error('dsh-xiao client: react module shape is unusable (no createElement/useState)');
    }

    const DICT = {
      zh: {
        subtitle: '一个由种子决定、只能按规则演化的持久角色',
        identity: '身份',
        traits: '性格',
        card: '注入到提示里的话',
        remembers: '她记得你什么',
        remembersEmpty: '还没记下关于你的事。',
        remembersHint: '只有你明确说过的事才会被记住；想让她忘掉就说「忘掉那条」。',
        timeline: '事实时间线',
        pageHint: '追加式日志：只写不改，删除靠墓碑标记。',
        emptyChat: '还没有任何事实。和她聊几句，这里会开始长出东西。',
        emptyFiltered: '当前筛选下没有内容。',
        loading: '读取中…',
        error: '读取失败',
        err404: '数据连接没建立（路由未注册）。检查插件是否启用，或运行 xiao_state 看 feed 字段。',
        err401: '鉴权失败：刷新页面，仍然失败就重启 DSH。',
        simulated: '模拟',
        unit: '条事实',
        shown: '显示',
        total: '共',
        refresh: '刷新',
        refreshTitle: '重新读取当前状态',
        born: '出生于',
        openPage: '事实时间线在左侧栏的「晓」页面。',
        note: '这里只读。改状态要通过对话里的 xiao_update 工具。',
        fields: {
          gender: '性别',
          age: '年龄',
          job: '职业',
          tone: '状态',
          outlook: '倾向',
          curiosity: '好奇心',
          speech: '说话',
          hobby: '闲时',
          quirk: '小毛病',
        },
        kinds: {
          birth: '出生',
          override: '更正',
          job: '职业',
          health: '健康',
          user_fact: '用户事实',
          event: '事件',
          tombstone: '删除',
          rejected: '拒绝',
        },
        codes: {
          age_out_of_range: '年龄超出范围',
          needs_confirmation: '需要用户确认',
          immutable_field: '不可变字段',
          illegal_job_transition: '不允许的职业转移',
          retire_too_young: '未到退休年龄',
          unknown_job_category: '未知职业类别',
          cannot_forget_birth: '出生事实不可删除',
          already_forgotten: '已经删过',
          unknown_fact: '找不到这条事实',
          missing_job: '缺少职业名',
          missing_text: '内容为空',
          missing_seq: '缺少序号',
          job_too_long: '职业名过长',
          text_too_long: '内容过长',
          unknown_action: '未知操作',
        },
      },
      en: {
        subtitle: 'A persistent character derived from one seed, changing only by rule',
        identity: 'Identity',
        traits: 'Traits',
        card: 'Text injected into the prompt',
        remembers: 'What she remembers about you',
        remembersEmpty: 'Nothing remembered about you yet.',
        remembersHint: 'Only things you actually stated get remembered; say "forget that" to drop one.',
        timeline: 'Fact timeline',
        pageHint: 'Append-only log: write once, never rewritten; deletion is a tombstone.',
        emptyChat: 'No facts yet. Talk to her for a while and this starts to grow.',
        emptyFiltered: 'Nothing matches the current filter.',
        loading: 'Loading…',
        error: 'Failed to load',
        err404: 'The data route is not registered. Check that the plugin is enabled, or call xiao_state and look at feed.',
        err401: 'Authentication failed: reload the page, or restart DSH.',
        simulated: 'simulated',
        unit: 'facts',
        shown: 'showing',
        total: 'of',
        refresh: 'Refresh',
        refreshTitle: 'Read the current state again',
        born: 'Born',
        openPage: 'The fact timeline lives on the 晓 panel in the left sidebar.',
        note: 'Read-only. State changes go through the xiao_update tool in chat.',
        fields: {
          gender: 'Gender',
          age: 'Age',
          job: 'Job',
          tone: 'Mood',
          outlook: 'Temper',
          curiosity: 'Curiosity',
          speech: 'Speech',
          hobby: 'Spare time',
          quirk: 'Quirk',
        },
        kinds: {
          birth: 'birth',
          override: 'correction',
          job: 'job',
          health: 'health',
          user_fact: 'user fact',
          event: 'event',
          tombstone: 'deleted',
          rejected: 'refused',
        },
        codes: {
          age_out_of_range: 'age out of range',
          needs_confirmation: 'needs confirmation',
          immutable_field: 'immutable field',
          illegal_job_transition: 'illegal job transition',
          retire_too_young: 'too young to retire',
          unknown_job_category: 'unknown job category',
          cannot_forget_birth: 'birth cannot be deleted',
          already_forgotten: 'already deleted',
          unknown_fact: 'fact not found',
          missing_job: 'missing job',
          missing_text: 'empty text',
          missing_seq: 'missing seq',
          job_too_long: 'job too long',
          text_too_long: 'text too long',
          unknown_action: 'unknown action',
        },
      },
    };

    const C = {
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      line: 'var(--dsw-alias-border-l1)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      brand: 'var(--dsw-alias-brand-primary)',
      layer: 'var(--dsw-alias-bg-layer-1)',
    };

    function activeLang(ctx) {
      try {
        const active = ctx?.locale?.getLocale?.()?.active ?? '';
        if (active) return String(active).toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch (error) {
        /* ignore */
      }
      try {
        const lang = (typeof document !== 'undefined' && document.documentElement?.lang) || 'en';
        return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch (error) {
        return 'zh';
      }
    }

    function useLang(ctx) {
      const [lang, setLang] = React.useState(() => activeLang(ctx));
      React.useEffect(() => {
        try {
          const subscribe = ctx?.locale?.subscribe;
          if (typeof subscribe !== 'function') return undefined;
          return subscribe(() => setLang(activeLang(ctx)));
        } catch (error) {
          return undefined;
        }
      }, [ctx]);
      return lang;
    }

    /** One read of the feed, a reload trigger, and a refresh when the page returns to view. */
    function useFeed(url) {
      const [state, setState] = React.useState({ status: 'loading' });
      const [nonce, setNonce] = React.useState(0);
      const reload = React.useCallback(() => setNonce((value) => value + 1), []);

      React.useEffect(() => {
        let alive = true;
        // Diagnostic marker: the host counts page-originated requests with it.
        const headers = { accept: 'application/json', 'x-xiao-client': 'settings' };
        fetch(`${url}?ping=mount`, { headers }).catch(() => {});
        fetch(url, { headers })
          .then((response) => {
            if (response.ok) return response.json();
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            return Promise.reject(error);
          })
          .then((value) => {
            if (alive) setState({ status: 'ready', value });
          })
          .catch((error) => {
            if (alive) setState({ status: 'error', error: String(error?.message ?? error), statusCode: error?.status });
          });
        return () => {
          alive = false;
        };
      }, [url, nonce]);

      React.useEffect(() => {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
        const onVisible = () => {
          if (document.visibilityState === 'visible') reload();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
      }, [reload]);

      return { state, reload };
    }

    function errorText(state, dict) {
      if (state.statusCode === 404) return dict.err404;
      if (state.statusCode === 401 || state.statusCode === 403) return dict.err401;
      return `${dict.error}：${state.error}`;
    }

    function errorView(error) {
      const detail = error?.stack || error?.message || String(error);
      return h(
        'pre',
        {
          style: {
            color: C.error,
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: 10,
          },
        },
        `xiao render error: ${detail}`,
      );
    }

    function startOfDay(ms) {
      const date = new Date(ms);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }

    /** People read a log as today / yesterday / a date, never as a raw timestamp. */
    function fmtWhen(ms, lang) {
      if (!Number.isFinite(ms)) return '';
      const date = new Date(ms);
      const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86_400_000);
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      if (days === 0) return `${lang === 'zh' ? '今天' : 'today'} ${hh}:${mm}`;
      if (days === 1) return `${lang === 'zh' ? '昨天' : 'yesterday'} ${hh}:${mm}`;
      const md = `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
      return days < 365 ? `${md} ${hh}:${mm}` : `${date.getFullYear()}-${md} ${hh}:${mm}`;
    }

    function shortSeq(seq) {
      return `#${String(seq).slice(-5)}`;
    }

    function row(key, label, value) {
      return h(
        'div',
        { key, style: { display: 'flex', gap: 12, padding: '2px 0' } },
        h('span', { style: { color: C.dim, minWidth: 64, fontSize: 13 } }, label),
        h('span', { style: { color: C.text, fontSize: 13 } }, value),
      );
    }

    function heading(key, text) {
      return h(
        'h3',
        {
          key,
          style: {
            margin: '14px 0 2px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: C.dim,
          },
        },
        text,
      );
    }

    function describe(fact, dict) {
      const data = fact?.data ?? {};
      switch (fact?.kind) {
        case 'birth':
          return `seed ${String(data.seed ?? '').slice(0, 8)}…`;
        case 'event':
        case 'user_fact':
        case 'health':
          return data.text ?? '';
        case 'job':
          return `${data.job ?? ''}（${data.category ?? ''}）`;
        case 'override':
          return `${dict.fields[data.field] ?? data.field} = ${data.value}`;
        case 'tombstone':
          return `${dict.kinds.tombstone} ${shortSeq(data.targetSeq)}`;
        case 'rejected':
          return `${data.action ?? ''} · ${dict.codes[data.code] ?? data.code ?? ''}`;
        default:
          return '';
      }
    }

    function TimelineList(props) {
      const { facts, dict, lang } = props;
      return h(
        'ul',
        { style: { listStyle: 'none', margin: 0, padding: 0 } },
        facts.map((fact) =>
          h(
            'li',
            {
              key: String(fact.seq),
              style: {
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                padding: '8px 0',
                borderBottom: `1px solid ${C.line}`,
                fontSize: 13,
              },
            },
            h(
              'span',
              { style: { color: C.dim, fontSize: 12, minWidth: 96, whiteSpace: 'nowrap' } },
              fmtWhen(fact.at, lang),
            ),
            h(
              'span',
              { style: { color: C.dim, fontSize: 11, minWidth: 66, textTransform: 'uppercase' } },
              dict.kinds[fact.kind] ?? fact.kind,
            ),
            h('span', { style: { color: C.text, flex: 1 } }, describe(fact, dict)),
            fact.kind === 'event'
              ? h(
                  'span',
                  {
                    style: {
                      color: C.warn,
                      fontSize: 11,
                      border: `1px solid ${C.line}`,
                      borderRadius: 4,
                      padding: '0 4px',
                    },
                  },
                  dict.simulated,
                )
              : null,
            h(
              'span',
              {
                title: String(fact.seq),
                style: { color: C.dim, fontSize: 11, opacity: 0.7, minWidth: 52, textAlign: 'right' },
              },
              shortSeq(fact.seq),
            ),
          ),
        ),
      );
    }

    function Chip(props) {
      const { active, onClick, children } = props;
      return h(
        'button',
        {
          type: 'button',
          'aria-pressed': active,
          onClick,
          style: {
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 12,
            padding: '2px 9px',
            borderRadius: 999,
            border: `1px solid ${C.line}`,
            background: active ? C.layer : 'transparent',
            color: active ? C.text : C.dim,
            opacity: active ? 1 : 0.65,
          },
        },
        children,
      );
    }

    function XiaoIcon(props) {
      const size = props?.size ?? 18;
      const active = Boolean(props?.active);
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, role: 'img', 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M16 3.2a9 9 0 1 0 0 17.6 7.2 7.2 0 1 1 0-17.6Z', fill: active ? C.brand : C.dim }),
      );
    }

    function XiaoPage(props) {
      const ctx = props?.ctx;
      const lang = useLang(ctx);
      const dict = DICT[lang] ?? DICT.zh;
      const { state, reload } = useFeed('api/xiao.state');
      const [hidden, setHidden] = React.useState(() => new Set(['rejected']));

      const toggle = (kind) =>
        setHidden((current) => {
          const next = new Set(current);
          if (next.has(kind)) next.delete(kind);
          else next.add(kind);
          return next;
        });

      const header = (facts) =>
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 } },
          h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 600, color: C.text } }, dict.timeline),
          facts ? h('span', { style: { color: C.dim, fontSize: 12 } }, `${facts.length} ${dict.unit}`) : null,
          h('span', { style: { flex: 1 } }),
          h(
            'button',
            {
              type: 'button',
              onClick: reload,
              title: dict.refreshTitle,
              style: {
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 6,
                border: `1px solid ${C.line}`,
                background: 'transparent',
                color: C.dim,
              },
            },
            dict.refresh,
          ),
        );

      let body;
      if (state.status === 'loading') {
        body = h('div', { style: { color: C.dim, fontSize: 13, padding: '24px 0' } }, dict.loading);
      } else if (state.status === 'error') {
        body = h('div', { style: { color: C.error, fontSize: 13, padding: '24px 0', lineHeight: 1.7 } }, errorText(state, dict));
      } else {
        const value = state.value ?? {};
        if (!value.ready) {
          body = h('div', { style: { color: C.dim, fontSize: 13, padding: '24px 0' } }, dict.emptyChat);
        } else {
          const facts = Array.isArray(value.facts) ? value.facts : [];
          const counts = new Map();
          for (const fact of facts) counts.set(fact.kind, (counts.get(fact.kind) ?? 0) + 1);
          const kinds = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
          const visible = facts
            .filter((fact) => !hidden.has(fact.kind))
            .slice()
            .reverse()
            .slice(0, 200);

          body = h(
            'div',
            null,
            header(facts),
            h('div', { style: { color: C.dim, fontSize: 12, marginBottom: 10 } }, dict.pageHint),
            kinds.length > 1
              ? h(
                  'div',
                  { style: { display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 10px' } },
                  kinds.map((kind) =>
                    h(
                      Chip,
                      { key: kind, active: !hidden.has(kind), onClick: () => toggle(kind) },
                      `${dict.kinds[kind] ?? kind} ${counts.get(kind)}`,
                    ),
                  ),
                )
              : null,
            visible.length === 0
              ? h(
                  'div',
                  { style: { color: C.dim, fontSize: 13, padding: '12px 0' } },
                  facts.length === 0 ? dict.emptyChat : dict.emptyFiltered,
                )
              : h(
                  'div',
                  null,
                  h(
                    'div',
                    { style: { color: C.dim, fontSize: 11, marginBottom: 4 } },
                    `${dict.shown} ${visible.length} / ${dict.total} ${facts.length}`,
                  ),
                  h(TimelineList, { facts: visible, dict, lang }),
                ),
            h('div', { style: { color: C.dim, fontSize: 12, marginTop: 16 } }, dict.note),
          );
        }
      }

      return h(
        'div',
        { style: { height: '100%', overflowY: 'auto', padding: '28px 32px 40px', boxSizing: 'border-box' } },
        h('div', { style: { maxWidth: 880, margin: '0 auto' } }, body),
      );
    }

    function settingsContent(state, dict, lang) {
      if (state.status === 'loading') {
        return h('div', { style: { color: C.dim, fontSize: 13, padding: '12px 0' } }, dict.loading);
      }
      if (state.status === 'error') {
        return h('div', { style: { color: C.error, fontSize: 13, padding: '12px 0', lineHeight: 1.7 } }, errorText(state, dict));
      }
      const value = state.value ?? {};
      if (!value.ready) {
        return h('div', { style: { color: C.dim, fontSize: 13, padding: '12px 0' } }, dict.emptyChat);
      }
      const identity = value.identity ?? {};
      const traits = value.traits ?? {};
      const knows = Array.isArray(value.knows) ? value.knows : [];

      return h(
        'div',
        { key: 'body' },
        h('div', { key: 'subtitle', style: { color: C.dim, fontSize: 13, margin: '2px 0 4px' } }, dict.subtitle),
        heading('h-remembers', dict.remembers),
        knows.length === 0
          ? h('div', { key: 'knows-empty', style: { color: C.dim, fontSize: 13 } }, dict.remembersEmpty)
          : h(
              'ul',
              { key: 'knows', style: { margin: '2px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: C.text } },
              knows.map((text, index) => h('li', { key: `${index}-${String(text).slice(0, 8)}` }, text)),
            ),
        h('div', { key: 'knows-hint', style: { color: C.dim, fontSize: 12, marginTop: 6 } }, dict.remembersHint),
        heading('h-identity', dict.identity),
        row('gender', dict.fields.gender, identity.gender ?? '—'),
        row('age', dict.fields.age, String(identity.age ?? '—')),
        row('job', dict.fields.job, identity.job ?? '—'),
        row('tone', dict.fields.tone, value.tone ?? '—'),
        Number.isFinite(value.bornAt) ? row('born', dict.born, fmtWhen(value.bornAt, lang)) : null,
        heading('h-traits', dict.traits),
        row('outlook', dict.fields.outlook, traits.outlook ?? '—'),
        row('curiosity', dict.fields.curiosity, traits.curiosity ?? '—'),
        row('speech', dict.fields.speech, traits.speech ?? '—'),
        row('hobby', dict.fields.hobby, traits.hobby ?? '—'),
        row('quirk', dict.fields.quirk, traits.quirk ?? '—'),
        heading('h-card', dict.card),
        h(
          'pre',
          {
            key: 'card',
            style: {
              background: C.layer,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: '10px 12px',
              margin: '4px 0 2px',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.6,
              color: C.text,
            },
          },
          value.card || '—',
        ),
        h('div', { key: 'open-page', style: { color: C.dim, fontSize: 12, marginTop: 14 } }, dict.openPage),
        h('div', { key: 'note', style: { color: C.dim, fontSize: 12, marginTop: 6 } }, dict.note),
      );
    }

    function XiaoSection(props) {
      const ctx = props?.ctx;
      const lang = useLang(ctx);
      const dict = DICT[lang] ?? DICT.zh;
      const { state } = useFeed('api/xiao.state');
      let content;
      try {
        content = settingsContent(state, dict, lang);
      } catch (error) {
        content = errorView(error);
      }
      return h('div', { style: { padding: '2px 2px 16px', maxWidth: 720 } }, content);
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      render() {
        if (this.state.error) return errorView(this.state.error);
        return this.props?.children ?? null;
      }
    }

    function guarded(Component) {
      return (props) => h(Boundary, null, h(Component, props));
    }

    return {
      // `locale` must be declared: a Client service accessor throws without it.
      inject: ['slots', 'locale'],
      apply(ctx) {
        // Fail loud at activation rather than as a silent blank slot.
        h('div', null);

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'xiao', order: 25, label: '晓' },
            guarded((props) => h(XiaoSection, { ...props, ctx }))),
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'xiao' },
            guarded((props) => h(XiaoPage, { ...props, ctx }))),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'xiao', order: 20, label: '晓' }, XiaoIcon),
        );
      },
    };
  },
});
