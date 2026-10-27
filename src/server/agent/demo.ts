/**
 * 演示模式回答（未调用大模型）
 *  - 只在 LLM_MODE=demo 时使用；界面和数据库都会标注 mode = 'demo'。
 *  - 固定演示文本 + 真实检索结果：引用编号只指向本次真实检索到的资料片段；检索不到就明确说明。
 */
import type { AgentAnswer, RefHistory, RefMaterial } from "./prompts";

type Canned = { test: RegExp; concepts: string[]; build: (cite: (i: number) => string, has: (i: number) => boolean) => string; followups: string[] };

const CANNED: Canned[] = [
  {
    test: /left\s*(outer\s*)?join|左外连接|左连接/i,
    concepts: ["左外连接", "连接条件与过滤条件"],
    followups: ["如果条件写在 ON 里，COUNT(*) 和 COUNT(e.cid) 有什么区别？", "RIGHT JOIN 也有同样的问题吗？"],
    build: (cite) => `**结论**：LEFT JOIN 会先保留左表的每一行；如果把**右表的条件**写进 WHERE，那些没有匹配、右表列为 NULL 的行会被 WHERE 过滤掉，结果就和 INNER JOIN 一样了${cite(1)}。

**为什么**
1. 执行顺序上，\`ON\` 决定“怎么配对”，配不上的左表行用 NULL 补齐；\`WHERE\` 在连接之后对整行再过滤${cite(1)}。
2. \`NULL = '2026秋'\` 的结果是“未知”，WHERE 只保留结果为真的行，所以补 NULL 的行被丢掉${cite(2)}。

**最小例子**
\`\`\`sql
-- 想要：所有学生 + 他们 2026秋 的选课数（没选课显示 0）
SELECT s.name, COUNT(e.cid) AS n
FROM students s
LEFT JOIN enrollments e ON e.sid = s.sid AND e.term = '2026秋'   -- 右表条件放在 ON
GROUP BY s.sid, s.name;

-- 常见错误：条件放进 WHERE，没选课的学生消失
SELECT s.name, COUNT(e.cid) AS n
FROM students s LEFT JOIN enrollments e ON e.sid = s.sid
WHERE e.term = '2026秋'
GROUP BY s.sid, s.name;
\`\`\`

**怎么判断放哪儿**：针对**左表**的筛选放 WHERE；针对**右表**、又想保留左表全部行的条件放 ON。若确实想要“只看有匹配的行”，直接用 INNER JOIN 更清楚。`,
  },
  {
    test: /内连接|inner\s*join|等值连接/i,
    concepts: ["内连接"],
    followups: ["内连接和自然连接有什么不同？"],
    build: (cite) => `**结论**：内连接只保留两张表中**满足连接条件**的行组合${cite(1)}。

用逗号写法与 WHERE 条件表达等值连接：
\`\`\`sql
SELECT s.name, e.score
FROM students s, enrollments e, courses c
WHERE s.sid = e.sid AND e.cid = c.cid AND c.title = '数据库系统概论';
\`\`\`
这与 \`JOIN ... ON\` 写法结果相同；没有任何选课记录的学生不会出现在结果中${cite(2)}。`,
  },
  {
    test: /条件概率|p\s*\(\s*a\s*\|\s*b\s*\)|p\(b\|a\)/i,
    concepts: ["条件概率"],
    followups: ["P(A|B) 和 P(B|A) 什么时候相等？", "条件概率和独立性是什么关系？"],
    build: (cite) => `**结论**：P(A|B) 表示“已知 B 发生，A 发生的概率”，定义为 P(A|B) = P(AB) / P(B)，要求 P(B) > 0${cite(1)}。

**直观理解**：知道 B 发生后，样本空间缩小为 B，再看其中 A 占多少${cite(2)}。

**例子**：班上 60% 学数据库，其中 30% 也学概率统计。随机抽一人：
- P(两门都学) = 0.6 × 0.3 = 0.18（乘法公式）
- P(学概率统计 | 学数据库) = 0.3，而 P(学数据库 | 学概率统计) 一般**不等于** 0.3——两者分母不同。`,
  },
  {
    test: /贝叶斯|bayes/i,
    concepts: ["贝叶斯公式", "全概率公式"],
    followups: ["为什么检测阳性时真正患病的概率可能很低？"],
    build: (cite) => `**结论**：贝叶斯公式把“已知原因求结果”的概率反过来，用于“已知结果推原因”：
P(Bᵢ|A) = P(Bᵢ)P(A|Bᵢ) / Σ P(Bⱼ)P(A|Bⱼ)${cite(1)}。

分母就是全概率公式：先按互斥完备的原因 B₁…Bₙ 分情况，再加总${cite(2)}。

**例子**：患病率 1%，检测灵敏度 95%，误报率 5%。阳性时真实患病概率
= 0.01×0.95 / (0.01×0.95 + 0.99×0.05) ≈ 0.161。基础比例很低时，即使检测较准，阳性结果中也有很多误报。`,
  },
  {
    test: /范式|3nf|bcnf|函数依赖|规范化/i,
    concepts: ["函数依赖", "范式与规范化"],
    followups: ["什么情况下会为了查询效率保留冗余？"],
    build: (cite) => `**结论**：若关系模式中每个非主属性都既不部分依赖、也不传递依赖于候选键，它就满足 3NF${cite(1)}。

**例子**：选课(学号, 课程号, 姓名, 成绩)，候选键是 (学号, 课程号)，但 学号 → 姓名 是部分依赖，同一学生的姓名会重复存储，改名时容易漏改（更新异常）。分解为 学生(学号, 姓名) 与 选课(学号, 课程号, 成绩)，公共属性“学号”是学生表的键，因此是无损连接分解${cite(2)}。`,
  },
  {
    test: /group\s*by|having|分组|聚合/i,
    concepts: ["分组聚合"],
    followups: ["WHERE 和 HAVING 能互换吗？"],
    build: (cite) => `**结论**：GROUP BY 把行按列值分组，聚合函数对每组计算一个值；WHERE 在分组前过滤行，HAVING 在分组后过滤组${cite(1)}。
\`\`\`sql
SELECT c.title, AVG(e.score) AS avg_score
FROM courses c, enrollments e
WHERE c.cid = e.cid
GROUP BY c.cid, c.title
HAVING AVG(e.score) > 75;
\`\`\``,
  },
];

export function demoAnswer(o: { text: string; intent: string; materials: RefMaterial[]; history: RefHistory[]; practice?: { explanation: string; picks: { taskVersionId: string; title: string; reason: string; suggestedMode: string }[] } | null }): AgentAnswer {
  const has = (i: number) => i >= 1 && i <= o.materials.length;
  const usedRefs = new Set<number>();
  const cite = (i: number) => { if (!has(i)) return ""; usedRefs.add(i); return ` [资料${i}]`; };
  const header = "> 演示模式回答：固定演示逻辑 + 本次真实检索结果，未调用大模型。\n\n";

  if (o.intent === "history") {
    if (!o.history.length) {
      return { answer: header + "我在你的历史问答里没有找到相关记录。可以在“历史”面板里换个关键词或放宽日期范围再试。", basis: "insufficient", citations: [], concepts: [], followups: [] };
    }
    const lines = o.history.slice(0, 5).map((h) => `- ${h.date}：${h.question.slice(0, 60)}　[打开原问题](kv://message/${h.conversationId}/${h.questionId})`);
    return { answer: header + `我在你的历史问答里找到 ${o.history.length} 条相关记录（按时间倒序）：\n\n${lines.join("\n")}\n\n点击链接会定位到原消息，可以从那里继续问。`, basis: "general", citations: [], concepts: [], followups: [] };
  }

  if (o.intent === "practice" && o.practice) {
    if (!o.practice.picks.length) return { answer: header + o.practice.explanation, basis: "general", citations: [], concepts: [], followups: [] };
    const lines = o.practice.picks.map((p) => `- **${p.title}**（${p.suggestedMode === "guided" ? "引导" : p.suggestedMode === "diagnostic" ? "诊断" : "独立"}）——${p.reason}　[开始练习](kv://practice/${p.taskVersionId}?mode=${p.suggestedMode})`);
    return { answer: header + `${o.practice.explanation}\n\n${lines.join("\n")}`, basis: "general", citations: [], concepts: [], followups: [] };
  }

  const canned = CANNED.find((c) => c.test.test(o.text));
  if (canned) {
    let body = canned.build(cite, has);
    let basis: AgentAnswer["basis"] = usedRefs.size ? "mixed" : "general";
    if (!usedRefs.size) body = "（资料中没有检索到对应片段，以下为通用知识。）\n\n" + body;
    return {
      answer: header + body, basis,
      citations: [...usedRefs].sort().map((i) => ({ ref: `资料${i}`, why: "演示模式按检索排序引用" })),
      concepts: canned.concepts, followups: canned.followups,
    };
  }

  if (o.materials.length) {
    const parts = o.materials.slice(0, 2).map((m, i) => `${i + 1}. 《${m.materialTitle}》${m.location}：${m.content.replace(/\s+/g, " ").slice(0, 120)}… [资料${i + 1}]`);
    return {
      answer: header + `这个问题没有对应的演示回答。我在你的资料里检索到以下最相关的片段，可以先从这里读起：\n\n${parts.join("\n")}\n\n配置真实模型（LLM_MODE=live）后，星灯会结合这些片段直接回答。`,
      basis: "materials", citations: o.materials.slice(0, 2).map((_, i) => ({ ref: `资料${i + 1}` })), concepts: [], followups: [],
    };
  }
  return {
    answer: header + "这个问题没有对应的演示回答，资料中也没有检索到相关片段，所以我不能给出有依据的回答。你可以上传相关资料，或配置真实模型后再问。",
    basis: "insufficient", citations: [], concepts: [], followups: [],
  };
}
