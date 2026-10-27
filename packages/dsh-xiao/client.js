window.__ModuleLoader__.load({
  id: '@local/dsh-xiao',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

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

    function activeLang(ctx) {
      try {
        const snapshot = ctx?.locale?.getLocale?.();
        const active = snapshot?.active ?? '';
        if (active) return String(active).toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch (error) {
        /* fall through to the document language */
      }
      const docLang = (typeof document !== 'undefined' && document.documentElement?.lang) || 'en';
      return String(docLang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    function useLang(ctx) {
      const [lang, setLang] = React.useState(() => activeLang(ctx));
      React.useEffect(() => {
        const subscribe = ctx?.locale?.subscribe;
        if (typeof subscribe !== 'function') return undefined;
        try {
          return subscribe(() => setLang(activeLang(ctx)));
        } catch (error) {
          return undefined;
        }
      }, [ctx]);
      return lang;
    }

    function useState0(url) {
      const [state, setState] = React.useState({ status: 'loading' });
      React.useEffect(() => {
        let alive = true;
        fetch(url, { headers: { accept: 'application/json' } })
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

    const tone = {
      color: 'var(--dsw-alias-label-primary)',
      fontSize: 13,
      lineHeight: 1.55,
    };

    function Row(label, value) {
      return h(
        'div',
        { key: label, style: { display: 'flex', gap: 12, padding: '4px 0' } },
        h('span', { style: { color: 'var(--dsw-alias-label-secondary)', minWidth: 64, fontSize: 13 } }, label),
        h('span', { style: tone }, value),
      );
    }

    function XiaoSection(props) {
      const ctx = props.ctx;
      const lang = useLang(ctx);
      const dict = DICT[lang] ?? DICT.zh;
      const snapshot = useState0('/xiao/state');

      const card = {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        padding: '12px 14px',
        margin: '10px 0 18px',
        whiteSpace: 'pre-wrap',
        fontFamily: 'inherit',
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--dsw-alias-label-primary)',
      };

      const heading = (text) =>
        h(
          'h3',
          {
            key: text,
            style: {
              margin: '18px 0 6px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--dsw-alias-label-secondary)',
            },
          },
          text,
        );

      if (snapshot.status === 'loading') {
        return h('div', { style: { ...tone, color: 'var(--dsw-alias-label-secondary)', padding: 16 } }, dict.loading);
      }
      if (snapshot.status === 'error') {
        return h(
          'div',
          { style: { ...tone, color: 'var(--dsw-alias-state-error-primary)', padding: 16 } },
          `${dict.error}：${snapshot.error}`,
        );
      }

      const value = snapshot.value ?? {};
      if (!value.ready) {
        return h('div', { style: { ...tone, padding: 16 } }, dict.empty);
      }
      const identity = value.identity ?? {};
      const traits = value.traits ?? {};
      const facts = Array.isArray(value.facts) ? value.facts : [];

      return h(
        'div',
        { style: { padding: '4px 2px 24px', maxWidth: 720 } },
        h('div', { style: { ...tone, color: 'var(--dsw-alias-label-secondary)', marginBottom: 12 } }, dict.subtitle),
        heading(dict.identity),
        Row(dict.fields.gender, identity.gender ?? '—'),
        Row(dict.fields.age, String(identity.age ?? '—')),
        Row(dict.fields.job, identity.job ?? '—'),
        Row(dict.fields.tone, value.tone ?? '—'),
        heading(dict.traits),
        Row(dict.fields.outlook, traits.outlook ?? '—'),
        Row(dict.fields.curiosity, traits.curiosity ?? '—'),
        Row(dict.fields.speech, traits.speech ?? '—'),
        Row(dict.fields.hobby, traits.hobby ?? '—'),
        Row(dict.fields.quirk, traits.quirk ?? '—'),
        heading(dict.card),
        h('pre', { style: card }, value.card || '—'),
        heading(`${dict.timeline} · ${facts.length}`),
        facts.length === 0
          ? h('div', { style: { ...tone, color: 'var(--dsw-alias-label-secondary)' } }, dict.empty)
          : h(
              'ul',
              { style: { listStyle: 'none', margin: 0, padding: 0 } },
              facts
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
                        borderBottom: '1px solid var(--dsw-alias-border-l1)',
                        fontSize: 13,
                      },
                    },
                    h(
                      'span',
                      {
                        style: {
                          color: 'var(--dsw-alias-label-secondary)',
                          fontSize: 11,
                          minWidth: 72,
                          textTransform: 'uppercase',
                        },
                      },
                      dict.kinds[fact.kind] ?? fact.kind,
                    ),
                    h('span', { style: { ...tone, flex: 1 } }, describe(fact)),
                    fact.kind === 'event'
                      ? h(
                          'span',
                          {
                            style: {
                              color: 'var(--dsw-alias-state-warn-primary)',
                              fontSize: 11,
                              border: '1px solid var(--dsw-alias-border-l1)',
                              borderRadius: 4,
                              padding: '0 4px',
                            },
                          },
                          dict.simulated,
                        )
                      : null,
                  ),
                ),
            ),
        h('div', { style: { ...tone, color: 'var(--dsw-alias-label-secondary)', marginTop: 14, fontSize: 12 } }, dict.note),
      );
    }

    function describe(fact) {
      const data = fact?.data ?? {};
      switch (fact?.kind) {
        case 'birth':
          return `seed ${String(data.seed ?? '').slice(0, 8)}…`;
        case 'event':
          return data.text ?? '';
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

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'xiao', order: 25, label: '晓' },
            (props) => h(XiaoSection, { ...props, ctx }),
          ),
        );
      },
    };
  },
});
