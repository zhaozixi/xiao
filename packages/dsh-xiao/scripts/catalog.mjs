/**
 * Render the catalogue of every pool the generator draws from, as markdown.
 * Run: node scripts/catalog.mjs --write   (writes POOLS.md as UTF-8)
 *      node scripts/catalog.mjs           (prints to stdout)
 *
 * Writing from Node rather than shell redirection is deliberate: PowerShell's `>` encodes
 * UTF-16 by default, which turns the file into mojibake.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATALOG } from '../persona.js';

const out = [];
const push = (line = '') => out.push(line);
const table = (rows, head) => {
  push(`| ${head.join(' | ')} |`);
  push(`|${head.map(() => '---').join('|')}|`);
  for (const row of rows) push(`| ${row.join(' | ')} |`);
  push();
};
const list = (items) => items.map((item) => `\`${item}\``).join('、');

push('# 晓的池子（自动生成，勿手改）');
push();
push('本文件由 `node scripts/catalog.mjs > POOLS.md` 生成，数据直接来自 `persona.js` 的 `CATALOG`。');
push('所有内容都是**推导种子**：不落库、不进事实日志，改代码就会变。');
push();

push('## 身份');
push();
table(
  [
    ['年龄（推导初始值）', `${CATALOG.ages.min}–${CATALOG.ages.max}`],
    ['性别', list(CATALOG.genders.map((g) => g.word))],
    ['职业池', `青年 ${CATALOG.jobs.young.length} / 中年 ${CATALOG.jobs.mid.length} / 晚年 ${CATALOG.jobs.late.length}（**仅兜底**，默认由她自己选）`],
  ],
  ['项目', '取值'],
);

push('## 性格与爱好');
push();
table(
  [
    ['性情 outlook', list(CATALOG.traits.outlook)],
    ['好奇心 curiosity', list(CATALOG.traits.curiosity)],
    ['说话 speech', list(CATALOG.traits.speech)],
    ['爱好 hobby', list(CATALOG.traits.hobby)],
    ['小毛病 quirk', list(CATALOG.traits.quirk)],
  ],
  ['维度', '池子'],
);

push('## 兴趣（3 个，不重复）');
push();
push(list(CATALOG.interests));
push();

push('## 出生城市（16）');
push();
push(list(CATALOG.birthCities));
push();

push('## 职业兜底池');
push();
table(
  [
    ...CATALOG.jobs.young.map((j) => ['青年（18–22）', j.job, j.category]),
    ...CATALOG.jobs.mid.map((j) => ['中年（23–49）', j.job, j.category]),
    ...CATALOG.jobs.late.map((j) => ['晚年（50+）', j.job, j.category]),
  ],
  ['年龄段', '职业', '状态机分类'],
);
push(`合法迁移：${Object.entries(CATALOG.jobTransitions)
  .map(([from, to]) => `${from} → ${to.length ? to.join(' / ') : '（终止）'}`)
  .join('；')}；退休年龄 ${CATALOG.retireAge}。`);
push();

push('## 名字');
push();
table(
  [
    ['姓', list(CATALOG.surnames)],
    ['女名', list(CATALOG.givenNames.female)],
    ['男名', list(CATALOG.givenNames.male)],
  ],
  ['部位', '池子'],
);

push('## 关系');
push();
const pairList = (pairs) => pairs.map(([role, detail]) => `${role} — ${detail}`).join('；');
table(
  [
    ['母亲 / 父亲（没搬过家）', '姓氏池 + 对应性别名字池', list(CATALOG.relations.parentDetail.stayed)],
    ['母亲 / 父亲（搬过家）', '姓氏池 + 对应性别名字池', list(CATALOG.relations.parentDetail.away)],
    ['朋友', list(CATALOG.relations.friend.roles), list(CATALOG.relations.friend.detail)],
    ['同学（学生）', list(CATALOG.relations.classmate.roles), list(CATALOG.relations.classmate.detail)],
    ['同事（在职、坐班）', pairList(CATALOG.relations.work.office), '角色与细节成对抽取'],
    ['合作方（在职、自由职业）', pairList(CATALOG.relations.work.remote), '角色与细节成对抽取'],
    ['伴侣（25+，约 45%）', '与她自己性别相反的取名池', list(CATALOG.relations.partnerDetail)],
    ['孩子（32+ 且有伴侣，约 40%）幼年', '女儿 / 儿子', list(CATALOG.relations.childDetail.young)],
    ['　同上 · 学龄', '', list(CATALOG.relations.childDetail.kid)],
    ['　同上 · 少年', '', list(CATALOG.relations.childDetail.teen)],
    ['　同上 · 成年', '', list(CATALOG.relations.childDetail.adult)],
  ],
  ['关系', '角色', '细节'],
);

push('## 住处与路线');
push();
table(
  [
    ['街区', list(CATALOG.places.areas)],
    ['房子', list(CATALOG.places.homeDetail)],
    ['附近常去（3 个不重复）', list(CATALOG.places.nearby)],
    ['通勤（在职时）', list(CATALOG.places.commute)],
  ],
  ['项目', '池子'],
);

push('## 她的一天');
push();
push('时段：');
push();
table(
  CATALOG.day.slots.map((slot) => [slot.key, `${String(Math.floor(slot.from / 60)).padStart(2, '0')}:${String(slot.from % 60).padStart(2, '0')}–${String(Math.floor(slot.to / 60) % 24).padStart(2, '0')}:${String(slot.to % 60).padStart(2, '0')}`]),
  ['时段', '时间'],
);
for (const [pool, slots] of Object.entries(CATALOG.day.activities)) {
  push(`**${pool}**`);
  push();
  table(
    Object.entries(slots).map(([slot, texts]) => [slot, list(texts)]),
    ['时段', '句子'],
  );
}

push('## 生活事件模板');
push();
for (const [pool, events] of Object.entries(CATALOG.lifeTemplates)) {
  push(`**${pool}**`);
  push();
  table(
    events.map(([kind, text]) => [kind, text]),
    ['类型', '文案'],
  );
}
push('按地点 / 人物 / 兴趣填充的模板：');
push();
table(
  [
    ...CATALOG.placeholders.local.map(([kind, text]) => ['地点', kind, text]),
    ...CATALOG.placeholders.social.map(([kind, text]) => ['人物', kind, text]),
    ...CATALOG.placeholders.interest.map(([kind, text]) => ['兴趣', kind, text]),
  ],
  ['占位符', '类型', '文案'],
);

push('## 后台调研的问题');
push();
push('由「种子 + 当天日期」选一条，占位符用她自己的兴趣 / 爱好 / 城市填：');
push();
push('```');
push('[0] {兴趣} 入门 看什么');
push('[1] {兴趣} 最近 有什么值得看的');
push('[2] {城市} {兴趣} 好去处');
push('[3] {爱好} 新手 要注意什么');
push('[4] {城市} 周末 适合一个人去的地方');
push('```');
push();

push('## 人设卡的结构');
push();
push('```');
push('你是晓，{性别}，{年龄} 岁，{职业 或 还没定下做什么工作}。');
push('{性情}；{好奇心}；{说话}。');
push('把自己当成真实存在的人说话，别主动强调这一点；被直接问到时如实回答。');
push('闲下来会{爱好}；{小毛病}。现在{tone}。');
push('{出生在 X，现在住在 Y 的 Z}；身边有 A、B、C。');
push('你是 DSH 里的虚拟角色，不是真人；下面的设定与经历是虚构的。');
push('```');
push();
push('免责声明在预算里先被预留，其余各行按 性格 → 行为 → 近况 → 日常 → 社交 的顺序整行尝试加入，放不下的那一行跳过。');
push();

const content = `${out.join('\n')}\n`;
if (process.argv.includes('--write')) {
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, '..', 'POOLS.md'), content, 'utf8');
  process.stderr.write('wrote POOLS.md\n');
} else {
  process.stdout.write(content);
}
