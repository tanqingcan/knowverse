"""
生成教材风格（Chen 表示法）的概念 E-R 图：实体=矩形，属性=椭圆（主码加下划线），联系=菱形，连线标注基数。
弱实体用双线矩形，标识联系用双线菱形。运行：python3 docs/er/gen_er.py（需要 Graphviz）
"""
import subprocess, pathlib

OUT = pathlib.Path(__file__).parent
FONT = "Noto Sans CJK SC"

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

class ER:
    def __init__(self, name, title, engine="neato"):
        self.name, self.title, self.engine = name, title, engine
        self.lines, self.n = [], 0
    def entity(self, key, label, attrs=(), weak=False):
        per = 2 if weak else 1
        self.lines.append(f'"{key}" [shape=box, peripheries={per}, style="filled", fillcolor="#F5EEDF", color="#24203A", penwidth=1.4, label="{label}", fontsize=15];')
        for a in attrs:
            self.attr(key, a)
    def attr(self, owner, a):
        self.n += 1
        aid = f"{owner}__a{self.n}"
        if a.startswith("*"):   # 主码 / 部分码
            lab = f"<<U>{esc(a[1:])}</U>>"
        elif a.startswith("~"): # 弱实体的部分码（虚下划线用斜体表示）
            lab = f"<<I><U>{esc(a[1:])}</U></I>>"
        else:
            lab = f'"{a}"'
        self.lines.append(f'"{aid}" [shape=ellipse, label={lab}, fontsize=11, color="#6F6987", fontcolor="#24203A", width=0.3, height=0.3, margin="0.03,0.02"];')
        self.lines.append(f'"{owner}" -- "{aid}" [color="#9A93B5", len=1.05];')
    def rel(self, key, label, ends, attrs=(), identifying=False):
        per = 2 if identifying else 1
        self.lines.append(f'"{key}" [shape=diamond, peripheries={per}, style="filled", fillcolor="#E9E3F7", color="#5A4D8C", label="{label}", fontsize=12, width=1.1, height=0.62, margin="0.02,0.01"];')
        for ent, card, *rest in ends:
            total = rest[0] if rest else False
            self.lines.append(f'"{key}" -- "{ent}" [label="{card}", fontsize=13, fontcolor="#A5566A", color="#24203A", penwidth={2.6 if total else 1.2}, len=1.7];')
        for a in attrs:
            self.attr(key, a)
    def render(self):
        dot = "graph G {\n" + f'graph [overlap=false, splines=true, sep="+12", outputorder=edgesfirst, label="{self.title}", labelloc=t, fontsize=20, fontname="{FONT}", pad=0.4, bgcolor="white"];\n'
        dot += f'node [fontname="{FONT}"]; edge [fontname="{FONT}"];\n' + "\n".join(self.lines) + "\n}\n"
        (OUT / f"{self.name}.dot").write_text(dot, encoding="utf-8")
        for fmt in ("svg", "png"):
            subprocess.run([self.engine, f"-T{fmt}", "-Gdpi=130" if fmt == "png" else "-Gdpi=72", str(OUT / f"{self.name}.dot"), "-o", str(OUT / f"{self.name}.{fmt}")], check=True)
        print("✓", self.name)

# ───────── 总览图（只画实体与联系，标注基数；属性见局部图） ─────────
g = ER("er-overview", "知屿 KNOWVERSE 概念 E-R 总览（Chen 表示法，属性见局部图）")
for k, l in [("用户", "用户"), ("星球", "星球"), ("花圃", "花圃"), ("植物", "植物"), ("学科", "学科"), ("知识点", "知识点"), ("目标", "学习目标"),
             ("会话", "会话"), ("消息", "消息"), ("资料", "资料"), ("片段", "资料片段"), ("题目", "题目"), ("作答", "作答"), ("证据", "学习证据"),
             ("班级", "班级"), ("小组", "共学小组"), ("学习卡", "学习卡")]:
    g.entity(k, l)
g.entity("资料版本", "资料版本", weak=True); g.entity("题目版本", "题目版本", weak=True)
g.rel("r拥有", "拥有", [("用户", "1"), ("星球", "1", True)])
g.rel("r包含花圃", "包含", [("星球", "1"), ("花圃", "n", True)])
g.rel("r对应", "对应", [("花圃", "n"), ("学科", "1")])
g.rel("r种植", "种植", [("花圃", "1"), ("植物", "n", True)])
g.rel("r体现", "体现", [("植物", "n"), ("知识点", "1")])
g.rel("r本命", "本命花", [("星球", "1"), ("植物", "1")])
g.rel("r属于", "属于", [("知识点", "n", True), ("学科", "1")])
g.rel("r先修", "先修", [("知识点", "m"), ("知识点", "n")])
g.rel("r设定", "设定", [("用户", "1"), ("目标", "n", True)])
g.rel("r路线", "路线", [("目标", "m"), ("知识点", "n")])
g.rel("r开启", "开启", [("用户", "1"), ("会话", "n", True)])
g.rel("r组成", "组成", [("会话", "1"), ("消息", "n", True)])
g.rel("r回复", "回复", [("消息", "1"), ("消息", "n")])
g.rel("r标注", "标注", [("消息", "m"), ("知识点", "n")])
g.rel("r引用", "引用", [("消息", "m"), ("片段", "n")])
g.rel("r版本", "版本", [("资料", "1"), ("资料版本", "n", True)], identifying=True)
g.rel("r分块", "分块", [("资料版本", "1"), ("片段", "n", True)], identifying=True)
g.rel("r考查", "考查", [("题目", "m"), ("知识点", "n")])
g.rel("r修订", "修订", [("题目", "1"), ("题目版本", "n", True)], identifying=True)
g.rel("r作答", "提交", [("用户", "1"), ("作答", "n", True)])
g.rel("r针对", "针对", [("作答", "n", True), ("题目版本", "1")])
g.rel("r记录", "记录", [("用户", "1"), ("证据", "n", True)])
g.rel("r关于", "关于", [("证据", "n", True), ("知识点", "1")])
g.rel("r产生", "产生", [("作答", "1"), ("证据", "n")])
g.rel("r状态", "当前状态", [("用户", "m"), ("知识点", "n")])
g.rel("r成员", "加入", [("用户", "m"), ("班级", "n")])
g.rel("r开设", "开设", [("班级", "1"), ("小组", "n", True)])
g.rel("r参与", "参与", [("用户", "m"), ("小组", "n")])
g.rel("r整理", "整理", [("用户", "1"), ("学习卡", "n", True)])
g.rel("r卡片", "主题", [("学习卡", "n"), ("知识点", "1")])
g.render()

# ───────── 局部图 1：星球世界、知识点与目标 ─────────
g = ER("er-1-world", "局部图 1　用户、星球世界、知识点与学习目标")
g.entity("用户", "用户", ["*用户ID", "登录名", "昵称", "时区", "是否演示账号"])
g.entity("星球", "星球", ["*星球ID", "名称", "天空主题"])
g.entity("花圃", "花圃", ["*花圃ID", "名称", "排序"])
g.entity("植物", "植物", ["*植物ID", "花种", "花色", "昵称", "经度", "纬度"])
g.entity("学科", "学科", ["*学科ID", "代码", "名称"])
g.entity("知识点", "知识点", ["*知识点ID", "名称", "规范化名称", "简介"])
g.entity("别名", "别名", ["~别名规范形", "别名"], weak=True)
g.entity("目标", "学习目标", ["*目标ID", "标题", "状态"])
g.rel("r拥有", "拥有", [("用户", "1"), ("星球", "1", True)])
g.rel("r包含", "包含", [("星球", "1"), ("花圃", "n", True)])
g.rel("r对应", "对应", [("花圃", "n"), ("学科", "1")])
g.rel("r种植", "种植", [("花圃", "1"), ("植物", "n", True)])
g.rel("r体现", "体现", [("植物", "n"), ("知识点", "1")])
g.rel("r本命", "本命花", [("星球", "1"), ("植物", "1")])
g.rel("r属于", "属于", [("知识点", "n", True), ("学科", "1")])
g.rel("r别名", "称为", [("知识点", "1"), ("别名", "n", True)], identifying=True)
g.rel("r先修", "先修", [("知识点", "m"), ("知识点", "n")])
g.rel("r设定", "设定", [("用户", "1"), ("目标", "n", True)])
g.rel("r路线", "路线", [("目标", "m"), ("知识点", "n")], ["路线顺序"])
g.render()

# ───────── 局部图 2：对话、历史问答与资料引用 ─────────
g = ER("er-2-dialogue", "局部图 2　会话、消息、资料版本与引用")
g.entity("用户", "用户", ["*用户ID"])
g.entity("会话", "会话", ["*会话ID", "标题", "创建时间", "更新时间", "来源", "归档时间"])
g.entity("消息", "消息", ["*消息ID", "序号", "角色", "正文", "生成状态", "依据类型", "创建时间"])
g.entity("模型调用", "模型调用", ["*调用ID", "模式", "模型", "状态", "耗时", "令牌数", "错误码"])
g.entity("知识点", "知识点", ["*知识点ID"])
g.entity("资料", "资料", ["*资料ID", "标题", "课程", "类型"])
g.entity("资料版本", "资料版本", ["~版本号", "文件名", "文件类型", "大小", "SHA-256", "处理状态", "页数", "上传时间"], weak=True)
g.entity("片段", "资料片段", ["~序号", "页码", "段落号", "标题", "内容"], weak=True)
g.rel("r开启", "开启", [("用户", "1"), ("会话", "n", True)])
g.rel("r组成", "组成", [("会话", "1"), ("消息", "n", True)])
g.rel("r回复", "回复", [("消息", "1"), ("消息", "n")])
g.rel("r生成", "生成", [("模型调用", "1"), ("消息", "n")])
g.rel("r标注", "标注", [("消息", "m"), ("知识点", "n")], ["来源", "状态", "置信度"])
g.rel("r引用", "引用", [("消息", "m"), ("片段", "n")], ["引用标记", "摘录", "顺序"])
g.rel("r上传", "上传", [("用户", "1"), ("资料", "n")])
g.rel("r版本", "版本", [("资料", "1"), ("资料版本", "n", True)], identifying=True)
g.rel("r分块", "分块", [("资料版本", "1"), ("片段", "n", True)], identifying=True)
g.rel("r涉及", "涉及", [("资料版本", "m"), ("知识点", "n")], ["确认状态", "命中次数"])
g.render()

# ───────── 局部图 3：练习、证据与成长 ─────────
g = ER("er-3-growth", "局部图 3　题目版本、作答、评价、证据与成长")
g.entity("用户", "用户", ["*用户ID"])
g.entity("知识点", "知识点", ["*知识点ID"])
g.entity("题目", "题目", ["*题目ID", "题型", "标题", "题族"])
g.entity("题目版本", "题目版本", ["~版本号", "题干", "是否变式", "难度", "判题规格", "数据集"], weak=True)
g.entity("提示", "提示", ["~序号", "内容"], weak=True)
g.entity("作答", "作答", ["*作答ID", "模式", "答案", "状态", "幂等键", "提交时间"])
g.entity("评价", "评价", ["*评价ID", "评价方式", "结论", "得分", "反馈", "不确定项"])
g.entity("证据", "学习证据", ["*证据ID", "类别", "说明", "是否用提示", "AI 辅助", "撤销时间", "撤销原因"])
g.entity("成长事件", "成长事件", ["*事件ID", "事件类型", "原阶段", "新阶段", "原因", "时间"])
g.entity("笔记", "笔记", ["*笔记ID", "标题", "内容"])
g.rel("r考查", "考查", [("题目", "m"), ("知识点", "n")])
g.rel("r修订", "修订", [("题目", "1"), ("题目版本", "n", True)], identifying=True)
g.rel("r含提示", "含有", [("题目版本", "1"), ("提示", "n", True)], identifying=True)
g.rel("r提交", "提交", [("用户", "1"), ("作答", "n", True)])
g.rel("r针对", "针对", [("作答", "n", True), ("题目版本", "1")])
g.rel("r查看", "查看", [("作答", "m"), ("提示", "n")], ["查看时间"])
g.rel("r评价", "得到", [("作答", "1"), ("评价", "1", True)])
g.rel("r产生", "产生", [("作答", "1"), ("证据", "n")])
g.rel("r写", "写下", [("用户", "1"), ("笔记", "n", True)])
g.rel("r依据", "依据", [("笔记", "1"), ("证据", "n")])
g.rel("r关于", "关于", [("证据", "n", True), ("知识点", "1")])
g.rel("r记录", "记录", [("用户", "1"), ("证据", "n", True)])
g.rel("r状态", "当前状态", [("用户", "m"), ("知识点", "n")], ["阶段", "阶段原因", "最近证据时间", "复习时间", "版本号"])
g.rel("r事件", "引发", [("证据", "1"), ("成长事件", "n")])
g.render()

# ───────── 局部图 4：班级与协作（增强） ─────────
g = ER("er-4-class", "局部图 4　班级星系、学习卡与协作（增强功能）")
g.entity("用户", "用户", ["*用户ID"])
g.entity("班级", "班级", ["*班级ID", "名称", "邀请码"])
g.entity("知识点", "知识点", ["*知识点ID"])
g.entity("意愿", "学习意愿", ["*意愿ID", "方向", "备注", "撤回时间"])
g.entity("小组", "共学小组", ["*小组ID", "标题", "名额", "状态"])
g.entity("贡献", "贡献", ["*贡献ID", "类型", "内容", "时间"])
g.entity("学习卡", "学习卡", ["*卡片ID", "创建时间"])
g.entity("卡片版本", "卡片版本", ["~版本号", "标题", "正文", "修订说明", "起草方式"], weak=True)
g.entity("消息", "消息", ["*消息ID"])
g.rel("r加入", "加入", [("用户", "m"), ("班级", "n")], ["角色", "加入时间", "公开星球", "公开阶段", "参与匹配"])
g.rel("r表达", "表达", [("用户", "1"), ("意愿", "n", True)])
g.rel("r在班", "发布于", [("意愿", "n", True), ("班级", "1")])
g.rel("r意愿知识点", "针对", [("意愿", "n"), ("知识点", "1")])
g.rel("r开设", "开设", [("班级", "1"), ("小组", "n", True)])
g.rel("r主题", "主题", [("小组", "n"), ("知识点", "1")])
g.rel("r参与", "参与", [("用户", "m"), ("小组", "n")], ["加入时间"])
g.rel("r贡献", "贡献于", [("用户", "1"), ("小组", "1"), ("贡献", "n", True)])
g.rel("r整理", "整理", [("用户", "1"), ("学习卡", "n", True)])
g.rel("r卡版本", "修订", [("学习卡", "1"), ("卡片版本", "n", True)], identifying=True)
g.rel("r来源", "来源", [("卡片版本", "m"), ("消息", "n")])
g.rel("r公开", "公开到", [("卡片版本", "m"), ("班级", "n")], ["发布时间", "撤下时间"])
g.render()
