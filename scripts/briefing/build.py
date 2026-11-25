"""Generate the standalone briefing with embedded, validated project assets."""
from base64 import b64encode
from html import escape
from io import BytesIO
import json
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DOCS = ROOT / 'docs'
ER = DOCS / 'er/advanced'
ACCEPTANCE = DOCS / 'screenshots/acceptance-2026-11-17'
OUT = DOCS / 'briefings/KNOWVERSE数据库阶段汇报.html'

def as_data(data, kind):
    return f'data:{kind};base64,' + b64encode(data).decode('ascii')

def screenshot(filename, number, title, label):
    with Image.open(ACCEPTANCE / filename) as original:
        target = BytesIO()
        original.convert('RGB').save(target, format='WEBP', quality=94, method=6)
        src = as_data(target.getvalue(), 'image/webp')
        width, height = original.size
    return (
        f'<button class="preview zoom-trigger" type="button" data-target="{number}" aria-label="放大{title}">'
        f'<img id="{number}" src="{src}" width="{width}" height="{height}" alt="{escape(title)}"></button>'
        f'<figcaption>{escape(label)}</figcaption>'
    )

def figure(filename, number, title, label):
    return '<figure class="shot tile">' + screenshot(filename, number, title, label) + '</figure>'

metadata = json.loads((ER / 'schema-metadata.json').read_text(encoding='utf-8'))
tables = {entry['name']: entry for entry in metadata['tables']}
assert len(tables) == 55
assert sum(c['type'] == 'f' for t in tables.values() for c in t['constraints']) == 106
conceptual = json.loads((ER / 'conceptual-manifest.json').read_text(encoding='utf-8'))
assert (conceptual['entities'], conceptual['relationships'], conceptual['attributes']) == (13, 12, 21)

def schema(entries):
    body = []
    for name, picked, meaning in entries:
        table = tables[name]
        columns = {column['name'] for column in table['columns']}
        pk = {column for constraint in table['constraints'] if constraint['type'] == 'p' for column in constraint['columns']}
        fk = {column for constraint in table['constraints'] if constraint['type'] == 'f' for column in constraint['columns']}
        items = []
        for column in picked.split():
            assert column in columns, (name, column)
            marks = '/'.join(label for label, group in [('PK', pk), ('FK', fk)] if column in group)
            badge = f'<span class="keymark">{marks}</span>' if marks else ''
            items.append(f'<code class="key">{column}{badge}</code>')
        body.append(f'<tr><td><code>{name}</code></td><td><div class="code-tags">{"".join(items)}</div></td><td>{escape(meaning)}</td></tr>')
    return ('<div class="scroll"><table class="schema"><caption>实际列节选 · PK 主键，FK 外键。同一组中出现多个 PK 标记时为联合主键。</caption>'
            '<thead><tr><th scope="col">表名</th><th scope="col">实际列</th><th scope="col">每行存的内容</th></tr></thead>'
            '<tbody>' + ''.join(body) + '</tbody></table></div>')

chat = [
    ('conversations', 'id user_id title subject_id created_at archived_at', '一场会话的归属、标题、学科和时间。'),
    ('messages', 'id conversation_id user_id seq role content reply_to_id created_at', '一条提问或回答。序号区分会话内顺序，回答指回原问题。'),
    ('concepts', 'id subject_id name summary', '课程知识点的名称与描述。'),
    ('message_concepts', 'message_id concept_id source status confidence', '一条消息和一个知识点的关联，含标签来源、状态和置信度。'),
]
source = [
    ('materials', 'id title subject_id owner_user_id', '一份资料的身份、标题与归属。'),
    ('material_versions', 'id material_id version_no file_name status', '一次上传对应的版本。版本号在同一份资料内唯一。'),
    ('material_chunks', 'id version_id ord page_no paragraph_no content', '某个版本里的片段，含顺序、位置和原文。'),
    ('message_citations', 'id message_id chunk_id quote ord', '一次引用，记录哪条消息引用了哪个片段和实际摘录。'),
]
practice = [
    ('task_versions', 'id task_id version_no prompt answer_spec', '一版题干及对应的判题规则。'),
    ('attempts', 'id user_id task_version_id answer status submit_key', '一次作答的用户、题目版本、答案、状态与提交标识。'),
    ('evaluations', 'id attempt_id verdict score feedback', '一次作答对应的评价、结果、得分和反馈。'),
    ('learning_evidence', 'id user_id concept_id kind attempt_id message_id revoked_at', '某个知识点的学习证据及其部分来源列，撤销时保留时间。'),
    ('learning_states', 'user_id concept_id stage stage_reason updated_at', '每名用户每个知识点的当前掌握阶段和原因。'),
    ('growth_events', 'id user_id concept_id event_type from_stage to_stage evidence_id created_at', '一条成长历史事件，阶段变化时可记录变化前后。'),
]
benchmark = json.loads((DOCS / 'sql/history-optimization.json').read_text(encoding='utf-8'))
assert (benchmark['messages'], benchmark['warmup'], benchmark['requestsPerCase']) == (40000, 2, 20)
cases = {(r['temperature'], r['concurrency'], r['optimized']): r for r in benchmark['rows'] if r['role'] == 'kv_app'}

def latest_answer_loop(plan):
    def walk(node):
        if node.get('Node Type') == 'Limit' and node.get('Plans', [{}])[0].get('Node Type') == 'Sort':
            sort = node['Plans'][0]
            if sort.get('Sort Key') == ['a.seq DESC']:
                yield node['Actual Loops']
        for subplan in node.get('Plans', []):
            yield from walk(subplan)
    loops, = walk(plan)
    return loops

before, after = (latest_answer_loop(cases['cold', 1, method]['plan']['Plan']) for method in (False, True))
assert (before, after) == (10000, 5)
assert [f'{cases[t,1,m]["p95"]:.2f}' for t in ('cold','hot') for m in (False,True)] == ['78.74','4.66','144.00','134.32']

def chart():
    groups = ['<div class="chart" role="group" aria-label="四组场景下的数据库 P95 延迟，单位毫秒">']
    for temperature, topic in [('cold', '冷门'), ('hot', '热门')]:
        for concurrency in (1, 4):
            bars = []
            for optimized, css, label in [(False, 'old', '原查询'), (True, 'new', '改写后')]:
                value = cases[temperature, concurrency, optimized]['p95']
                bars.append(f'<div class="track" aria-hidden="true"><span class="bar {css}" style="width:{value / 3:.3f}%"></span></div>'
                            f'<span class="bar-label">{label} {value:.2f} ms</span>')
            groups.append(f'<div class="chart-group"><strong>{topic} · 并发 {concurrency}</strong><div class="bars">{"".join(bars)}</div></div>')
    groups.append('<div class="axis" aria-hidden="true"><span>0</span><span>100</span><span>200</span><span>300 ms</span></div></div>')
    return ''.join(groups)

html = (HERE / 'report.html.in').read_text(encoding='utf-8-sig')
media = [
    ('03-answer.png', 'shot-answer', '完成提问并得到回答', '发送问题后，系统展示回答及引用。'),
    ('07-bloom.png', 'shot-graded', 'SQL 变式作答的实际评价', '完成独立变式后，界面显示评价与成长反馈。'),
    ('09-history-combined.png', 'shot-search', '历史问答组合筛选', '按关键词、日期和知识点组合筛选。'),
    ('10-located.png', 'shot-located', '定位并高亮原问题', '点结果回到原会话，高亮原问题。'),
    ('11-continue.png', 'shot-continue', '在原会话继续提问', '在原会话继续提问，保留上下文。'),
]
tokens = {
    'SHOTS': ''.join(figure(*entry) for entry in media),
    'ER': as_data((ER / '03-learning-model.svg').read_bytes(), 'image/svg+xml'),
    'SCHEMA_CHAT': schema(chat), 'SCHEMA_SOURCE': schema(source), 'SCHEMA_PRACTICE': schema(practice),
    'SOURCE_SHOT': screenshot('04-cited-chunk.png', 'shot-source', '在系统中打开并定位被引用的资料片段', '验收截图 · 点击引用后定位到对应资料片段。'),
    'BEFORE_LOOPS': f'{before:,}', 'AFTER_LOOPS': f'{after:,}', 'CHART': chart()
}
for key, value in tokens.items():
    token = f'@@{key}@@'
    if html.count(token) != 1:
        raise ValueError(f'Expected exactly one slot for {key}')
    html = html.replace(token, value)
if '@@' in html:
    raise ValueError('Report still contains unreplaced slots')
OUT.write_text(html, encoding='utf-8')
print(f'Generated offline report: {OUT.stat().st_size:,} bytes, {len(chat)+len(source)+len(practice)} tables, {len(media)+2} embedded figures')
