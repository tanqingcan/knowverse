"""
从数据库目录（information_schema / pg_catalog）自动生成关系模式图（表、主键、外键、唯一约束与关联）。
运行：DATABASE_URL=... python3 docs/schema/gen_schema.py
"""
import json, os, subprocess, pathlib
OUT = pathlib.Path(__file__).parent
URL = os.environ.get("DATABASE_URL", "postgres://postgres@localhost:5432/knowverse")
FONT = "Noto Sans CJK SC"

def sql(q):
    r = subprocess.run(["psql", URL, "-At", "-c", q], capture_output=True, text=True, check=True)
    return json.loads(r.stdout or "[]")

cols = sql("""SELECT json_agg(json_build_object('t', c.table_name, 'c', c.column_name, 'type', c.data_type, 'null', c.is_nullable, 'pos', c.ordinal_position) ORDER BY c.table_name, c.ordinal_position)
              FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
              WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'""")
cons = sql("""SELECT json_agg(json_build_object('t', cl.relname, 'type', con.contype, 'cols', (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(n, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n),
              'ref', fcl.relname, 'name', con.conname))
              FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
              WHERE ns.nspname = 'public' AND con.contype IN ('p','f','u')""")
uidx = sql("""SELECT coalesce(json_agg(json_build_object('t', tablename, 'name', indexname)), '[]') FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexname NOT LIKE '%_pkey'""")

GROUPS = [
  ("身份与世界", "#F5EEDF", ["users", "auth_sessions", "planets", "gardens", "plants", "subjects", "concepts", "concept_aliases", "concept_prerequisites", "learning_goals", "goal_concepts"]),
  ("对话与历史", "#EFE6F7", ["conversations", "messages", "message_concepts", "concept_suggestions", "model_calls", "message_citations"]),
  ("资料", "#E6EEF4", ["materials", "material_versions", "material_chunks", "material_concepts"]),
  ("练习与成长", "#EAF1E4", ["tasks", "task_concepts", "task_versions", "task_hints", "attempts", "hint_events", "evaluations", "notes", "learning_evidence", "learning_states", "growth_events"]),
  ("增强：班级与协作", "#F6E9E2", ["classes", "class_members", "sharing_preferences", "learning_intents", "study_groups", "study_group_members", "contributions", "knowledge_cards", "card_versions", "card_sources", "card_publications", "outbox_events"]),
]
pk = {}; fk_cols = {}; fks = []
for c in cons:
    if c["type"] == "p": pk[c["t"]] = set(c["cols"])
    if c["type"] == "f":
        fk_cols.setdefault(c["t"], set()).update(c["cols"]); fks.append(c)
short = {"timestamp with time zone": "timestamptz", "integer": "int", "boolean": "bool", "uuid": "uuid", "text": "text", "jsonb": "jsonb", "real": "real", "numeric": "numeric", "bigint": "bigint"}

def table_node(t):
    rows = [c for c in cols if c["t"] == t]
    h = f'<TR><TD BGCOLOR="#24203A" COLSPAN="3"><FONT COLOR="#F5EEDF"><B>{t}</B></FONT></TD></TR>'
    for c in rows:
        mark = ("PK " if c["c"] in pk.get(t, ()) else "") + ("FK" if c["c"] in fk_cols.get(t, ()) else "")
        name = f"<U>{c['c']}</U>" if c["c"] in pk.get(t, ()) else c["c"]
        h += f'<TR><TD ALIGN="LEFT" PORT="{c["c"]}">{('<FONT COLOR="#A5566A">' + mark.strip() + '</FONT>') if mark.strip() else ' '}</TD><TD ALIGN="LEFT">{name}</TD><TD ALIGN="LEFT"><FONT COLOR="#6F6987">{short.get(c["type"], c["type"])}{"" if c["null"] == "YES" else " ·NN"}</FONT></TD></TR>'
    return f'"{t}" [shape=plaintext, label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#24203A">{h}</TABLE>>];'

def render(name, title, groups):
    tables = {t for _, _, ts in groups for t in ts}
    dot = [f'digraph G {{ graph [rankdir=LR, splines=true, nodesep=0.35, ranksep=1.1, fontname="{FONT}", label="{title}", labelloc=t, fontsize=22, pad=0.4];',
           f'node [fontname="{FONT}", fontsize=11]; edge [color="#5A4D8C", arrowhead=crow, arrowtail=tee, dir=both, penwidth=1.1];']
    for i, (g, color, ts) in enumerate(groups):
        dot.append(f'subgraph cluster_{i} {{ label="{g}"; style="rounded,filled"; fillcolor="{color}"; color="#C9C1DE"; fontsize=16;')
        dot += [table_node(t) for t in ts]
        dot.append("}")
    seen = set()
    for f in fks:
        # 为减少交叉，指向 users 的外键只画“用户直接拥有”的几张表，其余以 FK 标注
        if f["ref"] == "users" and f["t"] not in ("planets", "conversations", "learning_goals", "attempts", "learning_evidence", "class_members", "knowledge_cards"): continue
        if f["t"] in tables and f["ref"] in tables:
            key = (f["t"], tuple(f["cols"]), f["ref"])
            if key in seen: continue
            seen.add(key)
            dot.append(f'"{f["ref"]}" -> "{f["t"]}":"{f["cols"][0]}" [tooltip="{f["name"]}"];')
    dot.append("}")
    (OUT / f"{name}.dot").write_text("\n".join(dot), encoding="utf-8")
    for fmt in ("svg", "png"):
        subprocess.run(["dot", f"-T{fmt}", "-Gdpi=110" if fmt == "png" else "-Gdpi=72", str(OUT / f"{name}.dot"), "-o", str(OUT / f"{name}.{fmt}")], check=True)
    print("✓", name, len(tables), "tables")

render("schema-core", "关系模式图（一）：P0/P1 核心——由数据库目录自动生成；箭头由被引用表指向引用表（1 → n）；部分指向 users 的外键仅以 FK 标注", GROUPS[:4])
render("schema-enhanced", "关系模式图（二）：增强功能与其引用的核心表", [("核心（被引用）", "#F5EEDF", ["users", "concepts", "messages"])] + GROUPS[4:])
total = len({c["t"] for c in cols})
print("total tables", total, "unique indexes (partial/expr)", len(uidx))
