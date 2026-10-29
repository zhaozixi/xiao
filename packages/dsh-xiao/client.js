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
        viewTimeline: '时间线',
        viewBrain: '记忆脑图',
        brainHint: '拖动旋转，滚轮缩放，点节点看名称。连线＝她是因什么把这两件事联系起来的。',
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
        loadOlder: '加载更早',
        loadingOlder: '加载中…',
        allDays: '全部',
        searchPlaceholder: '搜索事实内容…',
        guardRejected: '守卫拦截',
        toolRejected: '工具拒绝',
        born: '出生于',
        openPage: '事实时间线在左侧栏的「晓」页面。',
        note: '这里只读。改状态要通过对话里的 xiao_update 工具。',
        resetOpen: '重置晓…',
        resetWarning:
          '这会清空全部事实、她记住的事和「已见面」标记，然后重新随机性别、年龄、职业、性格。不可撤销。已经说过的对话不会被删除。现在什么都还没发生——要真的重置，请点下面的「确认重置」。',
        resetConfirm: '确认重置',
        resetCancel: '取消',
        resetWorking: '重置中…',
        resetDone: '已重置，新的晓已经出现。',
        resetAgain: '再重置一次',
        resetFailed: '重置失败',
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
          birthDate: '出生日期',
          birthCity: '出生地',
          currentCity: '现居',
          home: '住处',
          work: '工作地点',
          commute: '通勤',
          nearby: '附近常去',
        },
        places: '住处与路线',
        research: '最近自己查的事',
        researchEmpty: '还没有查过什么。',
        memory: '记忆',
        disputedLabel: '存疑',
        expiredLabel: '已淡出',
        blocksLabel: '本次注入',
        relations: '身边的人',
        interests: '兴趣',
        nowTitle: '此刻',
        dayTitle: '今天的安排',
        history: '大事记',
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
        viewTimeline: 'Timeline',
        viewBrain: 'Memory brain',
        brainHint: 'Drag to rotate, scroll to zoom, click a node for its name. Lines show why two things belong together.',
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
        loadOlder: 'Load older',
        loadingOlder: 'Loading…',
        allDays: 'All',
        searchPlaceholder: 'Search facts…',
        guardRejected: 'blocked by guard',
        toolRejected: 'refused by tool',
        born: 'Born',
        openPage: 'The fact timeline lives on the 晓 panel in the left sidebar.',
        note: 'Read-only. State changes go through the xiao_update tool in chat.',
        resetOpen: 'Reset 晓…',
        resetWarning:
          'This erases every fact, everything she remembers and the first-meeting marker, then rolls a new gender, age, job and personality. Irreversible. Messages already written are not deleted.',
        resetConfirm: 'Reset her',
        resetCancel: 'Cancel',
        resetWorking: 'Resetting…',
        resetDone: 'Reset done. A new 晓 is here.',
        resetAgain: 'Reset again',
        resetFailed: 'Reset failed',
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
          birthDate: 'Born on',
          birthCity: 'Birthplace',
          currentCity: 'Lives in',
          home: 'Home',
          work: 'Workplace',
          commute: 'Commute',
          nearby: 'Around home',
        },
        places: 'Home and route',
        research: 'Looked up on her own',
        researchEmpty: 'Nothing looked up yet.',
        memory: 'Memory',
        disputedLabel: 'In doubt',
        expiredLabel: 'Faded',
        blocksLabel: 'Injected',
        relations: 'People around her',
        interests: 'Interests',
        nowTitle: 'Right now',
        dayTitle: 'Today',
        history: 'Life so far',
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
      base: 'var(--dsw-alias-bg-base)',
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

    const DAY_MS = 86_400_000;
    const PREFS_KEY = 'dsh-xiao.timeline';

    /** The page remembers what you were looking at, for this browser session only. */
    function readPrefs() {
      try {
        if (typeof sessionStorage === 'undefined') return {};
        const raw = sessionStorage.getItem(PREFS_KEY);
        return raw ? JSON.parse(raw) ?? {} : {};
      } catch (error) {
        return {};
      }
    }

    function writePrefs(prefs) {
      try {
        if (typeof sessionStorage === 'undefined') return;
        sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch (error) {
        /* storage is best-effort */
      }
    }

    function startOfDay(ms) {
      const date = new Date(ms);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }

    function dayKey(ms) {
      const date = new Date(ms);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function clock(ms) {
      const date = new Date(ms);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    /** Day label: today / yesterday / a date. The clock time lives on each row. */
    function dayTitle(ms, lang) {
      const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY_MS);
      if (days === 0) return lang === 'zh' ? '今天' : 'Today';
      if (days === 1) return lang === 'zh' ? '昨天' : 'Yesterday';
      const date = new Date(ms);
      const md = `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
      return days < 365 ? md : `${date.getFullYear()}-${md}`;
    }

    function shortSeq(seq) {
      return `#${String(seq).slice(-5)}`;
    }

    /** Minutes from midnight as HH:MM. */
    function hhmm(minutes) {
      const value = Number(minutes);
      if (!Number.isFinite(value)) return '—';
      const hour = String(Math.floor(value / 60) % 24).padStart(2, '0');
      const minute = String(value % 60).padStart(2, '0');
      return `${hour}:${minute}`;
    }

    function snippet(fact, dict) {
      const data = fact?.data ?? {};
      switch (fact?.kind) {
        case 'event':
        case 'user_fact':
        case 'health':
          return String(data.text ?? '').slice(0, 24);
        case 'job':
          return String(data.job ?? '');
        case 'override':
          return `${dict.fields[data.field] ?? data.field}=${data.value}`;
        case 'birth':
          return dict.kinds.birth;
        default:
          return String(fact?.kind ?? '');
      }
    }

    function describe(fact, dict, bySeq) {
      const data = fact?.data ?? {};
      switch (fact?.kind) {
        case 'birth':
          return '—';
        case 'event':
        case 'user_fact':
        case 'health':
          return data.text ?? '';
        case 'job':
          return `${data.job ?? ''}（${data.category ?? ''}）`;
        case 'override':
          return `${dict.fields[data.field] ?? data.field} = ${data.value}`;
        case 'tombstone': {
          const target = bySeq?.get(data.targetSeq);
          if (!target || target.kind === 'tombstone') return shortSeq(data.targetSeq);
          return `${dict.kinds[target.kind] ?? target.kind}「${snippet(target, dict)}」`;
        }
        case 'rejected':
          return `${data.action ?? ''} · ${dict.codes[data.code] ?? data.code ?? ''}`;
        default:
          return '';
      }
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

    function TimelineList(props) {
      const { facts, dict, bySeq } = props;
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
                gap: 10,
                alignItems: 'baseline',
                padding: '7px 0',
                borderBottom: `1px solid ${C.line}`,
                fontSize: 13,
              },
            },
            h('span', { style: { color: C.dim, fontSize: 11, minWidth: 34 } }, clock(fact.at)),
            h(
              'span',
              { style: { color: C.dim, fontSize: 11, minWidth: 62, textTransform: 'uppercase' } },
              dict.kinds[fact.kind] ?? fact.kind,
            ),
            h(
              'span',
              {
                title: fact.kind === 'birth' ? `seed ${fact?.data?.seed ?? ''}` : undefined,
                style: { color: C.text, flex: 1 },
              },
              describe(fact, dict, bySeq),
            ),
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
            fact.kind === 'rejected'
              ? h(
                  'span',
                  { style: { color: C.dim, fontSize: 11 } },
                  fact.source === 'guard' ? dict.guardRejected : dict.toolRejected,
                )
              : null,
            h(
              'span',
              {
                title: String(fact.seq),
                style: { color: C.dim, fontSize: 11, opacity: 0.7, minWidth: 46, textAlign: 'right' },
              },
              shortSeq(fact.seq),
            ),
          ),
        ),
      );
    }

    function Chip(props) {
      const { active, onClick, children, title } = props;
      return h(
        'button',
        {
          type: 'button',
          title,
          'aria-pressed': active,
          onClick,
          style: {
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 12,
            padding: '2px 9px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
            border: `1px solid ${C.line}`,
            background: active ? C.layer : 'transparent',
            color: active ? C.text : C.dim,
            opacity: active ? 1 : 0.65,
          },
        },
        children,
      );
    }

    // -----------------------------------------------------------------------
    // Memory brain: a 3D force graph drawn on a plain canvas.
    //
    // No library: the projection, the simulation and the drawing are ~200 lines.
    // Nodes are what she knows; edges are why the pieces belong together (a person
    // mentioned in an event, an interest behind a search, a city where something
    // happened). It is the same data the prompt uses, laid out spatially.
    // -----------------------------------------------------------------------

    const BRAIN_COLORS = {
      self: '#d9a441',
      family: '#4ea1d3',
      friend: '#5bc0a5',
      partner: '#e07a8b',
      child: '#c98bd9',
      work: '#8a9bb8',
      interest: '#7bb36b',
      place: '#b98c5a',
      user_fact: '#4d7ea8',
      event: '#6f8a9c',
      job: '#d98c4a',
      research: '#9b8ad3',
      other: '#7a7a7a',
    };

    /** Build the graph: nodes with an initial position on a sphere, edges by association. */
    function buildBrain(value) {
      const nodes = [];
      const edges = [];
      const byId = new Map();
      const add = (node) => {
        const entry = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 3, ...node };
        if (byId.has(entry.id)) return byId.get(entry.id);
        byId.set(entry.id, entry);
        nodes.push(entry);
        return entry;
      };
      const link = (a, b, kind = 'soft') => {
        if (!a || !b || a === b) return;
        edges.push({ a, b, kind });
      };

      const self = add({ id: 'self', label: '晓', group: 'self', r: 11, hub: true });

      for (const relation of value?.relations ?? []) {
        add({ id: `rel:${relation.id ?? relation.name}`, label: relation.name, group: relation.kind ?? 'other', r: 7, hub: true });
      }
      for (const interest of value?.interests ?? []) {
        add({ id: `int:${interest}`, label: interest, group: 'interest', r: 5, hub: true });
      }
      const places = value?.places ?? {};
      if (places.home?.area) add({ id: 'place:home', label: places.home.area, group: 'place', r: 5, hub: true });
      if (places.work?.name) add({ id: 'place:work', label: places.work.name, group: 'place', r: 5 });
      for (const spot of places.nearby ?? []) add({ id: `spot:${spot}`, label: spot, group: 'place', r: 4 });

      // Facts: the memory itself. Only the ones that carry text are worth a node.
      const facts = (value?.facts ?? []).slice(-120);
      for (const fact of facts) {
        const data = fact?.data ?? {};
        let label = '';
        if (fact.kind === 'user_fact' || fact.kind === 'health' || fact.kind === 'event') label = String(data.text ?? '');
        else if (fact.kind === 'job') label = String(data.job ?? '');
        else if (fact.kind === 'override' && data.field === 'city') label = `搬到${data.value}`;
        else if (fact.kind === 'override' && data.field === 'nearby') label = String(data.value ?? '');
        if (!label) continue;
        add({ id: `fact:${fact.seq}`, label, group: fact.kind === 'event' ? 'event' : fact.kind === 'job' ? 'job' : 'user_fact', r: 3.5, at: fact.at });
      }
      for (const note of value?.research ?? []) {
        add({ id: `note:${note.at}`, label: String(note.query ?? ''), group: 'research', r: 3.5, at: note.at });
      }

      for (const node of nodes) {
        if (node.group === 'self') continue;
        link(self, node, 'anchor');
      }

      // Association edges: a sentence that mentions a person, a city or an interest is
      // connected to it. This is what makes the picture look like a brain rather than a
      // list of dots: the same name pulls several memories towards one node.
      const named = nodes.filter((node) => ['family', 'friend', 'partner', 'child', 'work'].includes(node.group));
      const placeNodes = nodes.filter((node) => node.group === 'place');
      const interestNodes = nodes.filter((node) => node.group === 'interest');
      const city = String(places.home?.city ?? '');
      for (const node of nodes) {
        if (node.group !== 'event' && node.group !== 'user_fact' && node.group !== 'research') continue;
        const text = node.label;
        for (const person of named) if (person.label && text.includes(person.label)) link(node, person, 'mention');
        for (const spot of placeNodes) if (spot.label && text.includes(spot.label)) link(node, spot, 'mention');
        if (city && text.includes(city)) {
          const home = byId.get('place:home');
          if (home) link(node, home, 'mention');
        }
        for (const interest of interestNodes) if (interest.label && text.includes(interest.label)) link(node, interest, 'mention');
      }

      // A small deterministic puff so the initial layout is not a straight line.
      let seed = 2166136261;
      const rand = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return ((seed >>> 0) % 1000) / 1000;
      };
      for (const node of nodes) {
        const theta = rand() * Math.PI * 2;
        const phi = Math.acos(2 * rand() - 1);
        const radius = node.group === 'self' ? 0 : 60 + rand() * 90;
        node.x = Math.sin(phi) * Math.cos(theta) * radius;
        node.y = Math.cos(phi) * radius * 0.8;
        node.z = Math.sin(phi) * Math.sin(theta) * radius;
      }
      return { nodes, edges };
    }

    /** One step of the 3D force layout: repel everything, pull along edges, stay centred. */
    function stepBrain(graph) {
      const { nodes, edges } = graph;
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dz = a.z - b.z;
          let distance = dx * dx + dy * dy + dz * dz;
          if (distance < 1) distance = 1;
          if (distance > 40000) continue;
          const force = 320 / distance;
          const length = Math.sqrt(distance);
          dx /= length;
          dy /= length;
          dz /= length;
          a.vx += dx * force;
          a.vy += dy * force;
          a.vz += dz * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
          b.vz -= dz * force;
        }
      }
      for (const edge of edges) {
        const dx = edge.b.x - edge.a.x;
        const dy = edge.b.y - edge.a.y;
        const dz = edge.b.z - edge.a.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const target = edge.kind === 'anchor' ? 95 : 55;
        const pull = (length - target) * (edge.kind === 'anchor' ? 0.02 : 0.012);
        const ux = (dx / length) * pull;
        const uy = (dy / length) * pull;
        const uz = (dz / length) * pull;
        if (!edge.a.hub || edge.a.group !== 'self') {
          edge.a.vx += ux;
          edge.a.vy += uy;
          edge.a.vz += uz;
        }
        edge.b.vx -= ux;
        edge.b.vy -= uy;
        edge.b.vz -= uz;
      }
      for (const node of nodes) {
        if (node.group === 'self') {
          node.vx = 0;
          node.vy = 0;
          node.vz = 0;
          node.x = 0;
          node.y = 0;
          node.z = 0;
          continue;
        }
        node.vx *= 0.82;
        node.vy *= 0.82;
        node.vz *= 0.82;
        node.x += node.vx * 0.35;
        node.y += node.vy * 0.35;
        node.z += node.vz * 0.35;
      }
    }

    function MemoryBrain(props) {
      const { graph, dict } = props;
      const canvasRef = React.useRef(null);
      const viewRef = React.useRef({ yaw: 0.55, pitch: -0.22, zoom: 1, dragging: false, lastX: 0, lastY: 0, settle: 320, hover: null, selected: null });
      const [selected, setSelected] = React.useState(null);

      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || typeof canvas.getContext !== 'function') return undefined;
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        let frame = 0;
        let width = 0;
        let height = 0;

        const resize = () => {
          const ratio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
          const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 640, height: 420 };
          width = Math.max(240, Math.round(rect.width));
          height = Math.max(220, Math.round(rect.height));
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };
        resize();
        const onResize = () => resize();
        if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onResize);

        const draw = () => {
          const view = viewRef.current;
          if (view.settle > 0) {
            stepBrain(graph);
            view.settle -= 1;
          }
          if (!view.dragging) view.yaw += 0.0022;
          context.clearRect(0, 0, width, height);
          const cx = width / 2;
          const cy = height / 2;
          const cosYaw = Math.cos(view.yaw);
          const sinYaw = Math.sin(view.yaw);
          const cosPitch = Math.cos(view.pitch);
          const sinPitch = Math.sin(view.pitch);
          const focal = Math.min(width, height) * 1.15;
          const zoom = view.zoom;

          const project = (node) => {
            const x1 = node.x * cosYaw - node.z * sinYaw;
            const z1 = node.x * sinYaw + node.z * cosYaw;
            const y2 = node.y * cosPitch - z1 * sinPitch;
            const z2 = node.y * sinPitch + z1 * cosPitch;
            const depth = z2 + 340;
            const scale = focal / Math.max(60, depth);
            return {
              sx: cx + x1 * scale * zoom,
              sy: cy + y2 * scale * zoom,
              scale: scale * zoom,
              depth: z2,
              visible: depth > 40,
            };
          };

          const projected = new Map();
          for (const node of graph.nodes) projected.set(node, project(node));

          context.lineWidth = 1;
          for (const edge of graph.edges) {
            const a = projected.get(edge.a);
            const b = projected.get(edge.b);
            if (!a || !b || !a.visible || !b.visible) continue;
            const depth = (a.depth + b.depth) / 2;
            const alpha = Math.max(0.03, Math.min(0.42, 0.32 - depth / 2400));
            context.strokeStyle = edge.kind === 'mention' ? `rgba(120, 170, 200, ${alpha + 0.08})` : `rgba(150, 150, 150, ${alpha})`;
            context.beginPath();
            context.moveTo(a.sx, a.sy);
            context.lineTo(b.sx, b.sy);
            context.stroke();
          }

          const ordered = [...graph.nodes].sort((x, y) => (projected.get(x)?.depth ?? 0) - (projected.get(y)?.depth ?? 0));
          for (const node of ordered) {
            const point = projected.get(node);
            if (!point || !point.visible) continue;
            const radius = Math.max(1.6, node.r * point.scale * 1.35);
            const isSelected = view.selected === node.id;
            context.globalAlpha = Math.max(0.35, Math.min(1, 0.95 - point.depth / 3000));
            context.beginPath();
            context.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
            context.fillStyle = BRAIN_COLORS[node.group] ?? BRAIN_COLORS.other;
            context.fill();
            if (isSelected) {
              context.lineWidth = 2;
              context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
              context.stroke();
            }
            if (node.hub || isSelected) {
              context.globalAlpha = 1;
              context.fillStyle = 'rgba(230, 230, 230, 0.85)';
              context.font = '11px system-ui, sans-serif';
              context.fillText(node.label.slice(0, 18), point.sx + radius + 3, point.sy + 3);
            }
          }
          context.globalAlpha = 1;
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);

        const hit = (clientX, clientY) => {
          const view = viewRef.current;
          const rect = canvas.getBoundingClientRect();
          const cx = width / 2;
          const cy = height / 2;
          const cosYaw = Math.cos(view.yaw);
          const sinYaw = Math.sin(view.yaw);
          const cosPitch = Math.cos(view.pitch);
          const sinPitch = Math.sin(view.pitch);
          const focal = Math.min(width, height) * 1.15;
          let best = null;
          let bestDistance = 18;
          for (const node of graph.nodes) {
            const x1 = node.x * cosYaw - node.z * sinYaw;
            const z1 = node.x * sinYaw + node.z * cosYaw;
            const y2 = node.y * cosPitch - z1 * sinPitch;
            const z2 = node.y * sinPitch + z1 * cosPitch;
            const scale = focal / Math.max(60, z2 + 340);
            const sx = cx + x1 * scale * view.zoom;
            const sy = cy + y2 * scale * view.zoom;
            const distance = Math.hypot(sx - (clientX - rect.left), sy - (clientY - rect.top));
            if (distance < bestDistance) {
              bestDistance = distance;
              best = node;
            }
          }
          view.selected = best?.id ?? null;
          setSelected(best ?? null);
        };

        const onDown = (event) => {
          const view = viewRef.current;
          view.dragging = true;
          view.lastX = event.clientX;
          view.lastY = event.clientY;
        };
        const onMove = (event) => {
          const view = viewRef.current;
          if (!view.dragging) return;
          view.yaw += (event.clientX - view.lastX) * 0.008;
          view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + (event.clientY - view.lastY) * 0.006));
          view.lastX = event.clientX;
          view.lastY = event.clientY;
        };
        const onUp = () => {
          viewRef.current.dragging = false;
        };
        const onWheel = (event) => {
          event.preventDefault();
          const view = viewRef.current;
          view.zoom = Math.max(0.4, Math.min(2.6, view.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
        };
        const onClick = (event) => hit(event.clientX, event.clientY);

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointerleave', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('click', onClick);

        return () => {
          cancelAnimationFrame(frame);
          if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onResize);
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('pointerup', onUp);
          canvas.removeEventListener('pointerleave', onUp);
          canvas.removeEventListener('wheel', onWheel);
          canvas.removeEventListener('click', onClick);
        };
      }, [graph]);

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('canvas', {
          ref: canvasRef,
          style: {
            width: '100%',
            height: 420,
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            background: 'radial-gradient(circle at 30% 20%, rgba(60,70,90,0.35), rgba(12,14,18,0.9))',
            touchAction: 'none',
            cursor: 'grab',
          },
        }),
        h(
          'div',
          { style: { display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12, color: C.dim } },
          h('span', null, dict.brainHint),
          selected
            ? h('span', { style: { color: C.text } }, `${selected.label} · ${dict.kinds?.[selected.group] ?? selected.group}`)
            : null,
        ),
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
      const [older, setOlder] = React.useState([]);
      const [loadingOlder, setLoadingOlder] = React.useState(false);
      const prefs = React.useMemo(readPrefs, []);
      const [hidden, setHidden] = React.useState(
        () => new Set(Array.isArray(prefs.hidden) ? prefs.hidden : ['rejected']),
      );
      const [dayFilter, setDayFilter] = React.useState(prefs.day ?? null);
      const [search, setSearch] = React.useState(prefs.search ?? '');

      React.useEffect(() => {
        writePrefs({ hidden: [...hidden], day: dayFilter, search, view });
      }, [hidden, dayFilter, search, view]);

      // A fresh read supersedes every older page that was loaded.
      const readRevision = state.status === 'ready' ? state.value : null;
      React.useEffect(() => {
        setOlder([]);
      }, [readRevision]);

      const value = state.status === 'ready' ? state.value ?? {} : null;
      const [view, setView] = React.useState(prefs.view === 'brain' ? 'brain' : 'timeline');
      const facts = React.useMemo(() => {
        const map = new Map();
        for (const fact of value?.facts ?? []) map.set(fact.seq, fact);
        for (const fact of older) if (!map.has(fact.seq)) map.set(fact.seq, fact);
        return [...map.values()].sort((a, b) => a.seq - b.seq);
      }, [value, older]);
      // The brain is built from the same payload the timeline uses; facts beyond the first
      // page are added as they load, so the picture grows with the list.
      const graph = React.useMemo(() => buildBrain({ ...(value ?? {}), facts }), [value, facts]);

      const bySeq = React.useMemo(() => new Map(facts.map((fact) => [fact.seq, fact])), [facts]);
      const total = Number.isFinite(value?.factsTotal) ? value.factsTotal : facts.length;
      const hasMore = facts.length < total;

      const loadOlder = () => {
        if (loadingOlder || facts.length === 0) return;
        setLoadingOlder(true);
        fetch(`api/xiao.state?before=${facts[0].seq}&limit=200`, {
          headers: { accept: 'application/json', 'x-xiao-client': 'settings' },
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((page) => {
            if (Array.isArray(page.facts) && page.facts.length > 0) setOlder((current) => [...page.facts, ...current]);
          })
          .catch(() => {})
          .then(() => setLoadingOlder(false));
      };

      const toggleKind = (kind) =>
        setHidden((current) => {
          const next = new Set(current);
          if (next.has(kind)) next.delete(kind);
          else next.add(kind);
          return next;
        });

      let body;
      if (state.status === 'loading') {
        body = h('div', { style: { color: C.dim, fontSize: 13, padding: '24px 0' } }, dict.loading);
      } else if (state.status === 'error') {
        body = h('div', { style: { color: C.error, fontSize: 13, padding: '24px 0', lineHeight: 1.7 } }, errorText(state, dict));
      } else if (!value?.ready) {
        body = h('div', { style: { color: C.dim, fontSize: 13, padding: '24px 0' } }, dict.emptyChat);
      } else {
        const kindCounts = new Map();
        for (const fact of facts) kindCounts.set(fact.kind, (kindCounts.get(fact.kind) ?? 0) + 1);
        const kinds = [...kindCounts.keys()].sort((a, b) => kindCounts.get(b) - kindCounts.get(a));

        const dayCounts = new Map();
        for (const fact of facts) {
          const key = dayKey(fact.at);
          dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
        }
        const days = [...dayCounts.keys()].sort().slice(-30);

        const needle = search.trim().toLowerCase();
        const visible = facts
          .filter((fact) => !hidden.has(fact.kind))
          .filter((fact) => !dayFilter || dayKey(fact.at) === dayFilter)
          .filter((fact) => {
            if (!needle) return true;
            const text = `${describe(fact, dict, bySeq)} ${dict.kinds[fact.kind] ?? fact.kind}`;
            return text.toLowerCase().includes(needle);
          })
          .slice()
          .reverse();

        const groups = [];
        for (const fact of visible) {
          const key = dayKey(fact.at);
          const last = groups[groups.length - 1];
          if (!last || last.key !== key) groups.push({ key, at: fact.at, facts: [fact] });
          else last.facts.push(fact);
        }

        body = h(
          'div',
          null,
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 } },
            h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 600, color: C.text } }, dict.timeline),
            h('span', { style: { color: C.dim, fontSize: 12 } }, `${total} ${dict.unit}`),
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
          ),
          h('div', { style: { color: C.dim, fontSize: 12, marginBottom: 10 } }, dict.pageHint),
          h(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '0 0 8px' } },
            h('input', {
              type: 'search',
              value: search,
              onChange: (event) => setSearch(event.target.value),
              placeholder: dict.searchPlaceholder,
              'aria-label': dict.searchPlaceholder,
              style: {
                flex: '0 1 240px',
                font: 'inherit',
                fontSize: 12,
                padding: '3px 8px',
                borderRadius: 6,
                border: `1px solid ${C.line}`,
                background: 'transparent',
                color: C.text,
              },
            }),
            kinds.length > 1
              ? kinds.map((kind) =>
                  h(
                    Chip,
                    { key: kind, active: !hidden.has(kind), onClick: () => toggleKind(kind) },
                    `${dict.kinds[kind] ?? kind} ${kindCounts.get(kind)}`,
                  ),
                )
              : null,
          ),
          days.length > 1
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    gap: 6,
                    overflowX: 'auto',
                    paddingBottom: 6,
                    marginBottom: 10,
                    borderBottom: `1px solid ${C.line}`,
                  },
                },
                h(Chip, { key: 'all', active: !dayFilter, onClick: () => setDayFilter(null) }, dict.allDays),
                days.map((key) =>
                  h(
                    Chip,
                    {
                      key,
                      active: dayFilter === key,
                      title: key,
                      onClick: () => setDayFilter(dayFilter === key ? null : key),
                    },
                    `${key.slice(5)} · ${dayCounts.get(key)}`,
                  ),
                ),
              )
            : null,
          h(
            'div',
            { style: { color: C.dim, fontSize: 11, marginBottom: 4 } },
            `${dict.shown} ${visible.length} / ${dict.total} ${facts.length}`,
          ),
          groups.length === 0
            ? h(
                'div',
                { style: { color: C.dim, fontSize: 13, padding: '16px 0' } },
                facts.length === 0 ? dict.emptyChat : dict.emptyFiltered,
              )
            : h(
                'div',
                null,
                groups.map((group) =>
                  h(
                    'div',
                    { key: group.key },
                    h(
                      'div',
                      {
                        style: {
                          position: 'sticky',
                          top: 0,
                          zIndex: 1,
                          display: 'flex',
                          gap: 8,
                          alignItems: 'baseline',
                          padding: '8px 0 6px',
                          background: C.base,
                          borderBottom: `1px solid ${C.line}`,
                        },
                      },
                      h('span', { style: { fontSize: 12, fontWeight: 600, color: C.text } }, dayTitle(group.at, lang)),
                      h('span', { style: { fontSize: 11, color: C.dim } }, String(group.facts.length)),
                    ),
                    h(TimelineList, { facts: group.facts, dict, bySeq }),
                  ),
                ),
              ),
          hasMore
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: loadOlder,
                  disabled: loadingOlder,
                  style: {
                    marginTop: 14,
                    cursor: loadingOlder ? 'default' : 'pointer',
                    font: 'inherit',
                    fontSize: 12,
                    padding: '5px 14px',
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: 'transparent',
                    color: C.dim,
                    opacity: loadingOlder ? 0.6 : 1,
                  },
                },
                loadingOlder ? dict.loadingOlder : dict.loadOlder,
              )
            : null,
          h('div', { style: { color: C.dim, fontSize: 12, marginTop: 16 } }, dict.note),
        );
      }

      return h(
        'div',
        { style: { height: '100%', overflowY: 'auto', padding: '28px 32px 40px', boxSizing: 'border-box' } },
        h(
          'div',
          { style: { maxWidth: 880, margin: '0 auto' } },
          h(
            'div',
            { style: { display: 'flex', gap: 6, marginBottom: 12 } },
            h(
              'button',
              {
                type: 'button',
                onClick: () => setView('timeline'),
                style: {
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: `1px solid ${C.line}`,
                  background: view === 'timeline' ? C.layer : 'transparent',
                  color: view === 'timeline' ? C.text : C.dim,
                },
              },
              dict.viewTimeline,
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => setView('brain'),
                style: {
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: `1px solid ${C.line}`,
                  background: view === 'brain' ? C.layer : 'transparent',
                  color: view === 'brain' ? C.text : C.dim,
                },
              },
              dict.viewBrain,
            ),
          ),
          view === 'brain' && value?.ready
            ? h('div', { key: 'brain' }, h('h2', { style: { margin: '0 0 10px', fontSize: 18, fontWeight: 600, color: C.text } }, dict.viewBrain), h(MemoryBrain, { graph, dict }))
            : body,
        ),
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
      const places = value.places ?? {};

      return h(
        'div',
        { key: 'body' },
        h('div', { key: 'subtitle', style: { color: C.dim, fontSize: 13, margin: '2px 0 4px' } }, dict.subtitle),
        h(
          'div',
          {
            key: 'now',
            style: {
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              padding: '8px 12px',
              margin: '6px 0 10px',
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              background: C.layer,
              fontSize: 13,
              color: C.text,
            },
          },
          h('span', { style: { color: C.dim, fontSize: 12, minWidth: 34 } }, dict.nowTitle),
          h('span', null, `${value.now?.label ?? '—'} · ${value.now?.text ?? '—'}`),
        ),
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
        row('birthDate', dict.fields.birthDate, identity.birthDate ?? '—'),
        row('birthCity', dict.fields.birthCity, identity.birthCity ?? '—'),
        row('currentCity', dict.fields.currentCity, identity.currentCity ?? '—'),
        row('job', dict.fields.job, identity.job ?? '—'),
        row('tone', dict.fields.tone, value.tone ?? '—'),
        heading('h-places', dict.places),
        row(
          'home',
          dict.fields.home,
          `${places.home?.city ?? ''}${places.home?.area ? ` · ${places.home.area}` : ''}${places.home?.detail ? ` · ${places.home.detail}` : ''}` || '—',
        ),
        row(
          'work',
          dict.fields.work,
          `${places.work?.name ?? ''}${places.work?.area ? `（${places.work.area}）` : ''}` || '—',
        ),
        row('commute', dict.fields.commute, places.commute || '—'),
        row('nearby', dict.fields.nearby, Array.isArray(places.nearby) ? places.nearby.join('、') || '—' : '—'),
        heading('h-relations', dict.relations),
        Array.isArray(value.relations) && value.relations.length > 0
          ? h(
              'ul',
              { key: 'relations', style: { margin: '2px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: C.text } },
              value.relations.map((relation) =>
                h(
                  'li',
                  { key: relation.id ?? relation.name },
                  `${relation.name}（${relation.role}）${relation.detail ? ` — ${relation.detail}` : ''}`,
                ),
              ),
            )
          : h('div', { key: 'relations-empty', style: { color: C.dim, fontSize: 13 } }, '—'),
        heading('h-interests', dict.interests),
        Array.isArray(value.interests) && value.interests.length > 0
          ? h(
              'ul',
              { key: 'interests', style: { margin: '2px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: C.text } },
              value.interests.map((interest) => h('li', { key: interest }, interest)),
            )
          : h('div', { key: 'interests-empty', style: { color: C.dim, fontSize: 13 } }, '—'),
        heading('h-day', dict.dayTitle),
        Array.isArray(value.dayPlan) && value.dayPlan.length > 0
          ? h(
              'ul',
              { key: 'day', style: { margin: '2px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: 13, lineHeight: 1.75 } },
              value.dayPlan.map((slot) => {
                const current = slot.key === value.now?.slot;
                return h(
                  'li',
                  { key: slot.key, style: { display: 'flex', gap: 10, color: current ? C.text : C.dim } },
                  h('span', { style: { minWidth: 92, color: C.dim, fontSize: 12 } }, `${hhmm(slot.from)}–${hhmm(slot.to)}`),
                  h('span', { style: { fontWeight: current ? 600 : 400 } }, slot.text),
                );
              }),
            )
          : h('div', { key: 'day-empty', style: { color: C.dim, fontSize: 13 } }, '—'),
        heading('h-history', dict.history),
        Array.isArray(value.lifeHistory) && value.lifeHistory.length > 0
          ? h(
              'ul',
              { key: 'history', style: { margin: '2px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: C.text } },
              value.lifeHistory.map((milestone, index) =>
                h(
                  'li',
                  { key: `${milestone.date}-${index}` },
                  h('span', { style: { color: C.dim, fontSize: 12, marginRight: 8 } }, milestone.date),
                  milestone.text,
                ),
              ),
            )
          : h('div', { key: 'history-empty', style: { color: C.dim, fontSize: 13 } }, '—'),
        heading('h-research', dict.research),
        Array.isArray(value.research) && value.research.length > 0
          ? h(
              'ul',
              { key: 'research', style: { margin: '2px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: C.text } },
              value.research
                .slice()
                .reverse()
                .map((note) =>
                  h(
                    'li',
                    { key: note.at },
                    h('span', { style: { color: C.dim } }, `${note.query} → `),
                    String(note.summary ?? '').slice(0, 80),
                  ),
                ),
            )
          : h('div', { key: 'research-empty', style: { color: C.dim, fontSize: 13 } }, dict.researchEmpty),
        heading('h-memory', dict.memory),
        row('disputed', dict.disputedLabel, String(Array.isArray(value.disputed) ? value.disputed.length : 0)),
        row('expired', dict.expiredLabel, String(value.expiredNotes ?? 0)),
        row(
          'blocks',
          dict.blocksLabel,
          value.stats?.blocks
            ? `${value.stats.blocks.persona ?? 0} / ${value.stats.blocks.user ?? 0} / ${value.stats.blocks.research ?? 0} / ${value.stats.blocks.now ?? 0} 字`
            : '—',
        ),
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

    function ResetBlock(props) {
      const { dict, reload } = props;
      const [stage, setStage] = React.useState('idle');
      const [detail, setDetail] = React.useState('');

      const submit = () => {
        setStage('working');
        fetch('api/xiao.reset', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-xiao-client': 'settings' },
          body: JSON.stringify({ confirm: 'reset' }),
        })
          .then((response) =>
            response
              .json()
              .catch(() => ({}))
              .then((body) => ({ ok: response.ok, body })),
          )
          .then(({ ok, body }) => {
            if (ok && body?.applied) {
              setStage('done');
              setDetail(body.instanceId ? String(body.instanceId).slice(0, 8) : '');
              reload();
            } else {
              setStage('error');
              setDetail(body?.reason || `HTTP ${body?.code ?? ''}`.trim());
            }
          })
          .catch((error) => {
            setStage('error');
            setDetail(String(error?.message ?? error));
          });
      };

      const outline = {
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 12,
        padding: '4px 12px',
        borderRadius: 6,
        border: `1px solid ${C.line}`,
        background: 'transparent',
        color: C.dim,
      };
      const danger = { ...outline, color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' };

      if (stage === 'idle') {
        return h('div', { style: { marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.line}` } },
          h('button', { type: 'button', onClick: () => setStage('confirming'), style: danger }, dict.resetOpen));
      }
      if (stage === 'confirming') {
        return h(
          'div',
          { style: { marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.line}` } },
          h('div', { style: { color: C.text, fontSize: 12, lineHeight: 1.7, marginBottom: 10 } }, dict.resetWarning),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { type: 'button', onClick: submit, style: danger }, dict.resetConfirm),
            h('button', { type: 'button', onClick: () => setStage('idle'), style: outline }, dict.resetCancel)),
        );
      }
      if (stage === 'working') {
        return h('div', { style: { marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.line}`, color: C.dim, fontSize: 12 } }, dict.resetWorking);
      }
      if (stage === 'done') {
        return h('div', { style: { marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.line}` } },
          h('div', { style: { color: C.text, fontSize: 12 } }, `${dict.resetDone}${detail ? `（${detail}）` : ''}`),
          // Without this the block stays in "done" forever and there is no button left,
          // which looks exactly like a reset that stopped working.
          h('div', { style: { marginTop: 10 } },
            h('button', { type: 'button', onClick: () => setStage('idle'), style: outline }, dict.resetAgain)),
        );
      }
      return h('div', { style: { marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.line}`, color: C.error, fontSize: 12 } },
        `${dict.resetFailed}：${detail}`);
    }

    function XiaoSection(props) {
      const ctx = props?.ctx;
      const lang = useLang(ctx);
      const dict = DICT[lang] ?? DICT.zh;
      const { state, reload } = useFeed('api/xiao.state');
      let content;
      try {
        content = settingsContent(state, dict, lang);
      } catch (error) {
        content = errorView(error);
      }
      return h(
        'div',
        { style: { padding: '2px 2px 16px', maxWidth: 720 } },
        content,
        state.status === 'ready' ? h(ResetBlock, { dict, reload }) : null,
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

    function guarded(Component) {
      return (props) => h(Boundary, null, h(Component, props));
    }

    return {
      // `locale` must be declared: a Client service accessor throws without it.
      inject: ['slots', 'locale'],
      // Exposed for the offline tests: the brain layout is pure and worth testing without
      // a browser. Not part of the plugin contract.
      _internals: { buildBrain, stepBrain, MemoryBrain },
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
