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
        timeline: '事实时间线',
        empty: '还没有任何事件。',
        loading: '读取中…',
        error: '读取失败',
        simulated: '模拟',
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
      },
      en: {
        subtitle: 'A persistent character derived from one seed, changing only by rule',
        identity: 'Identity',
        traits: 'Traits',
        card: 'Text injected into the prompt',
        timeline: 'Fact timeline',
        empty: 'No events yet.',
        loading: 'Loading…',
        error: 'Failed to load',
        simulated: 'simulated',
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
      },
    };

    const C = {
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      line: 'var(--dsw-alias-border-l1)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
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

    function useSnapshot(url) {
      const [state, setState] = React.useState({ status: 'loading' });
      React.useEffect(() => {
        let alive = true;
        // Diagnostic marker: the host counts page-originated requests with it.
        const headers = { accept: 'application/json', 'x-xiao-client': 'settings' };
        fetch(`${url}?ping=mount`, { headers }).catch(() => {});
        fetch(url, { headers })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((value) => {
            if (alive) setState({ status: 'ready', value });
          })
          .catch((error) => {
            if (alive) setState({ status: 'error', error: String(error?.message ?? error) });
          });
        return () => {
          alive = false;
        };
      }, [url]);
      return state;
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
            margin: '12px 0 2px',
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

    function describe(fact) {
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
          return `${data.field} = ${data.value}`;
        case 'tombstone':
          return `seq ${data.targetSeq}`;
        case 'rejected':
          return `${data.action ?? ''} · ${data.code ?? ''}`;
        default:
          return '';
      }
    }

    function contentOf(snapshot, dict) {
      if (snapshot.status === 'loading') {
        return h('div', { style: { color: C.dim, fontSize: 13, padding: '12px 0' } }, dict.loading);
      }
      if (snapshot.status === 'error') {
        return h('div', { style: { color: C.error, fontSize: 13, padding: '12px 0' } }, `${dict.error}：${snapshot.error}`);
      }
      const value = snapshot.value ?? {};
      if (!value.ready) {
        return h('div', { style: { color: C.dim, fontSize: 13, padding: '12px 0' } }, dict.empty);
      }
      const identity = value.identity ?? {};
      const traits = value.traits ?? {};
      const facts = Array.isArray(value.facts) ? value.facts : [];

      const children = [
        h('div', { key: 'subtitle', style: { color: C.dim, fontSize: 13, margin: '2px 0 4px' } }, dict.subtitle),
        heading('h-identity', dict.identity),
        row('gender', dict.fields.gender, identity.gender ?? '—'),
        row('age', dict.fields.age, String(identity.age ?? '—')),
        row('job', dict.fields.job, identity.job ?? '—'),
        row('tone', dict.fields.tone, value.tone ?? '—'),
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
              background: 'var(--dsw-alias-bg-layer-1)',
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
        heading('h-timeline', `${dict.timeline} · ${facts.length}`),
      ];

      if (facts.length === 0) {
        children.push(h('div', { key: 'empty', style: { color: C.dim, fontSize: 13 } }, dict.empty));
      } else {
        const items = facts
          .slice()
          .reverse()
          .slice(0, 40)
          .map((fact) =>
            h(
              'li',
              {
                key: String(fact.seq),
                style: {
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  padding: '6px 0',
                  borderBottom: `1px solid ${C.line}`,
                  fontSize: 13,
                },
              },
              h(
                'span',
                { style: { color: C.dim, fontSize: 11, minWidth: 72, textTransform: 'uppercase' } },
                dict.kinds[fact.kind] ?? fact.kind,
              ),
              h('span', { style: { color: C.text, flex: 1 } }, describe(fact)),
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
            ),
          );
        children.push(h('ul', { key: 'facts', style: { listStyle: 'none', margin: 0, padding: 0 } }, items));
      }

      children.push(h('div', { key: 'note', style: { color: C.dim, fontSize: 12, marginTop: 10 } }, dict.note));
      return h('div', { key: 'body' }, children);
    }

    function XiaoSection(props) {
      const ctx = props?.ctx;
      const lang = useLang(ctx);
      const dict = DICT[lang] ?? DICT.zh;
      const snapshot = useSnapshot('/xiao/state');
      let content;
      try {
        content = contentOf(snapshot, dict);
      } catch (error) {
        content = errorView(error);
      }
      return h(
        'div',
        { style: { padding: '2px 2px 16px', maxWidth: 720 } },
        h('div', { style: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 } }, '晓 · dsh-xiao'),
        content,
      );
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

    return {
      // `locale` must be declared: a Client service accessor throws without it.
      inject: ['slots', 'locale'],
      apply(ctx) {
        // Fail loud at activation rather than as a silent blank slot.
        h('div', null);
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'xiao', order: 25, label: '晓' }, (props) =>
            h(Boundary, null, h(XiaoSection, { ...props, ctx })),
          ),
        );
      },
    };
  },
});
