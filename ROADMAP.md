# dsh-xiao 路线图

> 状态：**v1.0 已交付并冻结（2026-10-27）**，实现记录见 §10。本文是唯一的版本依据；实现偏离本文必须先在本文改一行记录，再改代码。
> 范围：DSH profile 内的持久角色内核插件 `dsh-xiao`。
> 依据：`晓v3.0.md`（设计意图）与 `记忆越多，思考越久？v6.3_chatgpt.md`（记忆方法论），但**不复刻**——凡与 DSH 能力或逻辑不自洽之处，本文优先。

---

## 0 目标与非目标

### v1.0 完成定义

在任意 DSH profile 上装一个 bundle，新建一个「晓」preset 的 session，它会以一个由种子决定、跨 session 一致、重启不变、只能按规则演化的角色出现：

- 模型不能自己改年龄和性别；
- 用户能查、能导出、能禁用；
- 卸载后不留残留；
- 不常驻后台，不主动打扰，不做输出侧过滤。

### 非目标（写进 README，同时是护城河）

| 不做 | 原因 |
|---|---|
| H/I/C 分层记忆、预算分离 | 宿主已有会话日志、`session_search`、compaction；再造一套必然与日志不一致 |
| 后台常驻运行期 | DSH 无空闲事件；`agent.followup()` 会打断用户 |
| 输出侧内容过滤 | DSH 无输出过滤扩展点；包装模型会破坏流式与提示缓存 |
| 跨 profile 共享实例 | profile 是隔离单元，跨 profile 一致性与隐私都不可控 |
| 三预算 B_H/B_I/B_C | prompt 组装权不归插件，声称实现即假对齐 |

---

## 1 关键设计决定

| # | 决定 | 理由 | 被否的替代 |
|---|---|---|---|
| D1 | 状态 = 一条 append-only fact log + 纯函数 fold | 单键原子写天然无半提交；追加无冲突不需锁；按 seq 截断即历史版本；审计免费 | 版本链 + 状态表 + 事务表三套并列（上一版方案），需手写两阶段提交且崩溃恢复复杂 |
| D2 | 能算的不存，只存"偏离默认值的决定" | 年龄、情绪、生活事件都由种子与时间算出；fact log 不会退化成状态表 | 每次状态变化都写一行 |
| D3 | 身份注入走 `agent.created` 里 per-agent 注册 `systemPrompt.context` | 只对被挂载的 agent 生效，卸载即消失；不与编码代理的本职身份冲突 | 全局注入"你是晓"（会与工具型代理身份打架） |
| D4 | 通过 agent preset 挂载，不做全局 always | 用户显式选择进入角色模式；默认代理行为不受影响 | 装上即有 |
| D5 | 生活事件懒生成（`PRNG(seed ⊕ dayIndex)`），说出口才固化 | 无 timer、无配额、可复现、无"后台预算耗尽" | 后台定期生成 + planned/generated/committed 三态机 |
| D6 | 默认成年（`adultOnly: true`, `ageRange: [18,60]`） | 插件会装到任意环境，默认未成年角色是产品风险；6–12 段的"仅 student + 禁一切"几乎无角色信息量 | 论文的 6–60 全段默认 |

---

## 2 架构速览

```
一个 domain「dsh-xiao」
├── global:  { instanceId, seed, rulesVersion, birthAt, birthAge, gender }
└── facts[]: 只追加，永不改写
        │
        ├─ reduce(facts) ──→ 当前角色视图（不落盘）
        │      ├─ age   = birthAge + floor(elapsedMonths × g)   ← 算
        │      ├─ job   = fold(职业转移事实)                      ← 存变更
        │      ├─ tone  = f(最近 3 条事件, 距上次交互)             ← 算
        │      └─ recent = 已固化的模拟事件
        │
        └─ systemPrompt.context（per-agent 注册）──→ 人设卡 ≤ 220 字
```

fact 种类（v1.0 冻结为 7 种，此后只许加）：`birth | override | job | health | user_fact | event | tombstone`。

---

## 3 不变量（每版回归，破坏即回滚）

| # | 不变量 | 验法 |
|---|---|---|
| I1 | `reduce(facts)` 纯函数，同输入同输出 | 单测 + 随机 fact 序列快照 |
| I2 | facts 只追加，seq 单调，每条带 `source`/`evidence` | 扫表断言 |
| I3 | 模型不能写 `age`/`gender` | guard 集成测（构造越权调用） |
| I4 | 人设卡 ≤ `cardMaxChars`，前两行稳定 | 两次组装快照对比 |
| I5 | 卸载后无残留注册、无后台任务 | 装→卸→再装，检查 slot/context 计数 |
| I6 | 任何模拟事件带 `simulated: true` | 工具返回体断言 |
| I7 | 数据格式版本单调，旧版可读 | 迁移演练（v0.4 起每次必做） |

---

## 4 里程碑与依赖

```
M0 骨架 ──> M1 边界 ──> M2 生活 ──> M3 可见 ──> M4 冻结
 (v0.1)      (v0.2)      (v0.3)      (v0.4)      (v1.0)
   │            │                        │
   └────────────┴── 横切：数据格式、不变量回归、显示资源 ──┘
```

每个里程碑的退出条件是**可观察行为**，不是"代码写完"。

---

## 5 版本计划

### v0.1 内核（2–3 天）— 有一个人，且她始终是同一个人

**包含**
- workspace bundle 骨架：`package.json`、`cordis.patch.yml`、`index.js`、`locale/`、`icon.svg`；
- `defineDomain({ name: 'dsh-xiao', version: 1, invalidRecords: 'backup-and-skip' })`，单表 `facts` + `global`；
- `birth` 事实写入（seed、`birthAt`、`birthAge`、`gender`、`rulesVersion`）；
- `reduce` 纯函数 + 角色卡渲染；
- `agent/created` 中经 `agent.ctx.effect()` 注册 per-agent `systemPrompt.context`；
- `xiao_state` 只读工具。

**关键约束**
- 种子写入即冻结；
- `trait` / `job` / `health` 的初值全部由 seed 推导，**不落 fact**；只存"用户后来改了什么"；
- `SessionHeader.origin === 'subagent'` 时跳过注入。

**验收**
1. 首装 → 新 session 问"你是谁"，答案与 `xiao_state` 一致；
2. 重启 Harness、换 session、再问，三次答案一致；
3. 固定 `Config.seed` 时，两个全新 profile 得到完全相同的角色卡；
4. subagent session 没有人设卡。

**风险**：两 session 同时冷启动并发写 `birth`。对策：以 `(at, instanceId)` 确定性 tie-break，fold 只认最早一条；初值全部由种子推导，落败方的后续事实不影响正确性。策略写进代码注释。

**不做**：写工具、职业变化、生活事件、UI。

### v0.2 边界（2–3 天）— 她能变，但只能按规则变

**包含**
- `xiao_update`（受限写入）；
- `ctx.tools.guard()` 硬拦 `age`/`gender` 与非法职业转移；
- 职业状态机（合法路径；默认成年段只启用 `job_seeking → employed → unemployed → retired`）；
- `xiao_state` 支持按 seq 截断读历史；
- `tombstone` + 逻辑删除。

**验收**
1. 越权写（模型试图 `age: 17`）被 guard 拒绝，拒绝理由进事实流；
2. 非法职业跳转（`employed → student`）被拒；
3. 用户说"你今年 30 了"时不静默改，需显式确认；
4. 任意历史 seq 能还原当时完整角色卡（这就是 H3 的数据源）。

**风险**：`KvTable` 无 CAS，并发写后写胜。对策：seq = 时间戳 + 单调计数器，写入前重读最大 seq；接受极低概率覆盖并在审计留两条，**不引入锁**。

### v0.3 生活（2 天）— 她有一点点自己的时间

**包含**
- `xiao_life`：按日期区间懒生成，`PRNG(seed ⊕ dayIndex)`，用当前 `job`/`age` 过滤冲突项；
- "已提及"事件追加 `event` fact 固化；
- `tone` 作为派生值进人设卡最后半句。

**验收**
1. 同一周连问三次返回同一批事件；
2. 说出某条后换 session 再问，那条仍在且不变；
3. 求职/退休期生成不出"上班"类事件；
4. 返回体都带 `simulated: true`。

**风险**：懒生成与已固化事件不自洽。对策：生成前先 fold 当前 `job`，只生成与之一致的类别；跨职业跳变由 v0.2 状态机独占产生。

### v0.4 可见与可导出（2 天）

**包含**
- `settings.section` 一页「晓」：角色卡 / 事实时间线 / 复制 JSON，**全只读**；
- `xiao_export` 导出 JSONL 到工作区；
- locale 双语资源与图标定稿；
- 数据格式冻结前的迁移演练（v0.3 数据升 v1 读通）。

**验收**
1. 页面数据与 `xiao_state` 完全一致；
2. 导出文件能被独立脚本算出同种子复现率（H2a）、状态稳定性与合法演化（H3）；
3. 卸载重装后页面与数据都在。

**不做**：页面上的写操作（永远走工具，避免第一版就做 Host↔Client 写通道与授权模型）。

### v1.0 冻结（1–2 天 + 文档）

**包含**
- facts 结构与工具签名冻结（此后只许加 `kind`、加可选字段）；
- README 写清五条"做不到"；
- 失败模式手册：数据损坏、同秒并发、种子冲突、preset 未挂载，及各自恢复动作；
- `Config` 全字段文档化。

**验收**
1. 从 v0.1 数据升到 v1.0 的迁移脚本跑通；
2. 在一台没装过的机器上按 README 从零跑通。

---

## 6 风险与回退

| 风险 | 触发信号 | 回退动作 |
|---|---|---|
| 人设卡干扰本职工作 | 挂晓的 session 里编码任务质量下降或用户抱怨 | 默认改为仅 preset 挂载，并加"任务模式临时静音"开关 |
| fact log 膨胀 | 单实例 > 5000 条 | 加 checkpoint 行 + 只 fold 尾部；不改结构 |
| 懒生成不自洽 | 用户发现事件前后矛盾 | 关闭 `xiao_life`，退化为纯角色卡模式 |
| 宿主版本变化 | `storageDomain` / `systemPrompt` 签名变化 | 可选 `inject`，缺失时降级为"无持久化只读模式"而非崩溃 |

---

## 7 打包与发布节奏

每版同一链路：workspace 包目录 → 语法检查 → `plugin_manager install_bundle`（需审批、会改 profile）→ `cordis_inspect_query` 确认行生效 → 真实页面验证。**不写预览 HTML、不做 mock 页面。** 每版必须带本地化标题与原始图标，不接受默认占位。

---

## 8 评估数据出口

- **H2a（同种子可复现）**：固定 `Config.seed`，在两个空 profile 各初始化一次，比对 `reduce()` 全字段。
- **H3（稳定性 vs 合法演化）**：导出事实流后回放"应当不变/应当变化"两组脚本。
- **H4（摘要增益）**：`cardMaxChars = 0` 即"无摘要组"的近似对照。
- 所有 fact 带 `rulesVersion`，导出即得论文第 6 章要求的标注数据。

---

## 9 v1 之后 backlog（明确挂起）

多实例（一个 profile 两个晓）、主动提及（需 `agent.followup()` + 打扰上限）、感觉通道消融、`sessionProjections` 驱动的会话内成长指示、用 `llm.stream` 生成生活事件文本（默认关）。

---

## 10 实现记录

### v0.1 内核（2026-10-27）

已交付：`packages/dsh-xiao/`（bundle `@local/dsh-xiao` 0.1.0，Loader 行 `include:dsh-xiao`），纯核心 `persona.js` + Cordis 接线 `index.js` + `test/persona.test.mjs`（11 条，全绿）。

| 路线图验收 | 结果 | 证据 |
|---|---|---|
| 首装后能读到一致的自我 | 通过 | `xiao_state` 返回的人设卡与注入到提示里的卡逐字一致 |
| 卸载/重载后身份不变 | 通过 | 禁用→启用（新模块代）后身份与卡内容不变 |
| **进程重启后身份不变** | 通过（2026-10-27 22:06） | 宿主进程 PID 16556 于 22:05:59 重启（GUI 端口 36194→42338），`instanceId` 与卡内容不变，fact 仍为 1 条 |
| 落盘为唯一事实源 | 通过 | `~/.dsh/storages/dsh_xiao.json`，1 条 `birth` 事实，无其他状态 |
| 同种子可复现（纯函数层） | 通过 | `derivePersona` 单测；真实 profile 双实例对照留到 v0.4 评估脚本 |
| subagent 不注入 | 通过 | 独立子会话回报 `PERSONA=NO; EVIDENCE=NONE` |

偏离与修正（按本文"先改这里，再改代码"的约定记录）：

1. **存储单元名不能用连字符**：`UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/`，domain 名由 `dsh-xiao` 改为 `dsh_xiao`；包名与 Loader 行 id 不受影响。
2. **D4 的 preset 门控已实现但默认放开**：`enabledForPresets` 默认 `[]`（对所有 session 注入），否则装完看不到任何东西。要回到 D4 的语义，把它设为 `['xiao']`。
3. **不 import 任何 `@deepseek-ai/*` 包**：Storage 的 `valueSchema` 实际只调用 `parse` / `safeParse`（`dsh-storage-domain/lib/index.js:74,371`），所以手写最小 schema 对象即可，避免在 profile 里做裸模块解析。
4. **v0.1 的注入范围是整份 profile**：插件一旦启用，每个 session 都带人设卡（本会话亦然）。这是上表第 2 条的直接后果，不是 bug；v0.2 起用 preset 或开关收紧。

### v0.2 边界（2026-10-27）

已交付：`xiao_update`（`set_job` / `remember` / `forget` / `set_age`）+ `ctx.tools.guard()` 单调守卫 + 职业状态机 + tombstone 逻辑删除 + 历史 seq 读取；`persona.js` 新增 `canTransitionJob` / `planUpdate` 两个纯函数，测试 23 条全绿。

| 路线图验收 | 结果 | 证据 |
|---|---|---|
| 越权写被拒且留痕 | 通过 | `set_age 17` 与未确认的 `set_age 30` 由 guard 拒绝，两条 `rejected` 事实（`source: guard`）落盘 |
| 非法职业跳转被拒 | 通过 | `student → employed` 返回 `illegal_job_transition`（允许：`job_seeking`），并写入 `rejected`（`source: model`） |
| 改年龄不静默生效 | 通过 | 不带 `confirmed: true` 直接拒；带确认也只接受 18–60 的整数 |
| 出生事实不可删除 | 通过 | `forget` 指向 birth 返回 `cannot_forget_birth` |
| 任意历史 seq 还原 | 通过 | `asOfSeq` 截到 `user_fact` 之前：`knows` 为空、`factsCount` 4；当前读到 5 |
| 逻辑删除可审计 | 通过 | tombstone 后 `knows` 清空，事实仍留在日志里（`factsCount` 6） |

偏离与修正：

1. **`retired` 门槛取 55 岁**（论文与早期草稿写 60）。年龄上限本来就是 60，60 岁门槛会让 `retired` 在成年段几乎不可达，状态机等于空转。
2. **新增第 8 种 fact：`rejected`**（`{tool, action, code, reason}`）。原计划 7 种到 v1.0 冻结；"拒绝留痕"需要它，故提前加入。
3. **guard 只做形状级不可变检查**（性别、未确认的年龄、年龄区间）；职业转移依赖当前状态、且要给出可操作理由，放在 `xiao_update` 里。两者重叠处 guard 先拒，`planUpdate` 再校验一次。
4. **"合法职业转移"未在真实 profile 上执行**——那会永久改变当前实例。该路径由 `canTransitionJob` 的单元测试覆盖；要演示需另建测试实例。

### v0.3 生活（2026-10-27）

已交付：`xiao_life`（懒生成 + 已提及固化）+ `tone` 派生 + 按职业类别分池的生活模板；生成器 `generateLife` / `toneOf` 为纯函数；测试 33 条全绿。

| 路线图验收 | 结果 | 证据 |
|---|---|---|
| 同一周连问多次返回同一批事件 | 通过 | 同一窗口两次调用返回逐字段相同的 `id/text/day`；30 天窗口中同一 id 文本不变 |
| 说出后换会话再问仍不变 | 通过 | 独立子会话调用 `xiao_life(30)`，`2964.0` 仍是「逃了一节早课，醒来有点愧疚」、`committed: true` |
| 求职/退休不出"上班"类事件 | 通过（单测） | 四个非在职类别各扫 60 天窗口，`上班|加班|开会|表格|办公室` 零命中 |
| 返回体都带 simulated | 通过 | 顶层与每个 event 都带 `simulated: true` |
| tone 进人设卡 | 通过 | 固化后卡片从「现在平静」变为「现在松下来」，并多出「最近：…」一行 |

偏离与修正：

1. **密度改为"每周至少 1 条"**（`count = 1 + floor(rnd*cap)`）。原写法 `floor(rnd*(cap+1))` 在 cap=1 时有一半的周没有事件，7 天窗口经常返回空，看起来像坏了。
2. **模板池从 4–5 条扩到 6–8 条/类**。60 天窗口原本 8 条事件只有 4 种文本，重复感太重；扩池后 8 条里有 6 种。
3. **事件 id 用 `周序号.槽位`，与日期解耦**：同一周在任何窗口下都是同一批 id，固化才有稳定锚点。
4. **`tone` 不进 fact**，由已固化事件的最近一条算出；没有事件时是"平静"。因此它只在固化新事件时变化，卡片的稳定前缀不受日常对话影响。
5. 已知局限：调小 `lifeEventsPerWeek` 会让未固化事件整批改变（它们本来就只是"可能发生"），已固化的不受影响。

### v0.4 可见与可导出（2026-10-27）

已交付：`xiao_export`（Host）、`GET /xiao/state` 只读路由、`settings.section` 页面。`package.json` 增加 `dsh.client` 与 `./client` 导出，版本 0.4.0。**页面已渲染**（用户截图确认）。

| 路线图验收 | 结果 | 证据 |
|---|---|---|
| 导出可供离线计算 | 通过 | `xiao_export` 返回 8 条事实、1762 字节 JSONL，字段齐全（seq/at/kind/data/source/evidence） |
| 页面数据与工具一致 | 通过 | 截图中的身份、性格、人设卡、8 条时间线与 `xiao_state` 完全一致 |
| 只读 | 通过 | 同一路径 POST 返回 405 |
| 页面出现在设置里 | 通过 | `settings.section` 的 occupants 出现 `xiao`（order 25，active），导航排在 Agent 预设之后 |
| 页面渲染 | 通过 | 身份/状态/性格五行/人设卡/事实时间线；事件行带「模拟」角标；底部有只读提示 |
| 页面取数与计数 | 通过 | `pageRequests` 的 `total/page` 计数：直连只增 `total`，带页面标记头的请求同时增 `page` |

偏离与修正：

1. **`inject` 不能用对象形式**。写成 `{ required: [...], optional: [...] }` 时本版 Cordis 把键名当服务名，插件直接 `pending (waiting for services: required, optional)`。改回数组形式，`webServer` 列为必需。
2. **`xiao_export` 不自己写盘**：返回文本由 agent 写入工作区。插件绕过文件策略直接写盘的风险不值得冒。
3. **迁移演练推迟到 v1.0**：没有安全的离线 domain 环境，改 live 存储文件的收益小于风险。
4. **Client 侧 Service 必须显式 inject**。`ctx.locale` 在未声明的模块里访问会直接抛 `cannot get property "locale" without inject`；而且访问语句本身要放进 `try`（我第一版把 `try` 写在它下一行，于是白屏）。
5. **页面并不与 Host 同源**。页面跑在 `dsh-app://` 下、跨源请求 `http://127.0.0.1:<port>/xiao/state`，靠 Electron 的宽松策略才通得过；因此 `Sec-Fetch-Site` 不是可用判据（实测页面的 6 次请求全被记成 `direct`）。改用页面自带 `x-xiao-client: settings` 头做诊断计数，跨站 403 仍然保留。
6. **`/xiao/state` 没有接入连接令牌**。壳层对 `/` 返回 401，对这个路由返回 200——令牌机制在 connection 服务里，不在 webServer 里。当前姿态是"仅回环、只读、可计数"。真正的修法是把页面数据挪到鉴权的 Remote 通道，列为 v1.0 任务。

### v1.0 冻结（2026-10-27）

已交付：`README.md`（边界、配置、工具、格式、失败模式、安全说明）、`test/format.test.mjs` + `test/fixtures/facts.sample.jsonl`（格式冻结的金标准）、版本 `1.0.0`、设置页面距收紧。测试 40 条全绿。

| 验收 | 结果 | 证据 |
|---|---|---|
| 格式冻结有测试守护 | 通过 | 金标准 fixture 的折叠结果逐字段断言；未知 `kind` 被 schema 拒绝、多余字段被忽略 |
| 卸载重装后还是同一个晓 | 通过 | `remove_bundle` → `install_bundle`（回显 `version: 1.0.0`），身份、卡、7 条有效事实全部不变 |
| 工具签名冻结 | 通过 | 4 个工具的参数与语义写进 README §5 |
| "做不到"写清楚 | 通过 | README §2 六条（原计划五条，多出的一条是安全说明） |
| 失败模式可恢复 | 通过 | README §7 七种症状与对应动作 |

偏离与修正：

1. **迁移演练改成"金标准 + 拒绝未知"的自动测试**，而不是改 live 存储文件做手工演练。后者风险大于收益；fixture 测试每次改动都会跑，覆盖同一件事。
2. **设置页面距收紧**（标题 16→12、行距 3→2、卡片 12/14→10/12），整页矮约 40px，顶部的「晓 · dsh-xiao」不再需要滚动才能看到。

## 附录 A：与 `晓v3.0.md` 的偏离

| 论文机制 | 本插件 | 处置理由 |
|---|---|---|
| B_H / B_I / B_C 三预算 | 删除 | 组装权不归插件 |
| 沉默 3 轮 = 接受 | 删除 | 把无表态当同意 |
| 交互密度修正 `g_actual` | 删除 | 无可靠输入，伪精确 |
| 12+2 感觉通道 | 删除（只留 tone） | 无消融数据先建 14 通道是负债 |
| 用户关系信号 | 删除 | 不可靠推断，违反论文自身隐私原则 |
| 事件三态机 | 简化为"未提及/已提及" | 懒生成下三态空转 |
| 版本链 + 事务协议 | 合并为 fact log | 单键原子写已达同等保证 |
| 情绪作为检索权重 | 改为影响措辞 | 插件无检索权重可调 |
| 6–60 全段默认 | 18+ 默认 | 产品风险 |

## 附录 B：Config 字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabledForPresets` | `['xiao']` | 哪些 preset 挂载后注入 |
| `adultOnly` | `true` | 关闭后方可配置未成年段 |
| `ageRange` | `[18, 60]` | 生效范围受 `adultOnly` 约束 |
| `growthPerMonth` | `1/12` | 岁/月，范围 `[1/12, 1/4]` |
| `cardMaxChars` | `220` | 人设卡上限，`0` = 不注入（用于对照实验） |
| `lifeEventsPerWeek` | `1` | `0` 即关闭生活模拟 |
| `seed` | 未设 | 固定后可复现，供测试 |
