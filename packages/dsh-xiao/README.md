# dsh-xiao

DSH 里的持久角色内核。一个由种子决定的角色「晓」，跨会话、跨重启保持同一身份，只能按规则演化。

**v1.0，格式与工具签名已冻结。** 设计与取舍见 [`ROADMAP.md`](../../ROADMAP.md)。

```
一条 append-only 事实日志  ──reduce(纯函数)──▶  当前角色  ──▶  人设卡（注入提示词）
        ▲                                            │
        └──────── 只有"偏离默认值的决定"才写入 ◀──────┘
```

---

## 1. 它是什么

- 启动时用一条 `birth` 事实固定种子；性别、年龄、职业、性格、小毛病全部由种子**推导**，不存储。
- 只有三类东西会进日志：**用户/事件造成的偏离**（改职业、更正年龄、记住用户事实、固化模拟事件）、**删除标记**、**拒绝记录**。
- 因此"当前状态"永远等于日志的折叠结果：重启不是恢复状态，而是重新算一遍。

## 2. 它不是什么

这六条是**设计边界**，不是待办：

1. **不实现 H/I/C 三预算**。prompt 组装权在 `systemPrompt` 与 `compaction`，插件只负责自己那一段（人设卡 ≤ `cardMaxChars`）。
2. **不常驻后台，也不会主动找你**。没有 timer、没有空闲探测、没有"今天过得怎么样"的推送。
3. **删不掉会话日志里已经说过的话**。`forget` 只让事实在视图里消失，对话记录仍在。
4. **不拦截模型输出**。18 禁、不得冒充真人、模拟事件标注，这些靠提示词与状态约束**影响**生成，不保证拦得住。
5. **不跨 profile 共享实例**。每个 profile 一个晓。
6. **不提供未经鉴权的只读接口**。设置页的数据走 DSH 的 connection 通道（`/api/xiao.state`），无凭证请求返回 401；没有裸露的 HTTP 路由。

## 3. 安装

```powershell
# 在 DSH 里：plugin_manager → install_bundle，target 指向本目录
# 或命令行
dsh --profile <name> ...   # 具体以 plugin_manager 返回为准
```

- 依赖 Host 服务：`storageDomain`、`systemPrompt`、`tools`、`connection`。
- 数据落在 `~/.dsh/storages/dsh_xiao.json`（`storage-json` 后端）。
- 客户端半边（设置页）由 `dsh.client` 声明，**首次出现或改动后需要重启 DSH** 才会被浏览器加载。

## 4. 配置

配置写在 bundle 行的 `config` 里（`cordis.patch.yml`），改动会随 profile 持久化。插件不导出 `Config` schema，字段在加载时按下面的规则归一化，非法值被忽略而不是报错。

| 字段 | 默认 | 说明 |
|---|---|---|
| `cardMaxChars` | `220` | 人设卡字数上限。`0` = 完全不注入（做 H4 对照实验用） |
| `seed` | `''` | 固定种子。**只影响此后新生的实例**，已存在的实例不受影响 |
| `enabledForPresets` | `[]` | 允许注入人设卡的 preset 名。空数组 = 所有 session 都注入 |
| `growthPerMonth` | `1/12` | 年龄增速（岁/月），被夹到 `[1/12, 1/4]` |
| `lifeEventsPerWeek` | `1` | 每周模拟事件数，`0–2`；`0` 关闭生活模拟 |
| `announceOnFirstMeeting` | `true` | 新会话的第一条用户消息到达时，让晓用一两句话介绍自己；**只发生一次** |
| `userSummaryMaxChars` | `200` | "关于对方，你记得这些"那一块的预算，独立于卡片；`0` 关闭 |
| `researchPerDay` | `2` | 她每天可以自己上网查几件事；`0` 关闭 |
| `researchMaxChars` | `200` | "你最近自己查过这些"那一块的预算；`0` 关闭 |
| `nowMaxChars` | `120` | "此刻你在做什么"那一行的预算；`0` 关闭 |
| `chooseOwnJob` | `true` | 职业由她在第一次见面时自己挑，而不是继承种子的默认值；`false` 时直接用种子给的那个 |

> 要"只在名为 `xiao` 的 preset 里出现"，设 `enabledForPresets: ["xiao"]`。

## 5. 工具

| 工具 | 作用 | 硬约束 |
|---|---|---|
| `xiao_state` | 读角色卡、性格、近期事件；`includeFacts` 读原始日志，`asOfSeq` 读历史状态 | 只读 |
| `xiao_update` | `set_job` / `remember` / `forget` / `set_age` | 见下 |
| `xiao_reset` | 清空这个实例并重新投胎：全部事实、版本历史、记住的用户事实、首次见面标记 | 必须带 `confirm: "reset"`；**不可逆** |
| `xiao_life` | 读最近 N 天（1–60）的模拟生活；`speak: [id]` 把说过的事件固化 | 返回体一律带 `simulated: true` |
| `xiao_export` | 导出 JSONL 事实流 | 只读，不写盘 |

`xiao_update` 的三条不可越线：

- **性别不可写**（`ctx.tools.guard()`，单调拦截，与调用顺序无关）；
- **改年龄必须带 `confirmed: true`**，且必须是 18–60 的整数；
- **职业转移必须符合状态机**：`student → job_seeking → employed | unemployed → retired`，`retired` 仅 55 岁以上可达，且不可逆。

`remember` 写进去的事会以「关于对方，你记得这些」单独注入（见 §4 的 `userSummaryMaxChars`），`forget` 之后立刻消失。`set_age` 是一次**新的起点**，不是冻结：更正之后仍按 `growthPerMonth` 继续长。

`move` 只改**现居城市**（`override {field: "city"}`），既不改出生地，也不改人生大事记——大事记是冻结的过去。`place` 追加一个她熟悉的地点（`override {field: "nearby"}`），多次调用是追加而不是覆盖。

**她第一次定职业不受状态机约束**：`jobChosen: false` 时 `set_job` 可以选任意分类，因为那是在决定"我是谁"，不是在换工作。一旦写下第一条 job 事实，后续所有变更都必须走状态机（employed 不能直接回到 employed，退休必须 55 岁以上）。

`xiao_reset` 清空后立即重新投胎，性别/年龄/职业/性格全部重抽；**已经写进会话日志的对话不会被删除**。守卫（`ctx.tools.guard()`）在 `confirm` 不是字面量 `"reset"` 时直接拒绝。

`xiao_life` 的固化规则：**已经过去的日子会自动固化**（否则换一次职业就会把上周的事件重新生成，等于改写历史），只有今天的事件在说出口前还可能变。事件文案里会出现**她实际居住的城市**和**具体的人**（「和胡婧吃了顿饭」「下雨，在西安的街上走了一段」），而不是抽象的"朋友""外面"。另外当生活事件与当前职业状态构成合理转折时（求职中面了试、在职被裁），它会附带一条 `suggestion`——只是建议，绝不自动改状态。

除了被调用，插件在**激活时**和**每次新会话开始时**还会做一次追赶（`syncLife`）：从出生日（或上次追赶点，最多回溯 60 天）到**昨天**，把每天的事件生成并固化。它不说话、不改职业，只把已经过去的日子落盘——所以「最近」和心情会在你下次开新会话时自然更新，而不是等你问起。生成窗口不会早于出生日。

被拒绝的调用不会改变状态，但会写一条 `rejected` 事实留痕。

## 6. 数据格式 v1（冻结）

```jsonc
// 表：facts（键 = 补齐 16 位的 seq + 随机后缀）
{
  "seq": 1793110177105004,   // 单调；写入时间 × 1000 + 进程内计数
  "at": 1793110177105,       // 墙钟毫秒
  "kind": "user_fact",       // 见下表
  "data": { "text": "…" },
  "source": "user",          // seed | user | model | sim | guard
  "evidence": "confirmed"    // confirmed | unverified | disputed | superseded
}
```

**另一张表 `flags`**：只存 profile 级的一次性标记，目前有 `intro`（`{at, reason}`，表示晓已经做过自我介绍）和 `lifeSynced`（`{day}`，生活追赶的进度）。它不参与角色状态，加这张表没有改变 `facts` 的记录形状，所以 `SPEC.version` 仍是 1。

**由种子推导、从不存储的东西**：性别、年龄初值、职业初值、性格四维、出生日期（年月日）、出生地、现居城市、社会关系、三个兴趣、人生大事记。它们只由 `seed` 决定，所以"同种子同角色"是构造性的，不是靠备份保证的。

**兴趣**（3 个，互不相同）决定她"自己会去了解什么"：后台查资料的问题优先从兴趣里出，生活事件里也会出现"翻了一晚上手工装帧的东西"这类句子。爱好（`hobby`）是她闲下来做什么，兴趣是她关心什么，两者分开。

**她自己上网查的东西**存进第三张表 `notes`（`{at, day, query, summary, sources}`），最多保留 30 条。每轮对话结束后，若当天配额未用完，她按"种子 + 日期"决定一个问题去查——**只查自己的爱好和城市，永远不查用户**——然后把结果压缩成一两句。这件事不会打断对话、也不会主动开口；查到的内容以「你最近自己查过这些」单独注入，和用户记忆一样有独立预算。

**她的一天**按五个时段（早 / 中午 / 下午 / 晚上 / 深夜）生成，每个时段一句话，内容取决于她当前靠什么生活：在家工作的会"在和一个甲方来回改图"，上班的会"在回家的地铁上"，学生的会"在图书馆待到闭馆"。同一天的计划固定，过一天才换。对话发生的那一刻，当前时段的那句话会以「此刻是中午，你下楼买了份饭」注入——所以同一个下午聊两次，她的状态是一样的；隔几个小时再聊，她就在做别的事了。

出生地是固定的事实；**现居城市**在成年后按种子约 55% 的概率换过一次（18 岁或 22 岁），并作为一条「搬到 X」进入大事记。此后可以用 `xiao_update` 的 `move` 再改，只改现居，不回写历史。

**住处与路线**同样由种子推导：一个街区（老城区 / 江边 / 大学城旁边…）、一间具体的房子、三个附近常去的地方；如果她在上班，还有一个工作地点和一条通勤方式（自由职业者是「在家工作，没有通勤」）。这些是锚点，不是地理坐标——不编造不存在的街道名。

社会关系的构成是固定的两部分加两个可选：**父母必有**，一位朋友 + 一位同学（学生）或同事（其余）；**伴侣**在 25 岁以上按种子约 45% 出现，**孩子**仅在 32 岁以上且有伴侣时约 40% 出现。名字从姓氏池与性别相符的名字池里取，彼此不重名。

人生大事记从出生日推到当前年龄：出生 → 小学 → 初中 → 高中 → 大学（约 70%）或直接工作 → 毕业 → 第一份工作 → 换过一次工作（27 岁以上）。全部锚定在出生日期上，所以读起来是一条时间线，不是一串年份。

| `kind` | `data` | 谁写 |
|---|---|---|
| `birth` | `{instanceId, seed, birthAt, rulesVersion}` | 首次激活 |
| `override` | `{field, value}` | `set_age` |
| `job` | `{job, category}` | `set_job` |
| `health` | `{text}` | 预留 |
| `user_fact` | `{text}` | `remember` |
| `event` | `{id, day, kind, text}` | `xiao_life` + `speak` |
| `tombstone` | `{targetSeq}` | `forget` |
| `rejected` | `{tool, action, code, reason}` | guard / 工具拒绝 |

**不变量**（`test/format.test.mjs` 与 `test/persona.test.mjs` 守护）：

1. `fold` 是纯函数：同样的记录 + 同样的 `now` 得到同样的角色。
2. 日志只追加；记录一经写入不改。删除靠 `tombstone`。
3. 记录里多出的字段被忽略（向前兼容），**未知 `kind` 会被拒绝**（`invalidRecords: 'backup-and-skip'` 会把它挪到备份并跳过，而不是带着看不懂的记录继续算）。

**升级规则**：改记录形状 = 改 `SPEC.version`，并把旧版本放进 `compatibleVersions`，同时更新 `test/fixtures/facts.sample.jsonl`。只加字段不算改版本。

## 7. 失败模式与恢复

| 症状 | 原因 | 处理 |
|---|---|---|
| 日志里出现 `invalid record` 错误，某个事实消失 | 存储里的记录不合法；已按 `backup-and-skip` 挪到备份 | 备份文件名在 Host 日志里；需要的话手工修回 |
| 两条 `birth` 事实 | 两个会话同秒冷启动 | 折叠取 `(at, instanceId)` 最小的一条，其余被忽略，视图正常 |
| 所有会话都带人设卡 | `enabledForPresets` 默认是空数组 | 显式配置 preset 白名单 |
| 设置页一片空白 | 客户端 bundle 还是旧的 | 硬刷新；仍不行则重启 DSH |
| 设置页显示红字 `xiao render error` | 客户端渲染异常 | 红字里有完整堆栈，直接上报 |
| 设置页显示「读取失败」：`HTTP 404` | 数据路由没注册：`connection` 未注入、或 Host API 变了 | 先看 `xiao_state` 的 `feed` 字段：`ok` / `missing` / `unavailable` |
| 想从头开始 | — | 让晓调 `xiao_reset`（带 `confirm: "reset"`）；或手工删掉 `~/.dsh/storages/dsh_xiao.json`。**不可逆** |
| 插件行报 `service 'x' ...` | 宿主 API 变了 | 启动自检会点名服务与形状不匹配；按报错改插件或降级宿主 |

**安全说明（必须知道）**：设置页的数据来自 `GET /api/xiao.state`，它注册在 DSH 的 connection 通道上，由载波统一做 Host/Origin 检查与浏览器鉴权——**无凭证的直连返回 401**。v1.0 曾有一个未鉴权的 `/xiao/state`，已移除。`xiao_state` 返回里的 `pageRequests`（`total` / `page`）可以用来核对页面请求是否被接受。

## 8. 评估数据出口

```powershell
# 拿到事实流（JSONL），写进工作区
xiao_export → content → write facts.jsonl
```

- **H2a（同种子可复现）**：固定 `seed`，在空 profile 初始化两次，比较折叠后的角色字段。
- **H3（稳定性 vs 合法演化）**：回放事实流，检查"没有合法事件时状态不变"与"有合法事件时按规则变化"。
- **H4（摘要增益）**：`cardMaxChars = 0` 即"无摘要组"。

## 9. 测试

```powershell
cd packages/dsh-xiao
node --test test/persona.test.mjs test/update.test.mjs test/life.test.mjs test/format.test.mjs test/robustness.test.mjs
```

48 条：种子确定性、折叠纯函数、年龄上限、职业状态机、拒绝路径、生活生成与固化、§6 的冻结格式，以及边界健壮性（任意字数预算下卡片不超限、损坏的 birth 记录被跳过而不是抛错）。

> 注意：这个 Node 版本上 `node --test test/` 会把 `test` 当模块解析而失败，必须列文件名。

## 10. 许可证与来源

设计取自同目录的 `晓v3.0.md` 与 `记忆越多，思考越久？v6.3_chatgpt.md`，但按 DSH 的实际能力重做过（见 ROADMAP 附录 A）。图标为本插件自绘。
