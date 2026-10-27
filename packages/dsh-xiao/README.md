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

> 要"只在名为 `xiao` 的 preset 里出现"，设 `enabledForPresets: ["xiao"]`。

## 5. 工具

| 工具 | 作用 | 硬约束 |
|---|---|---|
| `xiao_state` | 读角色卡、性格、近期事件；`includeFacts` 读原始日志，`asOfSeq` 读历史状态 | 只读 |
| `xiao_update` | `set_job` / `remember` / `forget` / `set_age` | 见下 |
| `xiao_life` | 读最近 N 天（1–60）的模拟生活；`speak: [id]` 把说过的事件固化 | 返回体一律带 `simulated: true` |
| `xiao_export` | 导出 JSONL 事实流 | 只读，不写盘 |

`xiao_update` 的三条不可越线：

- **性别不可写**（`ctx.tools.guard()`，单调拦截，与调用顺序无关）；
- **改年龄必须带 `confirmed: true`**，且必须是 18–60 的整数；
- **职业转移必须符合状态机**：`student → job_seeking → employed | unemployed → retired`，`retired` 仅 55 岁以上可达，且不可逆。

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

**另一张表 `flags`**：只存 profile 级的一次性标记，目前只有 `intro`（`{at, reason}`，表示晓已经做过自我介绍）。它不参与角色状态，加这张表没有改变 `facts` 的记录形状，所以 `SPEC.version` 仍是 1。

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
| 设置页显示「读取失败」 | `/api/xiao.state` 不可达（插件未激活、连接服务缺席） | 检查插件行是否 `active`、日志里有没有 `connection service unavailable` |
| 想从头开始 | — | 删除 `~/.dsh/storages/dsh_xiao.json`，下次激活会重新投胎，**不可逆** |

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
