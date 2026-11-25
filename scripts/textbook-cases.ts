// Each evidence group requires one of its alternatives. Quotes anchor an exact page or paragraph.
export const sources = {
  slides: { title: "第3章 连接查询（课件）", version: 1, location: "page" },
  joins: { title: "第3章 SQL 连接查询（讲义）", version: 2, location: "paragraph" },
  probability: { title: "条件概率与贝叶斯公式（讲义）", version: 1, location: "page" },
  exercises: { title: "第一章习题说明", version: 1, location: "paragraph" },
  notes: { title: "评测上传课件与备注", version: 1, location: "page" },
  privateKeys: { title: "青瓦课程复习", version: 2, location: "paragraph" },
  privatePages: { title: "北桥存储讲义", version: 1, location: "paragraph" },
} as const;

export type Evidence = [source: keyof typeof sources, location: number, quote: string];
type TextbookCase = {
  id: string;
  subject: "dbms" | "prob";
  question: string;
  evidence: Evidence[][];
  expected: string;
};

const left: Evidence[] = [
  ["slides", 3, "右表没有匹配时，右表属性取 NULL"],
  ["joins", 8, "结果中右表的属性全部取 NULL"],
  ["notes", 3, "右表没有匹配时，右表属性取 NULL"],
];
const joinFilter: Evidence[] = [
  ["slides", 4, "希望保留左表全部元组：右表条件写进 ON"],
  ["joins", 10, "若希望保留左表全部元组，应把右表条件写进 ON"],
  ["notes", 4, "希望保留左表全部元组：右表条件写进 ON"],
];
const counts: Evidence[] = [
  ["slides", 5, "没有选课的学生 n = 0；用 COUNT(*) 会得到 1"],
  ["joins", 15, "补齐 NULL 的元组也会被 COUNT(*) 计为 1"],
  ["notes", 5, "没有选课的学生 n = 0；用 COUNT(*) 会得到 1"],
];
const groupFilter: Evidence[] = [
  ["slides", 6, "WHERE 在分组前筛选元组，HAVING 在分组后筛选组"],
  ["notes", 6, "WHERE 在分组前筛选元组，HAVING 在分组后筛选组"],
];
const nulls: Evidence[] = [["joins", 12, "任何与 NULL 的比较（包括 NULL = NULL）结果都是 UNKNOWN"]];
const cond: Evidence[] = [["probability", 1, "P(A|B) = P(AB) / P(B)"]];
const total: Evidence[] = [
  ["probability", 2, "两两互斥且并为整个样本空间"],
  ["exercises", 4, "互斥且完备的事件"],
];
const bayes: Evidence[] = [["probability", 3, "检测为阳性时真正患病的概率约为 0.161"]];
const independence: Evidence[] = [["probability", 4, "两个概率都大于 0 的互斥事件一定不独立"]];

export const cases: TextbookCase[] = [
  { id: "D01", subject: "dbms", question: "LEFT JOIN 右边没配到记录时，结果长什么样？", evidence: [left], expected: "左表行仍在，右表属性补 NULL。" },
  { id: "D02", subject: "dbms", question: "我想保留全部学生，包括一个班都没选的，右边的字段填什么？", evidence: [left], expected: "左外连接保留学生，未匹配时右表列为 NULL。" },
  { id: "D03", subject: "dbms", question: "只想要两边都对得上的行，应该用什么连接？", evidence: [[["slides", 2, "只保留满足连接条件的元组组合"], ["notes", 2, "只保留满足连接条件的元组组合"], ["joins", 6, "内连接（INNER JOIN）只保留满足连接条件的元组组合"]]], expected: "使用内连接，结果只有满足匹配条件的组合。" },
  { id: "D04", subject: "dbms", question: "LEFT JOIN 中 ON 和 WHERE 的区别是什么？要保留没选课的人，学期条件放哪？", evidence: [joinFilter], expected: "ON 决定配对；WHERE 过滤结果；右表学期条件写入 ON。" },
  { id: "D05", subject: "dbms", question: "为什么没选课的人用 COUNT(*) 会得到 1？怎么才是 0？", evidence: [counts], expected: "COUNT(*) 计入补齐行，COUNT(e.cid) 忽略 NULL。" },
  { id: "D06", subject: "dbms", question: "比较 NULL = NULL 为什么不是 TRUE？真正查空值该用哪个条件？", evidence: [nulls], expected: "比较结果为 UNKNOWN，用 IS NULL 判断空值。" },
  { id: "D07", subject: "dbms", question: "聚合后只保留平均分超过 75 的组，WHERE 和 HAVING 应选哪个？", evidence: [groupFilter], expected: "用 HAVING AVG(score) > 75；WHERE 在分组前筛行。" },
  { id: "D08", subject: "dbms", question: "先统计没选课的人为什么可能被算成 1；再说用哪个子句筛掉平均分不达标的组。", evidence: [counts, groupFilter], expected: "COUNT(*) 会计入补齐行，可计右表非空列；分组后的平均分用 HAVING。" },
  { id: "D09", subject: "dbms", question: "“星灯备注实验”在第几张？它说右表过滤条件放在哪里？", evidence: [[["notes", 1, "星灯备注实验。LEFT JOIN 的右表过滤条件放在 ON 中"]]], expected: "第 1 张幻灯片的演讲者备注，把右表过滤条件放在 ON 中。" },
  { id: "D10", subject: "dbms", question: "新版讲义的常见错误清单怎么解释 COUNT(*) 把没选课的人算成 1？", evidence: [[["joins", 15, "补齐 NULL 的元组也会被 COUNT(*) 计为 1"]]], expected: "新版讲义清单的错误二，COUNT(*) 会计入补齐的行。" },
  { id: "P01", subject: "prob", question: "已经知道 B 发生，计算 A 的概率时分母用谁？写出公式。", evidence: [cond], expected: "P(A|B)=P(AB)/P(B)，要求 P(B)>0。" },
  { id: "P02", subject: "prob", question: "为什么 P(A|B) 和 P(B|A) 一般不同？", evidence: [[["probability", 1, "与 P(B|A) 不相等，因为两者的分母不同"]]], expected: "两者条件不同，分母分别是 P(B) 和 P(A)。" },
  { id: "P03", subject: "prob", question: "按不同情况分别算，再把它们加权加起来，前提是这些情况满足什么条件？", evidence: [total], expected: "用全概率公式，各情况互斥且穷尽样本空间。" },
  { id: "P04", subject: "prob", question: "课上那个检测阳性的例子，实际上患病的概率有多大？", evidence: [bayes], expected: "约 0.161（16.1%），不要把灵敏度当答案。" },
  { id: "P05", subject: "prob", question: "两个不能同时发生的事，为什么彼此也可能有影响？如果各自概率都大于零呢？", evidence: [independence], expected: "正概率的互斥事件不独立，交集概率为零但乘积大于零。" },
  { id: "P06", subject: "prob", question: "分别说明已知 B 后 A 的概率怎么算；再说报告阳性的那个人真正患病的概率。", evidence: [cond, bayes], expected: "先给出 P(AB)/P(B)，再给出大约 0.161。" },
  { id: "N01", subject: "dbms", question: "春季阅卷的铜铃校验码是什么？", evidence: [], expected: "校验码只在另一个用户的私有合成笔记里；当前账号没有依据。" },
  { id: "N02", subject: "prob", question: "老师今年划定的补考具体日期是哪一天？", evidence: [], expected: "资料没有公布补考日期。" },
  { id: "N03", subject: "dbms", question: "课件中贝叶斯检测例子的阳性患病率是多少？", evidence: [], expected: "数据库课程资料不包含概率课教材的检测案例。" },
  { id: "N04", subject: "dbms", question: "课程讲义中 B+ 树叶子如何进行下溢合并？", evidence: [], expected: "知识点目录含索引，但评测语料没有下溢合并的原文。" },
];

export const scaleCase: TextbookCase = {
  id: "S01", subject: "dbms",
  question: "青瓦案例的候选键是什么；北桥案例中分区裁剪只访问哪一个月？",
  evidence: [
    [["privateKeys", 2, "青瓦案例的唯一候选键是 A"]],
    [["privatePages", 2, "北桥案例的分区裁剪只访问十一月分区"]],
  ],
  expected: "分别引用学生新上传的两讲。青瓦案例的候选键是 A，北桥只访问十一月分区。",
};
